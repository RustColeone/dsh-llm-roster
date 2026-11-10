// DeepSeek Harness plugin: a character roster for DSH's models. The server half (server.js) keeps your picks of art,
// serves the pictures and the Artificial Analysis rankings, and asks providers about your account (their live model
// list, your balance) with the key DSH keeps for them, which never leaves the server. The client half (client.js) is
// the avatar beside the composer's model picker and the roster it opens.
import os from 'node:os'
import path from 'node:path'
import { createRoster, serve } from './server.js'

export const name = 'llm-roster'

/** DSH's home, as @deepseek-ai/dsh-home-paths resolves it: $DSH_HOME (with ~ expanded), else ~/.dsh. */
export function dshHome (env = process.env) {
  const set = String(env.DSH_HOME ?? '').trim()
  if (!set) return path.join(os.homedir(), '.dsh')
  return path.resolve(set === '~' ? os.homedir() : set.replace(/^~(?=[/\\])/, os.homedir()))
}

/** Settings, in the profile's cordis.patch.yml: `aliases` ({ 'provider/model' or 'model': Artificial Analysis slug })
 * for a model whose id is not the one they measure it under, and `aaKeyEnv`, the reference holding your Artificial
 * Analysis key (else ARTIFICIAL_ANALYSIS_API_KEY or AA_API_TOKEN). */
export function apply (ctx, config = {}) {
  const work = createRoster(path.join(dshHome(), 'llm-roster'), {
    aliases: config.aliases ?? {},
    aaKeyEnv: config.aaKeyEnv,
    // A credential reference: DSH's store (what its Models page saves), then the environment.
    resolve: async reference => {
      const credentials = ctx.get?.('credentials')
      if (credentials) {
        try {
          const hit = await credentials.resolve(reference)
          if (hit?.value) return hit.value
        } catch { /* not a name the store reads: the environment */ }
      }
      return process.env[reference] || undefined
    }
  })
  ctx.inject(['connection'], scope => serve(scope.connection, work))
}
