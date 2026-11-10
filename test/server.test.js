// The server half without DSH: art picks, uploads, rankings, providers and the routes, with a fake fetch and a fake
// connection (DSH's `connection.fetch.register`).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { dshHome } from '../plugin/index.js'
import { balance, check, keyFor, liveModels } from '../plugin/providers.js'
import { compact, dateInId, formsOf, load, loadReleased, releasedDates, slugOf, split } from '../plugin/rankings.js'
import { pictureFile } from '../plugin/packs.js'
import { defaultArt, CHARACTERS, characterOf, lineup, Roster, tierOf } from '../plugin/roster.js'
import { createRoster, ROUTES, serve, spelled } from '../plugin/server.js'

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
    assert.equal(defaultArt('openai', 'gpt-6-luna'), 'gpt/chibi')
    assert.equal(defaultArt('openai', 'gpt-6.1-sol'), 'gpt/high')
    assert.equal(defaultArt('anthropic', 'claude-fable-5-1'), 'claude/university')
    assert.equal(defaultArt('deepseek-official', 'deepseek-v4-pro'), 'deepseek/high')
  })
  test('other models by their id, and through OpenRouter', () => {
    assert.equal(defaultArt('openai', 'gpt-5-mini'), 'gpt/chibi')
    assert.equal(defaultArt('openrouter', 'anthropic/claude-sonnet-5'), 'claude/middle')
    assert.equal(defaultArt('openrouter', 'google/gemini-4-carbon'), 'gemini/university')
    assert.equal(defaultArt('xai', 'grok-5'), 'grok/middle') // no tier word: the fallback
    assert.equal(characterOf('openai', 'o4-mini'), 'gpt')
    assert.equal(characterOf('xai', 'some-model'), 'grok') // by its provider
    assert.equal(defaultArt('my-gateway', 'phi-5'), null) // nobody we draw
    assert.equal(defaultArt('zai', 'glm-5'), 'glm/middle')
  })
  test('tier words match whole words', () => {
    assert.equal(tierOf('gemini-3.8-flash-lite'), 'chibi')
    assert.equal(tierOf('claude-opus-5-5'), 'high')
    assert.equal(tierOf('approver-1'), 'middle') // "pro" inside a word is not "pro"
  })
  test('what a picture may be: a file one folder deep, of a picture\'s type', () => {
    for (const good of ['gpt/high.webp', 'deepseek/Image 2.PNG', 'uploads/我的.jpg']) assert.equal(pictureFile(good), good)
    assert.equal(pictureFile('gpt\\high.webp'), 'gpt/high.webp')
    for (const bad of ['gpt/high', 'high.webp', '../x.png', 'a/../x.png', 'a/b/c.png', '.hidden/x.png', 'gpt/x.svg', 'gpt/', 7, null]) {
      assert.equal(pictureFile(bad), null, String(bad))
    }
  })
  test('the lineup: the mainstream models, each from its character\'s home provider', () => {
    const found = lineup()
    assert.ok(found.length >= 15)
    assert.deepEqual(found.find(item => item.id === 'gpt-6.1-sol'), { id: 'gpt-6.1-sol', provider: 'openai', character: 'gpt', tier: 'high' })
    assert.equal(found.find(item => item.id === 'deepseek-flash').provider, 'deepseek-official')
    assert.equal(found.find(item => item.id === 'gemini-4-argon').provider, 'google')
    // the characters at home on OpenRouter, by its `vendor/model` ids
    assert.deepEqual(found.find(item => item.id === 'moonshotai/kimi-k3.1-pro'), { id: 'moonshotai/kimi-k3.1-pro', provider: 'openrouter', character: 'kimi', tier: 'high' })
    for (const character of ['kimi', 'glm', 'qwen', 'mistral', 'minimax', 'llama', 'doubao', 'perplexity', 'hunyuan']) {
      assert.ok(found.some(item => item.character === character && item.provider === 'openrouter' && item.id.includes('/')), character)
    }
  })
  test('the newer characters, by their ids', () => {
    assert.equal(characterOf('openrouter', 'tencent/hy4'), 'hunyuan')
    assert.equal(characterOf('mistral', 'magistral-medium'), 'mistral')
    assert.equal(characterOf('zai', 'glm-4.7'), 'glm')
    assert.equal(characterOf('openrouter', 'perplexity/sonar'), 'perplexity')
    assert.equal(defaultArt('openrouter', 'z-ai/glm-5.3-prime'), 'glm/university')
    assert.equal(defaultArt('openrouter', 'qwen/qwen3.5-plus-20260420'), 'qwen/high')
    assert.equal(spelled('moonshotai/kimi-k2.6'), 'Kimi K2.6')
    assert.equal(spelled('perplexity/sonar-deep-research'), 'Sonar Deep Research')
    assert.equal(spelled('z-ai/glm-5.3-prime'), 'GLM 5.3 Prime')
    // a version written with dashes is a version, but a date stays a date
    assert.equal(spelled('bytedance-seed/seed-2-1-turbo'), 'Seed 2.1 Turbo')
    assert.equal(spelled('claude-3-5-haiku-20241022'), 'Claude 3.5 Haiku 20241022')
    assert.equal(spelled('doubao-seed-2-1-pro-260628'), 'Doubao Seed 2.1 Pro 260628')
    assert.equal(spelled('gpt-4o-2024-08-06'), 'GPT 4o 2024 08 06')
    // Volcengine's build stamps are dates too, but four digits (`qwen3.8-max-0902`) are not
    assert.equal(dateInId('doubao-seed-2-1-pro-260628'), '2026-06-28')
    assert.equal(dateInId('qwen3.8-max-0902'), null)
    assert.equal(dateInId('vendor/model-123456'), null)
  })
  test('Doubao: OpenRouter\'s Seed models, and Volcengine\'s dated ids for them', () => {
    const doubao = lineup().filter(item => item.character === 'doubao').map(item => `${item.id} ${item.tier}`)
    assert.deepEqual(doubao, ['bytedance-seed/seed-2.0-mini chibi', 'bytedance-seed/seed-2.0-lite middle', 'bytedance-seed/seed-2.0-code middle',
      'bytedance-seed/seed-2-1-turbo high', 'bytedance-seed/seed-2-1-pro high'])
    // Volcengine Ark's ids carry the family's name in front and a build stamp at the end: the same tiers as the lineup's
    assert.deepEqual(formsOf('doubao-seed-2-1-turbo-260628'), ['doubao-seed-2-1-turbo-260628', 'doubao-seed-2-1-turbo', 'seed-2-1-turbo'])
    assert.equal(defaultArt('volcengine', 'doubao-seed-2-0-lite-260215'), 'doubao/middle') // (not a chibi, for its "lite")
    assert.equal(defaultArt('volcengine', 'doubao-seed-2-1-turbo-260628'), 'doubao/high')
    assert.equal(defaultArt('volcengine', 'doubao-seed-2-1-pro-260628'), 'doubao/high')
    assert.equal(defaultArt('volcengine', 'doubao-seed-2-0-mini-260215'), 'doubao/chibi')
    // and the stripping is only for looking a model up: a plain id keeps its own tier
    assert.equal(defaultArt('openai', 'gpt-6-luna'), 'gpt/chibi')
  })
})

describe('the roster file, and your changes to the pack in use', () => {
  /** A roster with the packs that come with it, as it starts. */
  const started = () => { const roster = new Roster(folder); roster.seedPacks(); return roster }
  test('a model\'s card and avatar, chosen and uploaded: changes beside the pack, the pack itself untouched', () => {
    const roster = started()
    assert.equal(roster.active, 'academy') // the student pack, every character chibi to university student, until you choose another
    const packFile = path.join(folder, 'packs', 'academy', 'pack.json')
    const before = fs.readFileSync(packFile, 'utf8')
    roster.pick('openai/gpt-6-luna', { art: 'grok/university.webp' })
    const file = roster.upload(PNG, 'image/png', 'mine.png', 'claude')
    assert.equal(file, 'claude/mine.png')
    roster.pick('anthropic/claude-haiku-5-5', { art: file })
    roster.pick('openai/gpt-6.1-sol', { face: 'claude/face-chibi.webp' })
    const again = new Roster(folder)
    assert.deepEqual(again.artOf('openai', 'gpt-6-luna'), { art: 'grok/university.webp', own: true })
    assert.equal(again.faceOf('openai', 'gpt-6-luna'), 'gpt/face-chibi.webp') // her avatar stays her tier's
    assert.deepEqual(again.whoOf('openai', 'gpt-6-luna'), { character: 'gpt', tier: 'chibi' }) // and so does who she is
    assert.deepEqual(again.artOf('anthropic', 'claude-haiku-5-5'), { art: 'claude/mine.png', own: true })
    assert.equal(again.faceOf('openai', 'gpt-6.1-sol'), 'claude/face-chibi.webp') // an avatar chosen apart from the card
    assert.equal(again.faceOf('openai', 'gpt-6-astra'), 'gpt/face-university.webp')
    assert.equal(again.image({ art: file }).type, 'image/png')
    assert.equal(fs.readFileSync(packFile, 'utf8'), before, 'the pack itself is never written to')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'changes', 'academy', 'pack.json'))).models,
      { 'gpt-6-luna': { art: 'grok/university.webp' }, 'claude-haiku-5-5': { art: 'claude/mine.png' }, 'gpt-6.1-sol': { face: 'claude/face-chibi.webp' } })
    // taken back, and back to the pack's
    again.forget(file)
    assert.deepEqual(new Roster(folder).artOf('anthropic', 'claude-haiku-5-5'), { art: 'claude/chibi.webp', own: false })
    roster.pick('openai/gpt-6-luna', { art: null })
    assert.equal(new Roster(folder).artOf('openai', 'gpt-6-luna').own, false)
    roster.pick('openai/gpt-6.1-sol', { face: null })
    assert.equal(new Roster(folder).faceOf('openai', 'gpt-6.1-sol'), 'gpt/face-high.webp')
    // a model of no character wears what you give it, as its avatar too
    const phi = roster.upload(PNG, 'image/png', 'phi.png')
    roster.pick('my-gateway/phi-5', { art: phi })
    assert.deepEqual([phi, roster.artOf('my-gateway', 'phi-5').art, roster.faceOf('my-gateway', 'phi-5')], ['uploads/phi.png', 'uploads/phi.png', 'uploads/phi.png'])
  })
  test('refusals', () => {
    const roster = started()
    assert.throws(() => roster.pick('no-slash', { art: 'gpt/high.webp' }), RangeError)
    assert.throws(() => roster.pick('openai/x', { art: 'gpt/nope.webp' }), /no such picture/)
    assert.throws(() => roster.pick('openai/x', { art: '../x.png' }), /no such picture/)
    assert.throws(() => roster.forget('gpt/high.webp'), /not a picture you added/)
    assert.throws(() => roster.park('openai', { ns: 'llm-pi-ai', path: [] }), RangeError)
    assert.throws(() => roster.upload(Buffer.from('<svg/>'), 'image/svg+xml'), RangeError)
    assert.throws(() => roster.upload(Buffer.alloc(0), 'image/png'), /empty/)
    assert.throws(() => roster.upload(Buffer.alloc(4 * 1024 * 1024 + 1), 'image/png'), /at most/)
    // with no pack at all, there is nothing to change
    const bare = new Roster(fs.mkdtempSync(path.join(folder, 'none-')))
    assert.equal(bare.active, null)
    assert.throws(() => bare.pick('openai/x', { art: 'gpt/high.webp' }), /choose a pack/)
    assert.equal(bare.artOf('openai', 'gpt-6.1-sol').art, 'gpt/high.webp') // (the bundled pictures, still)
  })
  test('pictures are only ever the packs\' files', () => {
    const roster = started()
    for (const character of CHARACTERS) {
      for (const tier of ['chibi', 'middle', 'high', 'university']) {
        assert.ok(fs.existsSync(roster.image({ art: roster.look().tierArt(character, tier) }).file), `${character}/${tier}`)
        assert.ok(fs.existsSync(roster.image({ art: roster.look().tierFace(character, tier) }).file), `${character}/face ${tier}`)
      }
    }
    assert.equal(roster.image({ art: '../../etc/passwd' }), null)
    assert.equal(roster.image({ art: 'gpt/../../roster.json' }), null)
    assert.equal(roster.image({ art: 'gpt/nope.webp' }), null)
  })
  test('the picks of a roster before 0.5.2 become your changes to the pack in use, once', () => {
    fs.mkdirSync(path.join(folder, 'art'), { recursive: true })
    fs.writeFileSync(path.join(folder, 'art', '0123456789ab.png'), PNG)
    fs.writeFileSync(path.join(folder, 'roster.json'), JSON.stringify({ version: 2, routes: { kimi: 'openrouter' },
      art: { 'openai/gpt-6-luna': 'grok/university', 'anthropic/claude-haiku-5-5': 'custom:0123456789ab', 'openai/x': 'nobody/high' },
      faces: { 'openai/gpt-6.1-sol': 'claude/face-chibi' }, uploads: { '0123456789ab': { type: 'image/png', name: 'mine.png' } } }))
    const work = createRoster(folder)
    const [luna, haiku, sol] = work.resolve([{ provider: 'openai', id: 'gpt-6-luna' }, { provider: 'anthropic', id: 'claude-haiku-5-5' },
      { provider: 'openai', id: 'gpt-6.1-sol' }])
    assert.deepEqual([luna.art, haiku.art, sol.face], ['grok/university.webp', 'claude/mine.png', 'claude/face-chibi.webp'])
    const kept = JSON.parse(fs.readFileSync(path.join(folder, 'roster.json')))
    assert.deepEqual([kept.art, kept.routes], [undefined, { kimi: 'openrouter' }])
  })
})

describe('rankings', () => {
  test('the shipped snapshot: each model once, at its best, with its efforts', () => {
    const rankings = load(folder)
    const shipped = fs.readdirSync(new URL('../data/', import.meta.url)).find(name => name.startsWith('aa-'))
    assert.equal(rankings.about.as_of, shipped.slice(3, 13))
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
  test('a row: the indexes, and the cost, time and tokens of an index task (time and tokens only in the Pro list)', () => {
    const item = { slug: 'glm-5-3', name: 'GLM-5.3 (Max)', release_date: '2026-08-18', model_creator: { name: 'Z AI' },
      evaluations: { artificial_analysis_intelligence_index: 31.7, artificial_analysis_coding_index: null, artificial_analysis_engineering_index: 37.6,
        artificial_analysis_finance_and_accounting_index: 42.1, artificial_analysis_healthcare_and_medical_index: null },
      artificial_analysis_intelligence_index_cost: { total_cost: 3495.62, cost_per_task: { total_cost: 5.0093 } },
      pricing: { price_1m_input_tokens: 1.4, price_1m_output_tokens: 4.4 },
      performance: { median_output_tokens_per_second: 80.07, median_time_to_first_answer_token_seconds: 27.19 } }
    const free = compact(item)
    assert.deepEqual(free.capabilities, { engineering: 37.6, finance: 42.1 })
    assert.deepEqual([free.taskCost, free.indexCost, free.speed, free.latency, free.taskTime, free.taskTokens], [5.0093, 3495.62, 80, 27.19, null, null])
    assert.equal('coding' in free, false)
    // their Pro list breaks a task's cost down, and says how long a task takes
    const pro = compact({ ...item, artificial_analysis_intelligence_index_cost: { total_cost: 3495.62,
      cost_per_task: { total_cost: 5.0093, input_cost: 4.4857, reasoning_cost: 0.373, answer_cost: 0.1505 } },
    performance_v3: { mean_output_tokens_per_second: 62.36, time_per_task_seconds: 1907.94 } })
    assert.equal(pro.taskTime, 1907.9)
    assert.equal(pro.taskTokens, Math.round((0.373 + 0.1505) / 4.4 * 1e6)) // what a task writes: 118,977 tokens
  })
  test('the leaderboard: every model once, or every effort', () => {
    const rankings = load(folder)
    const models = rankings.top(2000)
    const efforts = rankings.top(2000, 'intelligence', { efforts: true })
    assert.equal(models.length, rankings.models.size)
    assert.ok(efforts.length > models.length)
    assert.ok(efforts.every((row, index) => row.rank === index + 1 && (index === 0 || row.intelligence <= efforts[index - 1].intelligence)))
    assert.ok(efforts.filter(row => row.base === 'gpt-6-1-sol').length > 1)
    assert.ok(models.filter(row => row.taskCost !== null).length > models.length / 2, 'the cost of a task, for most')
    assert.equal(rankings.about.tier, 'free')
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
    const toAA = asked.filter(call => call.url.startsWith('https://artificialanalysis.ai/'))
    assert.equal(toAA.length, 2)
    assert.equal(toAA[0].headers['x-api-key'], 'aa-key')
    assert.equal(work.top(1).rows[0].slug, 'model-2')
    const none = createRoster(folder, { resolve: async () => undefined })
    await assert.rejects(none.refreshRankings(), /no Artificial Analysis key/)
  })
  test('fetched with a Pro key: their full list, which has the time and tokens of a task', async () => {
    const row = { slug: 'model-9', name: 'Model 9', release_date: '2026-11-10', model_creator: { name: 'Lab' },
      evaluations: { artificial_analysis_intelligence_index: 80 }, pricing: { price_1m_input_tokens: 1, price_1m_output_tokens: 2 } }
    const { fetch, asked } = fakeFetch({
      'https://artificialanalysis.ai/api/v2/language/models/free?page=1': { tier: 'pro', intelligence_index_version: 6, pagination: { has_more: false }, data: [row] },
      'https://artificialanalysis.ai/api/v2/language/models?page=1': { tier: 'pro', intelligence_index_version: 6, pagination: { has_more: false },
        data: [{ ...row, performance_v3: { time_per_task_seconds: 600 },
          artificial_analysis_intelligence_index_cost: { total_cost: 100, cost_per_task: { total_cost: 0.5, reasoning_cost: 0.3, answer_cost: 0.1 } } }] }
    })
    const work = createRoster(folder, { fetch, resolve: async name => name === 'AA_API_TOKEN' ? 'aa-key' : undefined })
    assert.equal((await work.refreshRankings()).tier, 'pro')
    assert.deepEqual(asked.filter(call => call.url.startsWith('https://artificialanalysis.ai/')).map(call => call.url.split('/v2/')[1]),
      ['language/models/free?page=1', 'language/models?page=1'])
    const [top] = work.top(1).rows
    assert.deepEqual([top.slug, top.taskTime, top.taskTokens, top.taskCost], ['model-9', 600, 200000, 0.5])
  })
  test('release dates: Artificial Analysis\'s, else when OpenRouter listed the model', async () => {
    const at = date => Date.parse(`${date}T12:00:00Z`) / 1000
    assert.deepEqual(releasedDates({ data: [{ id: 'z-ai/glm-5.3', created: at('2026-09-01') }, { id: 'z-ai/glm-5.3:free', created: at('2026-08-30') },
      { id: 'anthropic/claude-opus-5.5', created: at('2026-09-22') }, { id: 'broken' }] }),
    { 'glm-5-3': '2026-08-30', 'claude-opus-5-5': '2026-09-22' })
    const work = createRoster(folder)
    const [sol, kimi, mine] = work.resolve([{ provider: 'openai', id: 'gpt-6.1-sol' }, { provider: 'openrouter', id: 'moonshotai/kimi-k2.6' },
      { provider: 'my-gateway', id: 'nothing-known' }])
    assert.equal(sol.released, '2026-09-29') // Artificial Analysis's
    assert.equal(kimi.released, '2026-04-20') // OpenRouter's (shipped snapshot)
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(mine.released) && mine.releasedSeen) // no published date: first seen today
    assert.equal(work.state().rankings.released_as_of, loadReleased(folder).as_of)
    const newest = work.top(5, 'released').rows
    assert.ok(newest.every((row, index) => index === 0 || row.released <= newest[index - 1].released))
    assert.equal(newest[0].slug, 'claude-fable-5-2')
    // every date known, for the page's lists of models: Artificial Analysis's over OpenRouter's, and by DSH's names
    const all = work.releasedDates().dates
    assert.equal(all['gpt-6-1-sol'], '2026-09-29')
    assert.equal(all['kimi-k2-6'], '2026-04-20')
    assert.equal(all['deepseek-flash'], all['deepseek-v4-1-flash-1017'])
    assert.ok(Object.keys(all).length > 300)
    // a Volcengine id gets OpenRouter's date for its model, and its name with its version
    const [turbo] = work.resolve([{ provider: 'volcengine', id: 'doubao-seed-2-1-turbo-260628' }])
    assert.deepEqual([turbo.released, turbo.releasedSeen, turbo.name, turbo.tier], ['2026-08-12', false, 'Doubao Seed 2.1 Turbo 260628', 'high'])
    // a lineup model OpenRouter does not list (Seed 2.1 Pro is Volcengine's alone) is marked so; the others are not
    const doubao = Object.fromEntries(work.state().lineup.filter(item => item.character === 'doubao').map(item => [item.id, item.listed]))
    assert.deepEqual(doubao, { 'bytedance-seed/seed-2.0-mini': undefined, 'bytedance-seed/seed-2.0-lite': undefined,
      'bytedance-seed/seed-2.0-code': undefined, 'bytedance-seed/seed-2-1-turbo': undefined, 'bytedance-seed/seed-2-1-pro': false })
    assert.equal(work.state().lineup.filter(item => item.listed === false).length, 1, 'every other OpenRouter lineup model is listed')
    // …with the date models.json gives it (not "first seen today"), while a Volcengine build of it keeps its own stamp
    const [pro, build] = work.resolve([{ provider: 'openrouter', id: 'bytedance-seed/seed-2-1-pro' }, { provider: 'volcengine', id: 'doubao-seed-2-1-pro-260815' }])
    assert.deepEqual([pro.released, pro.releasedSeen, build.released, build.releasedSeen], ['2026-06-23', false, '2026-08-15', false])
    // fetched again, even without an Artificial Analysis key
    const { fetch } = fakeFetch({ 'https://openrouter.ai/api/v1/models': { data: [{ id: 'moonshotai/kimi-k2.6', created: at('2026-04-01') }] } })
    const again = createRoster(folder, { fetch, resolve: async () => undefined, now: () => 0 })
    await assert.rejects(again.refreshRankings(), /no Artificial Analysis key/)
    assert.equal(again.resolve([{ provider: 'openrouter', id: 'moonshotai/kimi-k2.6' }])[0].released, '2026-04-01')
  })
  test('a model newer than every list: the day it was first seen, kept, until a published date comes', async () => {
    let clock = Date.parse('2026-11-11T09:00:00')
    const work = createRoster(folder, { now: () => clock, resolve: async () => undefined })
    const first = work.datesFor(['anthropic/claude-fable-5.5', 'claude-3-5-haiku-20241022', 'gpt-6.1-sol', 'x-ai/grok-9:free']).dates
    assert.deepEqual(first['anthropic/claude-fable-5.5'], { date: '2026-11-11', seen: true })
    assert.deepEqual(first['claude-3-5-haiku-20241022'], { date: '2024-10-22', seen: false }) // the date in its id
    assert.deepEqual(first['gpt-6.1-sol'], { date: '2026-09-29', seen: false }) // Artificial Analysis's
    assert.deepEqual(first['x-ai/grok-9:free'], { date: '2026-11-11', seen: true })
    // a week later, and after a restart: the same day it was first seen
    clock = Date.parse('2026-11-18T09:00:00')
    const later = createRoster(folder, { now: () => clock, resolve: async () => undefined })
    assert.deepEqual(later.datesFor(['anthropic/claude-fable-5.5']).dates['anthropic/claude-fable-5.5'], { date: '2026-11-11', seen: true })
    const card = later.resolve([{ provider: 'openrouter', id: 'anthropic/claude-fable-5.5' }])[0]
    assert.equal(card.released, '2026-11-11'); assert.equal(card.releasedSeen, true)
    assert.ok(later.releasedDates().seen['claude-fable-5-5'])
    // OpenRouter lists it: its date wins, and the first-seen day is let go
    const { fetch } = fakeFetch({ 'https://openrouter.ai/api/v1/models': { data: [{ id: 'anthropic/claude-fable-5.5', created: Date.parse('2026-11-12T12:00:00Z') / 1000 }] } })
    const settled = createRoster(folder, { fetch, now: () => clock, resolve: async () => undefined })
    await assert.rejects(settled.refreshRankings(), /no Artificial Analysis key/)
    assert.deepEqual(settled.datesFor(['anthropic/claude-fable-5.5']).dates['anthropic/claude-fable-5.5'], { date: '2026-11-12', seen: false })
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'seen.json'), 'utf8')).dates['claude-fable-5-5'], undefined)
    assert.equal(dateInId('qwen3.8-max-0902'), null) // four digits are no date
    assert.throws(() => work.datesFor('not a list'), RangeError)
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
  test('a key\'s check: its usage where the provider reports one, else its models', async () => {
    const { fetch } = fakeFetch({
      'https://api.deepseek.com/user/balance': { balance_infos: [{ currency: 'CNY', total_balance: '3' }] },
      'https://api.openai.com/v1/models': () => Response.json({ error: { message: 'Incorrect API key' } }, { status: 401 }),
      'https://api.x.ai/v1/models': () => Response.json({ error: 'busy' }, { status: 503 }),
      'https://api.anthropic.com/v1/models': { data: [{ id: 'claude-opus-5-5' }] }
    })
    const deepseek = await check('deepseek-official', 'k', { fetch })
    assert.equal(deepseek.status, 'ok'); assert.equal(deepseek.balances[0].amount, 3)
    assert.equal((await check('openai', 'k', { fetch })).status, 'rejected')
    assert.equal((await check('xai', 'k', { fetch })).status, 'error')
    assert.deepEqual(await check('anthropic', 'k', { fetch }), { status: 'ok', models: 1 })
    assert.deepEqual(await check('my-gateway', 'k', { fetch }), { status: 'untested' })
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
    assert.deepEqual(Object.keys((await json(await call('GET', ROUTES.state))).body).sort(), ['characters', 'lineup', 'pack', 'parked', 'providers', 'rankings', 'routes', 'tiers'])
    // the provider a character's lineup goes through
    assert.deepEqual((await json(await call('POST', ROUTES.route, { body: { character: 'gpt', provider: 'openrouter' } }))).body.routes, { gpt: 'openrouter' })
    assert.deepEqual((await json(await call('POST', ROUTES.route, { body: { character: 'gpt', provider: 'openai' } }))).body.routes, {}) // her own again
    assert.equal((await call('POST', ROUTES.route, { body: { character: 'nobody', provider: 'openrouter' } })).status, 400)
    assert.equal((await call('POST', ROUTES.route, { body: { character: 'kimi', provider: 'Not A Route' } })).status, 400)
    const resolved = await json(await call('POST', ROUTES.resolve, { body: { models: [{ provider: 'openai', id: 'gpt-6.1-sol' }] } }))
    assert.equal(resolved.body.models[0].art, 'gpt/high.webp')
    assert.equal(resolved.body.models[0].aa.rank > 0, true)
    const uploaded = await json(await call('POST', `${ROUTES.upload}?name=a.png&character=gpt`, { body: PNG, type: 'image/png' }))
    assert.equal(uploaded.body.file, 'gpt/a.png')
    assert.equal((await call('POST', ROUTES.pick, { body: { model: 'openai/gpt-6.1-sol', art: uploaded.body.file } })).status, 200)
    assert.equal((await json(await call('POST', ROUTES.resolve, { body: { models: [{ provider: 'openai', id: 'gpt-6.1-sol' }] } }))).body.models[0].art, 'gpt/a.png')
    const image = await call('GET', `${ROUTES.image}?art=${encodeURIComponent(uploaded.body.file)}`)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.equal(Buffer.from(await image.arrayBuffer()).equals(PNG), true)
    assert.equal((await call('GET', `${ROUTES.image}?art=gpt/face.webp`)).headers.get('content-type'), 'image/webp')
    assert.equal((await call('GET', `${ROUTES.image}?art=../x`)).status, 404)
    assert.equal((await call('POST', ROUTES.pick, { body: { model: 'x', art: 'gpt/high.webp' } })).status, 400)
    assert.equal((await call('POST', ROUTES.resolve, { body: 'not json', type: 'text/plain' })).status, 400)
    assert.equal((await json(await call('GET', `${ROUTES.balance}?provider=deepseek-official&ref=DEEPSEEK_API_KEY`))).body.balances[0].amount, 1.5)
    assert.equal((await json(await call('GET', `${ROUTES.balance}?provider=openai&ref=OPENAI_API_KEY`))).body.missing, true)
    assert.equal((await json(await call('GET', `${ROUTES.live}?provider=deepseek-official`))).body.models.length, 2)
    assert.equal((await call('GET', `${ROUTES.live}?provider=openai`)).status, 400)
    assert.equal((await json(await call('GET', `${ROUTES.rankings}?top=5`))).body.rows.length, 5)
    assert.ok((await json(await call('GET', `${ROUTES.rankings}?top=2000&efforts=1`))).body.rows.length >
      (await json(await call('GET', `${ROUTES.rankings}?top=2000`))).body.rows.length)
    const newest = (await json(await call('GET', `${ROUTES.rankings}?top=3&sort=released`))).body.rows
    assert.ok(newest[0].released >= newest[1].released && newest[1].released >= newest[2].released)
    assert.equal((await json(await call('GET', ROUTES.released))).body.dates['gpt-6-1-sol'], '2026-09-29')
    assert.deepEqual((await json(await call('POST', ROUTES.released, { body: { ids: ['openai/gpt-6.1-sol'] } }))).body.dates['openai/gpt-6.1-sol'],
      { date: '2026-09-29', seen: false })
    assert.equal((await call('POST', ROUTES.released, { body: { ids: 'nope' } })).status, 400)
    assert.equal((await call('POST', ROUTES.forget, { body: { file: uploaded.body.file } })).status, 200)
    assert.equal((await json(await call('POST', ROUTES.settings, { body: { aaKeyEnv: 'MY_AA' } }))).body.keys[0], 'MY_AA')
    const state = (await json(await call('GET', ROUTES.state))).body
    assert.ok(state.lineup.find(item => item.id === 'gpt-6.1-sol').name.startsWith('GPT-6.1 Sol'))
    assert.equal((await call('POST', ROUTES.pick, { body: { model: 'openai/gpt-6.1-sol', face: 'grok/face-chibi.webp' } })).status, 200)
    assert.equal((await json(await call('POST', ROUTES.resolve, { body: { models: [{ provider: 'openai', id: 'gpt-6.1-sol' }] } }))).body.models[0].face, 'grok/face-chibi.webp')
    assert.equal((await call('GET', `${ROUTES.image}?art=gemini/face-middle.webp`)).headers.get('content-type'), 'image/webp') // (the bundled pack's)
    // a key's check: kept for a while, asked again when fresh
    const first = (await json(await call('GET', `${ROUTES.check}?provider=deepseek-official&ref=DEEPSEEK_API_KEY`))).body
    assert.equal(first.status, 'ok'); assert.equal(first.key, 'DEEPSEEK_API_KEY')
    assert.equal((await json(await call('GET', `${ROUTES.check}?provider=deepseek-official`))).body.at, first.at)
    assert.equal((await json(await call('GET', `${ROUTES.check}?provider=openai`))).body.status, 'missing')
    // a provider set aside whole, and put back
    const profile = { apiKeyEnv: 'OPENAI_API_KEY', models: [{ id: 'gpt-6.1-sol' }] }
    assert.deepEqual((await json(await call('POST', ROUTES.park, { body: { provider: 'openai', ns: 'llm-pi-ai', path: ['providers', 'openai'], profile } }))).body.parked.openai.profile, profile)
    assert.deepEqual((await json(await call('GET', ROUTES.state))).body.parked.openai.path, ['providers', 'openai'])
    assert.deepEqual((await json(await call('POST', ROUTES.unpark, { body: { provider: 'openai' } }))).body.kept.profile, profile)
    assert.deepEqual((await json(await call('GET', ROUTES.state))).body.parked, {})
    assert.equal((await call('POST', ROUTES.settings, { body: { aaKeyEnv: '1bad' } })).status, 400)
  })
})

test('DSH\'s home, as dsh-home-paths resolves it', () => {
  assert.equal(dshHome({}), path.join(os.homedir(), '.dsh'))
  assert.equal(dshHome({ DSH_HOME: '  ' }), path.join(os.homedir(), '.dsh'))
  assert.equal(dshHome({ DSH_HOME: '~/elsewhere' }), path.join(os.homedir(), 'elsewhere'))
  assert.equal(dshHome({ DSH_HOME: '/srv/dsh/' }), '/srv/dsh')
})
