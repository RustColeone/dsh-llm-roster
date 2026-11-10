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
const { SUMMON, EQUIPMENT, summonPool, summonCards, glowOf, EN, ZH } = client

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
