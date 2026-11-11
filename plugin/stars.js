// The summon's ✦ in its Earned mode: kept in DSH's home (llm-roster/stars.json), so they outlive a restart and come
// while the roster is closed. They are earned now and then as DSH's model calls succeed, spent on summons, and added by
// a cheat code. Nothing is bought; they buy nothing but summons.
import fs from 'node:fs'
import path from 'node:path'

/** What one roll in [0, 1) drops: 10 ✦ under 1%, 3 ✦ under the next 6%, 1 ✦ under the next 30% (about 0.58 ✦ a roll). */
export const DROPS = [[0.01, 10], [0.06, 3], [0.30, 1]]
/** A model call that worked rolls once, and once more for every 2,000 tokens it wrote (its reasoning too), so a long,
 * high-effort call earns as its work does, not as one call: at most 25 rolls. */
export const TOKENS_PER_ROLL = 2000
export const MOST_ROLLS = 25
export const rollsFor = outputTokens => 1 + Math.min(MOST_ROLLS - 1, Math.floor(Math.max(0, Number(outputTokens) || 0) / TOKENS_PER_ROLL))
/** The cheat codes (spaces and case don't matter): ✦ to add, or the whole album to reveal (the page's to do). */
export const CODES = { hesoyam: { stars: 25 }, showmethemoney: { stars: 10 }, blacksheepwall: { reveal: true } }
/** A typed code as it is matched: its letters alone, lowercase. */
export const codeOf = text => String(text ?? '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 40)

export class Stars {
  constructor (folder, { now = Date.now, random = Math.random } = {}) {
    this.file = folder ? path.join(folder, 'stars.json') : null
    this.now = now
    this.random = random
    this.data = this.read()
  }

  /** What is kept (read again before each change, so two DSH processes sharing a home add up); with no file to read
   * (no home, or none written yet), what this run holds. */
  read () {
    try {
      const read = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : 0)
      return { balance: count(read?.balance), earned: count(read?.earned), calls: count(read?.calls), rolls: count(read?.rolls),
        last: read?.last && Number.isSafeInteger(read.last.amount) ? { amount: read.last.amount, at: Number(read.last.at) || 0 } : null }
    } catch { return this.data ?? { balance: 0, earned: 0, calls: 0, rolls: 0, last: null } }
  }

  save () {
    if (!this.file) return
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const temporary = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, ...this.data }, null, 1))
      fs.renameSync(temporary, this.file)
    } catch { /* kept for this run */ }
  }

  /** The balance, what was earned in all (from how many calls and rolls), and the last drop ({ amount, at }). */
  about () {
    this.data = this.read()
    return { ...this.data }
  }

  /** One roll: the ✦ it drops (0 for none). */
  roll () {
    let roll = this.random()
    for (const [chance, stars] of DROPS) {
      if (roll < chance) return stars
      roll -= chance
    }
    return 0
  }

  /** A model call worked (`outputTokens`: what it wrote): its rolls, and the ✦ they dropped (0 for none). */
  earn ({ outputTokens = 0 } = {}) {
    const rolls = rollsFor(outputTokens)
    let amount = 0
    for (let count = 0; count < rolls; count++) amount += this.roll()
    this.data = this.read()
    this.data = { ...this.data, calls: this.data.calls + 1, rolls: this.data.rolls + rolls,
      ...(amount ? { balance: this.data.balance + amount, earned: this.data.earned + amount, last: { amount, at: this.now() } } : {}) }
    this.save()
    return amount
  }

  /** Spend `count` ✦ on a summon; a RangeError when there are not enough. */
  spend (count) {
    const cost = Number(count)
    if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 1000) throw new RangeError('not a cost')
    this.data = this.read()
    if (this.data.balance < cost) throw new RangeError(`not enough ✦: ${this.data.balance} of ${cost}`)
    this.data = { ...this.data, balance: this.data.balance - cost }
    this.save()
    return this.about()
  }

  /** A cheat code: `{ code, added }` (✦ added), `{ code, reveal: true }` (the page reveals the album), or
   * `{ unknown: true }`; with the balance after. */
  code (text) {
    const code = codeOf(text)
    const found = Object.hasOwn(CODES, code) ? CODES[code] : null
    if (!found) return { unknown: true, ...this.about() }
    if (found.reveal) return { code, reveal: true, ...this.about() }
    this.data = this.read()
    this.data = { ...this.data, balance: this.data.balance + found.stars }
    this.save()
    return { code, added: found.stars, ...this.about() }
  }
}
