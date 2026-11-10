// Art packs: the bundled one, yours over it, and a pack's way in and out (a .zip, a lone pack.json, GitHub).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { BUNDLED, fetchPack, namesOf, packId, pictureName, sourceOf } from '../plugin/packs.js'
import { ART, CHARACTERS, packsIn, Roster, TIERS } from '../plugin/roster.js'
import { createRoster, ROUTES, serve } from '../plugin/server.js'
import { readZip, safePath, writeZip } from '../plugin/zip.js'

let folder
beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-roster-packs-')) })
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }))

const picture = name => fs.readFileSync(path.join(ART, name))
/** A pack of knights: the tiers renamed, Claude redrawn at two tiers (no avatars), and one model given its own picture. */
const knights = (top = 'knights-main') => writeZip([
  { name: `${top}/pack.json`, data: Buffer.from(JSON.stringify({ name: 'Knights', author: 'me', tiers: { high: { name: 'Knight', zh: '骑士' }, chibi: 'Squire' },
    characters: { claude: { name: 'Sir Claude' } }, models: { _: 'notes', 'claude-opus-5-5': 'claude/Opus.png' } })) },
  { name: `${top}/Claude/High.PNG`, data: picture('gpt/high.webp') },
  { name: `${top}/claude/opus.png`, data: picture('grok/high.webp') },
  { name: `${top}/README.md`, data: Buffer.from('# Knights') },
  { name: `${top}/tools/make.sh`, data: Buffer.from('echo') }
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

describe('the bundled pack', () => {
  test('every character, every tier, a card and an avatar; the tiers and characters named in both languages', () => {
    const look = packsIn(folder).look(null)
    assert.equal(look.id, BUNDLED)
    for (const character of CHARACTERS) {
      assert.deepEqual(look.cards(character).slice(0, 4), TIERS, character)
      for (const tier of TIERS) assert.ok(look.has(`${character}/face-${tier}`), `${character}/face-${tier}`)
      assert.ok(look.character(character).name, character)
    }
    assert.deepEqual(look.tier('high'), { name: 'High-schooler', names: { zh: '高中生' } })
    assert.equal(look.faceOf('claude/high', 'high'), 'claude/face-high')
  })
  test('names, ids and picture names as packs give them', () => {
    assert.deepEqual(namesOf('Knight'), { name: 'Knight', names: {} })
    assert.deepEqual(namesOf({ name: 'Knight', zh: '骑士', url: 'x', ja: ' ' }), { name: 'Knight', names: { zh: '骑士' } })
    assert.deepEqual(namesOf({ zh: '骑士' }), { name: '骑士', names: { zh: '骑士' } })
    assert.equal(namesOf({}), null)
    assert.equal(packId('Knights of the Prompt!'), 'knights-of-the-prompt')
    assert.equal(pictureName('My Opus_Special.PNG'), 'my-opus-special')
  })
})

describe('your packs', () => {
  test('imported from a .zip in a folder (as GitHub has it): kept, listed, used over the bundled pack, removed', () => {
    const packs = packsIn(folder)
    const kept = packs.install(readZip(knights()), { hint: 'knights-zip' })
    assert.deepEqual([kept.id, kept.kept, kept.skipped], ['knights', 4, ['tools/make.sh']])
    assert.deepEqual(fs.readdirSync(path.join(folder, 'packs', 'knights'), { recursive: true }).sort(),
      ['README.md', 'claude', 'claude/High.PNG', 'claude/opus.png', 'pack.json'])
    const look = packs.look('knights')
    // its names, and the bundled pack's for what it leaves out
    assert.deepEqual([look.tier('high').name, look.tier('high').names.zh, look.tier('chibi').name, look.tier('middle').name],
      ['Knight', '骑士', 'Squire', 'Middle-schooler'])
    assert.equal(look.character('claude').name, 'Sir Claude')
    assert.equal(look.character('gpt').name, 'GPT')
    // its pictures, then the bundled pack's
    assert.match(look.file('claude/high'), /knights\/claude\/High\.PNG$/)
    assert.equal(look.file('claude/middle'), path.join(ART, 'claude', 'middle.webp'))
    assert.deepEqual(look.cards('claude'), ['chibi', 'middle', 'high', 'university', 'opus'])
    // a new card is not worn with the old face: with no avatar drawn for it, the card is its own avatar
    assert.equal(look.faceOf('claude/high', 'high'), 'claude/high')
    assert.equal(look.faceOf('claude/middle', 'middle'), 'claude/face-middle')
    assert.equal(look.modelArt(['claude-opus-5-5']), 'claude/opus')
    // listed
    const listed = packs.list('knights')
    assert.deepEqual(listed.map(pack => [pack.id, pack.active]), [['bundled', false], ['knights', true]])
    assert.deepEqual([listed[1].name, listed[1].author, listed[1].license, listed[1].characters], ['Knights', 'me', null, ['claude']])
    // the same pack again replaces it
    packs.install(readZip(knights('other-folder')))
    assert.equal(packs.ids().length, 2)
    packs.remove('knights')
    assert.deepEqual(packs.ids(), ['bundled'])
    assert.throws(() => packs.remove(BUNDLED), /stays/)
  })
  test('a lone pack.json is a pack (names only), and a pack of pictures needs no pack.json', () => {
    const packs = packsIn(folder)
    assert.equal(packs.install([{ name: 'pack.json', data: Buffer.from('{ "name": "Ranks", "tiers": { "university": "Captain" } }') }]).id, 'ranks')
    assert.equal(packs.look('ranks').tier('university').name, 'Captain')
    assert.equal(packs.look('ranks').file('gpt/high'), path.join(ART, 'gpt', 'high.webp'))
    const bare = packs.install([{ name: 'x/gpt/high.webp', data: picture('claude/high.webp') }], { hint: 'my-gpt' })
    assert.equal(bare.id, 'my-gpt')
    assert.match(packs.look('my-gpt').file('gpt/high'), /my-gpt\/gpt\/high\.webp$/)
    assert.throws(() => packs.install([{ name: 'notes.txt', data: Buffer.from('x') }]), /no pack in it/)
    assert.throws(() => packs.install([{ name: 'pack.json', data: Buffer.from('[1]') }]), /not an object/)
    assert.equal(packs.install([{ name: 'pack.json', data: Buffer.from('{ "name": "bundled" }') }]).id, 'bundled-copy')
  })
  test('exported as a .zip, and imported again', () => {
    const packs = packsIn(folder)
    const { name, bytes } = packs.zip(BUNDLED)
    assert.equal(name, 'academy.zip')
    const files = readZip(bytes)
    assert.ok(files.some(file => file.name === 'academy/pack.json') && files.some(file => file.name === 'academy/CREDITS.md'))
    assert.equal(files.filter(file => file.name.endsWith('.webp')).length, packs.pack(BUNDLED).pictures.size)
    const again = packs.install(files)
    assert.equal(again.id, 'academy')
    assert.equal(packs.look('academy').tier('high').name, 'High-schooler')
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
    const missing = async () => new Response('Not Found', { status: 404 })
    await assert.rejects(fetchPack('https://github.com/someone/nothing', { fetch: missing }), /HTTP 404.*public/)
  })
})

describe('the pack in use', () => {
  function connect (work) {
    const routes = new Map()
    serve({ fetch: { register: route => { for (const method of route.methods) routes.set(`${method} ${route.path}`, route.fetch) } } }, work)
    return (method, where, { body, type = 'application/json' } = {}) => routes.get(`${method} ${where.split('?')[0]}`)(
      new Request(`http://127.0.0.1:3093${where}`, { method, headers: { 'content-type': type },
        body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) }))
  }
  test('its names and pictures on every card; your own picks still win; back to the bundled pack', async () => {
    const call = connect(createRoster(folder))
    const json = async response => ({ status: response.status, body: await response.json() })
    const imported = await json(await call('POST', `${ROUTES.packImport}?name=knights.zip`, { body: knights(), type: 'application/zip' }))
    assert.equal(imported.body.id, 'knights')
    const listed = (await json(await call('GET', ROUTES.packs))).body
    assert.deepEqual([listed.active, listed.packs.map(pack => pack.id)], ['bundled', ['bundled', 'knights']])
    // (a pack not in use shows its own pictures, for its preview)
    assert.equal((await call('GET', `${ROUTES.image}?art=claude/high&pack=knights`)).headers.get('content-type'), 'image/png')
    const used = (await json(await call('POST', ROUTES.packs, { body: { use: 'knights' } }))).body
    assert.deepEqual([used.active, used.tiers.high.name, used.tiers.high.rarity, used.characters.claude.name], ['knights', 'Knight', 'SSR', 'Sir Claude'])
    assert.deepEqual(used.characters.claude.pictures, ['chibi', 'middle', 'high', 'university', 'opus'])
    const resolve = async models => (await json(await call('POST', ROUTES.resolve, { body: { models } }))).body.models
    const [opus, sonnet] = await resolve([{ provider: 'anthropic', id: 'claude-opus-5-5' }, { provider: 'anthropic', id: 'claude-sonnet-5-5' }])
    assert.deepEqual([opus.art, opus.face, opus.character, opus.tier], ['claude/opus', 'claude/opus', 'claude', 'high']) // its own picture, its own tier
    assert.deepEqual([sonnet.art, sonnet.face], ['claude/middle', 'claude/face-middle'])
    assert.equal((await call('GET', `${ROUTES.image}?art=claude/high`)).headers.get('content-type'), 'image/png')
    // your pick of its picture
    assert.equal((await call('POST', ROUTES.pick, { body: { model: 'anthropic/claude-sonnet-5-5', art: 'claude/opus' } })).status, 200)
    assert.deepEqual((await resolve([{ provider: 'anthropic', id: 'claude-sonnet-5-5' }])).map(model => [model.art, model.tier]), [['claude/opus', 'middle']])
    // exported as it is
    const exported = await call('GET', `${ROUTES.packExport}?id=knights`)
    assert.equal(exported.headers.get('content-disposition'), 'attachment; filename="knights.zip"')
    assert.ok(readZip(Buffer.from(await exported.arrayBuffer())).some(file => file.name === 'knights/claude/opus.png'))
    // removed while in use: the bundled pack again, and a pick of a picture it does not have lets go
    assert.equal((await json(await call('POST', ROUTES.packs, { body: { remove: 'knights' } }))).body.active, 'bundled')
    const state = (await json(await call('GET', ROUTES.state))).body
    assert.deepEqual([state.pack.id, state.tiers.high.name], ['bundled', 'High-schooler'])
    assert.deepEqual((await resolve([{ provider: 'anthropic', id: 'claude-sonnet-5-5' }])).map(model => model.art), ['claude/middle'])
    // refusals
    assert.equal((await call('POST', ROUTES.packs, { body: { use: 'nope' } })).status, 400)
    assert.equal((await call('POST', `${ROUTES.packImport}?name=x.zip`, { body: Buffer.from('nope'), type: 'application/zip' })).status, 400)
    assert.equal((await call('GET', `${ROUTES.packExport}?id=nope`)).status, 400)
    assert.equal((await call('POST', ROUTES.packs, { body: { fetch: 'ftp://x' } })).status, 400)
    // the choice is kept
    await call('POST', `${ROUTES.packImport}?name=knights.zip`, { body: knights(), type: 'application/zip' })
    await call('POST', ROUTES.packs, { body: { use: 'knights' } })
    assert.equal(new Roster(folder).look().tier('high').name, 'Knight')
  })
})
