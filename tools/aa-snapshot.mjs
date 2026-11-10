#!/usr/bin/env node
// Fetch Artificial Analysis's free models list and ship it as data/aa-<today>.json (older snapshots are removed).
//
//     ARTIFICIAL_ANALYSIS_API_KEY=... node tools/aa-snapshot.mjs     (or AA_API_TOKEN)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchRankings } from '../plugin/rankings.js'

const key = process.env.ARTIFICIAL_ANALYSIS_API_KEY || process.env.AA_API_TOKEN
if (!key) {
  console.error('set ARTIFICIAL_ANALYSIS_API_KEY (or AA_API_TOKEN): a free key from artificialanalysis.ai')
  process.exit(1)
}
const data = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const fetched = await fetchRankings(key)
const file = path.join(data, `aa-${fetched.as_of}.json`)
fs.writeFileSync(file, JSON.stringify(fetched))
for (const old of fs.readdirSync(data)) {
  if (/^aa-\d{4}-\d{2}-\d{2}\.json$/.test(old) && path.join(data, old) !== file) fs.rmSync(path.join(data, old))
}
console.log(`${path.relative(process.cwd(), file)}: ${fetched.rows.length} rows, intelligence index v${fetched.version}`)
