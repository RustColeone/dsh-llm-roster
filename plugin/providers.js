// The providers the roster can ask about an account: what models the key can call (the provider's own list, live, for
// models newer than DSH's installed catalog), and what is left on it (a balance, where the provider reports one; or,
// for a key allowed to read it, what the account spent this month or its credit). Each is a fixed, official address: a key DSH
// keeps is only ever sent to its own provider, never to an address a page names.
//
// The table is keyed by DSH's provider route (pi-ai's ids, and llm-deepseek's `deepseek-official`).

const bearer = key => ({ authorization: `Bearer ${key}` })
const openAIList = body => (body.data ?? []).map(item => ({ id: String(item.id) }))
// Models a chat harness cannot use: pictures, speech, embeddings, moderation, realtime audio, video.
const NOT_CHAT = /(^|[-_/])(embed|embedding|tts|whisper|transcribe|dall-e|image|imagine|moderation|realtime|audio|sora|veo|speech)([-_.]|$)/
const chatOnly = models => models.filter(model => !NOT_CHAT.test(model.id))

const DEEPSEEK = {
  models: { url: 'https://api.deepseek.com/models', headers: bearer, read: openAIList },
  balance: {
    url: 'https://api.deepseek.com/user/balance', headers: bearer,
    read: body => (body.balance_infos ?? []).map(info => ({ currency: String(info.currency ?? ''),
      amount: Number(info.total_balance), granted: Number(info.granted_balance), topped: Number(info.topped_up_balance) })),
    note: body => body.is_available === false ? 'not enough balance to call' : null
  },
  keys: ['DEEPSEEK_API_KEY']
}
const MOONSHOT = host => ({
  models: { url: `https://${host}/v1/models`, headers: bearer, read: openAIList },
  balance: {
    url: `https://${host}/v1/users/me/balance`, headers: bearer,
    read: body => [{ currency: host.endsWith('.cn') ? 'CNY' : 'USD', amount: Number(body.data?.available_balance),
      granted: Number(body.data?.voucher_balance), topped: Number(body.data?.cash_balance) }]
  },
  keys: ['MOONSHOT_API_KEY']
})

// Spend and credit, from providers that tell them only to a key allowed to read them: OpenAI's costs this month (a key
// with the api.usage.read permission, or an admin key), Anthropic's (an organization-scoped key, or an Admin key), xAI's
// prepaid credit (a team's management key). Such a key may not call the models (Anthropic's organization keys need a
// workspace DSH does not name), so it is a key of its own (`keys`, the names it is read under), the roster's to read
// with only; without one, the roster asks with the provider's API key. One that may not read them is refused, and
// nothing is shown. (Google tells neither to a key.) Each `read(key, ask, now)` answers
// { spent: { amount, currency, since } } and/or { credit: { amount, currency } }.
const monthStart = now => { const day = new Date(now); return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1) }
const cents = value => Math.round(value * 100) / 100
const anthropicHeaders = key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' })
const PAGES = 5 // a month is one page (31 days); a few more, should a provider page it finer

const USAGE = {
  openai: {
    kind: 'admin', keys: ['OPENAI_ADMIN_KEY'],
    // the organization's costs, by day: each day's results' amounts ({ value, currency })
    async read (key, ask, now) {
      const since = monthStart(now)
      let amount = 0, currency = 'usd', page = null
      for (let pages = 0; pages < PAGES; pages++) {
        const body = await ask(`https://api.openai.com/v1/organization/costs?start_time=${since / 1000}&bucket_width=1d&limit=31${page ? `&page=${encodeURIComponent(page)}` : ''}`, bearer(key))
        for (const bucket of body.data ?? []) {
          for (const result of bucket.results ?? []) {
            amount += Number(result.amount?.value) || 0
            if (result.amount?.currency) currency = String(result.amount.currency)
          }
        }
        if (!body.has_more || !body.next_page) break
        page = body.next_page
      }
      return { spent: { amount: cents(amount), currency: currency.toUpperCase(), since: new Date(since).toISOString().slice(0, 10) } }
    }
  },
  anthropic: {
    kind: 'admin', keys: ['ANTHROPIC_ADMIN_KEY'],
    // the organization's cost report, by day: each result's `amount` is in cents, as a decimal string
    async read (key, ask, now) {
      const since = monthStart(now)
      let amount = 0, page = null
      for (let pages = 0; pages < PAGES; pages++) {
        const body = await ask(`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${new Date(since).toISOString().replace('.000Z', 'Z')}&bucket_width=1d&limit=31${page ? `&page=${encodeURIComponent(page)}` : ''}`, anthropicHeaders(key))
        for (const bucket of body.data ?? []) for (const result of bucket.results ?? []) amount += Number(result.amount) || 0
        if (!body.has_more || !body.next_page) break
        page = body.next_page
      }
      return { spent: { amount: cents(amount / 100), currency: 'USD', since: new Date(since).toISOString().slice(0, 10) } }
    }
  },
  xai: {
    kind: 'management', keys: ['XAI_MANAGEMENT_KEY', 'XAI_MANAGEMENT_API_KEY'],
    // the key's team, then the team's prepaid balance: its `total` (cents) counts a purchase as less and a spend as
    // more, so the credit left is its opposite
    async read (key, ask) {
      const who = await ask('https://management-api.x.ai/auth/management-keys/validation', bearer(key))
      const team = (who.scope ?? 'SCOPE_TEAM') === 'SCOPE_TEAM' ? (who.scopeId ?? who.teamId) : who.teamId
      if (!team) throw new Error('this management key is not a team\'s: the balance is a team\'s')
      const body = await ask(`https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(team)}/prepaid/balance`, bearer(key))
      const total = Number(body.total?.val)
      if (!Number.isFinite(total)) throw new Error('xAI answered no balance')
      return { credit: { amount: cents(-total / 100), currency: 'USD' } }
    }
  }
}

export const PROVIDERS = {
  'deepseek-official': DEEPSEEK,
  deepseek: DEEPSEEK,
  openai: { models: { url: 'https://api.openai.com/v1/models', headers: bearer, read: openAIList }, keys: ['OPENAI_API_KEY'], usage: USAGE.openai },
  anthropic: {
    models: {
      url: 'https://api.anthropic.com/v1/models?limit=1000',
      headers: anthropicHeaders,
      read: body => (body.data ?? []).map(item => ({ id: String(item.id), name: item.display_name ? String(item.display_name) : undefined }))
    },
    keys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    usage: USAGE.anthropic
  },
  google: {
    models: {
      url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      headers: key => ({ 'x-goog-api-key': key }),
      read: body => (body.models ?? []).filter(item => (item.supportedGenerationMethods ?? []).includes('generateContent'))
        .map(item => ({ id: String(item.name).replace(/^models\//, ''), name: item.displayName ? String(item.displayName) : undefined,
          contextWindow: item.inputTokenLimit, maxTokens: item.outputTokenLimit }))
    },
    keys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY']
  },
  xai: { models: { url: 'https://api.x.ai/v1/models', headers: bearer, read: openAIList }, keys: ['XAI_API_KEY', 'GROK_API_KEY'], usage: USAGE.xai },
  openrouter: {
    models: {
      url: 'https://openrouter.ai/api/v1/models', headers: bearer,
      read: body => (body.data ?? []).map(item => ({ id: String(item.id), name: item.name ? String(item.name) : undefined,
        contextWindow: item.context_length }))
    },
    balance: {
      url: 'https://openrouter.ai/api/v1/credits', headers: bearer,
      read: body => [{ currency: 'USD', amount: Math.round((Number(body.data?.total_credits) - Number(body.data?.total_usage ?? 0)) * 1e4) / 1e4,
        granted: Number(body.data?.total_credits), used: Number(body.data?.total_usage ?? 0) }]
    },
    keys: ['OPENROUTER_API_KEY']
  },
  mistral: { models: { url: 'https://api.mistral.ai/v1/models', headers: bearer, read: openAIList }, keys: ['MISTRAL_API_KEY'] },
  groq: { models: { url: 'https://api.groq.com/openai/v1/models', headers: bearer, read: openAIList }, keys: ['GROQ_API_KEY'] },
  moonshotai: MOONSHOT('api.moonshot.ai'),
  'moonshotai-cn': MOONSHOT('api.moonshot.cn')
}

/** What the roster can ask each provider: { route: { models, balance, usage } }; `usage`: the kind of key that reads
 * the spend (`admin`, `management`) and the names it is read under, the first the one a pasted key is kept under. */
export const offered = () => Object.fromEntries(Object.entries(PROVIDERS)
  .map(([route, about]) => [route, { models: Boolean(about.models), balance: Boolean(about.balance),
    usage: about.usage ? { kind: about.usage.kind, keys: [...about.usage.keys] } : null }]))

const REF = /^[A-Za-z_][A-Za-z0-9_]*$/

/** The key for a route: the reference its profile names (`ref`), then the provider's usual variables (or `names`).
 * `resolve` reads one reference (DSH's credential store, then the environment); undefined when none is set. */
export async function keyFor (route, ref, resolve, names = PROVIDERS[route]?.keys ?? []) {
  const tried = [ref, ...names].filter(name => typeof name === 'string' && REF.test(name))
  for (const name of [...new Set(tried)]) {
    const value = await resolve(name)
    if (value) return { name, value }
  }
  return null
}

async function ask (spec, key, fetch) {
  return request(spec.url, spec.headers(key), fetch)
}
async function request (url, headers, fetch) {
  const response = await fetch(url, { headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(20000) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const said = body?.error?.message ?? body?.error ?? body?.message
    const error = new Error(`HTTP ${response.status}${said ? `: ${String(typeof said === 'string' ? said : JSON.stringify(said)).slice(0, 200)}` : ''}`)
    error.status = response.status
    throw error
  }
  return body
}

/** The models the provider lists for this key. */
export async function liveModels (route, key, { fetch = globalThis.fetch } = {}) {
  const spec = PROVIDERS[route]?.models
  if (!spec) throw new RangeError(`the roster cannot list ${route}'s models; use the catalog`)
  const models = chatOnly(spec.read(await ask(spec, key, fetch)).filter(model => model.id))
  return models.sort((one, other) => one.id.localeCompare(other.id))
}

/** What is left on the key's account. */
export async function balance (route, key, { fetch = globalThis.fetch } = {}) {
  const spec = PROVIDERS[route]?.balance
  if (!spec) return { offered: false, balances: [] }
  const body = await ask(spec, key, fetch)
  return { offered: true, balances: spec.read(body).filter(found => Number.isFinite(found.amount)), note: spec.note?.(body) ?? null }
}

/** What the account spent this month, or has left, as the provider tells a key allowed to read it: `ok` with `spent`
 * and/or `credit`, `rejected` (the provider refused the key: it may not read them), `error` (it could not be asked),
 * or `untested` (the roster has no address for it). */
export async function usage (route, key, { fetch = globalThis.fetch, now = Date.now } = {}) {
  const spec = PROVIDERS[route]?.usage
  if (!spec) return { status: 'untested' }
  try {
    return { status: 'ok', ...(await spec.read(key, (url, headers) => request(url, headers, fetch), now())) }
  } catch (error) {
    return { status: [401, 403].includes(error.status) ? 'rejected' : 'error', detail: String(error.message).slice(0, 300) }
  }
}

/** Whether a key works, by asking the provider for its usage: the balance where it reports one, else the models the key
 * can call. `ok` (with the balance, when asked), `rejected` (the provider refused the key), `error` (it could not be
 * asked), or `untested` (the roster has no address for this provider: it may well work). */
export async function check (route, key, { fetch = globalThis.fetch } = {}) {
  const spec = PROVIDERS[route]
  if (!spec) return { status: 'untested' }
  try {
    if (spec.balance) return { status: 'ok', ...(await balance(route, key, { fetch })) }
    return { status: 'ok', models: (await liveModels(route, key, { fetch })).length }
  } catch (error) {
    return { status: [401, 403].includes(error.status) ? 'rejected' : 'error', detail: String(error.message).slice(0, 300) }
  }
}
