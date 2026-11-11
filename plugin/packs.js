// Art packs: what the roster's characters look like, and what they and their tiers are called. Who each model is (its
// character and tier) is the roster's own (plugin/models.json); a pack only dresses them.
//
// A pack is a folder: a pack.json, and folders of pictures. pack.json names every picture by its file:
//
//     "characters": { "deepseek": { "art": { "high": "deepseek/high.webp", … }, "face": { "high": "deepseek/face-high.webp", … } } }
//     "models":     { "deepseek-v4-pro": { "art": "deepseek/image2.webp", "face": "deepseek/face-2.webp" },
//                     "claude-opus-*": { "art": "claude/opus.webp" } }
//
// A model wears its own picture (`models`: the first that matches its id, wildcards and all), else its character's at
// its tier (`characters`); anything a pack does not have comes from the bundled pack (art/). A picture's file may be a
// pattern, as `ls` takes one (`deepseek/image*.webp`): the first file that matches, in `ls` order, the pack's own
// before the bundled ones. The pictures in a character's folder are hers to choose from on her page.
//
// Your packs are kept in DSH's home (llm-roster/packs/<id>/): the ones that come with the roster (Academy, the bundled
// art; Original, packs/original.zip), new empty ones, and the ones you import or fetch from GitHub.
// A pack is never written to once kept. What you change while you use it (a model's picture you choose, a picture you
// upload) is kept beside it, as a pack of its own (llm-roster/changes/<id>/: a pack.json of `models`, and the pictures),
// worn over it; exporting the pack writes the two together into the .zip: its pack.json with your choices, and every
// picture it uses.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { readZip, writeZip } from './zip.js'

export const PICTURES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' }
export const ID = /^[a-z0-9][a-z0-9-]{0,47}$/
export const DEFAULT = 'academy' // the pack in use until you choose another: every character, chibi to university student
const WORDS = /^(readme|license|licence|copying|credits|notice)(\.(md|txt))?$/i // a pack's words about itself, kept with it
const LANGUAGE = /^[a-z]{2}(-[a-z0-9]{2,8}){0,2}$/i // a language's code: `zh-CN`, `zh-TW`, `en`, `ja` (any case)
const UPLOADS = 'uploads' // the folder of pictures for models of no character
const MAX_DOWNLOAD = 128 * 1024 * 1024

/** A pack's id from its name: lowercase words joined by dashes (`Knights of the Prompt` is `knights-of-the-prompt`). */
export const packId = name => String(name ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '')
const slugOf = model => String(model ?? '').toLowerCase().split('/').pop().trim().replace(/[^a-z0-9]+/g, '-')
const GLOB = /[*?[]/ // a wildcard: a pattern, not a name
/** A shell's pattern (as `ls` takes one) as a regular expression: `*` any run of characters and `?` one, neither across
 * a `/`; `[abc]`, `[a-z]` one of them, `[!abc]` none of them; everything else as it is. */
export function globOf (pattern) {
  let out = ''
  const text = String(pattern)
  for (let at = 0; at < text.length; at++) {
    const char = text[at]
    if (char === '*') out += '[^/]*'
    else if (char === '?') out += '[^/]'
    else if (char === '[' && text.indexOf(']', at + 2) > 0) {
      const end = text.indexOf(']', at + 2)
      const body = text.slice(at + 1, end)
      out += `[${/^[!^]/.test(body) ? `^${body.slice(1)}` : body}]`.replace(/\\/g, '\\\\')
      at = end
    } else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

/** Whether a pack's name for models (`claude-opus-5-5`, or a pattern: `claude-opus-*`, `gpt-?`, `seed-2.[01]-*`) fits a
 * model, by any of its `names` (its id as it is, and as models are matched: `gpt-6-1-sol` for `gpt-6.1-sol`). */
export function fits (pattern, names) {
  const given = String(pattern).toLowerCase().trim()
  const rules = [globOf(given), globOf(given.replace(/[^a-z0-9*?[\]!-]+/g, '-'))]
  return names.some(name => rules.some(found => found.test(String(name).toLowerCase())))
}
const extension = file => path.extname(String(file)).slice(1).toLowerCase()

/** A picture's file as a pack names it: `folder/file.ext`, one folder deep, a picture's extension; null otherwise. */
export function pictureFile (value) {
  const parts = String(value ?? '').replace(/\\/g, '/').split('/')
  if (parts.length !== 2 || parts.some(part => !part || part.startsWith('.') || part.length > 120 || /[\0<>:"|?*]/.test(part))) return null
  return PICTURES[extension(parts[1])] ? parts.join('/') : null
}
/** A picture's file as a pack names it: a file (`folder/file.ext`), or a pattern for one (`deepseek/image*.webp`, or
 * any folder's `opus.png`), one folder deep; null otherwise. */
export function picturePattern (value) {
  const text = String(value ?? '').replace(/\\/g, '/')
  if (!GLOB.test(text)) return pictureFile(text)
  const parts = text.split('/')
  return parts.length === 2 && parts.every(part => part && !part.startsWith('.') && part.length <= 120 && !/[\0<>:"|]/.test(part)) ? text : null
}
/** Whether a picture's file is an avatar: its name begins with `face`. */
const avatarName = file => /^face/i.test(path.basename(file))

/** A name as a pack gives it: a string, or `{ "name": "Knight", "zh-CN": "骑士" }` (`name`, and other languages' by
 * their codes, kept lowercase: `zh-cn`); null when it gives none. */
export function namesOf (given, most = 80) {
  const clean = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, most) : null
  if (typeof given === 'string') return clean(given) ? { name: clean(given), names: {} } : null
  if (!given || typeof given !== 'object' || Array.isArray(given)) return null
  const names = Object.fromEntries(Object.entries(given).filter(([key, value]) => key !== 'name' && LANGUAGE.test(key) && clean(value))
    .map(([key, value]) => [key.toLowerCase(), clean(value)]))
  const name = clean(given.name) ?? Object.values(names)[0] ?? null
  return name ? { name, names } : null
}

/** A picture's entry in `pictures`: its names, and its `stars` (3, 4 or 5) as an outfit in the summon; null for none. */
export function labelOf (given) {
  const names = namesOf(given)
  const stars = given && typeof given === 'object' && [3, 4, 5].includes(given.stars) ? given.stars : null
  return names || stars ? { ...(names ?? {}), ...(stars ? { stars } : {}) } : null
}

/** A folder's pack.json as it is (an empty one when it has none). */
function readJson (folder) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(folder, 'pack.json'), 'utf8'))
    return json && typeof json === 'object' && !Array.isArray(json) ? json : {}
  } catch { return {} }
}
function writeJson (folder, json) {
  const temporary = path.join(folder, `.pack.json.${process.pid}.tmp`)
  fs.writeFileSync(temporary, `${JSON.stringify(json, null, 2)}\n`)
  fs.renameSync(temporary, path.join(folder, 'pack.json'))
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
      author: text(json.author), license: text(json.license), description: namesOf(json.description, 400),
      url: /^https?:\/\//.test(String(json.url ?? '')) ? text(json.url, 400) : null,
      // its own version, and the roster's it was last exported from
      version: text(json.version, 40), roster: text(json.roster, 40)
    }
    this.tiers = Object.fromEntries(tiers.map(tier => [tier, namesOf(json.tiers?.[tier])]).filter(([, names]) => names))
    // a picture's file, or a pattern for one; what is neither is said so, not worn
    const picture = (value, where) => {
      if (value === undefined || value === null) return null
      const found = picturePattern(value)
      if (!found) this.problems.push(`${where}: "${value}" is not a picture's file (folder/file.webp, or a pattern like deepseek/image*.webp)`)
      return found
    }
    // each character: her names, and her card and avatar at each tier, by file
    const byTier = (given, where) => Object.fromEntries(tiers.map(tier => [tier, picture(given?.[tier], `${where}.${tier}`)]).filter(([, file]) => file))
    this.characters = Object.fromEntries(characters.map(found => {
      const given = json.characters?.[found]
      return [found, { names: namesOf(given), art: byTier(given?.art, `characters.${found}.art`), face: byTier(given?.face, `characters.${found}.face`) }]
    }))
    // each model's own card and avatar, by file (a plain file is its card), in the order pack.json gives them: the first
    // that fits a model is its
    this.models = []
    for (const [model, given] of Object.entries(json.models ?? {})) {
      const entry = typeof given === 'string' ? { art: picture(given, `models.${model}`), face: null }
        : given && typeof given === 'object' ? { art: picture(given.art, `models.${model}.art`), face: picture(given.face, `models.${model}.face`) } : null
      if (entry && (entry.art || entry.face)) this.models.push({ pattern: model, ...entry })
    }
    // what a picture is called, by its file, and its rarity as an outfit in the summon (`stars`: 3 to 5; else ★4)
    this.labels = Object.fromEntries(Object.entries(json.pictures ?? {}).map(([file, label]) => [pictureFile(file), labelOf(label)])
      .filter(([file, label]) => file && label))
    // its pictures: every picture file one folder deep
    this.files = new Map() // `folder/file.ext` → where it is
    const stamp = []
    let entries = []
    try { entries = fs.readdirSync(folder, { withFileTypes: true }) } catch { this.missing = true }
    for (const entry of entries) {
      if (entry.isFile() && entry.name === 'pack.json') {
        const { mtimeMs, size } = fs.statSync(path.join(folder, entry.name)); stamp.push(`pack.json:${mtimeMs}:${size}`)
      }
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      for (const file of fs.readdirSync(path.join(folder, entry.name), { withFileTypes: true })) {
        const name = pictureFile(`${entry.name}/${file.name}`)
        if (!file.isFile() || !name) continue
        const where = path.join(folder, entry.name, file.name)
        this.files.set(name, where)
        const { mtimeMs, size } = fs.statSync(where); stamp.push(`${name}:${mtimeMs}:${size}`)
      }
    }
    // what its files are now (a change of any is a new stamp, so the page asks for its pictures again)
    this.stamp = crypto.createHash('sha256').update(`${id}\n${stamp.sort().join('\n')}`).digest('hex').slice(0, 10)
  }

  /** The files in a character's folder (its name hers, in any case). */
  folderFiles (character) { return [...this.files.keys()].filter(file => file.split('/')[0].toLowerCase() === character) }
  /** The files its pack.json names for its characters' tiers. */
}

/** The pack in use: your changes to it, over it, over the bundled pack. */
export class Look {
  constructor (own, changes, base, tiers) {
    this.own = own // null: the bundled pack alone (when you have no pack)
    this.changes = own ? changes : null
    this.base = base
    this.tiersOrder = tiers
    this.packs = [this.changes, own, base].filter(Boolean)
    this.id = own?.id ?? null
    this.stamp = this.packs.map(pack => pack.stamp).join('')
  }

  get about () { return this.own ? { ...this.own.about, name: this.own.about.name ?? this.own.id, id: this.id } : { ...this.base.about, id: null } }
  /** A tier's names (`{ name, names }`). */
  tier (tier) { return this.packs.map(pack => pack.tiers[tier]).find(Boolean) ?? { name: tier, names: {} } }
  /** A character's names. */
  character (character) { return this.packs.map(pack => pack.characters[character]?.names).find(Boolean) ?? { name: character, names: {} } }
  /** What the pictures are called, by file. */
  labels () { return Object.assign({}, ...[...this.packs].reverse().map(pack => pack.labels)) }
  /** Where a picture's file is: the pack's, else the bundled pack's; null for none. */
  file (picture) { return this.packs.map(pack => pack.files.get(picture)).find(Boolean) ?? null }
  has (picture) { return Boolean(this.file(picture)) }
  /** The file a pack's picture names: the file itself, if there is one; for a pattern, the first file that matches in
   * `ls` order, among the pack's own (with your changes) before the bundled ones; null for none. */
  resolve (value) {
    if (!value) return null
    if (!GLOB.test(value)) return this.has(value) ? value : null
    const rule = globOf(value)
    const ls = files => [...files].filter(file => rule.test(file)).sort((one, other) => one.localeCompare(other))
    const own = ls(new Set([this.changes, this.own].filter(Boolean).flatMap(pack => [...pack.files.keys()])))
    return own[0] ?? ls(this.base.files.keys())[0] ?? null
  }
  /** A character's card or avatar at a tier, as the pack names it (else as the bundled pack does). */
  tierArt (character, tier) { return this.#first(pack => pack.characters[character]?.art[tier]) }
  tierFace (character, tier) { return this.#first(pack => pack.characters[character]?.face[tier]) }
  #first (named) {
    for (const pack of this.packs) {
      const file = this.resolve(named(pack))
      if (file) return file
    }
    return null
  }

  /** A model's own card or avatar: the first of `models` that fits it (by any of its `names`) and gives one, your
   * changes' before the pack's, the pack's before the bundled pack's; null for none. `mine`: your changes' alone. */
  modelArt (names) { return this.#model(names, 'art', this.packs) }
  modelFace (names) { return this.#model(names, 'face', this.packs) }
  mine (names, kind) { return this.changes ? this.#model(names, kind, [this.changes]) : null }
  #model (names, kind, packs) {
    for (const pack of packs) {
      for (const entry of pack.models) {
        if (!entry[kind] || !fits(entry.pattern, names)) continue
        const file = this.resolve(entry[kind])
        if (file) return file
      }
    }
    return null
  }

  /** A character's pictures to choose from: her tiers' first, then every other one in her folder, by name (image2 before
   * image10); her cards
   * (`art`) or her avatars (`face`: the ones named face…, or named for her tiers' avatars). */
  choices (character, kind) {
    const tiers = this.tiersOrder.map(tier => kind === 'art' ? this.tierArt(character, tier) : this.tierFace(character, tier)).filter(Boolean)
    const mapped = new Set(this.packs.flatMap(pack => Object.values(pack.characters[character]?.[kind === 'art' ? 'face' : 'art'] ?? {})).map(value => this.resolve(value)))
    const rest = this.packs.flatMap(pack => pack.folderFiles(character))
      .filter(file => (kind === 'face') === avatarName(file) && !mapped.has(file)).sort((one, other) => one.localeCompare(other, undefined, { numeric: true }))
    return [...new Set([...tiers, ...rest])]
  }
}

/** The packs: yours, kept in DSH's home (llm-roster/packs/<id>/), over the bundled pack (art/). */
export class Packs {
  constructor (home, { bundled, included = null, characters, tiers, roster = null }) {
    this.home = home ? path.join(home, 'packs') : null
    this.changesHome = home ? path.join(home, 'changes') : null
    this.bundled = bundled
    this.included = included // a folder of .zip packs that come with the roster (besides the bundled art)
    this.roster = roster // the roster's version, written into a pack it exports
    this.known = { characters, tiers }
    this.seenIncluded = new Map() // file → { at, about }
  }

  folderOf (id) { return this.home && typeof id === 'string' && ID.test(id) ? path.join(this.home, id) : null }
  pack (id) {
    const folder = this.folderOf(id)
    return folder && fs.existsSync(folder) ? new Pack(folder, id, this.known) : null
  }

  base () { return new Pack(this.bundled, null, this.known) }
  ids () {
    try { return fs.readdirSync(this.home, { withFileTypes: true }).filter(entry => entry.isDirectory() && ID.test(entry.name)).map(entry => entry.name).sort() } catch { return [] }
  }

  /** The pack in use: `id` if you have it, else the default (Academy), else your first, else none (the
   * bundled pictures alone). */
  active (id) {
    const ids = this.ids()
    return ids.includes(id) ? id : ids.includes(DEFAULT) ? DEFAULT : ids[0] ?? null
  }

  look (id) {
    const own = id ? this.pack(id) : null
    return new Look(own, own ? this.changes(id) : null, this.base(), this.known.tiers)
  }

  /** Your changes to the pack `id`, as a pack of their own (empty when there are none). */
  changesFolder (id) { return this.changesHome && typeof id === 'string' && ID.test(id) ? path.join(this.changesHome, id) : null }
  changes (id) { return new Pack(this.changesFolder(id), id, this.known) }
  /** How many changes you made to the pack `id`: models given a picture, and pictures added. */
  changeCount (id) {
    const changes = this.changes(id)
    return changes.models.length + changes.files.size
  }

  /** Each pack, as the page lists it. */
  list (active) {
    return this.ids().map(id => {
      const pack = this.pack(id)
      const look = this.look(id)
      const covered = this.known.characters.filter(character => pack.folderFiles(character).length || Object.keys(pack.characters[character].art).length)
      return {
        id, ...look.about, active: active === id, folder: pack.folder, stamp: look.stamp, pictures: pack.files.size, characters: covered,
        changes: this.changeCount(id),
        tiers: Object.fromEntries(this.known.tiers.map(tier => [tier, look.tier(tier)])), problems: [...pack.problems, ...unmatched(pack, look)],
        // a few of its faces, to show it by
        preview: (covered.length ? covered : this.known.characters).slice(0, 8).map(character => look.tierFace(character, 'high')).filter(Boolean)
      }
    })
  }

  // ---- the packs that come with the roster: Academy (the bundled art) and the .zip packs in packs/ ----
  #includedFiles (file) {
    if (file === 'academy') return filesIn(this.bundled)
    const where = this.included && /^[a-z0-9][a-z0-9-]*$/.test(String(file)) ? path.join(this.included, `${file}.zip`) : null
    if (!where || !fs.existsSync(where)) throw new RangeError(`no such pack comes with the roster: ${file}`)
    return readZip(fs.readFileSync(where))
  }

  /** The packs that come with the roster: each one's id, names, version, and whether you have it. */
  includedList () {
    let zips = []
    try { zips = fs.readdirSync(this.included).filter(name => /^[a-z0-9][a-z0-9-]*\.zip$/.test(name)).sort() } catch { /* none */ }
    const have = new Set(this.ids())
    return ['academy', ...zips.map(name => name.replace(/\.zip$/, ''))].map(file => {
      const where = file === 'academy' ? path.join(this.bundled, 'pack.json') : path.join(this.included, `${file}.zip`)
      const at = fs.statSync(where).mtimeMs
      let seen = this.seenIncluded.get(file)
      if (!seen || seen.at !== at) {
        let json = {}
        try { json = JSON.parse(this.#includedFiles(file).find(entry => entry.name.split('/').pop() === 'pack.json')?.data.toString('utf8') ?? '{}') } catch { /* named by its file */ }
        const names = namesOf(json) ?? { name: file, names: {} }
        seen = { at, about: { ...names, license: typeof json.license === 'string' ? json.license.slice(0, 200) : null,
          description: namesOf(json.description, 400), version: typeof json.version === 'string' ? json.version.slice(0, 40) : null,
          id: packId(names.name) || file } }
        this.seenIncluded.set(file, seen)
      }
      const added = have.has(seen.about.id) ? this.pack(seen.about.id) : null
      return { file, ...seen.about, added: Boolean(added), addedVersion: added?.about.version ?? null }
    })
  }

  /** Add a pack that comes with the roster; added again, it is put back as it came. */
  addIncluded (file) { return this.install(this.#includedFiles(file), { hint: file }) }

  /** Add the packs that come with the roster that were never added (`done`: the ones added before, which stay as you
   * left them, removed or not); the ones added now. */
  seed (done = []) {
    const added = []
    for (const pack of this.includedList()) {
      if (done.includes(pack.file)) continue
      try { if (!pack.added) this.addIncluded(pack.file) } catch { continue }
      added.push(pack.file)
    }
    return added
  }

  // ---- your changes to a pack: kept beside it, never in it ----
  #mine (id) {
    const pack = this.pack(id)
    if (!pack) throw new RangeError('choose a pack, or make a new one, to change it')
    return { pack, folder: this.changesFolder(id), look: this.look(id) }
  }

  /** A new, empty pack named `name`: its id. */
  create (name) {
    if (!this.home) throw new RangeError('no place to keep packs')
    const base = packId(name) || 'pack'
    let id = base
    for (let n = 2; this.ids().includes(id); n++) id = `${base}-${n}`
    fs.mkdirSync(path.join(this.home, id), { recursive: true })
    writeJson(path.join(this.home, id), { name: String(name ?? '').trim().slice(0, 80) || id, version: '1.0.0', characters: {}, models: {} })
    return id
  }

  /** Choose a model's own card and/or avatar while you use the pack `id` (`undefined` leaves one as it is, `null` lets
   * it go back to the pack's). */
  setModel (id, model, { art, face } = {}) {
    const { folder, look } = this.#mine(id)
    const key = String(model ?? '').toLowerCase().split('/').pop().trim()
    if (!key || key.length > 200) throw new RangeError('not a model')
    const json = readJson(folder)
    json.models = json.models && typeof json.models === 'object' ? json.models : {}
    const entry = { ...(json.models[key] ?? {}) }
    for (const [kind, value] of [['art', art], ['face', face]]) {
      if (value === undefined) continue
      if (value === null) { delete entry[kind]; continue }
      const file = pictureFile(value)
      if (!file || !look.has(file)) throw new RangeError(`no such picture: ${value}`)
      entry[kind] = file
    }
    if (entry.art || entry.face) json.models[key] = entry; else delete json.models[key]
    fs.mkdirSync(folder, { recursive: true })
    writeJson(folder, json)
  }

  /** Add a picture while you use the pack `id`, in the folder `folder` (a character's, else `uploads`); its file. */
  addFile (id, folder, name, bytes) {
    const { folder: changes, look } = this.#mine(id)
    const into = typeof folder === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(folder) ? folder : UPLOADS
    const type = extension(name)
    if (!PICTURES[type]) throw new RangeError(`pictures are ${Object.keys(PICTURES).join(', ')}`)
    const stem = path.basename(String(name), path.extname(String(name))).replace(/[^\p{L}\p{N}._ -]+/gu, '-').replace(/^[.\s-]+/, '').slice(0, 80) || 'picture'
    let file = `${into}/${stem}.${type}`
    for (let n = 2; look.has(file); n++) file = `${into}/${stem}-${n}.${type}`
    fs.mkdirSync(path.join(changes, into), { recursive: true })
    fs.writeFileSync(path.join(changes, ...file.split('/')), bytes)
    return file
  }

  /** Take back a picture you added while you use the pack `id`, and every model's use of it. */
  removeFile (id, file) {
    const { folder } = this.#mine(id)
    const changes = this.changes(id)
    if (!changes.files.has(file)) throw new RangeError(`not a picture you added: ${file}`)
    fs.rmSync(changes.files.get(file), { force: true })
    const json = readJson(folder)
    for (const [model, entry] of Object.entries(json.models ?? {})) {
      for (const kind of ['art', 'face']) if (entry?.[kind] === file) delete entry[kind]
      if (!entry?.art && !entry?.face) delete json.models[model]
    }
    writeJson(folder, json)
  }

  /** Let go of every change you made to the pack `id`. */
  discard (id) {
    const folder = this.changesFolder(id)
    if (folder) fs.rmSync(folder, { recursive: true, force: true })
  }

  // ---- in and out ----
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
    const id = packId(namesOf(json)?.name) || packId(hint) || packId(root.split('/').pop()) || 'pack'
    // what is kept: pack.json, the pack's words about itself, and its pictures (one folder deep)
    const kept = [], skipped = []
    for (const file of inside) {
      if (file.name === 'pack.json' || (!file.name.includes('/') && WORDS.test(file.name)) || pictureFile(file.name)) kept.push(file)
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
      if (!json) writeJson(temporary, { name: id })
      const folder = path.join(this.home, id)
      fs.rmSync(folder, { recursive: true, force: true })
      fs.renameSync(temporary, folder)
    } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
    return { id, kept: kept.length, skipped: skipped.slice(0, 20), skippedCount: skipped.length }
  }

  /** Remove the pack `id`, and your changes to it. */
  remove (id) {
    const folder = this.folderOf(id)
    if (!folder || !fs.existsSync(folder)) throw new RangeError(`no such pack: ${id}`)
    fs.rmSync(folder, { recursive: true, force: true })
    this.discard(id)
  }

  /** A pack as a .zip, in a folder of its name, with your changes to it: its pack.json with the models' pictures you
   * chose (and the roster's version it was exported from, `roster`), its words about itself, every picture in it, the
   * pictures you added, and any of the bundled pack's that a model was given. */
  zip (id) {
    const pack = this.pack(id)
    if (!pack) throw new RangeError(`no such pack: ${id}`)
    const json = readJson(pack.folder)
    const changes = readJson(this.changesFolder(id))
    // (your choices first: the first that fits a model is its, so they stay yours)
    const theirs = json.models && typeof json.models === 'object' ? json.models : {}
    const models = {}
    for (const [model, entry] of Object.entries(changes.models ?? {})) {
      const before = typeof theirs[model] === 'string' ? { art: theirs[model] } : theirs[model] && typeof theirs[model] === 'object' ? theirs[model] : {}
      models[model] = { ...before, ...entry }
    }
    for (const [model, entry] of Object.entries(theirs)) if (!(model in models)) models[model] = entry
    const merged = { ...json, models, ...(this.roster ? { roster: this.roster } : {}) }
    const files = new Map(filesIn(pack.folder).filter(file => file.name !== 'pack.json').map(file => [file.name, file.data]))
    const changed = this.changes(id)
    for (const [file, where] of changed.files) files.set(file, fs.readFileSync(where))
    // (a bundled picture a model wears, by its file or a pattern, comes along)
    const base = this.base()
    const look = this.look(id)
    for (const entry of Object.values(models)) {
      for (const value of typeof entry === 'string' ? [entry] : [entry?.art, entry?.face]) {
        const named = look.resolve(picturePattern(value))
        if (named && !files.has(named) && base.files.has(named)) files.set(named, fs.readFileSync(base.files.get(named)))
      }
    }
    const all = [{ name: 'pack.json', data: Buffer.from(`${JSON.stringify(merged, null, 2)}\n`) }, ...[...files].map(([name, data]) => ({ name, data }))]
    return { name: `${id}.zip`, bytes: writeZip(all.map(file => ({ ...file, name: `${id}/${file.name}` }))) }
  }
}

/** The pictures a pack's pack.json names that are nowhere (no such file, or a pattern no file matches), said so. */
function unmatched (pack, look) {
  const named = [
    ...Object.entries(pack.characters).flatMap(([character, about]) => ['art', 'face']
      .flatMap(kind => Object.entries(about[kind]).map(([tier, value]) => [`characters.${character}.${kind}.${tier}`, value]))),
    ...pack.models.flatMap(entry => ['art', 'face'].filter(kind => entry[kind]).map(kind => [`models.${entry.pattern}.${kind}`, entry[kind]]))
  ]
  return named.filter(([, value]) => !look.resolve(value)).map(([where, value]) => `${where}: "${value}" ${GLOB.test(value) ? 'matches no picture' : 'is not there'}`)
}

/** A pack folder's files: pack.json, its words about itself, its pictures one folder deep. */
function filesIn (folder) {
  const files = []
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name === 'pack.json' || WORDS.test(entry.name))) files.push({ name: entry.name, data: fs.readFileSync(path.join(folder, entry.name)) })
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    for (const file of fs.readdirSync(path.join(folder, entry.name), { withFileTypes: true }).sort((one, other) => one.name.localeCompare(other.name))) {
      if (file.isFile() && pictureFile(`${entry.name}/${file.name}`)) files.push({ name: `${entry.name}/${file.name}`, data: fs.readFileSync(path.join(folder, entry.name, file.name)) })
    }
  }
  return files
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
    return parts.length >= 2 && characters.includes(parts.at(-2).toLowerCase()) && PICTURES[extension(name)]
  }).map(name => name.split('/').slice(0, -2).join('/')).filter(folder => under(folder))
    .sort((one, other) => depth(one) - depth(other))
  return pictures.length ? pictures[0] : null
}

/** Where to fetch a pack from: a GitHub repository (`github.com/owner/repo`), a folder in one (`…/tree/<branch>/<path>`,
 * or a file in it, `…/blob/<branch>/<path>/pack.json`), a .zip on GitHub, or a link straight to a .zip or a pack.json. */
export function sourceOf (link) {
  let url
  try { url = new URL(String(link ?? '').trim()) } catch { throw new RangeError('not a link') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new RangeError('a link is https://…')
  const hint = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? 'pack').replace(/\.(zip|json)$/i, '')
  // a .zip, wherever it is (a release's, an archive); on GitHub, a file's page is the file itself
  const blob = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+\.zip)$/i.exec(url.pathname)
  if ((url.hostname === 'github.com' || url.hostname === 'www.github.com') && blob) {
    return { zip: `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`, within: '', hint }
  }
  if (/\.zip$/i.test(url.pathname)) return { zip: url.href, within: '', hint }
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
