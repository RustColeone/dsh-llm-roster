// The server half without DSH: art picks, uploads, rankings, providers and the routes, with a fake fetch and a fake
// connection (DSH's `connection.fetch.register`).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { dshHome } from '../plugin/index.js'
import { balance, keyFor, liveModels } from '../plugin/providers.js'
import { compact, load, slugOf, split } from '../plugin/rankings.js'
import { bundledArt, characterOf, Roster, tierOf, validArt } from '../plugin/roster.js'
import { createRoster, ROUTES, serve } from '../plugin/server.js'

let folder
beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-roster-')) })
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }))

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
  '53de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082', 'hex')

/** A fetch that answers from a table of url → body (or a function of the request). */
function fakeFetch (table) {
  const asked = []
  const fetch = async (url, options = {}) => {
    asked.push({ url: String(url), headers: options.headers ?? {} })
    const key = Object.keys(table).find(prefix => String(url).startsWith(prefix))
    if (!key) return Response.json({ error: { message: 'not found' } }, { status: 404 })
    const body = typeof table[key] === 'function' ? table[key](String(url), options) : table[key]
    return body instanceof Response ? body : Response.json(body)
  }
  return { fetch, asked }
}

describe('who a model is', () => {
  test('the bundled ladders', () => {
    assert.equal(bundledArt('openai', 'gpt-6-luna'), 'gpt/chibi')
    assert.equal(bundledArt('openai', 'gpt-6.1-sol'), 'gpt/high')
    assert.equal(bundledArt('anthropic', 'claude-fable-5-1'), 'claude/university')
    assert.equal(bundledArt('deepseek-official', 'deepseek-v4-pro'), 'deepseek/high')
  })
  test('other models by their id, and through OpenRouter', () => {
    assert.equal(bundledArt('openai', 'gpt-5-mini'), 'gpt/chibi')
    assert.equal(bundledArt('openrouter', 'anthropic/claude-sonnet-5'), 'claude/middle')
    assert.equal(bundledArt('openrouter', 'google/gemini-4-carbon'), 'gemini/university')
    assert.equal(bundledArt('xai', 'grok-5'), 'grok/middle') // no tier word: the fallback
    assert.equal(characterOf('openai', 'o4-mini'), 'gpt')
    assert.equal(characterOf('xai', 'some-model'), 'grok') // by its provider
    assert.equal(bundledArt('zai', 'glm-5'), null) // nobody we draw
  })
  test('tier words match whole words', () => {
    assert.equal(tierOf('gemini-3.8-flash-lite'), 'chibi')
    assert.equal(tierOf('claude-opus-5-5'), 'high')
    assert.equal(tierOf('approver-1'), 'middle') // "pro" inside a word is not "pro"
  })
  test('what a picture may be', () => {
    assert.ok(validArt('gpt/high'))
    assert.ok(validArt('custom:0123456789ab'))
    for (const bad of ['gpt/face', 'nobody/high', '../x', 'custom:../../x', 7, null]) assert.ok(!validArt(bad), String(bad))
  })
})

describe('the roster file', () => {
  test('picks and uploads are kept, and an upload is forgotten with its picks', () => {
    const roster = new Roster(folder)
    roster.pick('openai/gpt-6-luna', 'grok/university')
    const id = roster.upload(PNG, 'image/png', 'mine.png')
    roster.pick('anthropic/claude-haiku-5-5', `custom:${id}`)
    const again = new Roster(folder)
    assert.deepEqual(again.artOf('openai', 'gpt-6-luna'), { art: 'grok/university', own: true })
    assert.deepEqual(again.artOf('anthropic', 'claude-haiku-5-5'), { art: `custom:${id}`, own: true })
    assert.equal(again.image({ upload: id }).type, 'image/png')
    again.forget(id)
    assert.deepEqual(new Roster(folder).artOf('anthropic', 'claude-haiku-5-5'), { art: 'claude/chibi', own: false })
    assert.equal(fs.readdirSync(path.join(folder, 'art')).length, 0)
    roster.pick('openai/gpt-6-luna', null)
    assert.equal(new Roster(folder).artOf('openai', 'gpt-6-luna').own, false)
  })
  test('refusals', () => {
    const roster = new Roster(folder)
    assert.throws(() => roster.pick('no-slash', 'gpt/high'), RangeError)
    assert.throws(() => roster.pick('openai/x', 'custom:0123456789ab'), /no such upload/)
    assert.throws(() => roster.upload(Buffer.from('<svg/>'), 'image/svg+xml'), RangeError)
    assert.throws(() => roster.upload(Buffer.alloc(0), 'image/png'), /empty/)
    assert.throws(() => roster.upload(Buffer.alloc(4 * 1024 * 1024 + 1), 'image/png'), /at most/)
  })
  test('pictures are only ever from the art folder or the uploads', () => {
    const roster = new Roster(folder)
    assert.ok(fs.existsSync(roster.image({ art: 'gpt/face' }).file))
    for (const art of TIERS_OF('claude')) assert.ok(fs.existsSync(roster.image({ art }).file), art)
    assert.equal(roster.image({ art: '../../etc/passwd' }), null)
    assert.equal(roster.image({ upload: '../roster' }), null)
  })
})
const TIERS_OF = character => ['chibi', 'middle', 'high', 'university'].map(tier => `${character}/${tier}`)

describe('rankings', () => {
  test('the shipped snapshot: each model once, at its best, with its efforts', () => {
    const rankings = load(folder)
    assert.equal(rankings.about.as_of, '2026-11-09')
    const sol = rankings.of('openai', 'gpt-6.1-sol')
    assert.equal(sol.slug, 'gpt-6-1-sol')
    assert.ok(sol.efforts.length > 1 && sol.efforts[0].intelligence === sol.intelligence)
    assert.equal(rankings.top(3).map(row => row.rank).join(), '1,2,3')
    assert.equal(new Set(rankings.top(100).map(row => row.slug)).size, rankings.top(100).length)
    assert.equal(rankings.of('deepseek-official', 'deepseek-flash').slug, 'deepseek-v4-1-flash-1017') // built-in alias
    assert.equal(rankings.of('openai', 'gpt-6.1-sol', { 'gpt-6.1-sol': 'gpt-6-astra' }).slug, 'gpt-6-astra') // yours
    assert.equal(rankings.of('openai', 'not-a-model'), null)
  })
  test('slugs and efforts', () => {
    assert.equal(slugOf('openai/GPT-6.1 Sol'), 'gpt-6-1-sol')
    assert.deepEqual(split('gpt-6-1-sol-xhigh'), { base: 'gpt-6-1-sol', effort: 'xhigh' })
    assert.deepEqual(split('kimi-k3-1-pro'), { base: 'kimi-k3-1-pro', effort: null })
    assert.equal(compact({ slug: 'x', evaluations: { artificial_analysis_intelligence_index: null } }), null)
  })
  test('fetched again: every page, kept, and newer than the snapshot', async () => {
    const page = (n, more) => ({ intelligence_index_version: 6, pagination: { has_more: more },
      data: [{ slug: `model-${n}`, name: `Model ${n}`, release_date: '2026-11-10', model_creator: { name: 'Lab' },
        evaluations: { artificial_analysis_intelligence_index: 70 + n }, pricing: { price_1m_input_tokens: 1, price_1m_output_tokens: 2 } }] })
    const { fetch, asked } = fakeFetch({ 'https://artificialanalysis.ai/api/v2/language/models/free?page=1': page(1, true),
      'https://artificialanalysis.ai/api/v2/language/models/free?page=2': page(2, false) })
    const work = createRoster(folder, { fetch, resolve: async name => name === 'AA_API_TOKEN' ? 'aa-key' : undefined })
    const about = await work.refreshRankings()
    assert.equal(about.version, 6)
    assert.equal(asked.length, 2)
    assert.equal(asked[0].headers['x-api-key'], 'aa-key')
    assert.equal(work.top(1).rows[0].slug, 'model-2')
    const none = createRoster(folder, { resolve: async () => undefined })
    await assert.rejects(none.refreshRankings(), /no Artificial Analysis key/)
  })
  test('your key: the variable named on the page, then the plugin\'s, then the usual names', async () => {
    const asked = []
    const work = createRoster(folder, { aaKeyEnv: 'CONFIG_AA', resolve: async name => { asked.push(name) } })
    assert.deepEqual(work.state().rankings.keys, ['CONFIG_AA', 'ARTIFICIAL_ANALYSIS_API_KEY', 'AA_API_TOKEN'])
    assert.deepEqual(work.settings({ aaKeyEnv: 'PAGE_AA' }).keys, ['PAGE_AA', 'CONFIG_AA', 'ARTIFICIAL_ANALYSIS_API_KEY', 'AA_API_TOKEN'])
    await assert.rejects(work.refreshRankings(), /set PAGE_AA/)
    assert.deepEqual(asked, ['PAGE_AA', 'CONFIG_AA', 'ARTIFICIAL_ANALYSIS_API_KEY', 'AA_API_TOKEN'])
    assert.equal(createRoster(folder).state().rankings.keyEnv, 'PAGE_AA') // kept
    assert.throws(() => work.settings({ aaKeyEnv: 'not a name' }), RangeError)
    assert.equal(work.settings({ aaKeyEnv: null }).keyEnv, null)
  })
})

describe('providers', () => {
  test('a key: the profile\'s reference, then the provider\'s usual names', async () => {
    const env = { CLAUDE_API_KEY: 'c', OPENAI_API_KEY: 'o' }
    const resolve = async name => env[name]
    assert.deepEqual(await keyFor('anthropic', 'MISSING_KEY', resolve), { name: 'CLAUDE_API_KEY', value: 'c' })
    assert.deepEqual(await keyFor('openai', 'OPENAI_API_KEY', resolve), { name: 'OPENAI_API_KEY', value: 'o' })
    assert.equal(await keyFor('openai', 'bad name; rm', async () => 'x').then(found => found.name), 'OPENAI_API_KEY')
    assert.equal(await keyFor('nobody', undefined, resolve), null)
  })
  test('balances, as each provider reports them', async () => {
    const { fetch, asked } = fakeFetch({
      'https://api.deepseek.com/user/balance': { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '55.88', granted_balance: '0.00', topped_up_balance: '55.88' }] },
      'https://openrouter.ai/api/v1/credits': { data: { total_credits: 345, total_usage: 336.15 } }
    })
    assert.deepEqual((await balance('deepseek-official', 'k', { fetch })).balances, [{ currency: 'CNY', amount: 55.88, granted: 0, topped: 55.88 }])
    assert.equal(asked[0].headers.authorization, 'Bearer k')
    assert.equal((await balance('openrouter', 'k', { fetch })).balances[0].amount, 8.85)
    assert.deepEqual(await balance('openai', 'k', { fetch }), { offered: false, balances: [] })
  })
  test('live lists: chat models only, and an error says why', async () => {
    const { fetch, asked } = fakeFetch({
      'https://api.openai.com/v1/models': { data: ['gpt-6.1-sol', 'gpt-image-2', 'text-embedding-3-large', 'tts-1', 'gpt-4o-mini-transcribe', 'o4-mini'].map(id => ({ id })) },
      'https://api.anthropic.com/v1/models': { data: [{ id: 'claude-fable-5-2', display_name: 'Claude Fable 5.2' }] },
      'https://generativelanguage.googleapis.com/': { models: [{ name: 'models/gemini-4-carbon', displayName: 'Gemini 4 Carbon', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1048576 },
        { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] }] },
      'https://api.x.ai/v1/models': () => Response.json({ error: 'bad key' }, { status: 401 })
    })
    assert.deepEqual((await liveModels('openai', 'k', { fetch })).map(model => model.id), ['gpt-6.1-sol', 'o4-mini'])
    assert.deepEqual(await liveModels('anthropic', 'k', { fetch }), [{ id: 'claude-fable-5-2', name: 'Claude Fable 5.2' }])
    assert.equal(asked[1].headers['x-api-key'], 'k')
    assert.deepEqual((await liveModels('google', 'k', { fetch })).map(model => [model.id, model.contextWindow]), [['gemini-4-carbon', 1048576]])
    await assert.rejects(liveModels('xai', 'k', { fetch }), /HTTP 401: bad key/)
    await assert.rejects(liveModels('some-gateway', 'k', { fetch }), RangeError)
  })
})

describe('the routes', () => {
  function connect (work) {
    const routes = new Map()
    serve({ fetch: { register: route => { for (const method of route.methods) routes.set(`${method} ${route.path}`, route.fetch) } } }, work)
    return (method, where, { body, type = 'application/json' } = {}) => {
      const handle = routes.get(`${method} ${where.split('?')[0]}`)
      assert.ok(handle, `${method} ${where}`)
      const request = new Request(`http://127.0.0.1:3093${where}`, { method, headers: { 'content-type': type },
        body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) })
      return handle(request)
    }
  }
  test('every route', async () => {
    const { fetch } = fakeFetch({ 'https://api.deepseek.com/user/balance': { balance_infos: [{ currency: 'CNY', total_balance: '1.5' }] },
      'https://api.deepseek.com/models': { data: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }] } })
    const call = connect(createRoster(folder, { fetch, resolve: async name => name === 'DEEPSEEK_API_KEY' ? 'k' : undefined }))
    const json = async response => ({ status: response.status, body: await response.json() })
    assert.deepEqual(Object.keys((await json(await call('GET', ROUTES.state))).body).sort(), ['characters', 'providers', 'rankings', 'tiers', 'uploads'])
    const resolved = await json(await call('POST', ROUTES.resolve, { body: { models: [{ provider: 'openai', id: 'gpt-6.1-sol' }] } }))
    assert.equal(resolved.body.models[0].art, 'gpt/high')
    assert.equal(resolved.body.models[0].aa.rank > 0, true)
    const uploaded = await json(await call('POST', `${ROUTES.upload}?name=a.png`, { body: PNG, type: 'image/png' }))
    assert.match(uploaded.body.id, /^[a-f0-9]{12}$/)
    assert.equal((await call('POST', ROUTES.pick, { body: { model: 'openai/gpt-6.1-sol', art: `custom:${uploaded.body.id}` } })).status, 200)
    const image = await call('GET', `${ROUTES.image}?upload=${uploaded.body.id}`)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.equal(Buffer.from(await image.arrayBuffer()).equals(PNG), true)
    assert.equal((await call('GET', `${ROUTES.image}?art=gpt/face`)).headers.get('content-type'), 'image/webp')
    assert.equal((await call('GET', `${ROUTES.image}?art=../x`)).status, 404)
    assert.equal((await call('POST', ROUTES.pick, { body: { model: 'x', art: 'gpt/high' } })).status, 400)
    assert.equal((await call('POST', ROUTES.resolve, { body: 'not json', type: 'text/plain' })).status, 400)
    assert.equal((await json(await call('GET', `${ROUTES.balance}?provider=deepseek-official&ref=DEEPSEEK_API_KEY`))).body.balances[0].amount, 1.5)
    assert.equal((await json(await call('GET', `${ROUTES.balance}?provider=openai&ref=OPENAI_API_KEY`))).body.missing, true)
    assert.equal((await json(await call('GET', `${ROUTES.live}?provider=deepseek-official`))).body.models.length, 2)
    assert.equal((await call('GET', `${ROUTES.live}?provider=openai`)).status, 400)
    assert.equal((await json(await call('GET', `${ROUTES.rankings}?top=5`))).body.rows.length, 5)
    assert.equal((await call('POST', ROUTES.forget, { body: { upload: uploaded.body.id } })).status, 200)
    assert.equal((await json(await call('POST', ROUTES.settings, { body: { aaKeyEnv: 'MY_AA' } }))).body.keys[0], 'MY_AA')
    assert.equal((await call('POST', ROUTES.settings, { body: { aaKeyEnv: '1bad' } })).status, 400)
  })
})

test('DSH\'s home, as dsh-home-paths resolves it', () => {
  assert.equal(dshHome({}), path.join(os.homedir(), '.dsh'))
  assert.equal(dshHome({ DSH_HOME: '  ' }), path.join(os.homedir(), '.dsh'))
  assert.equal(dshHome({ DSH_HOME: '~/elsewhere' }), path.join(os.homedir(), 'elsewhere'))
  assert.equal(dshHome({ DSH_HOME: '/srv/dsh/' }), '/srv/dsh')
})
