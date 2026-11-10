#!/usr/bin/env node
// Ship today's snapshots in data/: OpenRouter's release dates (data/openrouter-<today>.json; its model list is public)
// and, with a key, Artificial Analysis's rankings (data/aa-<today>.json). Older snapshots of each are removed.
//
//     node tools/aa-snapshot.mjs                                     the release dates only
//     ARTIFICIAL_ANALYSIS_API_KEY=... node tools/aa-snapshot.mjs     both (or AA_API_TOKEN)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchRankings, fetchReleased } from '../plugin/rankings.js'

const data = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

/** Write `value` as data/<prefix>-<date>.json and remove the older ones of that prefix. */
function ship (prefix, value) {
  const file = path.join(data, `${prefix}-${value.as_of}.json`)
  fs.writeFileSync(file, JSON.stringify(value))
  for (const old of fs.readdirSync(data)) {
    if (new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}\\.json$`).test(old) && path.join(data, old) !== file) fs.rmSync(path.join(data, old))
  }
  return path.relative(process.cwd(), file)
}

const released = await fetchReleased()
console.log(`${ship('openrouter', released)}: ${Object.keys(released.dates).length} release dates`)
const key = process.env.ARTIFICIAL_ANALYSIS_API_KEY || process.env.AA_API_TOKEN
if (!key) {
  console.log('no ARTIFICIAL_ANALYSIS_API_KEY (or AA_API_TOKEN): the rankings snapshot is left as it is')
  process.exit(0)
}
const rankings = await fetchRankings(key)
console.log(`${ship('aa', rankings)}: ${rankings.rows.length} rows, intelligence index v${rankings.version}`)
