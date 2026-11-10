// The roster's server half: it keeps your picks of art and avatar, serves the pictures and the Artificial Analysis
// rankings, and asks providers about your account (does the key work, its balance, the models it can call) with the key
// DSH keeps for them, which never leaves the server.
//
// Routes, on DSH's own API (behind its sign-in, for its owner only):
//
//     GET  /api/llm-roster.state      tiers and characters (as the art pack in use names and pictures them), the pack,
//                                     the lineup, your uploads, parked providers, the rankings' date and where your
//                                     Artificial Analysis key is, what each provider offers
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
//     GET  /api/llm-roster.image      ?art=<character>/<picture> (the art pack's: `claude/high`, `claude/face-high`; or
//                                     the pack `&pack=<id>`'s), or ?upload=<id>
//     GET  /api/llm-roster.packs      the art packs: the bundled one and yours, and which is in use
//     POST /api/llm-roster.packs      { use: '<id>' | null } | { remove: '<id>' } | { fetch: '<GitHub or .zip link>' }
//     POST /api/llm-roster.pack-import  ?name=<file name>, a .zip of a pack (or a lone pack.json) as the body
//     GET  /api/llm-roster.pack-export  ?id=<pack>: the pack as a .zip
//     GET  /api/llm-roster.rankings   ?top=20&sort=released&efforts=1: the leaderboard, the best models each once (or
//                                     the newest; or every effort each was measured at)
//     POST /api/llm-roster.rankings   fetch the release dates again (OpenRouter, public) and the rankings (needs a free
//                                     Artificial Analysis key)
//     GET  /api/llm-roster.released   every release date known, by model slug, and the days models were first seen
//     POST /api/llm-roster.released   { ids } → { dates: { id: { date, seen } } }: the release dates of a list of models
//                                     (a model of no published date: the day it was first seen here, kept)
//     GET  /api/llm-roster.check      ?provider=<route>&ref=<credential reference>&fresh=1: does the key work
//     GET  /api/llm-roster.balance    ?provider=<route>&ref=<credential reference>
//     GET  /api/llm-roster.live       ?provider=<route>&ref=<credential reference>: the models the provider lists
import fs from 'node:fs'
import path from 'node:path'
import { balance, check, keyFor, liveModels, offered } from './providers.js'
import { ALIASES, dateInId, fetchRankings, fetchReleased, formsOf, load, loadReleased, Seen, slugOf, undated } from './rankings.js'
import { BUNDLED, fetchPack, filesOf } from './packs.js'
import { CHARACTERS, lineup, MODELS, RARITY, releasedInLineup, Roster, TIERS } from './roster.js'

export const ROUTES = {
  state: '/api/llm-roster.state', resolve: '/api/llm-roster.resolve', pick: '/api/llm-roster.pick',
  upload: '/api/llm-roster.upload', forget: '/api/llm-roster.forget', settings: '/api/llm-roster.settings',
  park: '/api/llm-roster.park', unpark: '/api/llm-roster.unpark', route: '/api/llm-roster.route', image: '/api/llm-roster.image',
  rankings: '/api/llm-roster.rankings', check: '/api/llm-roster.check', balance: '/api/llm-roster.balance',
  live: '/api/llm-roster.live', released: '/api/llm-roster.released', packs: '/api/llm-roster.packs',
  packImport: '/api/llm-roster.pack-import', packExport: '/api/llm-roster.pack-export'
}
const MAX_PACK = 128 * 1024 * 1024 // a pack's .zip, at most
const AA_KEYS = ['ARTIFICIAL_ANALYSIS_API_KEY', 'AA_API_TOKEN']
const CHECKED_FOR = 10 * 60 * 1000 // how long a key's check stands (a fresh one is asked for after a change)

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const ACRONYMS = new Set(['gpt', 'glm', 'hy', 'ai', 'xl'])
/** A model id as a name: without its vendor, its words capitalised (`sonar-deep-research` → `Sonar Deep Research`), and
 * a version written with dashes as a version (`seed-2-1-turbo` → `Seed 2.1 Turbo`), unless the id has a date written
 * with dashes (`2024-08-06`). */
export function spelled (model) {
  const words = String(model).split('/').pop().split('-').filter(Boolean)
  const joined = /\d{4}-\d{2}-\d{2}/.test(String(model)) ? words : words.reduce((out, word) => {
    if (/^\d{1,2}$/.test(word) && /^\d{1,2}$/.test(out.at(-1) ?? '')) out[out.length - 1] += `.${word}`
    else out.push(word)
    return out
  }, [])
  return joined.map(word => ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)).join(' ')
}

/** The plugin's state and work, without DSH: what the routes call (and the tests). `resolve(name)` reads a credential
 * reference (DSH's store, then the environment). */
export function createRoster (folder, { aliases = {}, aaKeyEnv, resolve = async name => process.env[name], fetch, now = Date.now } = {}) {
  const roster = new Roster(folder)
  let rankings = load(folder)
  let released = loadReleased(folder)
  const options = fetch ? { fetch } : {}
  // the tiers and characters, as the art pack in use names and pictures them (read again as the page asks: a pack you
  // change in place shows as it is now)
  const dressed = (look = roster.look(true)) => ({
    tiers: Object.fromEntries(TIERS.map(tier => [tier, { rarity: RARITY[tier], ...look.tier(tier) }])),
    characters: Object.fromEntries(CHARACTERS.map(found => [found, { ...look.character(found), home: MODELS.characters[found].home,
      providers: MODELS.characters[found].providers, pictures: look.cards(found), faces: look.faces(found),
      tierFaces: Object.fromEntries(TIERS.map(tier => [tier, look.faceOf(`${found}/${tier}`, tier)])) }])),
    pack: { id: look.id, name: look.about.name, names: look.about.names, version: look.version }
  })
  // Where your Artificial Analysis key is, in lookup order: the variable named on the page, then in the plugin's
  // settings, then the usual names. A key pasted on the page is stored under the first.
  const aaKeys = () => [...new Set([roster.data.settings.aaKeyEnv, aaKeyEnv, ...AA_KEYS].filter(Boolean))]
  const checked = new Map() // `${provider}:${key name}` → { at, result }

  /** A model's name as people know it: Artificial Analysis's (without the effort it was measured at), else its id
   * spelled as a name (`moonshotai/kimi-k2.6` → `Kimi K2.6`). */
  const nameOf = (model, aa) => aa?.name ? aa.name.replace(/\s*\([^)]*\)\s*$/, '') : spelled(model)

  // A model's release date: Artificial Analysis's; else the day OpenRouter listed it (the id as it is, without a date
  // or build stamp at its end, or without its family's name in front); else, for a lineup model neither lists, the
  // date models.json gives it; else the date the id carries; else the day it was first seen here (`seen`), which stands
  // until one of them gives a date.
  const seen = new Seen(folder)
  const today = () => {
    const day = new Date(now())
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  }
  const listedOn = slug => formsOf(slug).map(form => released.dates[form]).find(Boolean) ?? null
  const published = (id, aa) => aa?.released || listedOn(slugOf(String(id).split(':')[0])) || releasedInLineup(id) || dateInId(id) || null
  // Whether OpenRouter lists a lineup model the roster offers through it (judged only with its list at hand; a lineup
  // id is OpenRouter's own name, so only as it is or undated)
  const onOpenRouter = item => item.provider !== 'openrouter' || !Object.keys(released.dates).length ||
    Boolean(released.dates[slugOf(item.id)] || released.dates[undated(slugOf(item.id))])
  /** The release dates of `ids` (with their Artificial Analysis rows, when known), stamping the ones of no date. */
  function datesOf (models) {
    const found = models.map(({ id, aa }) => ({ id, slug: slugOf(String(id).split(':')[0]), date: published(id, aa) }))
    seen.stamp(found.filter(item => !item.date).map(item => item.slug), today())
    return found.map(item => item.date ? { date: item.date, seen: false } : { date: seen.dates[item.slug] ?? null, seen: true })
  }

  return {
    roster,
    state: () => ({
      ...dressed(),
      // (each with its picture and avatar as its card shows them: the pack's, or your pick)
      lineup: lineup().map(item => ({ ...item, name: nameOf(item.id, rankings.of(item.provider, item.id, aliases)),
        art: roster.artOf(item.provider, item.id).art, face: roster.faceOf(item.provider, item.id), ...(onOpenRouter(item) ? {} : { listed: false }) })),
      uploads: Object.entries(roster.data.uploads).map(([id, about]) => ({ id, name: about.name, at: about.at })),
      parked: roster.data.parked,
      routes: roster.data.routes,
      rankings: { ...rankings.about, keys: aaKeys(), keyEnv: roster.data.settings.aaKeyEnv ?? null, released_as_of: released.as_of },
      providers: offered()
    }),
    resolve (models) {
      if (!Array.isArray(models)) throw new RangeError('models is a list of { provider, id }')
      const found = models.slice(0, 500).map(({ provider, id }) => {
        provider = String(provider ?? ''); id = String(id ?? '')
        const { art, own } = roster.artOf(provider, id)
        const { character, tier } = roster.whoOf(provider, id, art)
        const aa = rankings.of(provider, id, aliases)
        return { provider, id, art, own, face: roster.faceOf(provider, id, art), character, tier, name: nameOf(id, aa), aa }
      })
      const dates = datesOf(found)
      return found.map((model, index) => ({ ...model, released: dates[index].date, releasedSeen: dates[index].seen }))
    },
    /** The release dates of model ids from lists the page sorts (a provider's catalog or live list): `{ id: { date,
     * seen } }`, stamping the ones of no date as first seen today. */
    datesFor (ids) {
      if (!Array.isArray(ids)) throw new RangeError('ids is a list of model ids')
      const wanted = [...new Set(ids.slice(0, 1000).map(String).filter(id => id && id.length <= 200))]
      const dates = datesOf(wanted.map(id => ({ id, aa: rankings.of('', id, aliases) })))
      return { dates: Object.fromEntries(wanted.map((id, index) => [id, dates[index]])) }
    },
    pick: (model, picks) => roster.pick(model, picks),
    upload: (bytes, type, fileName) => roster.upload(bytes, type, fileName),
    forget: id => roster.forget(id),
    settings: values => { roster.set(values); return { keys: aaKeys(), keyEnv: roster.data.settings.aaKeyEnv ?? null } },
    park: (provider, about) => { roster.park(provider, about); return { parked: roster.data.parked } },
    unpark: provider => ({ kept: roster.unpark(provider), parked: roster.data.parked }),
    route: (character, provider) => { roster.route(character, provider); return { routes: roster.data.routes } },
    image: query => roster.image(query),
    top: (count, sort, efforts) => ({ ...rankings.about, rows: rankings.top(count, sort, { efforts }) }),
    // ---- art packs ----
    packs: () => ({ active: roster.look(true).id, packs: roster.packs.list(roster.data.settings.pack) }),
    usePack: id => { roster.usePack(id); return { ...dressed(), active: roster.look().id } },
    removePack: id => {
      roster.packs.remove(id)
      if (roster.data.settings.pack === id) roster.usePack(null)
      return { active: roster.look(true).id }
    },
    /** Keep a pack from a .zip or a lone pack.json (`bytes`), named by `fileName` when its pack.json does not. */
    importPack: (bytes, fileName = '') => {
      if (!bytes.length) throw new RangeError('the file is empty')
      if (bytes.length > MAX_PACK) throw new RangeError(`a pack is at most ${MAX_PACK / 1024 / 1024} MB`)
      const kept = roster.packs.install(filesOf(bytes), { hint: String(fileName).replace(/\.(zip|json)$/i, '') })
      roster.look(true)
      return kept
    },
    /** Fetch a pack from GitHub (a repository, or a folder in one) or a link to a .zip, and keep it. */
    async fetchPack (link) {
      const fetched = await fetchPack(link, options)
      const kept = roster.packs.install(fetched.files, { hint: fetched.hint, within: fetched.within })
      roster.look(true)
      return kept
    },
    exportPack: id => roster.packs.zip(String(id ?? BUNDLED)),
    /** Every release date known, by slug, for lists of models the page sorts itself: OpenRouter's, with Artificial
     * Analysis's over them (and their names for the models DSH calls otherwise). */
    releasedDates () {
      const dates = { ...released.dates }
      for (const [base, row] of rankings.models) if (row.released) dates[base] = row.released
      for (const [model, slug] of Object.entries(ALIASES)) {
        const row = rankings.models.get(slugOf(slug))
        if (row?.released) dates[slugOf(model)] = row.released
      }
      return { as_of: released.as_of, dates, seen: { ...seen.dates } }
    },
    async refreshRankings () {
      // the release dates first: OpenRouter's list is public, so they come again even without an Artificial Analysis key
      try {
        const dates = await fetchReleased(options)
        fs.mkdirSync(folder, { recursive: true })
        fs.writeFileSync(path.join(folder, 'openrouter.json'), JSON.stringify(dates))
        released = loadReleased(folder)
      } catch { /* the dates we have stand */ }
      seen.settle(slug => Boolean(listedOn(slug) || releasedInLineup(slug) || rankings.models.has(slug)))
      let key
      for (const reference of aaKeys()) if ((key = await resolve(reference))) break
      if (!key) throw new RangeError(`no Artificial Analysis key: set ${aaKeys()[0]} (a free key from artificialanalysis.ai)`)
      const fetched = await fetchRankings(key, options)
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'aa.json'), JSON.stringify(fetched))
      rankings = load(folder)
      seen.settle(slug => rankings.models.has(slug))
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
    const found = work.image(query.has('upload') ? { upload: query.get('upload') } : { art: query.get('art'), pack: query.get('pack') ?? undefined })
    if (!found || !fs.existsSync(found.file)) return answer({ error: 'no such picture' }, 404)
    return new Response(fs.readFileSync(found.file), { headers: { 'content-type': found.type,
      'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } })
  })
  route(ROUTES.rankings, ['GET', 'POST'], async (request, query) => request.method === 'POST'
    ? answer(await work.refreshRankings())
    : answer(work.top(Math.min(2000, Math.max(1, Number(query.get('top')) || 20)), query.get('sort') === 'released' ? 'released' : 'intelligence',
      query.get('efforts') === '1')))
  route(ROUTES.packs, ['GET', 'POST'], async request => {
    if (request.method === 'GET') return answer(work.packs())
    const body = await json(request)
    if ('use' in body) return answer(work.usePack(body.use === null ? null : String(body.use)))
    if ('remove' in body) return answer(work.removePack(String(body.remove)))
    if ('fetch' in body) return answer(await work.fetchPack(String(body.fetch)))
    throw new RangeError('say { use }, { remove } or { fetch }')
  })
  route(ROUTES.packImport, ['POST'], async (request, query) =>
    answer(work.importPack(Buffer.from(await request.arrayBuffer()), query.get('name') ?? '')))
  route(ROUTES.packExport, ['GET'], (request, query) => {
    const { name, bytes } = work.exportPack(query.get('id') ?? BUNDLED)
    return new Response(bytes, { headers: { 'content-type': 'application/zip', 'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${name}"`, 'x-content-type-options': 'nosniff' } })
  })
  route(ROUTES.released, ['GET', 'POST'], async request => request.method === 'POST'
    ? answer(work.datesFor((await json(request)).ids))
    : answer(work.releasedDates()))
  route(ROUTES.check, ['GET'], async (request, query) =>
    answer(await work.check(provider(query), query.get('ref') ?? undefined, query.get('fresh') === '1')))
  route(ROUTES.balance, ['GET'], async (request, query) =>
    answer(await work.balance(provider(query), query.get('ref') ?? undefined)))
  route(ROUTES.live, ['GET'], async (request, query) =>
    answer(await work.live(provider(query), query.get('ref') ?? undefined)))
}
