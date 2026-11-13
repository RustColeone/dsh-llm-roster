// Where a dragged provider pill goes (plugin/client.js `insertion`), loaded as DSH's module loader would, React stubbed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { insertion } = (() => {
  let registration
  new Function('window', fs.readFileSync(new URL('../plugin/client.js', import.meta.url), 'utf8'))({ __ModuleLoader__: { load: found => { registration = found } } })
  return registration.factory(name => (name === 'react' ? { createElement () {} } : {}))
})()

/** Pills 90 wide with 6 between, `perLine` to a line, lines 26 high with 6 between. */
const pills = (count, perLine = count) => Array.from({ length: count }, (_, index) => {
  const left = (index % perLine) * 96
  const top = Math.floor(index / perLine) * 32
  return { left, right: left + 90, top, bottom: top + 26 }
})

test('one line: the gap nearest the pointer, and the place the pill takes there', () => {
  const boxes = pills(4) // A B C D; C is dragged
  assert.deepEqual(insertion(boxes, 2, 100, 13), { at: 1, x: 93, top: 0, bottom: 26 }, 'B\'s left half: before B')
  assert.deepEqual(insertion(boxes, 2, 5, 13), { at: 0, x: -3, top: 0, bottom: 26 }, 'A\'s left half: first')
  assert.deepEqual(insertion(boxes, 2, 350, 13), { at: 3, x: 381, top: 0, bottom: 26 }, 'D\'s right half: last')
  assert.deepEqual(insertion(boxes, 2, 900, 13), { at: 3, x: 381, top: 0, bottom: 26 }, 'past the end: last')
  assert.deepEqual(insertion(boxes, 0, 100, 13), { at: 0 }, 'B\'s left half for A: where it is (no marker)')
})

test('its own place, either side of it: no marker', () => {
  const boxes = pills(4)
  for (const x of [150, 200, 250, 300]) assert.deepEqual(insertion(boxes, 2, x, 13), { at: 2 }, `at ${x}`)
})

test('wrapped onto two lines: the pointer\'s own line first, the marker where the pointer is', () => {
  const boxes = pills(4, 2) // A B / C D; A is dragged
  assert.deepEqual(insertion(boxes, 0, 1000, 13), { at: 1, x: 189, top: 0, bottom: 26 }, 'far right of the first line: after B')
  assert.deepEqual(insertion(boxes, 0, 0, 45), { at: 1, x: -3, top: 32, bottom: 58 }, 'start of the second line: before C, the same place')
  assert.deepEqual(insertion(boxes, 0, 1000, 45), { at: 3, x: 189, top: 32, bottom: 58 }, 'far right of the second line: last')
})

test('well above or below the pills: nowhere (let go there, it stays)', () => {
  const boxes = pills(4)
  assert.equal(insertion(boxes, 1, 100, -41), null)
  assert.equal(insertion(boxes, 1, 100, 67), null)
  assert.ok(insertion(boxes, 1, 300, 60), 'a little below still counts')
  assert.equal(insertion([], 0, 0, 0), null)
})
