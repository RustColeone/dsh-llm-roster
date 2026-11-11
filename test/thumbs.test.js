// The pictures' thumbnails: made with @napi-rs/image when it is there, kept by the picture's file, size and time, served
// by the image route for `size=thumb`; without it, or for a picture already small, the picture itself.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createRoster, ROUTES, serve } from '../plugin/server.js'
import { Thumbs, WIDTH } from '../plugin/thumbs.js'

let Transformer = null
try { Transformer = (await import('@napi-rs/image')).Transformer } catch { /* not installed: those tests are skipped */ }
const sizeOf = async bytes => { const about = await new Transformer(bytes).metadata(); return [about.width, about.height] }
let folder
beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-roster-thumbs-')) })
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }))

const picture = async (name, width, height) => {
  const file = path.join(folder, name)
  const pixels = new Uint8Array(width * height * 4).map((value, at) => (at % 4 === 3 ? 255 : (at * 7) % 251))
  fs.writeFileSync(file, await Transformer.fromRgbaPixels(pixels, width, height).webp(90))
  return file
}

describe('thumbnails', () => {
  test('without the image library: the picture itself', async () => {
    const thumbs = new Thumbs(folder, { load: async () => null })
    fs.writeFileSync(path.join(folder, 'a.webp'), 'x')
    assert.equal(await thumbs.of(path.join(folder, 'a.webp')), null)
  })
  test('made once, 320 wide, kept by the picture\'s file, size and time; a picture already small, or a GIF, is its own', { skip: !Transformer }, async () => {
    const thumbs = new Thumbs(folder)
    const big = await picture('big.webp', 1024, 1536)
    const made = await thumbs.of(big)
    assert.ok(made && made.startsWith(path.join(folder, 'thumbs')))
    assert.deepEqual(await sizeOf(fs.readFileSync(made)), [WIDTH, 480])
    assert.equal(await thumbs.of(big), made) // (kept)
    const [one, two] = await Promise.all([thumbs.of(await picture('c.webp', 900, 1350)), thumbs.of(path.join(folder, 'c.webp'))])
    assert.equal(one, two) // (two asks at once: made once)
    assert.equal(await thumbs.of(await picture('small.webp', 200, 300)), null)
    fs.writeFileSync(path.join(folder, 'moving.gif'), 'GIF89a')
    assert.equal(await thumbs.of(path.join(folder, 'moving.gif')), null)
    // the picture changed: a new thumbnail
    await new Promise(resolve => setTimeout(resolve, 20))
    await picture('big.webp', 1024, 1600)
    assert.notEqual(await thumbs.of(big), made)
  })
  test('warmed in the background, one at a time', { skip: !Transformer }, async () => {
    const thumbs = new Thumbs(folder)
    const files = [await picture('a.webp', 800, 1200), await picture('b.webp', 800, 1200)]
    thumbs.warm(files)
    const made = () => { try { return fs.readdirSync(path.join(folder, 'thumbs')).filter(name => name.endsWith('.webp')).length } catch { return 0 } }
    for (let wait = 0; wait < 100 && made() < 2; wait++) {
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    assert.equal(fs.readdirSync(path.join(folder, 'thumbs')).filter(name => name.endsWith('.webp')).length, 2)
  })
  test('the image route: `size=thumb` sends the thumbnail, else the picture', { skip: !Transformer }, async () => {
    const work = createRoster(folder)
    const routes = new Map()
    serve({ fetch: { register: route => { for (const method of route.methods) routes.set(`${method} ${route.path}`, route.fetch) } } }, work)
    const get = async query => {
      const response = await routes.get(`GET ${ROUTES.image}`)(new Request(`http://x${ROUTES.image}?${query}`))
      return { type: response.headers.get('content-type'), bytes: Buffer.from(await response.arrayBuffer()) }
    }
    const whole = await get('art=claude/high.webp')
    const small = await get('art=claude/high.webp&size=thumb')
    assert.equal(small.type, 'image/webp')
    assert.deepEqual([(await sizeOf(whole.bytes))[0], (await sizeOf(small.bytes))[0]], [768, WIDTH])
    assert.ok(small.bytes.length < whole.bytes.length / 2)
  })
})
