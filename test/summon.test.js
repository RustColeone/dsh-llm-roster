// The summon tab's odds (plugin/client.js), loaded as DSH's module loader would, with React stubbed: nothing renders here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { lineup } from '../plugin/roster.js'

const client = (() => {
  let registration
  new Function('window', fs.readFileSync(new URL('../plugin/client.js', import.meta.url), 'utf8'))({ __ModuleLoader__: { load: found => { registration = found } } })
  const react = { createElement () {} }
  return registration.factory(name => (name === 'react' ? react : {}))
})()
const { SUMMON, EQUIPMENT, summonPool, summonOutfits, summonCards, glowOf, zoomAt, fitView, EN, ZH } = client

/** A seeded random, so a failure can be run again. */
function seeded (seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
const pool = summonPool(lineup())
const fives = pool.filter(card => card.kind === 'character' && card.stars === 5)
const fours = pool.filter(card => card.kind === 'character' && card.stars === 4)

test('the pool: the lineup as characters (★ by tier) and the equipment, every one named in both languages', () => {
  assert.equal(pool.filter(card => card.kind === 'character').length, lineup().length)
  assert.deepEqual(fives.map(card => card.tier).filter(tier => tier !== 'university'), [])
  assert.deepEqual(fours.map(card => card.tier).filter(tier => tier !== 'high'), [])
  for (const stars of [3, 4, 5]) assert.ok(EQUIPMENT.some(card => card.stars === stars), `★${stars} equipment`)
  for (const card of EQUIPMENT) {
    for (const words of [EN, ZH]) {
      assert.ok(words[`equip.${card.id}.name`] && words[`equip.${card.id}.text`], card.id)
    }
    assert.ok(fs.existsSync(new URL(`../art/${card.character}/${card.tier}.webp`, import.meta.url)), `${card.character}/${card.tier}`)
  }
  assert.equal(new Set(pool.map(card => card.key)).size, pool.length)
  assert.equal(SUMMON.rates.reduce((sum, [, , rate]) => sum + rate, 0), 100)
})

test('the rates: per card, ★5/★4/★3 characters 1/3/40%, equipment 4/12/40%; the pickup ★5 0.8%, the pickup ★4 1.5%', () => {
  const random = seeded(7)
  const banner = { pickup5: fives[0].key, pickup4: fours[0].key, got: true } // (its guarantee used: no 330th)
  const counts = {}
  let pickup5 = 0, pickup4 = 0
  const total = 400000
  for (let index = 0; index < total; index++) {
    const [card] = summonCards(pool, banner, 1, random).cards
    counts[`${card.kind}${card.stars}`] = (counts[`${card.kind}${card.stars}`] ?? 0) + 1
    if (card.key === banner.pickup5) pickup5++
    if (card.key === banner.pickup4) pickup4++
  }
  const near = (found, percent, what) => {
    const expected = total * percent / 100
    const spread = 4.5 * Math.sqrt(expected * (1 - percent / 100)) // well within chance
    assert.ok(Math.abs(found - expected) < spread, `${what}: ${found} for ~${expected.toFixed(0)}`)
  }
  for (const [kind, stars, rate] of SUMMON.rates) near(counts[`${kind}${stars}`] ?? 0, rate, `${kind} ★${stars}`)
  near(pickup5, 0.8, 'the pickup ★5')
  near(pickup4, 1.5, 'the pickup ★4')
})

test('a ×10 deals 11 cards, always at least one ★4 or better and at least one character', () => {
  const random = seeded(11)
  let banner = { pickup5: fives[1].key }
  for (let index = 0; index < 30000; index++) {
    const result = summonCards(pool, banner, SUMMON.multiCount, random)
    assert.equal(result.cards.length, 11)
    assert.ok(result.cards.some(card => card.stars >= 4), 'a ★4 or better')
    assert.ok(result.cards.some(card => card.kind === 'character'), 'a character')
    banner = { pickup5: banner.pickup5, summons: 0 } // (no pity in the way)
  }
  // and with the worst luck there is, the floor still holds
  const [card3] = pool.filter(card => card.kind === 'equipment' && card.stars === 3)
  assert.ok(card3)
  const unlucky = summonCards(pool, { pickup5: fives[1].key }, 11, () => 0.999999).cards
  assert.ok(unlucky.some(card => card.stars >= 4) && unlucky.some(card => card.kind === 'character'), unlucky.map(card => card.key).join())
})

test('the 330th summon on a banner is its pickup ★5 if it has not come, once', () => {
  const unlucky = () => 0.999999 // every draw a ★3 equipment, but for the floor
  let banner = { pickup5: fives[2].key, pickup4: null }
  const dealt = []
  for (let multi = 0; multi < 30; multi++) {
    const result = summonCards(pool, banner, 11, unlucky)
    dealt.push(...result.cards)
    banner = result.banner
  }
  assert.equal(banner.summons, 330)
  assert.equal(dealt.findIndex(card => card.key === fives[2].key), 329)
  assert.equal(dealt[329].pity, true)
  assert.equal(banner.got, true)
  // used: the next 330 are luck alone
  for (let multi = 0; multi < 30; multi++) {
    const result = summonCards(pool, banner, 11, unlucky)
    assert.ok(!result.cards.some(card => card.pity))
    banner = result.banner
  }
  assert.equal(banner.summons, 660)
  // the pickup ★5 summoned by luck before the 330th uses the guarantee up
  let lucky = { pickup5: fives[2].key, summons: 100 }
  const rolls = [0.001, 0.1] // a ★5 character, then the pickup's share
  lucky = summonCards(pool, lucky, 1, () => rolls.shift() ?? 0.5).banner
  assert.equal(lucky.got, true)
  assert.equal(lucky.summons, 101)
  // singles count toward it as well
  let singles = { pickup5: fives[0].key, summons: 328 }
  const one = summonCards(pool, singles, 1, unlucky); singles = one.banner
  assert.ok(!one.cards[0].pity)
  const two = summonCards(pool, singles, 1, unlucky)
  assert.equal(two.cards[0].key, fives[0].key)
  assert.equal(two.banner.summons, 330)
})

test('the ring\'s light: rainbow for a ★5 character, gold for a ★4 character or ★5 equipment, else blue', () => {
  const card = (kind, stars) => pool.find(item => item.kind === kind && item.stars === stars)
  assert.equal(glowOf([card('equipment', 3), card('character', 5)]), 'rainbow')
  assert.equal(glowOf([card('equipment', 3), card('character', 4)]), 'gold')
  assert.equal(glowOf([card('equipment', 5)]), 'gold')
  assert.equal(glowOf([card('equipment', 4), card('character', 3)]), 'blue')
})

test('the album\'s viewer: a zoom keeps the picture\'s point under the pointer; a picture fits centred', () => {
  const view = { x: 120, y: -40, s: 1.5 }
  const pointer = { x: 333, y: 217 }
  const under = view => ({ x: (pointer.x - view.x) / view.s, y: (pointer.y - view.y) / view.s }) // the picture's point there
  for (const factor of [1.25, 0.8, 3, 0.1]) {
    const zoomed = zoomAt(view, pointer, factor)
    assert.ok(Math.abs(under(zoomed).x - under(view).x) < 1e-9 && Math.abs(under(zoomed).y - under(view).y) < 1e-9, String(factor))
  }
  assert.equal(zoomAt(view, pointer, 100, 0.5, 4).s, 4) // (held within its bounds, the point still kept)
  assert.ok(Math.abs(under(zoomAt(view, pointer, 100, 0.5, 4)).x - under(view).x) < 1e-9)
  assert.deepEqual(fitView({ w: 1000, h: 800 }, { w: 512, h: 768 }, 1), { x: (1000 - 512 * (800 / 768)) / 2, y: 0, s: 800 / 768 })
})

test('outfits: every card picture of the pack in use that no other card shows, as equipment, ★4 unless the pack says; by pack', () => {
  const characters = {
    claude: { pictures: ['claude/chibi.webp', 'claude/middle.webp', 'claude/high.webp', 'claude/university.webp', 'claude/cafe.webp', 'claude/festival.webp'] },
    kimi: { pictures: ['kimi/chibi.webp', 'kimi/middle.webp', 'kimi/high.webp', 'kimi/university.webp'] }
  }
  const base = summonPool(lineup(), (character, tier) => `${character}/${tier}.webp`)
  const outfits = summonOutfits(characters, 'original', { 'claude/festival.webp': { name: 'Summer festival', stars: 5 }, 'claude/cafe.webp': { stars: 9 } }, base)
  // Claude's tiers are all shown (by her models, or the equipment); her café and festival are not; Kimi's middle-school card is no model's now
  assert.deepEqual(outfits.map(card => [card.art, card.stars, card.key]), [
    ['claude/cafe.webp', 4, 'o:original:claude/cafe.webp'], ['claude/festival.webp', 5, 'o:original:claude/festival.webp'],
    ['kimi/middle.webp', 4, 'o:original:kimi/middle.webp']])
  assert.ok(outfits.every(card => card.kind === 'equipment' && card.outfit))
  // another pack's are its own
  assert.equal(summonOutfits(characters, 'academy', {}, base)[0].key, 'o:academy:claude/cafe.webp')
  // they are summoned as the equipment are: at the equipment's rates
  const pool = [...base, ...outfits.map(card => ({ ...card, name: card.art }))]
  const { cards } = summonCards(pool, { pickup5: fives[0].key, summons: 0 }, 5000, seeded(11))
  assert.ok(cards.some(card => card.outfit && card.stars === 5) && cards.some(card => card.outfit && card.stars === 4))
})
