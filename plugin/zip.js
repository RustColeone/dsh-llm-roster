// .zip files, read and written with Node's own zlib (no dependency): enough for art packs, which are a pack.json and
// folders of pictures. Reading is careful with what it is given: no file outside the archive's own folders, no
// encrypted or ZIP64 entries, and limits on how many files and how many bytes it unpacks to.
import zlib from 'node:zlib'

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50

export const LIMITS = { files: 4000, file: 16 * 1024 * 1024, total: 256 * 1024 * 1024 }

/** A path inside an archive as it may be written out: forward slashes, no `..`, `.` or empty parts, not absolute. */
export function safePath (name) {
  const parts = String(name).replace(/\\/g, '/').split('/')
  if (parts.at(-1) === '') parts.pop() // a folder
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || part.includes('\0')) || /^[a-z]:$/i.test(parts[0])) return null
  return parts.join('/')
}

/** The files of a .zip (`bytes`, a Buffer): [{ name, data }], folders left out. Throws a RangeError for what is not a
 * zip, or is one it will not unpack. */
export function readZip (bytes, limits = LIMITS) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes)
  // the end record is in the last 22 bytes, or before a comment of at most 64 KiB
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (bytes.readUInt32LE(at) === END) { end = at; break }
  }
  if (end < 0) throw new RangeError('not a .zip file')
  const count = bytes.readUInt16LE(end + 10)
  const size = bytes.readUInt32LE(end + 12)
  let at = bytes.readUInt32LE(end + 16)
  if (count === 0xffff || at === 0xffffffff || at + size > bytes.length) throw new RangeError('a ZIP64 or broken .zip: not unpacked')
  if (count > limits.files) throw new RangeError(`more than ${limits.files} files in the .zip`)
  const files = []
  let total = 0
  for (let index = 0; index < count; index++) {
    if (bytes.readUInt32LE(at) !== CENTRAL) throw new RangeError('a broken .zip')
    const flags = bytes.readUInt16LE(at + 8)
    const method = bytes.readUInt16LE(at + 10)
    const crc = bytes.readUInt32LE(at + 16)
    const packed = bytes.readUInt32LE(at + 20)
    const unpacked = bytes.readUInt32LE(at + 24)
    const nameLength = bytes.readUInt16LE(at + 28)
    const extraLength = bytes.readUInt16LE(at + 30)
    const commentLength = bytes.readUInt16LE(at + 32)
    const local = bytes.readUInt32LE(at + 42)
    const raw = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    at += 46 + nameLength + extraLength + commentLength
    if (raw.endsWith('/')) continue // a folder
    const name = safePath(raw)
    if (!name) throw new RangeError(`a file outside the archive: ${raw}`)
    if (flags & 1) throw new RangeError('an encrypted .zip: not unpacked')
    if (packed === 0xffffffff || unpacked === 0xffffffff) throw new RangeError('a ZIP64 .zip: not unpacked')
    if (unpacked > limits.file) throw new RangeError(`${name} is more than ${limits.file / 1024 / 1024} MB`)
    total += unpacked
    if (total > limits.total) throw new RangeError(`the .zip unpacks to more than ${limits.total / 1024 / 1024} MB`)
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== LOCAL) throw new RangeError('a broken .zip')
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const body = bytes.subarray(start, start + packed)
    if (body.length !== packed) throw new RangeError('a broken .zip')
    let data
    if (method === 0) data = Buffer.from(body)
    else if (method === 8) {
      try { data = zlib.inflateRawSync(body, { maxOutputLength: Math.max(1, unpacked) }) } catch { throw new RangeError(`${name} would not unpack`) }
    } else throw new RangeError(`${name} is packed in a way this cannot unpack (method ${method})`)
    if (data.length !== unpacked || zlib.crc32(data) !== crc) throw new RangeError(`${name} is damaged`)
    files.push({ name, data })
  }
  return files
}

/** A .zip of `files` ([{ name, data }]); pictures (already compressed) are stored, the rest deflated. */
export function writeZip (files, now = new Date()) {
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const day = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const locals = [], centrals = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data)
    const stored = /\.(webp|png|jpe?g|gif|zip)$/i.test(file.name)
    const body = stored ? data : zlib.deflateRawSync(data, { level: 9 })
    const crc = zlib.crc32(data)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(LOCAL, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(stored ? 0 : 8, 8)
    head.writeUInt16LE(time, 10); head.writeUInt16LE(day, 12); head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(stored ? 0 : 8, 10); central.writeUInt16LE(time, 12); central.writeUInt16LE(day, 14); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(head, name, body); centrals.push(central, name)
    offset += head.length + name.length + body.length
  }
  const directory = Buffer.concat(centrals)
  const tail = Buffer.alloc(22)
  tail.writeUInt32LE(END, 0); tail.writeUInt16LE(files.length, 8); tail.writeUInt16LE(files.length, 10)
  tail.writeUInt32LE(directory.length, 12); tail.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, tail])
}
