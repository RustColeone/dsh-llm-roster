// The summon's earned ✦: dropped by model calls that work, spent on summons, added by cheat codes, kept in DSH's home.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { watch } from '../plugin/failures.js'
import { createRoster, ROUTES, serve } from '../plugin/server.js'
import { codeOf, CODES, DROPS, MOST_ROLLS, rollsFor, Stars } from '../plugin/stars.js'

let folder
beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-roster-stars-')) })
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }))

/** A random that answers these rolls in turn. */
const rolls = (...values) => () => values.shift() ?? 0.99

describe('the earned ✦', () => {
  test('a roll drops 10 ✦ under 1%, 3 under the next 6%, 1 under the next 30%, else none (a short call: one roll)', () => {
    const stars = new Stars(folder, { random: rolls(0.005, 0.03, 0.2, 0.5, 0.369, 0.371), now: () => 42 })
    assert.deepEqual([stars.earn(), stars.earn(), stars.earn(), stars.earn(), stars.earn(), stars.earn()], [10, 3, 1, 0, 1, 0])
    assert.deepEqual(stars.about(), { balance: 15, earned: 15, calls: 6, rolls: 6, last: { amount: 1, at: 42 } })
    // about 0.58 ✦ a roll
    assert.equal(DROPS.reduce((sum, [chance, amount]) => sum + chance * amount, 0).toFixed(2), '0.58')
  })
  test('kept in DSH\'s home: a restart (or another DSH process) has them', () => {
    new Stars(folder, { random: rolls(0.005) }).earn()
    const again = new Stars(folder)
    assert.equal(again.about().balance, 10)
    new Stars(folder, { random: rolls(0.005) }).earn() // (another process, meanwhile)
    assert.equal(again.spend(3).balance, 17) // (read again before a change: the other's ✦ are not lost)
  })
  test('a summon spends them; not enough is refused, and nothing is spent', () => {
    const stars = new Stars(folder, { random: rolls(0.005) })
    stars.earn()
    assert.equal(stars.spend(3).balance, 7)
    assert.throws(() => stars.spend(30), /not enough ✦: 7 of 30/)
    assert.equal(stars.about().balance, 7)
    for (const bad of [0, -3, 1.5, 'x', 5000]) assert.throws(() => stars.spend(bad), RangeError)
  })
  test('cheat codes: HESOYAM +25, showmethemoney +10, blacksheepwall reveals the album; case and spaces don\'t matter', () => {
    const stars = new Stars(folder)
    assert.deepEqual(Object.keys(CODES), ['hesoyam', 'showmethemoney', 'blacksheepwall'])
    assert.equal(codeOf('  Show me the Money! '), 'showmethemoney')
    assert.deepEqual([stars.code('HESOYAM').added, stars.code('show me the money').added, stars.about().balance], [25, 10, 35])
    assert.deepEqual(stars.code('BlackSheepWall'), { code: 'blacksheepwall', reveal: true, balance: 35, earned: 0, calls: 0, rolls: 0, last: null })
    assert.equal(stars.code('rosebud').unknown, true)
    assert.equal(stars.code('constructor').unknown, true) // (an object's own names are no codes)
    assert.equal(stars.about().earned, 0) // (a code's ✦ were not earned)
  })
  test('DSH\'s model calls: one that works may drop ✦; one that fails or is stopped does not', async () => {
    const work = createRoster(folder, { random: rolls(0.005, 0.005, 0.005) })
    const calls = []
    const stream = finish => async function * () { yield { type: 'text-delta', text: 'a' }; yield { type: 'finish', reason: finish } }
    const run = async finish => { for await (const chunk of watch(stream(finish), { provider: 'openai', model: 'gpt-6.1-sol' }, work.failures, call => calls.push(work.stars.earn(call)))) void chunk }
    await run({ kind: 'stop' })
    await run({ kind: 'error', failure: { code: 'RATE_LIMIT', message: 'slow down' } })
    await run({ kind: 'aborted' })
    await run({ kind: 'tool-calls' })
    assert.deepEqual([calls, work.stars.about().balance], [[10, 10], 20])
  })
  test('a long call earns as its work does: a roll more for every 2,000 tokens it wrote (its usage, else its text), at most 25', async () => {
    assert.deepEqual([0, 1999, 2000, 9000, 47999, 48000, 1e7].map(rollsFor), [1, 1, 2, 5, 24, 25, MOST_ROLLS])
    const work = createRoster(folder, { random: () => 0.99 }) // (rolls that drop nothing: only counted)
    const told = []
    const call = async chunks => {
      const stream = async function * () { yield * chunks; yield { type: 'finish', reason: { kind: 'stop' } } }
      for await (const chunk of watch(stream, { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, work.failures, found => { told.push(found.outputTokens); work.stars.earn(found) })) void chunk
    }
    // a high-effort call: 9,000 tokens of reasoning and answer, as its usage says
    await call([{ type: 'reasoning-delta', index: 0, text: 'think '.repeat(10) }, { type: 'text-delta', index: 1, text: 'done' },
      { type: 'usage', usage: { inputTokens: 1200, outputTokens: 9000 } }])
    // a provider that sends no usage: about 4 characters a token, its tool calls' arguments too
    await call([{ type: 'reasoning-delta', index: 0, text: 'x'.repeat(12000) }, { type: 'tool-call-delta', index: 1, id: 'a', argumentsDelta: 'y'.repeat(4000) }])
    assert.deepEqual(told, [9000, 4000])
    assert.deepEqual([work.stars.about().calls, work.stars.about().rolls], [2, 5 + 3])
  })
  test('with no home to keep them in, a run keeps its own', () => {
    const stars = new Stars(null, { random: rolls(0.005) })
    assert.equal(stars.code('hesoyam').balance, 25)
    stars.earn()
    assert.deepEqual([stars.about().balance, stars.spend(3).balance], [35, 32])
  })
  test('the route: read, spend, a code; not enough is a 400', async () => {
    const work = createRoster(folder, { random: rolls(0.03) })
    work.stars.earn()
    const routes = new Map()
    serve({ fetch: { register: route => { for (const method of route.methods) routes.set(`${method} ${route.path}`, route.fetch) } } }, work)
    const call = async (method, body) => {
      const response = await routes.get(`${method} ${ROUTES.stars}`)(new Request(`http://x${ROUTES.stars}`, { method, body: body ? JSON.stringify(body) : undefined }))
      return { status: response.status, body: await response.json() }
    }
    assert.equal((await call('GET')).body.balance, 3)
    assert.deepEqual((await call('POST', { spend: 3 })).body.balance, 0)
    assert.equal((await call('POST', { spend: 3 })).status, 400)
    assert.deepEqual((await call('POST', { code: 'hesoyam' })).body.added, 25)
    assert.equal((await call('POST', { code: 'blacksheepwall' })).body.reveal, true)
    for (const body of [null, 5, ['hesoyam']]) assert.equal((await call('POST', body)).status, 400, JSON.stringify(body))
  })
})
