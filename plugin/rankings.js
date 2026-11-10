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

  /** The best `count` models, each once, at its best. */
  top (count = 20) {
    return this.order.slice(0, count).map((base, index) => ({ ...this.models.get(base), slug: base, rank: index + 1 }))
  }
}
