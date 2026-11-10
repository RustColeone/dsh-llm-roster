// The providers the roster can ask about an account: what models the key can call (the provider's own list, live, for
// models newer than DSH's installed catalog), and what is left on it (a balance, where the provider reports one). Each
// is a fixed, official address: a key DSH keeps is only ever sent to its own provider, never to an address a page names.
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

export const PROVIDERS = {
  'deepseek-official': DEEPSEEK,
  deepseek: DEEPSEEK,
  openai: { models: { url: 'https://api.openai.com/v1/models', headers: bearer, read: openAIList }, keys: ['OPENAI_API_KEY'] },
  anthropic: {
    models: {
      url: 'https://api.anthropic.com/v1/models?limit=1000',
      headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
      read: body => (body.data ?? []).map(item => ({ id: String(item.id), name: item.display_name ? String(item.display_name) : undefined }))
    },
    keys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']
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
  xai: { models: { url: 'https://api.x.ai/v1/models', headers: bearer, read: openAIList }, keys: ['XAI_API_KEY', 'GROK_API_KEY'] },
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

/** What the roster can ask each provider: { route: { models, balance } }. */
export const offered = () => Object.fromEntries(Object.entries(PROVIDERS)
  .map(([route, about]) => [route, { models: Boolean(about.models), balance: Boolean(about.balance) }]))

const REF = /^[A-Za-z_][A-Za-z0-9_]*$/

/** The key for a route: the reference its profile names (`ref`), then the provider's usual variables. `resolve` reads
 * one reference (DSH's credential store, then the environment); undefined when none is set. */
export async function keyFor (route, ref, resolve) {
  const names = [ref, ...(PROVIDERS[route]?.keys ?? [])].filter(name => typeof name === 'string' && REF.test(name))
  for (const name of [...new Set(names)]) {
    const value = await resolve(name)
    if (value) return { name, value }
  }
  return null
}

async function ask (spec, key, fetch) {
  const response = await fetch(spec.url, { headers: { accept: 'application/json', ...spec.headers(key) },
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
