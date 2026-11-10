// Who each model is: its character, its tier, the picture on its card and its avatar. The roster's own table
// (plugin/models.json) answers who the mainstream models are and is the roster's lineup, and gives every model its
// character and tier (and so its rarity); the art pack in use (plugin/packs.js) says what they look like and what they
// are called, with your changes to it (the pictures you choose and upload, kept beside it). The roster's own file, in
// DSH's home (llm-roster/roster.json), keeps the pack in use, the providers you set aside whole ("Ignore all") and the
// provider each character goes through.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ID, Packs, PICTURES, pictureFile } from './packs.js'
import { formsOf, undated } from './rankings.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ART = path.join(HERE, '..', 'art')
export const MODELS = JSON.parse(fs.readFileSync(path.join(HERE, 'models.json'), 'utf8'))
export const VERSION = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).version
/** The tiers, weakest to strongest, and the rarity each is. */
export const TIERS = ['chibi', 'middle', 'high', 'university']
export const RARITY = { chibi: 'R', middle: 'SR', high: 'SSR', university: 'UR' }
export const CHARACTERS = Object.keys(MODELS.characters)

/** Image types an upload may be, and the extension each is kept under. */
export const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
export const MAX_UPLOAD = 4 * 1024 * 1024
export const REF = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/ // a credential reference (an environment variable's name)
const PROVIDER = /^[a-z0-9][a-z0-9-]{0,63}$/ // a DSH provider route

/** The part of a model id that names the model: lowercase, without a `vendor/` prefix (OpenRouter's). */
export const bare = model => String(model ?? '').toLowerCase().split('/').pop().trim()
/** The names a pack's `models` may know a model by: its id as it is, and as models are matched across providers (without
 * a date or build stamp, without its family's name in front). */
const namesOf = model => [...new Set([bare(model), ...formsOf(slug(model))])]

/** The character a model is, from its id, else its provider; null when neither says. */
export function characterOf (provider, model) {
  const id = bare(model)
  for (const [name, about] of Object.entries(MODELS.characters)) {
    if (about.match.some(pattern => new RegExp(pattern).test(id))) return name
  }
  for (const [name, about] of Object.entries(MODELS.characters)) {
    if (about.providers.includes(String(provider))) return name
  }
  return null
}

/** The tier a model is, from the words in its id. Words are matched whole, between dashes, dots or digits. */
export function tierOf (model) {
  const id = bare(model)
  for (const [tier, words] of Object.entries(MODELS.words)) {
    if (words.some(word => new RegExp(`(^|[^a-z])${word.replace(/[-]/g, '[-_ ]?')}([^a-z]|$)`).test(id))) return tier
  }
  return MODELS.fallback
}

/** A model id as models are matched across providers: no vendor, words joined by dashes (OpenRouter's
 * `anthropic/claude-opus-5.5` is Anthropic's `claude-opus-5-5`). */
export const slug = model => bare(model).replace(/[^a-z0-9]+/g, '-')
const SLUGGED = new Map(Object.entries(MODELS.lineup).map(([model, art]) => [slug(model), art]))
const RELEASED = new Map(Object.entries(MODELS.released ?? {}).filter(([model]) => model !== '_').map(([model, date]) => [slug(model), date]))
/** The release date the roster gives a lineup model that neither Artificial Analysis nor OpenRouter lists (by its id as
 * it is, or undated), or null. */
export const releasedInLineup = model => RELEASED.get(slug(model)) ?? RELEASED.get(undated(slug(model))) ?? null

/** Who a model is, `character/tier`, or null for a model of no known character. */
export function defaultArt (provider, model) {
  // (also as another provider lists it: Volcengine's `doubao-seed-2-0-lite-260215` is the lineup's `seed-2.0-lite`)
  const exact = MODELS.lineup[bare(model)] ?? formsOf(slug(model)).map(form => SLUGGED.get(form)).find(Boolean)
  if (exact) return exact
  const character = characterOf(provider, model)
  return character ? `${character}/${tierOf(model)}` : null
}

/** The roster's lineup: the mainstream models of models.json, each from its character's home provider (through
 * OpenRouter, as `vendor/model`, for a character whose home it is). */
export const lineup = () => Object.entries(MODELS.lineup).map(([model, art]) => {
  const [character, tier] = art.split('/')
  const about = MODELS.characters[character]
  const id = about.home === 'openrouter' && about.vendor ? `${about.vendor}/${model}` : model
  return { id, provider: about.home, character, tier }
})

export const INCLUDED = path.join(HERE, '..', 'packs')
/** The packs: yours in `folder`/packs (with your changes in `folder`/changes), over the bundled pack (art/), and the
 * ones that come with the roster (Academy, from art/; the .zip packs in packs/). */
export const packsIn = folder => new Packs(folder, { bundled: ART, included: INCLUDED, characters: CHARACTERS, tiers: TIERS, roster: VERSION })

/** The roster file: the pack in use, the providers you set aside, the provider each character goes through, and the
 * roster's own settings. */
export class Roster {
  constructor (folder, { packs = packsIn(folder) } = {}) {
    this.folder = folder
    this.packs = packs
    this.file = path.join(folder, 'roster.json')
    this.data = { version: 3, parked: {}, routes: {}, settings: {} }
    this.before = null // the picks and uploads of a roster before 0.5.2, to bring into the pack in use (`migrate`)
    try {
      const read = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (read && typeof read === 'object') {
        this.data.parked = Object.fromEntries(Object.entries(read.parked ?? {})
          .filter(([, about]) => about && typeof about.ns === 'string' && Array.isArray(about.path)))
        this.data.routes = Object.fromEntries(Object.entries(read.routes ?? {})
          .filter(([character, provider]) => CHARACTERS.includes(character) && PROVIDER.test(String(provider))))
        if (typeof read.settings?.aaKeyEnv === 'string' && REF.test(read.settings.aaKeyEnv)) {
          this.data.settings.aaKeyEnv = read.settings.aaKeyEnv
        }
        if (typeof read.settings?.pack === 'string' && ID.test(read.settings.pack)) this.data.settings.pack = read.settings.pack
        if (Array.isArray(read.settings?.seeded)) this.data.settings.seeded = read.settings.seeded.filter(file => typeof file === 'string' && ID.test(file))
        if (Object.keys(read.art ?? {}).length || Object.keys(read.faces ?? {}).length) {
          this.before = { art: read.art ?? {}, faces: read.faces ?? {}, uploads: read.uploads ?? {} }
        }
      }
    } catch { /* none yet */ }
  }

  save () {
    fs.mkdirSync(this.folder, { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 1))
    fs.renameSync(temporary, this.file)
  }

  /** The pack in use: the one you chose, else Academy, else your first; null when you have none. */
  get active () { return this.packs.active(this.data.settings.pack) }

  #look = null
  /** The pack in use as it looks, with your changes, as its folders are now (read again with `fresh`, as when the page
   * asks for the state). */
  look (fresh = false) {
    if (fresh || !this.#look) this.#look = this.packs.look(this.active)
    return this.#look
  }

  /** A model's character and tier (and so its rarity): the roster's own word on it; none for a model of no known
   * character. */
  whoOf (provider, model) {
    const who = defaultArt(provider, model)
    return who ? { character: who.split('/')[0], tier: who.split('/')[1] } : { character: null, tier: null }
  }

  /** The picture a model's card shows: its own in the pack (your choice, else the pack's), else its character's at its
   * tier; `own` when you chose it. */
  artOf (provider, model) {
    const look = this.look()
    const names = namesOf(model)
    const { character, tier } = this.whoOf(provider, model)
    const own = look.modelArt(names)
    return { art: own ?? (character ? look.tierArt(character, tier) : null), own: Boolean(own && look.mine(names, 'art') === own) }
  }

  /** A model's avatar: its own in the pack, else its character's at its tier; a model of no character wears its card. */
  faceOf (provider, model, art = this.artOf(provider, model).art) {
    const look = this.look()
    const { character, tier } = this.whoOf(provider, model)
    return look.modelFace(namesOf(model)) ?? (character ? look.tierFace(character, tier) : art)
  }

  /** Choose a model's card and/or avatar (a picture's file; null: back to the pack's), as a change to the pack in use.
   * `key` is `provider/model`. */
  pick (key, { art, face } = {}) {
    if (typeof key !== 'string' || !/^[^/\s]+\/\S+$/.test(key) || key.length > 300) throw new RangeError('a model is provider/model')
    this.packs.setModel(this.active, key.slice(key.indexOf('/') + 1), { art, face })
    this.look(true)
  }

  /** Add an uploaded picture to the pack in use, in `character`'s folder (else `uploads`); its file. */
  upload (bytes, type, name = '', character = null) {
    const extension = TYPES[type]
    if (!extension) throw new RangeError(`pictures are ${Object.keys(TYPES).join(', ')}`)
    if (!bytes.length) throw new RangeError('the picture is empty')
    if (bytes.length > MAX_UPLOAD) throw new RangeError(`a picture is at most ${MAX_UPLOAD / 1024 / 1024} MB`)
    const stem = String(name).replace(/\.[^.]*$/, '') || 'picture'
    const file = this.packs.addFile(this.active, CHARACTERS.includes(character) ? character : null, `${stem}.${extension}`, bytes)
    this.look(true)
    return file
  }

  /** Take back a picture you added. */
  forget (file) {
    this.packs.removeFile(this.active, String(file))
    this.look(true)
  }

  /** The roster's own settings set on the page: `aaKeyEnv`, the variable holding your Artificial Analysis key (null
   * goes back to the plugin's settings). */
  set ({ aaKeyEnv }) {
    if (aaKeyEnv === null || aaKeyEnv === '') delete this.data.settings.aaKeyEnv
    else if (typeof aaKeyEnv === 'string' && REF.test(aaKeyEnv)) this.data.settings.aaKeyEnv = aaKeyEnv
    else throw new RangeError('a variable name is letters, digits and underscores, not starting with a digit')
    this.save()
  }

  /** Add the packs that come with the roster, once each: one you remove stays removed. */
  seedPacks () {
    const done = this.data.settings.seeded ?? []
    const added = this.packs.seed(done)
    if (added.length) { this.data.settings.seeded = [...done, ...added]; this.save() }
    return added
  }

  /** Bring the picks and uploads of a roster before 0.5.2 (kept in roster.json) into the pack in use, as your changes to
   * it, once. */
  migrate () {
    if (!this.before || !this.active) return
    const look = this.look(true)
    const fileOf = (key, picture, kind) => {
      const value = String(picture)
      if (value.startsWith('custom:')) {
        const id = value.slice(7)
        const type = this.before.uploads[id]?.type
        const where = TYPES[type] ? path.join(this.folder, 'art', `${id}.${TYPES[type]}`) : null
        if (!where || !fs.existsSync(where)) return null
        return this.packs.addFile(this.active, this.whoOf(key.split('/')[0], key.slice(key.indexOf('/') + 1)).character,
          this.before.uploads[id].name || `${id}.${TYPES[type]}`, fs.readFileSync(where))
      }
      const [character, name] = value.split('/')
      if (TIERS.includes(name)) return look.tierArt(character, name)
      if (name?.startsWith('face-') && TIERS.includes(name.slice(5))) return look.tierFace(character, name.slice(5))
      return look.choices(character, kind).find(file => path.basename(file).replace(/\.[^.]*$/, '').toLowerCase() === name) ?? null
    }
    for (const [kind, picks] of [['art', this.before.art], ['face', this.before.faces]]) {
      for (const [key, picture] of Object.entries(picks)) {
        try {
          const file = fileOf(key, picture, kind)
          if (file && key.includes('/')) this.packs.setModel(this.active, key.slice(key.indexOf('/') + 1), { [kind]: file })
        } catch { /* a pick that cannot be brought over is let go */ }
      }
    }
    this.before = null
    this.save()
    this.look(true)
  }

  /** Use the pack `id`. */
  usePack (id) {
    if (typeof id === 'string' && ID.test(id) && this.packs.pack(id)) this.data.settings.pack = id
    else throw new RangeError(`no such pack: ${id}`)
    this.save()
    return this.look(true)
  }

  /** The provider a character's lineup goes through: her own (`provider` null, or her home), OpenRouter, or an
   * OpenAI-compatible endpoint of yours. */
  route (character, provider) {
    if (!CHARACTERS.includes(character)) throw new RangeError(`no such character: ${character}`)
    if (provider === null || provider === undefined || provider === MODELS.characters[character].home) delete this.data.routes[character]
    else if (typeof provider === 'string' && PROVIDER.test(provider)) this.data.routes[character] = provider
    else throw new RangeError('not a provider')
    this.save()
  }

  /** Set a provider aside whole: its profile as it was in DSH's settings (`ns`, `path`, `profile`), to put back. */
  park (provider, { ns, path: where, profile }) {
    if (typeof provider !== 'string' || !PROVIDER.test(provider)) throw new RangeError('not a provider')
    if (typeof ns !== 'string' || !Array.isArray(where) || !where.length || where.some(part => typeof part !== 'string')) {
      throw new RangeError('a parked provider needs its settings namespace and path')
    }
    this.data.parked[provider] = { ns, path: where, profile: profile ?? {}, at: new Date().toISOString() }
    this.save()
  }

  /** Forget a parked provider; what was kept of it. */
  unpark (provider) {
    const found = this.data.parked[provider] ?? null
    if (found) { delete this.data.parked[provider]; this.save() }
    return found
  }

  /** A picture's file and type, by its file in the pack in use (or in the pack `pack`, for its preview). */
  image ({ art, pack }) {
    const file = pictureFile(art)
    if (!file) return null
    const look = pack && ID.test(String(pack)) ? this.packs.look(pack) : this.look()
    const where = look.file(file)
    return where ? { file: where, type: PICTURES[path.extname(where).slice(1).toLowerCase()] } : null
  }
}
