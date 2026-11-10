// Who each model is: its character, its tier, the picture on its card and its avatar. The roster's own table
// (plugin/models.json) answers who the mainstream models are and is the roster's lineup; the art pack in use (the bundled
// one, art/, or one of yours: plugin/packs.js) says what they look like and what they are called; your own picks, kept
// in DSH's home (llm-roster/roster.json), win over both. Pictures you upload are kept beside it
// (llm-roster/art/<id>.<ext>), and so are the providers you set aside whole ("Ignore all"), to be put back as they were.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLED, ID, Packs, PICTURES } from './packs.js'
import { formsOf, undated } from './rankings.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ART = path.join(HERE, '..', 'art')
export const MODELS = JSON.parse(fs.readFileSync(path.join(HERE, 'models.json'), 'utf8'))
/** The tiers, weakest to strongest, and the rarity each is. */
export const TIERS = ['chibi', 'middle', 'high', 'university']
export const RARITY = { chibi: 'R', middle: 'SR', high: 'SSR', university: 'UR' }
export const CHARACTERS = Object.keys(MODELS.characters)

/** Image types an upload may be, and the extension each is kept under. */
export const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
export const MAX_UPLOAD = 4 * 1024 * 1024
export const REF = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/ // a credential reference (an environment variable's name)
const UPLOAD_ID = /^[a-f0-9]{12}$/
const PROVIDER = /^[a-z0-9][a-z0-9-]{0,63}$/ // a DSH provider route
const PICTURE = /^([a-z0-9-]+)\/([a-z0-9][a-z0-9-]{0,63})$/ // a pack's picture: `character/name`

/** The part of a model id that names the model: lowercase, without a `vendor/` prefix (OpenRouter's). */
export const bare = model => String(model ?? '').toLowerCase().split('/').pop().trim()

const packed = (picture, face) => {
  const found = PICTURE.exec(String(picture))
  return Boolean(found && CHARACTERS.includes(found[1]) && /^face(-|$)/.test(found[2]) === face)
}
const custom = picture => typeof picture === 'string' && picture.startsWith('custom:') && UPLOAD_ID.test(picture.slice(7))

/** Whether `art` names a card picture: a pack's `character/name` (`gpt/high`), or `custom:<id>`. */
export const validArt = art => custom(art) || packed(art, false)
/** Whether `face` names an avatar: a pack's `character/face` or `character/face-<name>`, or `custom:<id>`. */
export const validFace = face => custom(face) || packed(face, true)

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

/** The packs, the bundled one in art/ and yours in `folder`/packs. */
export const packsIn = folder => new Packs(folder, { bundled: ART, characters: CHARACTERS, tiers: TIERS })

/** The roster file: your picks of art and avatar for each `provider/model`, your uploads, the providers you set aside,
 * and the roster's own settings. */
export class Roster {
  constructor (folder, { packs = packsIn(folder) } = {}) {
    this.folder = folder
    this.packs = packs
    this.file = path.join(folder, 'roster.json')
    this.uploads = path.join(folder, 'art')
    this.data = { version: 2, art: {}, faces: {}, uploads: {}, parked: {}, routes: {}, settings: {} }
    try {
      const read = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (read && typeof read === 'object') {
        this.data.art = Object.fromEntries(Object.entries(read.art ?? {}).filter(([, art]) => validArt(art)))
        this.data.faces = Object.fromEntries(Object.entries(read.faces ?? {}).filter(([, face]) => validFace(face)))
        this.data.uploads = Object.fromEntries(Object.entries(read.uploads ?? {})
          .filter(([id, about]) => UPLOAD_ID.test(id) && about && TYPES[about.type]))
        this.data.parked = Object.fromEntries(Object.entries(read.parked ?? {})
          .filter(([, about]) => about && typeof about.ns === 'string' && Array.isArray(about.path)))
        this.data.routes = Object.fromEntries(Object.entries(read.routes ?? {})
          .filter(([character, provider]) => CHARACTERS.includes(character) && PROVIDER.test(String(provider))))
        if (typeof read.settings?.aaKeyEnv === 'string' && REF.test(read.settings.aaKeyEnv)) {
          this.data.settings.aaKeyEnv = read.settings.aaKeyEnv
        }
        if (typeof read.settings?.pack === 'string' && ID.test(read.settings.pack)) this.data.settings.pack = read.settings.pack
      }
    } catch { /* none yet: the bundled picks alone */ }
  }

  save () {
    fs.mkdirSync(this.folder, { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 1))
    fs.renameSync(temporary, this.file)
  }

  #look = null
  /** The art pack in use, as its folder is now (read again with `fresh`, as when the page asks for the state). */
  look (fresh = false) {
    if (fresh || !this.#look) this.#look = this.packs.look(this.data.settings.pack)
    return this.#look
  }

  /** Whether a picture is there to be shown: an upload still kept, or a picture of the pack in use. */
  #kept = picture => custom(picture) ? Boolean(this.data.uploads[picture.slice(7)]) : this.look().has(picture)

  /** The picture a model's card shows: your pick, else the pack's for that model, else her tier's; null for a model of
   * no known character. */
  artOf (provider, model) {
    const mine = this.data.art[`${provider}/${model}`]
    if (mine && this.#kept(mine)) return { art: mine, own: true }
    const own = this.look().modelArt(formsOf(slug(model)))
    return { art: own ?? defaultArt(provider, model), own: false }
  }

  /** A model's character and tier as its card shows them: the picture's (a tier's picture is that tier; any other is the
   * model's own tier), none for a picture you uploaded. */
  whoOf (provider, model, art = this.artOf(provider, model).art) {
    if (!art || custom(art)) return { character: null, tier: null }
    const [character, name] = art.split('/')
    return { character, tier: TIERS.includes(name) ? name : (defaultArt(provider, model)?.split('/')[1] ?? tierOf(model)) }
  }

  /** A model's avatar: your pick, else your own picture's (when its card is one you uploaded), else the face that goes
   * with its card picture. */
  faceOf (provider, model, art = this.artOf(provider, model).art) {
    const mine = this.data.faces[`${provider}/${model}`]
    if (mine && this.#kept(mine)) return mine
    if (custom(art)) return art
    return art ? this.look().faceOf(art, this.whoOf(provider, model, art).tier) : null
  }

  /** Pick a model's `art` and/or `face` (undefined leaves one as it is; null lets it go back to the default). */
  pick (key, { art, face } = {}) {
    if (typeof key !== 'string' || !/^[^/\s]+\/\S+$/.test(key) || key.length > 300) throw new RangeError('a model is provider/model')
    const check = (value, valid, what) => {
      if (value === undefined || value === null) return
      if (!valid(value)) throw new RangeError(`not ${what}: ${value}`)
      if (!this.#kept(value)) throw new RangeError(custom(value) ? `no such upload: ${value}` : `the art pack has no ${value}`)
    }
    check(art, validArt, 'a picture'); check(face, validFace, 'an avatar')
    if (art === null) delete this.data.art[key]; else if (art !== undefined) this.data.art[key] = art
    if (face === null) delete this.data.faces[key]; else if (face !== undefined) this.data.faces[key] = face
    this.save()
  }

  /** The roster's own settings set on the page: `aaKeyEnv`, the variable holding your Artificial Analysis key (null
   * goes back to the plugin's settings). */
  set ({ aaKeyEnv }) {
    if (aaKeyEnv === null || aaKeyEnv === '') delete this.data.settings.aaKeyEnv
    else if (typeof aaKeyEnv === 'string' && REF.test(aaKeyEnv)) this.data.settings.aaKeyEnv = aaKeyEnv
    else throw new RangeError('a variable name is letters, digits and underscores, not starting with a digit')
    this.save()
  }

  /** Use the art pack `id` (null: the bundled one). */
  usePack (id) {
    if (id === null || id === undefined || id === BUNDLED) delete this.data.settings.pack
    else if (typeof id === 'string' && ID.test(id) && this.packs.pack(id)) this.data.settings.pack = id
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

  /** Keep an uploaded picture; its id. */
  upload (bytes, type, name = '') {
    const extension = TYPES[type]
    if (!extension) throw new RangeError(`pictures are ${Object.keys(TYPES).join(', ')}`)
    if (!bytes.length) throw new RangeError('the picture is empty')
    if (bytes.length > MAX_UPLOAD) throw new RangeError(`a picture is at most ${MAX_UPLOAD / 1024 / 1024} MB`)
    const id = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12)
    fs.mkdirSync(this.uploads, { recursive: true })
    fs.writeFileSync(path.join(this.uploads, `${id}.${extension}`), bytes)
    this.data.uploads[id] = { type, name: String(name).slice(0, 120), at: new Date().toISOString() }
    this.save()
    return id
  }

  /** Forget an uploaded picture, and every pick of it. */
  forget (id) {
    const about = this.data.uploads[id]
    if (!about) return
    fs.rmSync(path.join(this.uploads, `${id}.${TYPES[about.type]}`), { force: true })
    delete this.data.uploads[id]
    for (const picks of [this.data.art, this.data.faces]) {
      for (const [key, picture] of Object.entries(picks)) if (picture === `custom:${id}`) delete picks[key]
    }
    this.save()
  }

  /** A picture's file and type: a pack's `character/name` (the pack in use's, or the pack `pack`'s), or an upload's
   * id. */
  image ({ art, upload, pack }) {
    if (upload !== undefined) {
      const about = UPLOAD_ID.test(upload) ? this.data.uploads[upload] : undefined
      return about ? { file: path.join(this.uploads, `${upload}.${TYPES[about.type]}`), type: about.type } : null
    }
    if (!PICTURE.test(String(art))) return null
    const look = pack && ID.test(String(pack)) ? this.packs.look(pack) : this.look()
    const file = look.file(String(art))
    return file ? { file, type: PICTURES[path.extname(file).slice(1).toLowerCase()] } : null
  }
}
