// The roster's server half: it keeps your picks of art and avatar, serves the pictures and the Artificial Analysis
// rankings, and asks providers about your account (does the key work, its balance, the models it can call) with the key
// DSH keeps for them, which never leaves the server.
//
// Routes, on DSH's own API (behind its sign-in, for its owner only):
//
//     GET  /api/llm-roster.state      tiers, characters, the lineup, your uploads, parked providers, the rankings' date
//                                     and where your Artificial Analysis key is, what each provider offers
//     POST /api/llm-roster.resolve    { models: [{ provider, id }] } → each one's character, tier, picture, avatar, name
//                                     and rankings
//     POST /api/llm-roster.pick       { model: 'provider/model', art?: 'gpt/high' | 'custom:<id>' | null,
//                                       face?: 'gpt/face-high' | 'custom:<id>' | null }
//     POST /api/llm-roster.upload     ?name=<file name>, the picture as the body (png, jpeg, webp or gif; 4 MB at most)
//     POST /api/llm-roster.forget     { upload: '<id>' }
//     POST /api/llm-roster.settings   { aaKeyEnv: '<variable>' | null }: where your Artificial Analysis key is
//     POST /api/llm-roster.park       { provider, ns, path, profile }: a provider set aside whole ("Ignore all")
//     POST /api/llm-roster.unpark     { provider } → what was kept of it
//     POST /api/llm-roster.route      { character, provider | null }: the provider her lineup goes through
//     GET  /api/llm-roster.image      ?art=<character>/<tier, face or face-tier>, or ?upload=<id>
//     GET  /api/llm-roster.rankings   ?top=20: the best models, each once
//     POST /api/llm-roster.rankings   fetch the rankings again (needs a free Artificial Analysis key)
//     GET  /api/llm-roster.check      ?provider=<route>&ref=<credential reference>&fresh=1: does the key work
//     GET  /api/llm-roster.balance    ?provider=<route>&ref=<credential reference>
//     GET  /api/llm-roster.live       ?provider=<route>&ref=<credential reference>: the models the provider lists
import fs from 'node:fs'
import path from 'node:path'
import { balance, check, keyFor, liveModels, offered } from './providers.js'
import { fetchRankings, load } from './rankings.js'
import { CHARACTERS, lineup, Roster, TABLE, TIERS } from './roster.js'

export const ROUTES = {
  state: '/api/llm-roster.state', resolve: '/api/llm-roster.resolve', pick: '/api/llm-roster.pick',
  upload: '/api/llm-roster.upload', forget: '/api/llm-roster.forget', settings: '/api/llm-roster.settings',
  park: '/api/llm-roster.park', unpark: '/api/llm-roster.unpark', route: '/api/llm-roster.route', image: '/api/llm-roster.image',
  rankings: '/api/llm-roster.rankings', check: '/api/llm-roster.check', balance: '/api/llm-roster.balance',
  live: '/api/llm-roster.live'
}
const AA_KEYS = ['ARTIFICIAL_ANALYSIS_API_KEY', 'AA_API_TOKEN']
const CHECKED_FOR = 10 * 60 * 1000 // how long a key's check stands (a fresh one is asked for after a change)

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const ACRONYMS = new Set(['gpt', 'glm', 'hy', 'ai', 'xl'])
/** A model id as a name: without its vendor, its words capitalised (`sonar-deep-research` → `Sonar Deep Research`). */
export const spelled = model => String(model).split('/').pop().split('-').filter(Boolean)
  .map(word => ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)).join(' ')

/** The plugin's state and work, without DSH: what the routes call (and the tests). `resolve(name)` reads a credential
 * reference (DSH's store, then the environment). */
export function createRoster (folder, { aliases = {}, aaKeyEnv, resolve = async name => process.env[name], fetch, now = Date.now } = {}) {
  const roster = new Roster(folder)
  let rankings = load(folder)
  const options = fetch ? { fetch } : {}
  const tiers = Object.fromEntries(TIERS.map(tier => [tier, { rarity: TABLE.tiers[tier].rarity }]))
  const characters = Object.fromEntries(CHARACTERS.map(found => [found, { name: TABLE.characters[found].name,
    home: TABLE.characters[found].home, providers: TABLE.characters[found].providers }]))
  // Where your Artificial Analysis key is, in lookup order: the variable named on the page, then in the plugin's
  // settings, then the usual names. A key pasted on the page is stored under the first.
  const aaKeys = () => [...new Set([roster.data.settings.aaKeyEnv, aaKeyEnv, ...AA_KEYS].filter(Boolean))]
  const checked = new Map() // `${provider}:${key name}` → { at, result }

  /** A model's name as people know it: Artificial Analysis's (without the effort it was measured at), else its id
   * spelled as a name (`moonshotai/kimi-k2.6` → `Kimi K2.6`). */
  const nameOf = (model, aa) => aa?.name ? aa.name.replace(/\s*\([^)]*\)\s*$/, '') : spelled(model)

  return {
    roster,
    state: () => ({
      tiers, characters,
      lineup: lineup().map(item => ({ ...item, name: nameOf(item.id, rankings.of(item.provider, item.id, aliases)) })),
      uploads: Object.entries(roster.data.uploads).map(([id, about]) => ({ id, name: about.name, at: about.at })),
      parked: roster.data.parked,
      routes: roster.data.routes,
      rankings: { ...rankings.about, keys: aaKeys(), keyEnv: roster.data.settings.aaKeyEnv ?? null },
      providers: offered()
    }),
    resolve (models) {
      if (!Array.isArray(models)) throw new RangeError('models is a list of { provider, id }')
      return models.slice(0, 500).map(({ provider, id }) => {
        provider = String(provider ?? ''); id = String(id ?? '')
        const { art, own } = roster.artOf(provider, id)
        const [character, tier] = art && !art.startsWith('custom:') ? art.split('/') : [null, null]
        const aa = rankings.of(provider, id, aliases)
        return { provider, id, art, own, face: roster.faceOf(provider, id, art), character, tier, name: nameOf(id, aa), aa }
      })
    },
    pick: (model, picks) => roster.pick(model, picks),
    upload: (bytes, type, fileName) => roster.upload(bytes, type, fileName),
    forget: id => roster.forget(id),
    settings: values => { roster.set(values); return { keys: aaKeys(), keyEnv: roster.data.settings.aaKeyEnv ?? null } },
    park: (provider, about) => { roster.park(provider, about); return { parked: roster.data.parked } },
    unpark: provider => ({ kept: roster.unpark(provider), parked: roster.data.parked }),
    route: (character, provider) => { roster.route(character, provider); return { routes: roster.data.routes } },
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
    /** Does the provider's key work: `missing` (none set), or what asking the provider for its usage said. */
    async check (route, ref, fresh = false) {
      const key = await keyFor(route, ref, resolve)
      if (!key) return { status: 'missing', at: now() }
      const kept = checked.get(`${route}:${key.name}`)
      if (!fresh && kept && now() - kept.at < CHECKED_FOR) return kept.result
      const result = { ...(await check(route, key.value, options)), key: key.name, at: now() }
      checked.set(`${route}:${key.name}`, { at: now(), result })
      return result
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
  const provider = query => String(query.get('provider') ?? '')

  route(ROUTES.state, ['GET'], () => answer(work.state()))
  route(ROUTES.resolve, ['POST'], async request => answer({ models: work.resolve((await json(request)).models) }))
  route(ROUTES.pick, ['POST'], async request => {
    const body = await json(request)
    work.pick(body.model, { art: body.art, face: body.face })
    return answer({ ok: true })
  })
  route(ROUTES.upload, ['POST'], async (request, query) => {
    const type = String(request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const bytes = Buffer.from(await request.arrayBuffer())
    return answer({ id: work.upload(bytes, type, query.get('name') ?? '') })
  })
  route(ROUTES.settings, ['POST'], async request => answer(work.settings(await json(request))))
  route(ROUTES.park, ['POST'], async request => {
    const body = await json(request)
    return answer(work.park(String(body.provider ?? ''), body))
  })
  route(ROUTES.unpark, ['POST'], async request => answer(work.unpark(String((await json(request)).provider ?? ''))))
  route(ROUTES.route, ['POST'], async request => {
    const body = await json(request)
    return answer(work.route(String(body.character ?? ''), body.provider ?? null))
  })
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
  route(ROUTES.check, ['GET'], async (request, query) =>
    answer(await work.check(provider(query), query.get('ref') ?? undefined, query.get('fresh') === '1')))
  route(ROUTES.balance, ['GET'], async (request, query) =>
    answer(await work.balance(provider(query), query.get('ref') ?? undefined)))
  route(ROUTES.live, ['GET'], async (request, query) =>
    answer(await work.live(provider(query), query.get('ref') ?? undefined)))
}
