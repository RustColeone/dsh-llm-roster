// Art packs: each picture named by its file; your changes kept beside the pack in use, never in it, and written into
// the .zip when you export it; the packs that come with the roster; a pack's way in (a .zip, a lone pack.json, GitHub).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { DEFAULT, fetchPack, namesOf, packId, sourceOf } from '../plugin/packs.js'
import { ART, CHARACTERS, packsIn, TIERS } from '../plugin/roster.js'
import { createRoster, ROUTES, serve } from '../plugin/server.js'
import { readZip, safePath, writeZip } from '../plugin/zip.js'

let folder
beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-roster-packs-')) })
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }))

const picture = name => fs.readFileSync(path.join(ART, name))
/** A pack of knights: the tiers renamed, Claude's high tier redrawn, ten pictures of DeepSeek's, one model's own. */
const knights = (top = 'knights-main') => writeZip([
  { name: `${top}/pack.json`, data: Buffer.from(JSON.stringify({ name: 'Knights', author: 'me', version: '1.0.0',
    tiers: { high: { name: 'Knight', 'zh-CN': '骑士' }, chibi: 'Squire' },
    characters: { claude: { name: 'Sir Claude', art: { high: 'claude/knight.png' }, face: { high: 'claude/knight-face.png' } } },
    models: { 'claude-opus-5-5': { art: 'claude/opus.png' } } })) },
  { name: `${top}/claude/knight.png`, data: picture('gpt/high.webp') },
  { name: `${top}/claude/knight-face.png`, data: picture('gpt/face-high.webp') },
  { name: `${top}/claude/opus.png`, data: picture('grok/high.webp') },
  ...Array.from({ length: 10 }, (_, n) => ({ name: `${top}/deepseek/image${n + 1}.webp`, data: picture(`deepseek/${TIERS[n % 4]}.webp`) })),
  { name: `${top}/README.md`, data: Buffer.from('# Knights') },
  { name: `${top}/tools/deep/make.sh`, data: Buffer.from('echo') }
])

describe('zip', () => {
  test('what is written is read back', () => {
    const files = [{ name: 'a/pack.json', data: Buffer.from('{"name":"x"}'.repeat(100)) }, { name: 'a/b/c.webp', data: picture('gpt/face-high.webp') }]
    const read = readZip(writeZip(files))
    assert.deepEqual(read.map(file => file.name), ['a/pack.json', 'a/b/c.webp'])
    assert.ok(read.every((file, index) => file.data.equals(files[index].data)))
  })
  test('nothing outside the archive, nothing damaged, nothing too big', () => {
    for (const bad of ['../x', '/etc/passwd', 'a/../../x', 'C:/x', 'a//b']) assert.equal(safePath(bad), null, bad)
    assert.equal(safePath('a\\b/c.png'), 'a/b/c.png')
    assert.throws(() => readZip(writeZip([{ name: '../evil.png', data: Buffer.from('x') }])), /outside the archive/)
    assert.throws(() => readZip(Buffer.from('not a zip at all, not at all')), /not a .zip/)
    const zipped = writeZip([{ name: 'a.txt', data: Buffer.from('hello hello hello') }])
    zipped[40] ^= 0xff // a byte of the packed text
    assert.throws(() => readZip(zipped), /damaged|would not unpack/)
    assert.throws(() => readZip(writeZip([{ name: 'big.txt', data: Buffer.alloc(2048) }]), { files: 10, file: 1024, total: 4096 }), /more than/)
  })
})

describe('the bundled pictures (art/)', () => {
  test('every character\'s card and avatar at every tier, named by its file; the tiers and characters named in both languages', () => {
    const look = packsIn(folder).look(null)
    for (const character of CHARACTERS) {
      for (const tier of TIERS) {
        assert.equal(look.tierArt(character, tier), `${character}/${tier}.webp`)
        assert.equal(look.tierFace(character, tier), `${character}/face-${tier}.webp`)
      }
      assert.ok(look.character(character).name, character)
    }
    assert.deepEqual(look.tier('high'), { name: 'High-schooler', names: { 'zh-cn': '高中生' } })
  })
  test('names and ids as packs give them', () => {
    assert.deepEqual(namesOf('Knight'), { name: 'Knight', names: {} })
    assert.deepEqual(namesOf({ name: 'Knight', 'zh-CN': '骑士', 'zh-TW': '騎士', url: 'x', ja: ' ' }), { name: 'Knight', names: { 'zh-cn': '骑士', 'zh-tw': '騎士' } })
    assert.deepEqual(namesOf({ 'zh-Hans-CN': '骑士', zh: '骑士' }), { name: '骑士', names: { 'zh-hans-cn': '骑士', zh: '骑士' } })
    assert.equal(namesOf({}), null)
    assert.equal(packId('Knights of the Prompt!'), 'knights-of-the-prompt')
  })
})

describe('a pack: every picture by its file', () => {
  test('imported from a .zip in a folder (as GitHub has it): its pictures kept as they are, over the bundled ones', () => {
    const packs = packsIn(folder)
    const kept = packs.install(readZip(knights()), { hint: 'knights-zip' })
    assert.deepEqual([kept.id, kept.kept, kept.skipped], ['knights', 15, ['tools/deep/make.sh']])
    const look = packs.look('knights')
    // its names, and the bundled ones for what it leaves out
    assert.deepEqual([look.tier('high').name, look.tier('high').names['zh-cn'], look.tier('chibi').name, look.tier('middle').name],
      ['Knight', '骑士', 'Squire', 'Middle-schooler'])
    assert.deepEqual([look.character('claude').name, look.character('gpt').name], ['Sir Claude', 'GPT'])
    // its files as pack.json names them, else the bundled ones
    assert.deepEqual([look.tierArt('claude', 'high'), look.tierFace('claude', 'high'), look.tierArt('claude', 'middle')],
      ['claude/knight.png', 'claude/knight-face.png', 'claude/middle.webp'])
    assert.match(look.file('claude/knight.png'), /packs\/knights\/claude\/knight\.png$/)
    assert.equal(look.file('claude/middle.webp'), path.join(ART, 'claude', 'middle.webp'))
    assert.equal(look.modelArt(['claude-opus-5-5']), 'claude/opus.png')
    // every picture of DeepSeek's to choose from: her tiers' first, then the ten
    assert.deepEqual(look.choices('deepseek', 'art'), [...TIERS.map(tier => `deepseek/${tier}.webp`), ...Array.from({ length: 10 }, (_, n) => `deepseek/image${n + 1}.webp`)])
    assert.deepEqual(look.choices('claude', 'face').slice(0, 4), ['claude/face-chibi.webp', 'claude/face-middle.webp', 'claude/knight-face.png', 'claude/face-university.webp'])
    // the same pack again replaces it
    packs.install(readZip(knights('other-folder')))
    assert.deepEqual(packs.ids(), ['knights'])
  })
  test('a model\'s own card and avatar: the first of `models` that fits it, wildcards and all', () => {
    const packs = packsIn(folder)
    packs.install([{ name: 'pack.json', data: Buffer.from(JSON.stringify({ name: 'Wildcards', models: {
      'claude-opus-5-5': { face: 'claude/face-chibi.webp' }, 'claude-opus-*': 'claude/middle.webp', 'claude-*': { art: 'claude/university.webp', face: 'claude/face-university.webp' },
      'gpt-6.1-*': 'gpt/nope.webp', '*-flash': 'deepseek/chibi.webp', 'seed-2.?-pro': 'doubao/university.webp' } })) }])
    const look = packs.look('wildcards')
    // the first that fits and gives one: Opus 5.5's own avatar, Opus's card
    assert.deepEqual([look.modelArt(['claude-opus-5-5']), look.modelFace(['claude-opus-5-5'])], ['claude/middle.webp', 'claude/face-chibi.webp'])
    assert.deepEqual([look.modelArt(['claude-opus-6']), look.modelFace(['claude-opus-6'])], ['claude/middle.webp', 'claude/face-university.webp'])
    assert.deepEqual([look.modelArt(['claude-haiku-5-5']), look.modelFace(['claude-haiku-5-5'])], ['claude/university.webp', 'claude/face-university.webp'])
    assert.equal(look.modelArt(['gpt-6.1-sol', 'gpt-6-1-sol']), null) // (a file it does not have is not worn)
    assert.equal(look.modelArt(['deepseek-flash']), 'deepseek/chibi.webp')
    // a model as another provider names it: Volcengine's dated build is Seed 2.1 Pro
    assert.equal(look.modelArt(['doubao-seed-2-1-pro-260628', 'doubao-seed-2-1-pro', 'seed-2-1-pro']), 'doubao/university.webp')
    // through the roster, by its id as DSH has it
    const work = createRoster(folder)
    work.usePack('wildcards')
    assert.deepEqual(work.resolve([{ provider: 'openai', id: 'gpt-6.1-sol' }, { provider: 'volcengine', id: 'doubao-seed-2-1-pro-260628' }, { provider: 'anthropic', id: 'claude-sonnet-5-5' }])
      .map(model => model.art), ['gpt/high.webp', 'doubao/university.webp', 'claude/university.webp'])
    // your own choice comes first, and stays first in the export
    work.pick('anthropic/claude-sonnet-5-5', { art: 'claude/chibi.webp' })
    assert.equal(work.resolve([{ provider: 'anthropic', id: 'claude-sonnet-5-5' }])[0].art, 'claude/chibi.webp')
    const exported = JSON.parse(readZip(work.exportPack('wildcards').bytes).find(file => file.name === 'wildcards/pack.json').data)
    assert.equal(Object.keys(exported.models)[0], 'claude-sonnet-5-5')
  })
  test('a picture\'s file as a pattern, as ls takes one: the first that matches in ls order, the pack\'s own before the bundled ones', () => {
    const packs = packsIn(folder)
    packs.install([
      { name: 'pack.json', data: Buffer.from(JSON.stringify({ name: 'Patterns',
        characters: { claude: { art: { high: 'claude/b*.png', middle: 'claude/u*', chibi: 'claude/[!b]*.png' } } },
        models: { 'claude-opus-*': { art: '*/opus.png', face: 'gpt/face-univ*' }, 'gpt-6-luna': 'gpt/univ*.webp',
          'gpt-6.1-*': 'gpt/b/c*.png', 'gpt-6-astra': 'claude/zzz*.png', 'deepseek-flash': 'deepseek/nope.webp' } })) },
      { name: 'claude/b2.png', data: picture('gpt/high.webp') },
      { name: 'claude/b10.png', data: picture('grok/high.webp') },
      { name: 'claude/u-own.png', data: picture('kimi/high.webp') },
      { name: 'claude/opus.png', data: picture('glm/high.webp') },
      { name: 'gpt/opus.png', data: picture('qwen/high.webp') }
    ])
    const look = packs.look('patterns')
    assert.equal(look.tierArt('claude', 'high'), 'claude/b10.png') // (ls order: b10 before b2)
    assert.equal(look.tierArt('claude', 'middle'), 'claude/u-own.png') // the pack's own before the bundled university.webp
    assert.equal(look.tierArt('claude', 'chibi'), 'claude/opus.png') // [!b]: not a b…
    assert.equal(look.modelArt(['claude-opus-5-5']), 'claude/opus.png') // */opus.png: every folder's, in ls order
    assert.equal(look.modelFace(['claude-opus-5-5']), 'gpt/face-university.webp') // matched among the bundled ones
    assert.equal(look.modelArt(['gpt-6-luna']), 'gpt/university.webp')
    // what is no picture's file, and a pattern no file matches, are said so on the pack (and worn as if unwritten)
    const listed = packs.list('patterns').find(pack => pack.id === 'patterns')
    assert.deepEqual(listed.problems, [
      'models.gpt-6.1-*: "gpt/b/c*.png" is not a picture\'s file (folder/file.webp, or a pattern like deepseek/image*.webp)',
      'models.gpt-6-astra.art: "claude/zzz*.png" matches no picture',
      'models.deepseek-flash.art: "deepseek/nope.webp" is not there'
    ])
    assert.equal(look.modelArt(['gpt-6-astra']), null)
    // exported, a bundled picture a pattern gives a model comes along
    const work = createRoster(folder)
    const names = readZip(work.exportPack('patterns').bytes).map(file => file.name)
    assert.ok(names.includes('patterns/gpt/university.webp') && names.includes('patterns/gpt/face-university.webp'), names.join())
  })
  test('a lone pack.json is a pack (names only), and a folder of pictures needs no pack.json', () => {
    const packs = packsIn(folder)
    assert.equal(packs.install([{ name: 'pack.json', data: Buffer.from('{ "name": "Ranks", "tiers": { "university": "Captain" } }') }]).id, 'ranks')
    assert.equal(packs.look('ranks').tier('university').name, 'Captain')
    assert.equal(packs.look('ranks').tierArt('gpt', 'high'), 'gpt/high.webp')
    assert.equal(packs.install([{ name: 'x/gpt/extra.webp', data: picture('claude/high.webp') }], { hint: 'my-gpt' }).id, 'my-gpt')
    assert.ok(packs.look('my-gpt').choices('gpt', 'art').includes('gpt/extra.webp'))
    assert.throws(() => packs.install([{ name: 'notes.txt', data: Buffer.from('x') }]), /no pack in it/)
    assert.throws(() => packs.install([{ name: 'pack.json', data: Buffer.from('[1]') }]), /not an object/)
  })
})

describe('your changes: beside the pack, never in it, written in when you export it', () => {
  test('ten pictures of DeepSeek\'s, the second chosen: the export has it as her model\'s, and all ten', () => {
    const work = createRoster(folder)
    work.importPack(knights(), 'knights.zip')
    work.usePack('knights')
    const before = fs.readFileSync(path.join(folder, 'packs', 'knights', 'pack.json'), 'utf8')
    work.pick('deepseek-official/deepseek-v4-pro', { art: 'deepseek/image2.webp', face: 'deepseek/face-university.webp' })
    const upload = work.upload(picture('kimi/high.webp'), 'image/webp', 'Kimi pose.webp', 'kimi')
    work.pick('openrouter/moonshotai/kimi-k3', { art: upload })
    work.pick('openai/gpt-6.1-sol', { art: 'gpt/university.webp' }) // a bundled picture, not the pack's
    const [deepseek, kimi] = work.resolve([{ provider: 'deepseek-official', id: 'deepseek-v4-pro' }, { provider: 'openrouter', id: 'moonshotai/kimi-k3' }])
    assert.deepEqual([deepseek.art, deepseek.face, deepseek.own, deepseek.tier, kimi.art], ['deepseek/image2.webp', 'deepseek/face-university.webp', true, 'high', 'kimi/Kimi pose.webp'])
    assert.equal(fs.readFileSync(path.join(folder, 'packs', 'knights', 'pack.json'), 'utf8'), before, 'the pack is never written to')
    assert.equal(work.packs().packs.find(pack => pack.id === 'knights').changes, 4) // three models, one picture
    // exported: its pack.json with your choices, and every picture
    const files = readZip(work.exportPack('knights').bytes)
    const json = JSON.parse(files.find(file => file.name === 'knights/pack.json').data)
    assert.deepEqual(json.models, { 'claude-opus-5-5': { art: 'claude/opus.png' }, 'deepseek-v4-pro': { art: 'deepseek/image2.webp', face: 'deepseek/face-university.webp' },
      'kimi-k3': { art: 'kimi/Kimi pose.webp' }, 'gpt-6.1-sol': { art: 'gpt/university.webp' } })
    assert.equal(json.roster, JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version)
    assert.equal(json.characters.claude.name, 'Sir Claude') // (the rest as it was)
    const names = files.map(file => file.name)
    assert.equal(names.filter(name => /^knights\/deepseek\/image\d+\.webp$/.test(name)).length, 10)
    for (const name of ['knights/kimi/Kimi pose.webp', 'knights/gpt/university.webp', 'knights/deepseek/face-university.webp', 'knights/README.md']) assert.ok(names.includes(name), name)
    // …and imported elsewhere, it is as you left it
    const elsewhere = createRoster(fs.mkdtempSync(path.join(folder, 'elsewhere-')))
    elsewhere.importPack(work.exportPack('knights').bytes, 'knights.zip')
    elsewhere.usePack('knights')
    assert.deepEqual(elsewhere.resolve([{ provider: 'deepseek-official', id: 'deepseek-v4-pro' }, { provider: 'openrouter', id: 'moonshotai/kimi-k3' }])
      .map(model => [model.art, model.own]), [['deepseek/image2.webp', false], ['kimi/Kimi pose.webp', false]])
    // taken back, discarded
    work.forget(upload)
    assert.equal(work.resolve([{ provider: 'openrouter', id: 'moonshotai/kimi-k3' }])[0].art, 'kimi/middle.webp')
    work.discardChanges('knights')
    assert.equal(work.resolve([{ provider: 'deepseek-official', id: 'deepseek-v4-pro' }])[0].art, 'deepseek/high.webp')
    assert.equal(work.packs().packs.find(pack => pack.id === 'knights').changes, 0)
  })
  test('a new, empty pack: the bundled pictures until you choose; its export has what you chose', () => {
    const work = createRoster(folder)
    assert.deepEqual(work.createPack('My Roster'), { id: 'my-roster', active: 'my-roster' })
    assert.deepEqual(work.createPack('My Roster'), { id: 'my-roster-2', active: 'my-roster-2' })
    const state = work.state()
    assert.deepEqual([state.pack.id, state.tiers.high.name, state.characters.claude.art.high], ['my-roster-2', 'High-schooler', 'claude/high.webp'])
    work.pick('anthropic/claude-opus-5-5', { art: 'claude/university.webp' })
    const names = readZip(work.exportPack('my-roster-2').bytes).map(file => file.name).sort()
    assert.deepEqual(names, ['my-roster-2/claude/university.webp', 'my-roster-2/pack.json'])
  })
})

describe('the packs that come with the roster', () => {
  test('Academy and Original Students: yours from the start, Academy in use; one you remove stays removed', () => {
    const work = createRoster(folder)
    const listed = work.packs()
    assert.deepEqual([DEFAULT, listed.active, listed.packs.map(pack => [pack.id, pack.version])], ['academy', 'academy', [['academy', '1.0.0'], ['original-students', '1.0.0']]])
    assert.deepEqual(listed.included.map(pack => [pack.file, pack.added, pack.names['zh-cn']]), [['academy', true, '学园'], ['original-students', true, '原版学生']])
    // every character, chibi to university student
    const look = work.roster.look()
    for (const character of CHARACTERS) for (const tier of TIERS) assert.match(look.file(look.tierArt(character, tier)), /packs\/academy\//, `${character} ${tier}`)
    work.removePack('original-students')
    assert.deepEqual([createRoster(folder).packs().active, createRoster(folder).packs().packs.map(pack => pack.id)], ['academy', ['academy']])
    assert.equal(work.addPack('original-students').id, 'original-students')
    work.removePack('academy') // (no Academy: the first pack you have)
    assert.equal(createRoster(folder).packs().active, 'original-students')
  })
  test('Original Students: her stages as the tiers, her portrait at them, her bond pictures and moods named', () => {
    const look = createRoster(folder).roster.packs.look('original-students')
    assert.equal(look.id, 'original-students')
    assert.deepEqual(TIERS.map(tier => look.tier(tier).name), ['Chibi', 'Stage 2', 'Stage 3', 'Awakened'])
    for (const character of ['gpt', 'claude', 'gemini', 'deepseek', 'grok']) {
      assert.deepEqual(look.choices(character, 'art'), [...TIERS.map(tier => `${character}/${tier}.webp`), `${character}/cafe.webp`, `${character}/festival.webp`, `${character}/home.webp`])
      assert.deepEqual([look.tierFace(character, 'chibi'), look.tierFace(character, 'high')], [`${character}/face-chibi.webp`, `${character}/face.webp`])
      assert.match(look.file(`${character}/high.webp`), /packs\/original-students\//)
    }
    assert.equal(look.tierArt('kimi', 'high'), 'kimi/high.webp') // the other characters: the bundled pictures
    assert.match(look.file('kimi/high.webp'), /art\/kimi\/high\.webp$/)
    assert.deepEqual(look.labels()['claude/festival.webp'], { name: 'Summer festival', names: { 'zh-cn': '夏日祭' } })
  })
})

describe('fetched from GitHub', () => {
  test('links: a repository, a folder in one, a file in one, a raw pack.json, a .zip', () => {
    assert.deepEqual(sourceOf('https://github.com/someone/knights'), { zip: 'https://codeload.github.com/someone/knights/zip/HEAD', within: '', hint: 'knights' })
    assert.deepEqual(sourceOf('https://github.com/someone/packs/tree/main/sets/knights'),
      { zip: 'https://codeload.github.com/someone/packs/zip/main', within: 'sets/knights', hint: 'knights' })
    assert.deepEqual(sourceOf('https://github.com/someone/packs/blob/v2/knights/pack.json'),
      { zip: 'https://codeload.github.com/someone/packs/zip/v2', within: 'knights', hint: 'knights' })
    assert.deepEqual(sourceOf('https://raw.githubusercontent.com/someone/packs/main/knights/pack.json'),
      { zip: 'https://codeload.github.com/someone/packs/zip/main', within: 'knights', hint: 'knights' })
    assert.deepEqual(sourceOf('https://example.com/dl/knights-v2.zip?x=1'), { zip: 'https://example.com/dl/knights-v2.zip?x=1', within: '', hint: 'knights-v2' })
    assert.deepEqual(sourceOf('https://github.com/RustColeone/dsh-llm-roster/blob/main/packs/original-students.zip'),
      { zip: 'https://raw.githubusercontent.com/RustColeone/dsh-llm-roster/main/packs/original-students.zip', within: '', hint: 'original-students' })
    assert.throws(() => sourceOf('file:///etc/passwd'), /https/)
    assert.throws(() => sourceOf('https://github.com/someone'), /names a repository/)
  })
  test('a folder of a repository: its pack, not the others', async () => {
    const archive = writeZip([
      { name: 'packs-main/README.md', data: Buffer.from('# packs') },
      { name: 'packs-main/sets/maids/pack.json', data: Buffer.from('{ "name": "Maids" }') },
      { name: 'packs-main/sets/knights/pack.json', data: Buffer.from('{ "name": "Knights" }') },
      { name: 'packs-main/sets/knights/claude/high.webp', data: picture('gpt/high.webp') }
    ])
    const asked = []
    const fetch = async url => { asked.push(url); return new Response(archive, { headers: { 'content-type': 'application/zip' } }) }
    const work = createRoster(folder, { fetch })
    assert.equal((await work.fetchPack('https://github.com/someone/packs/tree/main/sets/knights')).id, 'knights')
    assert.deepEqual(asked, ['https://codeload.github.com/someone/packs/zip/main'])
    await assert.rejects(work.fetchPack('https://github.com/someone/packs'), /more than one pack in it.*sets\/maids.*link the folder of one/)
    await assert.rejects(fetchPack('https://github.com/someone/nothing', { fetch: async () => new Response('Not Found', { status: 404 }) }), /HTTP 404.*public/)
  })
})

describe('the routes', () => {
  function connect (work) {
    const routes = new Map()
    serve({ fetch: { register: route => { for (const method of route.methods) routes.set(`${method} ${route.path}`, route.fetch) } } }, work)
    return (method, where, { body, type = 'application/json' } = {}) => routes.get(`${method} ${where.split('?')[0]}`)(
      new Request(`http://127.0.0.1:3093${where}`, { method, headers: { 'content-type': type },
        body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) }))
  }
  test('packs: listed, imported, used, made, exported with your changes, discarded, removed', async () => {
    const call = connect(createRoster(folder))
    const json = async response => ({ status: response.status, body: await response.json() })
    assert.equal((await json(await call('POST', `${ROUTES.packImport}?name=knights.zip`, { body: knights(), type: 'application/zip' }))).body.id, 'knights')
    assert.deepEqual((await json(await call('GET', ROUTES.packs))).body.packs.map(pack => pack.id), ['academy', 'knights', 'original-students'])
    // (a pack not in use shows its own pictures, for its preview)
    assert.equal((await call('GET', `${ROUTES.image}?art=claude/knight.png&pack=knights`)).headers.get('content-type'), 'image/png')
    const used = (await json(await call('POST', ROUTES.packs, { body: { use: 'knights' } }))).body
    assert.deepEqual([used.active, used.tiers.high.name, used.tiers.high.rarity, used.characters.claude.name, used.characters.claude.art.high],
      ['knights', 'Knight', 'SSR', 'Sir Claude', 'claude/knight.png'])
    assert.equal((await call('POST', ROUTES.pick, { body: { model: 'deepseek-official/deepseek-v4-pro', art: 'deepseek/image2.webp' } })).status, 200)
    const exported = await call('GET', `${ROUTES.packExport}?id=knights`)
    assert.equal(exported.headers.get('content-disposition'), 'attachment; filename="knights.zip"')
    const zipped = readZip(Buffer.from(await exported.arrayBuffer()))
    assert.equal(JSON.parse(zipped.find(file => file.name === 'knights/pack.json').data).models['deepseek-v4-pro'].art, 'deepseek/image2.webp')
    assert.equal((await json(await call('POST', ROUTES.packs, { body: { discard: 'knights' } }))).body.active, 'knights')
    assert.equal((await json(await call('POST', ROUTES.packs, { body: { create: 'Blank' } }))).body.active, 'blank')
    assert.equal((await json(await call('POST', ROUTES.packs, { body: { remove: 'blank' } }))).body.active, DEFAULT)
    // refusals
    assert.equal((await call('POST', ROUTES.packs, { body: { use: 'nope' } })).status, 400)
    assert.equal((await call('POST', `${ROUTES.packImport}?name=x.zip`, { body: Buffer.from('nope'), type: 'application/zip' })).status, 400)
    assert.equal((await call('GET', `${ROUTES.packExport}?id=nope`)).status, 400)
    assert.equal((await call('POST', ROUTES.packs, { body: { fetch: 'ftp://x' } })).status, 400)
    assert.equal((await call('POST', ROUTES.pick, { body: { model: 'openai/x', art: 'gpt/nope.webp' } })).status, 400)
  })
})
