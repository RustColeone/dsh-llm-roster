// Why calls failed: each provider's model calls that failed (as DSH's model layer reports them: a code such as QUOTA,
// RATE_LIMIT or INVALID_CREDENTIAL, the HTTP status, the provider's message) and the roster's own key checks that did,
// kept in DSH's home (llm-roster/failures.json) so they outlive a restart. A call that succeeds again lets them go:
// the failures of that model, and the ones that were the provider's as a whole (its key, its balance, its rate).
import fs from 'node:fs'
import path from 'node:path'

const MOST = 100 // failures kept in all (the newest)
const MOST_EACH = 12 // and for each provider
/** The codes (DSH's, and the roster's key checks') that are about the provider (its key, its account, its service),
 * not one model: any call to it that succeeds lets them go. */
const THE_PROVIDER = new Set(['AUTH', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL', 'QUOTA', 'ACCOUNT_QUOTA', 'ACCOUNT_SIGN_IN_REQUIRED',
  'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'KEY_REJECTED', 'UNREACHABLE'])
/** What looks like a key in a provider's message, hidden before it is kept. */
const KEYS = [/\b(sk|pk|rk|gsk|xai|key|tok)[-_][A-Za-z0-9_-]{8,}/gi, /\bAIza[0-9A-Za-z_-]{16,}/g, /\b(Bearer|Basic)\s+\S+/gi]
export const hideKeys = text => KEYS.reduce((found, pattern) => found.replace(pattern, '…'), String(text ?? ''))
/** A provider's message without its request's id (each attempt's own), so the same failure again is counted. */
const withoutRequest = text => String(text).replace(/\s*\(?\brequest[ _-]?id\b\s*[:=]?\s*[\w-]+\)?/gi, '')

export class Failures {
  constructor (folder, { now = Date.now } = {}) {
    this.file = folder ? path.join(folder, 'failures.json') : null
    this.now = now
    this.entries = []
    try {
      const read = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (Array.isArray(read?.failures)) this.entries = read.failures.filter(entry => entry && typeof entry.provider === 'string')
    } catch { /* none yet */ }
  }

  save () {
    if (!this.file) return
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const temporary = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, failures: this.entries }, null, 1))
      fs.renameSync(temporary, this.file)
    } catch { /* kept for this run */ }
  }

  /** Every failure kept, the newest first. */
  list () { return this.entries.map(entry => ({ ...entry })) }

  /** Keep a failure: `{ provider, model?, code, status?, message, source }` (`source`: 'call', a model call; 'check', the
   * roster's check of a key). The same failure again is counted, not kept twice. */
  failed ({ provider, model = null, code = 'ERROR', status = null, message = '', source = 'call' }) {
    if (!provider) return
    const entry = { provider: String(provider), model: model ? String(model) : null, code: String(code || 'ERROR').slice(0, 60),
      status: Number.isInteger(status) ? status : null, message: withoutRequest(hideKeys(message)).replace(/\s+/g, ' ').trim().slice(0, 400), source }
    const same = this.entries.find(found => found.provider === entry.provider && found.model === entry.model && found.code === entry.code &&
      found.message === entry.message && found.source === entry.source)
    if (same) {
      same.count = (same.count ?? 1) + 1
      same.at = new Date(this.now()).toISOString()
      this.entries = [same, ...this.entries.filter(found => found !== same)]
    } else {
      this.entries = [{ ...entry, count: 1, at: new Date(this.now()).toISOString() }, ...this.entries]
    }
    const each = {}
    this.entries = this.entries.filter(found => (each[found.provider] = (each[found.provider] ?? 0) + 1) <= MOST_EACH).slice(0, MOST)
    this.save()
  }

  /** A call to `provider` (and `model`) succeeded: let go of that model's failures, and the provider's own. */
  succeeded (provider, model = null) {
    const before = this.entries.length
    this.entries = this.entries.filter(found => found.provider !== provider ||
      !(THE_PROVIDER.has(found.code) || found.source === 'check' || (model !== null && found.model === model)))
    if (this.entries.length !== before) this.save()
  }

  /** Let go of a provider's failures (or every one). */
  clear (provider = null) {
    this.entries = provider ? this.entries.filter(found => found.provider !== provider) : []
    this.save()
  }
}

/** Whether a call ended because it was stopped (by you, or its turn), not because it failed. */
const stopped = (error, signal) => Boolean(signal?.aborted) || error?.name === 'AbortError' ||
  /^(ABORTED?|CANCELL?ED|INTERRUPTED)$/.test(String(error?.failure?.code ?? error?.code ?? ''))

/** The ways a call finishes that mean it worked (DSH's finish reasons; `aborted` is a call stopped, `error` one that
 * failed, with its failure). */
const WORKED = new Set(['stop', 'tool-calls', 'max-tokens'])

/** A model call's chunks, as DSH's model layer streams them (`llm/stream`), passed on untouched. A call that finishes in
 * an error (its last chunk: `{ type: 'finish', reason: { kind: 'error', failure } }`), or throws one, is kept as a
 * failure of its provider and model; one that finishes as it should lets theirs go; one stopped is neither. */
export async function * watch (next, options, failures) {
  const keep = (failure, error = null) => {
    try {
      if (!stopped(error, options?.signal)) {
        failures.failed({ provider: options?.provider, model: options?.model, code: failure?.code ?? error?.code, status: failure?.status ?? error?.status,
          message: failure?.message ?? error?.message, source: 'call' })
      }
    } catch { /* the call's own failure is what matters */ }
  }
  let finish = null
  try {
    for await (const chunk of next()) {
      if (chunk?.type === 'finish') finish = chunk.reason
      yield chunk
    }
  } catch (error) {
    keep(error?.failure, error)
    throw error
  }
  try {
    if (finish?.kind === 'error') keep(finish.failure)
    else if (WORKED.has(finish?.kind)) failures.succeeded(options?.provider, options?.model ?? null)
  } catch { /* the call is what matters */ }
}
