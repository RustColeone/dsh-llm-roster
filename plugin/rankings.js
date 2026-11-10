// Artificial Analysis's rankings: their free models list (intelligence, coding and agentic indexes, prices, speed), as
// a snapshot shipped with the plugin (data/aa-<date>.json) or fetched again with your own free key from
// artificialanalysis.ai, kept in DSH's home (llm-roster/aa.json). Their terms ask that the source be credited wherever
// the data is shown; the roster does.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SOURCE = 'https://artificialanalysis.ai/api/v2/language/models/free'
export const ATTRIBUTION = { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai' }
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

// The effort a row was measured at, as the end of its slug says it (`gpt-6-1-sol-xhigh`); a slug with none is the
// model at its default, which for a reasoning model is its highest.
const EFFORTS = ['xhigh', 'high', 'medium', 'low', 'minimal', 'non-reasoning', 'reasoning', 'max']
// Models DSH names other than Artificial Analysis does (your own `aliases` in the plugin's settings win).
export const ALIASES = { 'deepseek-flash': 'deepseek-v4-1-flash-1017', 'qwen3.8-max-0902': 'qwen3-8-max',
  'mistral-large-4-0': 'mistral-large-4', hy4: 'tencent-hy4' }
const EFFORT_END = new RegExp(`-(${EFFORTS.join('|')})$`)

/** A model id or slug as Artificial Analysis spells slugs: lowercase words joined by dashes. */
export const slugOf = text => String(text ?? '').toLowerCase().split('/').pop().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

/** One row of their list, kept small; null for a model they have not measured. */
export function compact (item) {
  const index = item?.evaluations?.artificial_analysis_intelligence_index
  if (typeof index !== 'number') return null
  const round = (value, digits = 2) => typeof value === 'number' ? Math.round(value * 10 ** digits) / 10 ** digits : null
  return {
    slug: String(item.slug ?? ''),
    name: String(item.name ?? ''),
    creator: String(item.model_creator?.name ?? ''),
    released: String(item.release_date ?? ''),
    intelligence: round(index, 1),
    coding: round(item.evaluations.artificial_analysis_coding_index, 1),
    agentic: round(item.evaluations.artificial_analysis_agentic_index, 1),
    input: round(item.pricing?.price_1m_input_tokens, 3),
    output: round(item.pricing?.price_1m_output_tokens, 3),
    speed: round(item.performance?.median_output_tokens_per_second, 0)
  }
}

/** The effort in a row's slug, and the slug of the model it measures. */
export function split (slug) {
  const found = EFFORT_END.exec(slug)
  return found ? { base: slug.slice(0, -found[0].length), effort: found[1] } : { base: slug, effort: null }
}

// ---- release dates: Artificial Analysis's for the models they measure, else when OpenRouter listed the model ----
export const OPENROUTER = 'https://openrouter.ai/api/v1/models'

/** OpenRouter's public model list as release dates by slug (variants such as `:free` are the model; the earliest date
 * of a slug listed twice wins). */
export function releasedDates (body) {
  const dates = {}
  for (const model of body?.data ?? []) {
    if (typeof model?.id !== 'string' || !Number.isFinite(model.created)) continue
    const slug = slugOf(model.id.split(':')[0])
    const date = new Date(model.created * 1000).toISOString().slice(0, 10)
    if (!dates[slug] || date < dates[slug]) dates[slug] = date
  }
  return dates
}

/** The release dates we have: the newest of what was fetched and the shipped snapshot. */
export function loadReleased (folder) {
  const shipped = fs.readdirSync(DATA).filter(name => /^openrouter-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().pop()
  let best = { as_of: null, dates: {} }
  for (const file of [shipped && path.join(DATA, shipped), folder && path.join(folder, 'openrouter.json')].filter(Boolean)) {
    try {
      const read = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (read?.dates && (!best.as_of || String(read.as_of) >= String(best.as_of))) best = read
    } catch { /* not there, or unreadable: the other */ }
  }
  return best
}

/** A slug without a date or `-latest` at its end (`claude-3-5-haiku-20241022` is `claude-3-5-haiku`). */
export const undated = slug => slug.replace(/-(\d{8}|\d{6}|\d{4}-\d{2}-\d{2}|latest)$/, '')

/** The names a model (as a slug) may be listed under elsewhere: as is, without a date or build stamp at the end, and
 * without its family's name in front, so Volcengine's `doubao-seed-2-1-turbo-260628` is OpenRouter's
 * `seed-2-1-turbo`. */
export function formsOf (slug) {
  const plain = undated(slug)
  return [...new Set([slug, plain, plain.replace(/^[a-z]+-(?=[a-z])/, '')])]
}

/** The date a model id carries in itself (`claude-3-5-haiku-20241022`, `qwen3.5-plus-2026-04-20`), or null. */
export function dateInId (id) {
  const found = /(?:^|[-_/])(20\d{2})-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])(?=$|[-_:])/.exec(String(id))
  if (found) return `${found[1]}-${found[2]}-${found[3]}`
  // a build stamp at the end, as Volcengine dates its models (`doubao-seed-2-1-pro-260628`: 2026-06-28)
  const stamp = /-([23]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?=$|:)/.exec(String(id))
  return stamp ? `20${stamp[1]}-${stamp[2]}-${stamp[3]}` : null
}

/** The day each model with no published date was first seen here (kept in DSH's home, llm-roster/seen.json): a model
 * newer than every list we have can only have come out since, so the day it showed up stands for its release date
 * until Artificial Analysis or OpenRouter give one. */
export class Seen {
  constructor (folder) {
    this.file = folder ? path.join(folder, 'seen.json') : null
    this.dates = {}
    try {
      const read = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      for (const [slug, date] of Object.entries(read?.dates ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(date)) this.dates[slug] = date
    } catch { /* none yet */ }
  }

  save () {
    if (!this.file) return
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, dates: this.dates }, null, 1))
    fs.renameSync(temporary, this.file)
  }

  /** Note `slugs` as first seen on `day`; the ones seen before keep their day. */
  stamp (slugs, day) {
    let changed = false
    for (const slug of slugs) if (slug && !this.dates[slug]) { this.dates[slug] = day; changed = true }
    if (changed) this.save()
  }

  /** Let go of the slugs that now have a published date. */
  settle (dated) {
    const before = Object.keys(this.dates).length
    for (const slug of Object.keys(this.dates)) if (dated(slug)) delete this.dates[slug]
    if (Object.keys(this.dates).length !== before) this.save()
  }
}

/** OpenRouter's release dates as of today (its model list is public: no key). */
export async function fetchReleased ({ fetch = globalThis.fetch, today = new Date() } = {}) {
  const response = await fetch(OPENROUTER, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`OpenRouter answered HTTP ${response.status}`)
  const dates = releasedDates(await response.json())
  if (!Object.keys(dates).length) throw new Error('OpenRouter sent an empty list')
  return { as_of: today.toISOString().slice(0, 10), source: OPENROUTER, dates }
}

/** The rankings we have: the newest of what was fetched and the shipped snapshot. */
export function load (folder) {
  const shipped = fs.readdirSync(DATA).filter(name => /^aa-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().pop()
  const candidates = [shipped && path.join(DATA, shipped), folder && path.join(folder, 'aa.json')].filter(Boolean)
  let best = null
  for (const file of candidates) {
    try {
      const read = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (Array.isArray(read.rows) && (!best || String(read.as_of) >= String(best.as_of))) best = read
    } catch { /* not there, or unreadable: the other */ }
  }
  return new Rankings(best ?? { as_of: null, version: null, rows: [] })
}

/** Fetch every page of their free list with `key`; the rankings as of today. */
export async function fetchRankings (key, { fetch = globalThis.fetch, today = new Date() } = {}) {
  const rows = []
  let version = null
  for (let page = 1; page <= 50; page++) {
    const response = await fetch(`${SOURCE}?page=${page}`, { headers: { 'x-api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`Artificial Analysis answered HTTP ${response.status}`)
    const body = await response.json()
    version ??= body.intelligence_index_version ?? null
    rows.push(...(body.data ?? []).map(compact).filter(Boolean))
    if (!body.pagination?.has_more) break
  }
  if (!rows.length) throw new Error('Artificial Analysis sent an empty list')
  return { as_of: today.toISOString().slice(0, 10), version, source: SOURCE, attribution: ATTRIBUTION, rows }
}

export class Rankings {
  constructor (data) {
    this.data = data
    // Each measured model's best row (its rank is among models, not among the efforts each was measured at).
    this.models = new Map()
    for (const row of data.rows) {
      const { base } = split(row.slug)
      const best = this.models.get(base)
      if (!best || row.intelligence > best.intelligence) this.models.set(base, row)
    }
    this.order = [...this.models.entries()].sort((one, other) => other[1].intelligence - one[1].intelligence)
      .map(([base]) => base)
  }

  get about () {
    return { as_of: this.data.as_of, version: this.data.version, models: this.models.size, source: SOURCE,
      attribution: ATTRIBUTION }
  }

  /** The slug a model is measured under: `aliases` first (`provider/model` or `model` → slug), then its own id with
   * dots as dashes, then its id without a date or `-latest` at the end; null when they have not measured it. */
  baseOf (provider, model, aliases = {}) {
    const alias = aliases[`${provider}/${model}`] ?? aliases[model] ?? ALIASES[String(model).toLowerCase().split('/').pop()]
    if (alias) return this.models.has(split(slugOf(alias)).base) ? split(slugOf(alias)).base : null
    const slug = slugOf(model)
    const tries = [slug, split(slug).base, slug.replace(/-(\d{8}|\d{4}-\d{2}-\d{2}|latest|preview)$/, '')]
    return tries.find(found => this.models.has(found)) ?? null
  }

  /** What the roster shows of a model: its best index and rank, and each effort they measured. */
  of (provider, model, aliases) {
    const base = this.baseOf(provider, model, aliases)
    if (!base) return null
    const best = this.models.get(base)
    const efforts = this.data.rows.filter(row => split(row.slug).base === base)
      .map(row => ({ effort: split(row.slug).effort ?? /\(([^,)]+)/.exec(row.name)?.[1]?.toLowerCase() ?? 'default',
        intelligence: row.intelligence }))
      .sort((one, other) => other.intelligence - one.intelligence)
    return { ...best, slug: base, rank: this.order.indexOf(base) + 1, of: this.order.length, efforts }
  }

  /** The best `count` models, each once, at its best; or (`sort` 'released') the newest, with their rank. */
  top (count = 20, sort = 'intelligence') {
    const rows = this.order.map((base, index) => ({ ...this.models.get(base), slug: base, rank: index + 1 }))
    if (sort === 'released') rows.sort((one, other) => String(other.released).localeCompare(String(one.released)) || one.rank - other.rank)
    return rows.slice(0, count)
  }
}
