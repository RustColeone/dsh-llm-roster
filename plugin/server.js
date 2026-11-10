// The roster's server half: it keeps your picks of art,
// serves the pictures, the Artificial Analysis rankings, and asks providers about your account (their live model list,
// your balance) with the key DSH keeps for them, which never leaves the server. Its client half (client.js) is the
// avatar beside the composer's model picker and the roster it opens.
//
// Routes, on DSH's own API (behind its sign-in, for its owner only):
//
//     GET  /api/llm-roster.state      the tiers, characters, your uploads, the rankings' date, what each provider offers
//     POST /api/llm-roster.resolve    { models: [{ provider, id }] } → each model's character, tier, picture and rankings
//     POST /api/llm-roster.pick       { model: 'provider/model', art: 'gpt/high' | 'custom:<id>' | null }
//     POST /api/llm-roster.upload     ?name=<file name>, the picture as the body (png, jpeg, webp or gif; 4 MB at most)
//     POST /api/llm-roster.forget     { upload: '<id>' }
//     POST /api/llm-roster.settings   { aaKeyEnv: '<variable>' | null }: where your Artificial Analysis key is
//     GET  /api/llm-roster.image      ?art=<character>/<tier or face>, or ?upload=<id>
//     GET  /api/llm-roster.rankings   ?top=20: the best models, each once
//     POST /api/llm-roster.rankings   fetch the rankings again (needs a free Artificial Analysis key)
//     GET  /api/llm-roster.balance    ?provider=<route>&ref=<credential reference>
//     GET  /api/llm-roster.live       ?provider=<route>&ref=<credential reference>: the models the provider lists
import fs from 'node:fs'
import path from 'node:path'
import { balance, keyFor, liveModels, offered } from './providers.js'
import { fetchRankings, load } from './rankings.js'
import { CHARACTERS, Roster, TABLE, TIERS } from './roster.js'

export const ROUTES = {
  state: '/api/llm-roster.state', resolve: '/api/llm-roster.resolve', pick: '/api/llm-roster.pick',
  upload: '/api/llm-roster.upload', forget: '/api/llm-roster.forget', image: '/api/llm-roster.image',
  rankings: '/api/llm-roster.rankings', balance: '/api/llm-roster.balance', live: '/api/llm-roster.live',
  settings: '/api/llm-roster.settings'
}
const AA_KEYS = ['ARTIFICIAL_ANALYSIS_API_KEY', 'AA_API_TOKEN']

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** The plugin's state and work, without DSH: what the routes call (and the tests). `resolve(name)` reads a credential
 * reference (DSH's store, then the environment). */
export function createRoster (folder, { aliases = {}, aaKeyEnv, resolve = async name => process.env[name], fetch } = {}) {
  const roster = new Roster(folder)
  let rankings = load(folder)
  const options = fetch ? { fetch } : {}
  const tiers = Object.fromEntries(TIERS.map(tier => [tier, TABLE.tiers[tier]]))
  const characters = Object.fromEntries(CHARACTERS.map(found => [found, { name: TABLE.characters[found].name }]))
  // Where your Artificial Analysis key is, in lookup order: the variable named on the page, then in the plugin's
  // settings, then the usual names. A key pasted on the page is stored under the first.
  const aaKeys = () => [...new Set([roster.data.settings.aaKeyEnv, aaKeyEnv, ...AA_KEYS].filter(Boolean))]

  return {
    roster,
    state: () => ({
      tiers, characters,
      uploads: Object.entries(roster.data.uploads).map(([id, about]) => ({ id, name: about.name, at: about.at })),
      rankings: { ...rankings.about, keys: aaKeys(), keyEnv: roster.data.settings.aaKeyEnv ?? null },
      providers: offered()
    }),
    resolve (models) {
      if (!Array.isArray(models)) throw new RangeError('models is a list of { provider, id }')
      return models.slice(0, 500).map(({ provider, id }) => {
        provider = String(provider ?? ''); id = String(id ?? '')
        const { art, own } = roster.artOf(provider, id)
        const [character, tier] = art && !art.startsWith('custom:') ? art.split('/') : [null, null]
        return { provider, id, art, own, character, tier, aa: rankings.of(provider, id, aliases) }
      })
    },
    pick: (model, art) => roster.pick(model, art),
    settings: values => { roster.set(values); return { keys: aaKeys(), keyEnv: roster.data.settings.aaKeyEnv ?? null } },
    upload: (bytes, type, fileName) => roster.upload(bytes, type, fileName),
    forget: id => roster.forget(id),
    image: query => roster.image(query),
    top: count => ({ ...rankings.about, rows: rankings.top(count) }),
    async refreshRankings () {
      let key
      for (const reference of aaKeys()) if ((key = await resolve(reference))) break
      if (!key) throw new RangeError(`no Artificial Analysis key: set ${aaKeys()[0]} (a free key from artificialanalysis.ai)`)
      const fetched = await fetchRankings(key, options)
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'aa.json'), JSON.stringify(fetched))
      rankings = load(folder)
      return rankings.about
    },
    async balance (route, ref) {
      const key = await keyFor(route, ref, resolve)
      if (!key) return { offered: offered()[route]?.balance ?? false, balances: [], missing: true }
      return { ...(await balance(route, key.value, options)), key: key.name }
    },
    async live (route, ref) {
      const key = await keyFor(route, ref, resolve)
      if (!key) throw new RangeError(`no key for ${route}: set ${ref || 'its API key'} on DSH's Models page or in the environment`)
      return { models: await liveModels(route, key.value, options), key: key.name }
    }
  }
}

/** The routes, on DSH's API (`connection.fetch`, which signs people in and lets only its owner through). */
export function serve (connection, work) {
  const failed = error => answer({ error: String(error?.message ?? error) }, error instanceof RangeError ? 400 : 502)
  const route = (where, methods, handle) => connection.fetch.register({ path: where, methods, requestBody: 'buffered',
    fetch: async request => {
      try {
        const url = new URL(request.url, 'http://localhost')
        return await handle(request, url.searchParams)
      } catch (error) { return failed(error) }
    } })
  const json = async request => {
    try { return await request.json() } catch { throw new RangeError('the body is JSON') }
  }

  route(ROUTES.state, ['GET'], () => answer(work.state()))
  route(ROUTES.resolve, ['POST'], async request => answer({ models: work.resolve((await json(request)).models) }))
  route(ROUTES.pick, ['POST'], async request => {
    const body = await json(request)
    work.pick(body.model, body.art ?? null)
    return answer({ ok: true })
  })
  route(ROUTES.upload, ['POST'], async (request, query) => {
    const type = String(request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const bytes = Buffer.from(await request.arrayBuffer())
    return answer({ id: work.upload(bytes, type, query.get('name') ?? '') })
  })
  route(ROUTES.settings, ['POST'], async request => answer(work.settings(await json(request))))
  route(ROUTES.forget, ['POST'], async request => {
    work.forget(String((await json(request)).upload ?? ''))
    return answer({ ok: true })
  })
  route(ROUTES.image, ['GET'], (request, query) => {
    const found = work.image(query.has('upload') ? { upload: query.get('upload') } : { art: query.get('art') })
    if (!found || !fs.existsSync(found.file)) return answer({ error: 'no such picture' }, 404)
    return new Response(fs.readFileSync(found.file), { headers: { 'content-type': found.type,
      'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } })
  })
  route(ROUTES.rankings, ['GET', 'POST'], async (request, query) => request.method === 'POST'
    ? answer(await work.refreshRankings())
    : answer(work.top(Math.min(100, Math.max(1, Number(query.get('top')) || 20)))))
  route(ROUTES.balance, ['GET'], async (request, query) =>
    answer(await work.balance(String(query.get('provider') ?? ''), query.get('ref') ?? undefined)))
  route(ROUTES.live, ['GET'], async (request, query) =>
    answer(await work.live(String(query.get('provider') ?? ''), query.get('ref') ?? undefined)))
}

