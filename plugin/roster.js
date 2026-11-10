// Who each model is: its character, its tier and the picture on its card. The bundled table (art/art.json) answers for
// the mainstream models; your own picks, kept in DSH's home (llm-roster/roster.json), win over it. Pictures you upload
// are kept beside it (llm-roster/art/<id>.<ext>).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ART = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'art')
export const TABLE = JSON.parse(fs.readFileSync(path.join(ART, 'art.json'), 'utf8'))
export const TIERS = Object.keys(TABLE.tiers)
export const CHARACTERS = Object.keys(TABLE.characters)

/** Image types an upload may be, and the extension each is kept under. */
export const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
export const MAX_UPLOAD = 4 * 1024 * 1024
const UPLOAD_ID = /^[a-f0-9]{12}$/
const BUNDLED = /^([a-z]+)\/([a-z]+)$/
export const REF = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/ // a credential reference (an environment variable's name)

/** The part of a model id that names the model: lowercase, without a `vendor/` prefix (OpenRouter's). */
export const bare = model => String(model ?? '').toLowerCase().split('/').pop().trim()

/** Whether `art` names a picture we can show: a bundled `character/tier`, or `custom:<id>`. */
export function validArt (art) {
  if (typeof art !== 'string') return false
  if (art.startsWith('custom:')) return UPLOAD_ID.test(art.slice(7))
  const found = BUNDLED.exec(art)
  return Boolean(found && CHARACTERS.includes(found[1]) && TIERS.includes(found[2]))
}

/** The character a model is, from its id, else its provider; null when neither says. */
export function characterOf (provider, model) {
  const id = bare(model)
  for (const [name, about] of Object.entries(TABLE.characters)) {
    if (about.match.some(pattern => new RegExp(pattern).test(id))) return name
  }
  for (const [name, about] of Object.entries(TABLE.characters)) {
    if (about.providers.includes(String(provider))) return name
  }
  return null
}

/** The tier a model is, from the words in its id. Words are matched whole, between dashes, dots or digits. */
export function tierOf (model) {
  const id = bare(model)
  for (const [tier, words] of Object.entries(TABLE.words)) {
    if (words.some(word => new RegExp(`(^|[^a-z])${word.replace(/[-]/g, '[-_ ]?')}([^a-z]|$)`).test(id))) return tier
  }
  return TABLE.fallback
}

/** The bundled pick for a model, `character/tier`, or null for a model of no known character. */
export function bundledArt (provider, model) {
  const exact = TABLE.models[bare(model)]
  if (exact) return exact
  const character = characterOf(provider, model)
  return character ? `${character}/${tierOf(model)}` : null
}

/** The roster file: your picks of art for each `provider/model`, and the pictures you uploaded. */
export class Roster {
  constructor (folder) {
    this.folder = folder
    this.file = path.join(folder, 'roster.json')
    this.uploads = path.join(folder, 'art')
    this.data = { version: 1, art: {}, uploads: {}, settings: {} }
    try {
      const read = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (read && typeof read === 'object') {
        this.data.art = Object.fromEntries(Object.entries(read.art ?? {}).filter(([, art]) => validArt(art)))
        this.data.uploads = Object.fromEntries(Object.entries(read.uploads ?? {})
          .filter(([id, about]) => UPLOAD_ID.test(id) && about && TYPES[about.type]))
        if (typeof read.settings?.aaKeyEnv === 'string' && REF.test(read.settings.aaKeyEnv)) {
          this.data.settings.aaKeyEnv = read.settings.aaKeyEnv
        }
      }
    } catch { /* none yet: the bundled picks alone */ }
  }

  save () {
    fs.mkdirSync(this.folder, { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 1))
    fs.renameSync(temporary, this.file)
  }

  /** The picture a model's card shows: your pick, else the bundled one, else null. */
  artOf (provider, model) {
    const mine = this.data.art[`${provider}/${model}`]
    if (mine && (!mine.startsWith('custom:') || this.data.uploads[mine.slice(7)])) return { art: mine, own: true }
    return { art: bundledArt(provider, model), own: false }
  }

  /** Pick `art` for a model, or let it go back to the bundled one (`art` null). */
  pick (key, art) {
    if (typeof key !== 'string' || !/^[^/\s]+\/\S+$/.test(key) || key.length > 300) throw new RangeError('a model is provider/model')
    if (art === null) delete this.data.art[key]
    else if (!validArt(art)) throw new RangeError(`not a picture: ${art}`)
    else if (art.startsWith('custom:') && !this.data.uploads[art.slice(7)]) throw new RangeError(`no such upload: ${art}`)
    else this.data.art[key] = art
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
    for (const [key, art] of Object.entries(this.data.art)) if (art === `custom:${id}`) delete this.data.art[key]
    this.save()
  }

  /** A picture's file and type: a bundled `character/tier` (or `character/face`), or an upload's id. */
  image ({ art, upload }) {
    if (upload !== undefined) {
      const about = UPLOAD_ID.test(upload) ? this.data.uploads[upload] : undefined
      return about ? { file: path.join(this.uploads, `${upload}.${TYPES[about.type]}`), type: about.type } : null
    }
    const found = BUNDLED.exec(String(art))
    if (!found || !CHARACTERS.includes(found[1]) || ![...TIERS, 'face'].includes(found[2])) return null
    return { file: path.join(ART, found[1], `${found[2]}.webp`), type: 'image/webp' }
  }
}
