// Why calls failed: model calls watched as DSH streams them, key checks, kept until a call succeeds again.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { Failures, hideKeys, watch } from '../plugin/failures.js'
import { dshVersion } from '../plugin/index.js'
import { createRoster, ROUTES, serve } from '../plugin/server.js'

let folder
beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-roster-failures-')) })
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }))

/** A model call's stream as DSH's model layer gives it: its chunks, then a finish (or the error it throws). */
const stream = (chunks, error = null) => async function * () {
  for (const chunk of chunks) yield chunk
  if (error) throw error
}
/** An error as DSH's model layer throws one (an LlmError: its failure facts). */
const llmError = (code, status, message) => Object.assign(new Error(message), { code, failure: { code, status, message } })
const drain = async iterable => { const out = []; for await (const chunk of iterable) out.push(chunk); return out }

describe('the failures kept', () => {
  test('kept with their reason, counted when they come again, kept past a restart; keys hidden', () => {
    const failures = new Failures(folder, { now: () => Date.parse('2026-11-11T10:00:00Z') })
    failures.failed({ provider: 'openai', model: 'gpt-6.1-sol', code: 'RATE_LIMIT', status: 429, message: 'Rate limit reached for sk-proj-abcdefghijklmnop' })
    failures.failed({ provider: 'openai', model: 'gpt-6.1-sol', code: 'RATE_LIMIT', status: 429, message: 'Rate limit reached for sk-proj-abcdefghijklmnop' })
    failures.failed({ provider: 'openai', model: 'gpt-7', code: 'NOT_FOUND', status: 404, message: 'no such model' })
    const kept = new Failures(folder).list()
    assert.deepEqual(kept.map(entry => [entry.model, entry.code, entry.status, entry.count]), [['gpt-7', 'NOT_FOUND', 404, 1], ['gpt-6.1-sol', 'RATE_LIMIT', 429, 2]])
    assert.equal(kept[1].message, 'Rate limit reached for …')
    assert.equal(hideKeys('Bearer abc.def AIzaSyA1234567890123456789 xai-abcdefghijkl'), '… … …')
  })
  test('a call that succeeds lets go of its model\'s failures, and its provider\'s own', () => {
    const failures = new Failures(folder)
    failures.failed({ provider: 'openai', model: 'gpt-6.1-sol', code: 'EMPTY_RESPONSE', message: 'nothing' })
    failures.failed({ provider: 'openai', model: 'gpt-7', code: 'NOT_FOUND', message: 'no such model' })
    failures.failed({ provider: 'openai', model: 'gpt-6-luna', code: 'QUOTA', message: 'insufficient quota' })
    failures.failed({ provider: 'openai', code: 'KEY_REJECTED', message: '401', source: 'check' })
    failures.failed({ provider: 'xai', model: 'grok-4.7', code: 'RATE_LIMIT', message: 'slow down' })
    failures.succeeded('openai', 'gpt-6.1-sol')
    assert.deepEqual(failures.list().map(entry => `${entry.provider} ${entry.model} ${entry.code}`), ['xai grok-4.7 RATE_LIMIT', 'openai gpt-7 NOT_FOUND'])
    failures.clear('openai')
    assert.deepEqual(failures.list().map(entry => entry.provider), ['xai'])
    failures.clear()
    assert.deepEqual(new Failures(folder).list(), [])
  })
  test('a provider keeps its newest twelve', () => {
    const failures = new Failures(folder)
    for (let n = 0; n < 20; n++) failures.failed({ provider: 'openai', model: `m-${n}`, code: 'ERROR', message: String(n) })
    assert.equal(failures.list().length, 12)
    assert.equal(failures.list()[0].model, 'm-19')
  })
})

describe('a model call, watched', () => {
  test('its chunks passed on untouched; one that finishes lets its failures go', async () => {
    const failures = new Failures(folder)
    failures.failed({ provider: 'anthropic', model: 'claude-opus-5-5', code: 'RATE_LIMIT', message: 'slow down' })
    const chunks = [{ type: 'text-delta', index: 0, text: 'Hi' }, { type: 'finish', reason: { kind: 'stop' } }]
    assert.deepEqual(await drain(watch(stream(chunks), { provider: 'anthropic', model: 'claude-opus-5-5' }, failures)), chunks)
    assert.deepEqual(failures.list(), [])
  })
  test('one that finishes in an error (as DSH\'s model layer ends a failed call) is kept with its reason', async () => {
    const failures = new Failures(folder)
    const failed = { type: 'finish', reason: { kind: 'error', failure: { message: 'Authentication Fails, Your api key: ****0000 is invalid', code: 'AUTH', status: 401 } } }
    assert.deepEqual(await drain(watch(stream([failed]), { provider: 'deepseek-official', model: 'deepseek-flash' }, failures)), [failed])
    assert.deepEqual(failures.list().map(entry => [entry.provider, entry.model, entry.code, entry.status, entry.message]),
      [['deepseek-official', 'deepseek-flash', 'AUTH', 401, 'Authentication Fails, Your api key: ****0000 is invalid']])
    // the same again (another attempt, its own request id): counted
    const again = { type: 'finish', reason: { kind: 'error', failure: { message: 'Authentication Fails, Your api key: ****0000 is invalid (request_id: 0c08a2e8-8f89)', code: 'AUTH', status: 401 } } }
    await drain(watch(stream([again]), { provider: 'deepseek-official', model: 'deepseek-flash' }, failures))
    assert.deepEqual(failures.list().map(entry => [entry.message, entry.count]), [['Authentication Fails, Your api key: ****0000 is invalid', 2]])
    // one stopped (its turn aborted) is no failure, and no success either
    await drain(watch(stream([{ type: 'finish', reason: { kind: 'aborted', failure: { message: 'request aborted', code: 'ABORTED' } } }]), { provider: 'deepseek-official', model: 'deepseek-flash' }, failures))
    assert.equal(failures.list().length, 1)
    // a call that ends as it should (here, in tool calls) lets it go
    await drain(watch(stream([{ type: 'finish', reason: { kind: 'tool-calls' } }]), { provider: 'deepseek-official', model: 'deepseek-flash' }, failures))
    assert.deepEqual(failures.list(), [])
  })
  test('one that throws is kept with its reason, and its error goes on', async () => {
    const failures = new Failures(folder)
    const error = llmError('QUOTA', 402, 'Insufficient Balance')
    await assert.rejects(drain(watch(stream([{ type: 'block-start', index: 0 }], error), { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, failures)),
      thrown => thrown === error)
    assert.deepEqual(failures.list().map(entry => [entry.provider, entry.model, entry.code, entry.status, entry.message, entry.source]),
      [['deepseek-official', 'deepseek-v4-pro', 'QUOTA', 402, 'Insufficient Balance', 'call']])
    // (an error before any chunk, as when no adapter takes the call)
    await assert.rejects(drain(watch(() => { throw llmError('NO_ADAPTER', undefined, 'no adapter') }, { provider: 'x', model: 'y' }, failures)), /no adapter/)
    assert.equal(failures.list()[0].code, 'NO_ADAPTER')
  })
  test('one you stopped is no failure; one cut short is no success', async () => {
    const failures = new Failures(folder)
    const stopped = new AbortController()
    stopped.abort()
    await assert.rejects(drain(watch(stream([], Object.assign(new Error('aborted'), { name: 'AbortError' })), { provider: 'openai', model: 'a', signal: stopped.signal }, failures)))
    assert.deepEqual(failures.list(), [])
    failures.failed({ provider: 'openai', model: 'b', code: 'RATE_LIMIT', message: 'slow down' })
    const cut = watch(stream([{ type: 'text-delta', index: 0, text: 'a' }, { type: 'finish', reason: { kind: 'stop' } }]), { provider: 'openai', model: 'b' }, failures)
    await cut.next(); await cut.return() // (the caller stopped reading before the finish)
    assert.equal(failures.list().length, 1)
  })
})

describe('in the roster', () => {
  test('a key the provider refused is kept as a failure; a key that works lets it go; the routes; DSH\'s version', async () => {
    let refuse = true
    const fetch = async () => refuse ? Response.json({ error: { message: 'Incorrect API key' } }, { status: 401 }) : Response.json({ data: [{ id: 'gpt-6.1-sol' }] })
    const work = createRoster(folder, { fetch, resolve: async () => 'k', dshVersion: '0.2.1-rc.5' })
    assert.equal((await work.check('openai', 'OPENAI_API_KEY', true)).status, 'rejected')
    const state = work.state()
    assert.deepEqual([state.failures.map(entry => [entry.provider, entry.code, entry.source]), state.dsh.version], [[['openai', 'KEY_REJECTED', 'check']], '0.2.1-rc.5'])
    refuse = false
    assert.equal((await work.check('openai', 'OPENAI_API_KEY', true)).status, 'ok')
    assert.deepEqual(work.state().failures, [])
    // the routes
    const routes = new Map()
    serve({ fetch: { register: route => { for (const method of route.methods) routes.set(`${method} ${route.path}`, route.fetch) } } }, work)
    work.failures.failed({ provider: 'xai', model: 'grok-4.7', code: 'RATE_LIMIT', message: 'slow down' })
    const listed = await (await routes.get(`GET ${ROUTES.failures}`)(new Request(`http://x${ROUTES.failures}`))).json()
    assert.equal(listed.failures[0].code, 'RATE_LIMIT')
    const cleared = await (await routes.get(`POST ${ROUTES.failures}`)(new Request(`http://x${ROUTES.failures}`, { method: 'POST', body: JSON.stringify({ clear: 'xai' }) }))).json()
    assert.deepEqual(cleared.failures, [])
    // DSH's version, from where DSH runs
    const dsh = path.join(folder, 'node_modules', '@deepseek-ai', 'dsh')
    fs.mkdirSync(path.join(dsh, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(dsh, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '9.9.9' }))
    fs.writeFileSync(path.join(dsh, 'lib', 'bin.js'), '')
    assert.equal(dshVersion(path.join(dsh, 'lib', 'bin.js')), '9.9.9')
    assert.equal(dshVersion(path.join(folder, 'nowhere.js')), null)
  })
  test('the spend: read with the spend key, else the API key; one that may not read it is no failure; it stands a while, a test asks again', async () => {
    const allowed = new Set(), used = []
    const fetch = async (url, options) => {
      const key = String(options.headers.authorization ?? '').replace('Bearer ', '')
      if (!String(url).includes('/organization/costs')) return Response.json({ data: [{ id: 'gpt-6.1-sol' }] }) // (the key's check)
      used.push(key)
      return allowed.has(key) ? Response.json({ data: [{ results: [{ amount: { value: 2, currency: 'usd' } }] }], has_more: false })
        : Response.json({ error: { message: 'Missing scopes: api.usage.read' } }, { status: 403 })
    }
    const keys = {}
    const work = createRoster(folder, { fetch, resolve: async name => keys[name] })
    assert.deepEqual(work.state().providers.openai.usage, { kind: 'admin', keys: ['OPENAI_ADMIN_KEY'] })
    assert.equal(work.state().providers.google.usage, null)
    assert.deepEqual(await work.usage('openai', 'OPENAI_API_KEY'), { status: 'missing' })
    // no spend key: the API key is asked, and may not read it
    keys.OPENAI_API_KEY = 'calls'
    const refused = await work.usage('openai', 'OPENAI_API_KEY')
    assert.deepEqual([refused.status, refused.key, used], ['rejected', 'OPENAI_API_KEY', ['calls']])
    assert.equal((await work.check('openai', 'OPENAI_API_KEY', true)).status, 'ok') // (it calls the models all the same)
    assert.deepEqual(work.failures.list(), [])
    // an API key given the permission reads it (after a test: what was told stands a while)
    allowed.add('calls')
    assert.equal((await work.usage('openai', 'OPENAI_API_KEY')).status, 'rejected')
    assert.equal((await work.usage('openai', 'OPENAI_API_KEY', true)).spent.amount, 2)
    // a spend key, once set, is read with instead
    keys.OPENAI_ADMIN_KEY = 'admin'; allowed.add('admin')
    const spend = await work.usage('openai', 'OPENAI_API_KEY', true)
    assert.deepEqual([spend.status, spend.key, used.at(-1)], ['ok', 'OPENAI_ADMIN_KEY', 'admin'])
    // the route
    const routes = new Map()
    serve({ fetch: { register: route => { for (const method of route.methods) routes.set(`${method} ${route.path}`, route.fetch) } } }, work)
    const asked = await (await routes.get(`GET ${ROUTES.usage}`)(new Request(`http://x${ROUTES.usage}?provider=openai&ref=OPENAI_API_KEY`))).json()
    assert.deepEqual([asked.status, asked.key, asked.spent], ['ok', 'OPENAI_ADMIN_KEY', { amount: 2, currency: 'USD', since: asked.spent.since }])
    assert.equal((await (await routes.get(`GET ${ROUTES.usage}`)(new Request(`http://x${ROUTES.usage}?provider=google`))).json()).status, 'untested')
  })
})
