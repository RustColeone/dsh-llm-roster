// Art packs: what the roster's characters look like, and what they and their tiers are called. Who each model is (its
// character and tier) is the roster's own (plugin/models.json); a pack only dresses them.
//
// A pack is a folder, as plain as can be, to be made and changed by hand:
//
//     pack.json          its name, author, license; the tiers' and characters' names; a model's own picture
//     claude/high.webp   a character's card picture for a tier (chibi, middle, high, university), .webp .png .jpg .gif
//     claude/face-high.png   her avatar at that tier (else `face`, else the card itself)
//     claude/opus.png    any more pictures: more to choose from, or one model's own (pack.json's `models`)
//
// The bundled pack is art/; yours are kept in DSH's home (llm-roster/packs/<id>/): imported from a .zip (or a lone
// pack.json), fetched from GitHub, or changed there in place. Anything a pack leaves out (a tier's name, a character's
// pictures) comes from the bundled pack, so a pack can be as small as a pack.json that renames the tiers.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { readZip, writeZip } from './zip.js'

export const PICTURES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' }
export const BUNDLED = 'bundled'
export const ID = /^[a-z0-9][a-z0-9-]{0,47}$/
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/ // a picture's name: its file's, lowercase, without the extension
const WORDS = /^(readme|license|licence|copying|credits|notice)(\.(md|txt))?$/i // a pack's words about itself, kept with it
const LANGUAGE = /^[a-z]{2}(-[a-z0-9]{2,8})?$/i
const MAX_DOWNLOAD = 128 * 1024 * 1024

/** A picture's name from its file's: lowercase, words joined by dashes (`Opus Special.PNG` is `opus-special`). */
export const pictureName = file => path.basename(String(file)).replace(/\.[^.]*$/, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
/** A pack's id from its name: lowercase words joined by dashes (`Knights of the Prompt` is `knights-of-the-prompt`). */
export const packId = name => String(name ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '')
const slugOf = model => String(model ?? '').toLowerCase().split('/').pop().trim().replace(/[^a-z0-9]+/g, '-')

/** A name as a pack gives it: a string, or `{ "name": "Knight", "zh": "骑士" }` (`name`, and other languages' by their
 * two-letter codes); null when it gives none. */
export function namesOf (given) {
  const clean = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null
  if (typeof given === 'string') return clean(given) ? { name: clean(given), names: {} } : null
  if (!given || typeof given !== 'object' || Array.isArray(given)) return null
  const names = Object.fromEntries(Object.entries(given).filter(([key, value]) => key !== 'name' && LANGUAGE.test(key) && clean(value))
    .map(([key, value]) => [key.toLowerCase(), clean(value)]))
  const name = clean(given.name) ?? Object.values(names)[0] ?? null
  return name ? { name, names } : null
}

/** One pack, as its folder is now. */
export class Pack {
  constructor (folder, id, { characters, tiers }) {
    this.folder = folder
    this.id = id
    this.problems = []
    let json = {}
    try {
      json = JSON.parse(fs.readFileSync(path.join(folder, 'pack.json'), 'utf8'))
      if (!json || typeof json !== 'object' || Array.isArray(json)) { json = {}; this.problems.push('pack.json is not an object { … }') }
    } catch (error) {
      if (error.code !== 'ENOENT') this.problems.push(`pack.json: ${error.message}`)
    }
    const text = (value, most = 200) => typeof value === 'string' && value.trim() ? value.trim().slice(0, most) : null
    this.about = {
      ...(namesOf(json) ?? { name: null, names: {} }),
      author: text(json.author), license: text(json.license), description: text(json.description, 400),
      url: /^https?:\/\//.test(String(json.url ?? '')) ? text(json.url, 400) : null
    }
    this.tiers = Object.fromEntries(tiers.map(tier => [tier, namesOf(json.tiers?.[tier])]).filter(([, names]) => names))
    this.characters = Object.fromEntries(characters.map(found => [found, namesOf(json.characters?.[found])]).filter(([, names]) => names))
    // the pictures: every picture file in a character's folder
    this.pictures = new Map() // `character/name` → file
    this.unknown = [] // folders that are no character the roster knows
    const stamp = []
    let entries = []
    try { entries = fs.readdirSync(folder, { withFileTypes: true }) } catch { this.missing = true }
    for (const entry of entries) {
      if (entry.isFile() && entry.name === 'pack.json') {
        const { mtimeMs, size } = fs.statSync(path.join(folder, entry.name)); stamp.push(`pack.json:${mtimeMs}:${size}`)
      }
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const character = entry.name.toLowerCase()
      if (!characters.includes(character)) { this.unknown.push(entry.name); continue }
      for (const file of fs.readdirSync(path.join(folder, entry.name), { withFileTypes: true })) {
        const type = PICTURES[path.extname(file.name).slice(1).toLowerCase()]
        const name = pictureName(file.name)
        if (!file.isFile() || !type || !NAME.test(name) || this.pictures.has(`${character}/${name}`)) continue
        const where = path.join(folder, entry.name, file.name)
        this.pictures.set(`${character}/${name}`, where)
        const { mtimeMs, size } = fs.statSync(where); stamp.push(`${character}/${file.name}:${mtimeMs}:${size}`)
      }
    }
    this.version = crypto.createHash('sha256').update(`${id}\n${stamp.sort().join('\n')}`).digest('hex').slice(0, 10)
    // a model's own picture: `model id: character/picture` (an extension, if given, is the file's and is let go)
    this.models = new Map()
    for (const [model, picture] of Object.entries(json.models ?? {})) {
      if (model === '_' || typeof picture !== 'string') continue
      const [character, file] = picture.toLowerCase().split('/')
      if (characters.includes(character) && file) this.models.set(slugOf(model), `${character}/${pictureName(file)}`)
    }
  }
}

/** The pack in use, over the bundled one: what it leaves out comes from the bundled pack. */
export class Look {
  constructor (own, base, tiers) {
    this.own = own // null: the bundled pack alone
    this.base = base
    this.tiersOrder = tiers
    this.packs = own ? [own, base] : [base]
    this.id = own?.id ?? base.id
    this.version = own ? `${own.version}${base.version}` : base.version
  }

  /** The pack's own words about itself (a pack of yours is not the bundled pack's author's). */
  get about () { return this.own ? { ...this.own.about, name: this.own.about.name ?? this.own.id, id: this.id } : { ...this.base.about, id: this.id } }
  /** A tier's names (`{ name, names }`). */
  tier (tier) { return this.packs.map(pack => pack.tiers[tier]).find(Boolean) ?? { name: tier, names: {} } }
  /** A character's names. */
  character (character) { return this.packs.map(pack => pack.characters[character]).find(Boolean) ?? { name: character, names: {} } }
  /** A picture's file (`character/name`), or null. */
  file (picture) { return this.packs.map(pack => pack.pictures.get(picture)).find(Boolean) ?? null }
  has (picture) { return Boolean(this.file(picture)) }
  /** A character's card pictures: her tiers' in order, then any more. */
  cards (character) {
    const names = new Set(this.packs.flatMap(pack => [...pack.pictures.keys()]).filter(key => key.startsWith(`${character}/`))
      .map(key => key.slice(character.length + 1)).filter(name => !/^face(-|$)/.test(name)))
    return [...this.tiersOrder.filter(tier => names.has(tier)), ...[...names].filter(name => !this.tiersOrder.includes(name)).sort()]
  }

  /** A character's avatars: her portrait, her tiers' faces in order, then any more. */
  faces (character) {
    const names = new Set(this.packs.flatMap(pack => [...pack.pictures.keys()]).filter(key => key.startsWith(`${character}/`))
      .map(key => key.slice(character.length + 1)).filter(name => /^face(-|$)/.test(name)))
    const ordered = ['face', ...this.tiersOrder.map(tier => `face-${tier}`)]
    return [...ordered.filter(name => names.has(name)), ...[...names].filter(name => !ordered.includes(name)).sort()]
  }

  /** The picture a pack gives a model of its own (by its id as it is, without a date, or without its family's name in
   * front: `forms`), if the pack has it. */
  modelArt (forms) {
    for (const pack of this.packs) {
      for (const form of forms) {
        const picture = pack.models.get(form)
        if (picture && this.has(picture)) return picture
      }
    }
    return null
  }

  /** The avatar that goes with a card picture (`character/name`, at `tier`): the face drawn for it, else for its tier,
   * else her portrait, else the card itself; the pack's own before the bundled pack's (so a pack's new card is never
   * worn with the old face). */
  faceOf (picture, tier) {
    const [character, name] = String(picture).split('/')
    for (const pack of this.packs) {
      for (const face of [`face-${name}`, `face-${tier}`, 'face', name]) if (pack.pictures.has(`${character}/${face}`)) return `${character}/${face}`
    }
    return null
  }
}

/** The packs: the bundled one (art/) and yours (DSH's home, llm-roster/packs/<id>/). */
export class Packs {
  constructor (home, { bundled, characters, tiers }) {
    this.home = home ? path.join(home, 'packs') : null
    this.bundled = bundled
    this.known = { characters, tiers }
  }

  folderOf (id) { return id === BUNDLED ? this.bundled : this.home && ID.test(String(id)) ? path.join(this.home, id) : null }
  pack (id) {
    const folder = this.folderOf(id)
    if (!folder || !fs.existsSync(path.join(folder, id === BUNDLED ? 'pack.json' : ''))) return null
    return new Pack(folder, id, this.known)
  }

  ids () {
    let yours = []
    try { yours = fs.readdirSync(this.home, { withFileTypes: true }).filter(entry => entry.isDirectory() && ID.test(entry.name)).map(entry => entry.name) } catch { /* none yet */ }
    return [BUNDLED, ...yours.filter(id => id !== BUNDLED).sort()]
  }

  /** The pack `id` in use (null, or one not there: the bundled pack). */
  look (id) {
    const base = this.pack(BUNDLED)
    const own = id && id !== BUNDLED ? this.pack(id) : null
    return new Look(own, base, this.known.tiers)
  }

  /** Each pack, as the page lists it. */
  list (active) {
    return this.ids().map(id => {
      const pack = this.pack(id)
      if (!pack) return null
      const look = this.look(id)
      const covered = this.known.characters.filter(character => [...pack.pictures.keys()].some(key => key.startsWith(`${character}/`)))
      return {
        id, ...look.about, bundled: id === BUNDLED, active: (active && this.pack(active) ? active : BUNDLED) === id,
        folder: pack.folder, version: look.version, pictures: pack.pictures.size, characters: covered,
        tiers: Object.fromEntries(this.known.tiers.map(tier => [tier, look.tier(tier)])),
        renamed: Object.keys(pack.characters).length, models: pack.models.size, unknown: pack.unknown, problems: pack.problems,
        // a few of its faces, to show it by
        preview: (covered.length ? covered : this.known.characters).slice(0, 8).map(character => look.faceOf(`${character}/high`, 'high')).filter(Boolean)
      }
    }).filter(Boolean)
  }

  /** Keep a pack from the files of a .zip (`[{ name, data }]`; its pack.json at the top or in a folder, as GitHub's
   * archives have it) or a lone pack.json; `hint` names it when its pack.json does not. Replaces a pack of the same
   * name. */
  install (files, { hint = 'pack', within = '' } = {}) {
    if (!this.home) throw new RangeError('no place to keep packs')
    const root = rootOf(files, within, this.known.characters)
    if (root === null) throw new RangeError(within ? `no pack in ${within}` : 'no pack in it: a pack has a pack.json, or a folder of pictures for a character')
    const inside = root ? files.filter(file => file.name.startsWith(`${root}/`)).map(file => ({ ...file, name: file.name.slice(root.length + 1) })) : files
    let json = null
    const found = inside.find(file => file.name === 'pack.json')
    if (found) {
      try { json = JSON.parse(found.data.toString('utf8')) } catch (error) { throw new RangeError(`its pack.json is not JSON: ${error.message}`) }
      if (!json || typeof json !== 'object' || Array.isArray(json)) throw new RangeError('its pack.json is not an object { … }')
    }
    let id = packId(namesOf(json)?.name) || packId(hint) || packId(root.split('/').pop()) || 'pack'
    if (id === BUNDLED) id = `${BUNDLED}-copy`
    // what is kept: pack.json, the pack's words about itself, and the characters' pictures
    const kept = [], skipped = []
    for (const file of inside) {
      const parts = file.name.split('/')
      const picture = parts.length === 2 && this.known.characters.includes(parts[0].toLowerCase()) && PICTURES[path.extname(parts[1]).slice(1).toLowerCase()]
      if (file.name === 'pack.json' || (parts.length === 1 && WORDS.test(parts[0]))) kept.push(file)
      else if (picture) kept.push({ ...file, name: `${parts[0].toLowerCase()}/${parts[1]}` })
      else skipped.push(file.name)
    }
    if (!kept.some(file => file.name.includes('/')) && !json) throw new RangeError('no pack in it: no pictures and no pack.json')
    fs.mkdirSync(this.home, { recursive: true })
    const temporary = path.join(this.home, `.${id}.${process.pid}.${Date.now()}`)
    try {
      for (const file of kept) {
        const where = path.join(temporary, ...file.name.split('/'))
        fs.mkdirSync(path.dirname(where), { recursive: true })
        fs.writeFileSync(where, file.data)
      }
      if (!json) fs.writeFileSync(path.join(temporary, 'pack.json'), `${JSON.stringify({ name: id }, null, 2)}\n`)
      const folder = path.join(this.home, id)
      fs.rmSync(folder, { recursive: true, force: true })
      fs.renameSync(temporary, folder)
    } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
    return { id, kept: kept.length, skipped: skipped.slice(0, 20), skippedCount: skipped.length }
  }

  remove (id) {
    if (id === BUNDLED) throw new RangeError('the bundled pack stays')
    const folder = this.folderOf(id)
    if (!folder || !fs.existsSync(folder)) throw new RangeError(`no such pack: ${id}`)
    fs.rmSync(folder, { recursive: true, force: true })
  }

  /** A pack as a .zip, in a folder of its name: pack.json, its words about itself and every picture. */
  zip (id) {
    const pack = this.pack(id)
    if (!pack) throw new RangeError(`no such pack: ${id}`)
    const top = id === BUNDLED ? packId(pack.about.name) || 'pack' : id
    const files = []
    for (const entry of fs.readdirSync(pack.folder, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name === 'pack.json' || WORDS.test(entry.name))) {
        files.push({ name: `${top}/${entry.name}`, data: fs.readFileSync(path.join(pack.folder, entry.name)) })
      }
    }
    for (const [picture, file] of [...pack.pictures.entries()].sort()) {
      files.push({ name: `${top}/${picture.split('/')[0]}/${path.basename(file)}`, data: fs.readFileSync(file) })
    }
    return { name: `${top}.zip`, bytes: writeZip(files) }
  }
}

/** Where the pack is in an archive's files: the folder of its shallowest pack.json (under `within`, if given), else the
 * shallowest folder holding a character's folder of pictures; '' for the top, null for none. */
function rootOf (files, within, characters) {
  const names = files.map(file => file.name)
  const depth = name => name.split('/').length
  // (a folder `within` the repository: as it is, or inside the archive's own top folder, as GitHub's archives have it)
  const inside = folder => folder === within || folder.startsWith(`${within}/`)
  const under = folder => !within || inside(folder) || inside(folder.split('/').slice(1).join('/'))
  const jsons = names.filter(name => (name === 'pack.json' || name.endsWith('/pack.json')) && under(name.replace(/\/?pack\.json$/, '')))
    .sort((one, other) => depth(one) - depth(other))
  const shallowest = jsons.filter(name => depth(name) === depth(jsons[0] ?? ''))
  if (shallowest.length > 1) {
    throw new RangeError(`more than one pack in it (${shallowest.map(name => name.replace(/\/?pack\.json$/, '')).join(', ')}): link the folder of one`)
  }
  if (jsons.length) return jsons[0].replace(/\/?pack\.json$/, '')
  const pictures = names.filter(name => {
    const parts = name.split('/')
    return parts.length >= 2 && characters.includes(parts.at(-2).toLowerCase()) && PICTURES[path.extname(name).slice(1).toLowerCase()]
  }).map(name => name.split('/').slice(0, -2).join('/')).filter(folder => under(folder))
    .sort((one, other) => depth(one) - depth(other))
  return pictures.length ? pictures[0] : null
}

/** Where to fetch a pack from: a GitHub repository (`github.com/owner/repo`), a folder in one (`…/tree/<branch>/<path>`,
 * or a file in it, `…/blob/<branch>/<path>/pack.json`), or a link straight to a .zip or a pack.json. */
export function sourceOf (link) {
  let url
  try { url = new URL(String(link ?? '').trim()) } catch { throw new RangeError('not a link') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new RangeError('a link is https://…')
  const hint = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? 'pack').replace(/\.(zip|json)$/i, '')
  if (/\.zip$/i.test(url.pathname)) return { zip: url.href, within: '', hint } // a .zip, wherever it is (a release's, an archive)
  if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
    const [owner, repo, kind, ref, ...rest] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (!owner || !repo) throw new RangeError('a GitHub link names a repository: https://github.com/owner/repo')
    const name = repo.replace(/\.git$/, '')
    let within = (kind === 'tree' || kind === 'blob') ? rest.join('/') : ''
    if (kind === 'blob') within = within.replace(/\/?[^/]*$/, '') // a file: its folder
    return { zip: `https://codeload.github.com/${owner}/${name}/zip/${kind === 'tree' || kind === 'blob' ? encodeURIComponent(ref) : 'HEAD'}`,
      within, hint: within ? within.split('/').pop() : name }
  }
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.endsWith('/pack.json')) {
    const [owner, repo, ref, ...rest] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const within = rest.slice(0, -1).join('/')
    return { zip: `https://codeload.github.com/${owner}/${repo}/zip/${encodeURIComponent(ref)}`, within, hint: within ? within.split('/').pop() : repo }
  }
  return { zip: url.href, within: '', hint }
}

/** Fetch a pack's files from a link (see `sourceOf`). */
export async function fetchPack (link, { fetch = globalThis.fetch } = {}) {
  const source = sourceOf(link)
  const response = await fetch(source.zip, { headers: { accept: 'application/zip, application/json, */*' }, redirect: 'follow',
    signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new RangeError(`${new URL(source.zip).hostname} answered HTTP ${response.status}${response.status === 404 ? ' (is the repository public, and the branch and folder right?)' : ''}`)
  if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD) throw new RangeError(`more than ${MAX_DOWNLOAD / 1024 / 1024} MB`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_DOWNLOAD) throw new RangeError(`more than ${MAX_DOWNLOAD / 1024 / 1024} MB`)
  return { ...source, files: filesOf(bytes) }
}

/** The files of what was given as a pack: a .zip, or a lone pack.json. */
export function filesOf (bytes) {
  const start = bytes.subarray(0, 64).toString('utf8').replace(/^﻿/, '').trimStart()
  if (start.startsWith('{')) return [{ name: 'pack.json', data: bytes }]
  return readZip(bytes)
}
