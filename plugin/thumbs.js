// Thumbnails of the art packs' pictures, for what shows them small (the roster's cards, the album, the summon's cards,
// the pickers); the full pictures are for a character's page, the banner and the viewer. They are made with sharp, when
// it is installed (an optional dependency: without it, every picture is served whole), kept in DSH's home
// (llm-roster/thumbs/), each named by its picture's file, size and time, so a changed picture gets a new one; a pack's
// are made in the background as it is added or chosen, and any other as it is first asked for.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const WIDTH = 320 // wide enough for a card twice over on a sharp screen
const QUALITY = 80
const KEPT = 2000 // thumbnails kept at most (the oldest go first)

let found // the sharp module, once looked for (null: none)
const sharpModule = async () => {
  if (found === undefined) {
    try { found = (await import('sharp')).default ?? null } catch { found = null }
  }
  return found
}

export class Thumbs {
  /** `load`: how sharp is found (for the tests: one that finds none). */
  constructor (folder, { load = sharpModule } = {}) {
    this.root = folder ? path.join(folder, 'thumbs') : null
    this.load = load
    this.making = new Map() // a thumbnail's file → its making
    this.whole = new Set() // pictures small enough to be their own thumbnail
    this.queue = []
    this.warming = false
  }

  /** The thumbnail's file for a picture's (`file`): made now if need be; null to serve the picture itself (no sharp, a
   * picture already small, an animated GIF, or one it cannot read). */
  async of (file) {
    if (!this.root || !file || /\.gif$/i.test(file) || this.whole.has(file)) return null
    let stat
    try { stat = fs.statSync(file) } catch { return null }
    const name = crypto.createHash('sha1').update(`${path.resolve(file)}\n${stat.size}\n${stat.mtimeMs}\n${WIDTH}`).digest('hex')
    const target = path.join(this.root, `${name}.webp`)
    if (fs.existsSync(target)) return target
    if (this.making.has(target)) return this.making.get(target)
    const making = (async () => {
      const sharp = await this.load()
      if (!sharp) return null
      const about = await sharp(file).metadata()
      if (!about.width || about.width <= WIDTH) { this.whole.add(file); return null }
      fs.mkdirSync(this.root, { recursive: true })
      const temporary = `${target}.${process.pid}.tmp`
      await sharp(file).resize({ width: WIDTH }).webp({ quality: QUALITY }).toFile(temporary)
      fs.renameSync(temporary, target)
      return target
    })().catch(() => null).finally(() => this.making.delete(target))
    this.making.set(target, making)
    return making
  }

  /** Make these pictures' thumbnails in the background, one at a time (a pack's, as it is added or chosen). */
  warm (files) {
    if (!this.root) return
    for (const file of files) if (file && !this.queue.includes(file)) this.queue.push(file)
    if (this.warming) return
    this.warming = true
    const next = async () => {
      const file = this.queue.shift()
      if (!file) { this.warming = false; this.prune(); return }
      await this.of(file)
      const timer = setTimeout(next, 5)
      timer.unref?.()
    }
    const timer = setTimeout(next, 50)
    timer.unref?.()
  }

  /** Keep at most KEPT thumbnails: the oldest go. */
  prune () {
    try {
      const files = fs.readdirSync(this.root).filter(name => name.endsWith('.webp'))
      if (files.length <= KEPT) return
      const dated = files.map(name => ({ name, at: fs.statSync(path.join(this.root, name)).mtimeMs })).sort((one, other) => one.at - other.at)
      for (const { name } of dated.slice(0, files.length - KEPT)) fs.rmSync(path.join(this.root, name), { force: true })
    } catch { /* none to prune */ }
  }
}
