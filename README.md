# dsh-llm-roster

A gacha-style character roster for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Your
models become characters: an avatar sits just left of the composer's model picker, and a click opens the roster, where
picking a card switches the session to that model.

DSH runs one agent on one model at a time, so there are no teams here. Picking a card does exactly what DSH's own
model picker does. The two share one model directory, so they always agree, and reasoning effort stays in DSH's picker.

## Install

```sh
dsh plugin --profile web add github:RustColeone/dsh-llm-roster
```

The package's bundle patch adds the plugin to the profile (`- id: llm-roster`). Start DSH again (`dsh web`) and open
a conversation: the avatar is beside the model name under the message box.

## What it shows

**The avatar.** It shows the face of the character for the session's current model, ringed in its rarity's colour.
It opens the roster.

**Roster.** Every model DSH's picker offers, as a card with:

- the character's art for the model's tier, and the rarity of that tier;
- the model's Artificial Analysis Intelligence Index, and its rank among the models they measure;
- its list price per million tokens.

You can filter by provider and sort by provider or by rank. A click on a card switches the session to that model.

| Tier | Art | Rarity |
| --- | --- | --- |
| Chibi | a chibi | R |
| Middle-schooler | middle-school uniform | SR |
| High-schooler | high-school blazer | SSR |
| University student | grown-up, on campus | UR |

Five characters ship: GPT, Claude, Gemini, DeepSeek and Grok. [`art/art.json`](art/art.json) says which mainstream
model is which character and tier (GPT-6 Luna a chibi, GPT-6.1 Sol a high-schooler, Claude Fable a university
student, …). Any other model is matched by its id (`gpt…`, `claude…`, `gemini…`, `grok…`, `deepseek…`, also behind
OpenRouter's `vendor/` prefix) or by its provider, and gets its tier from the words in its id (flash, mini and haiku
are chibis; pro and opus are high-schoolers; …). You can pick other art for any model, or upload your own (below).

**Models & keys.** Each provider you have configured in DSH gets a card with three parts.

- **API key.** You can paste a key, which is stored write-only in DSH's credential store, exactly as DSH's Models page
  stores it. Or you can name the environment variable that holds it, which sets the provider's `apiKeyEnv`. A dot says
  whether the key is set, and whether it comes from DSH or from the environment.
- **Balance**, for providers whose API reports one: DeepSeek, OpenRouter and Moonshot. OpenAI, Anthropic, Google and
  xAI don't report one for ordinary keys.
- **Used and Ignored models, as pills.** A click moves a model from one to the other.
  - Used is the provider's model list in DSH's settings (`providers.<route>.models` for pi-ai providers, `models` for
    DeepSeek), so the Used models are exactly what DSH's model picker and the roster offer. A provider with no list
    uses its whole catalog until you first move one out.
  - Ignored shows what **Fetch catalog** found: DSH's installed catalog, with no network call.
  - **Fetch live list** asks the provider itself which models your key can call. That finds models newer than DSH's
    catalog, such as Claude Fable 5.2 on its release day. Picture, speech and embedding models are left out.
  - The small face on each Used pill opens the art picker. You can choose any character's art for any tier, upload a
    picture (PNG, JPEG, WebP or GIF, up to 4 MB), or go back to the default.

**Add a provider…** adds any provider DSH can route but you haven't set up yet.

**Rankings.** Artificial Analysis's top models, each listed once at its best effort, with the intelligence, coding
and agentic indexes and prices. Models in your roster are highlighted. The plugin ships a snapshot (the date is shown).
**Fetch again** downloads the current list, which needs your own free key from
[artificialanalysis.ai](https://artificialanalysis.ai). Paste it on the Rankings tab, where it is stored write-only in
DSH's credential store like a provider's key. Or name the environment variable that holds it. Otherwise the roster
reads `ARTIFICIAL_ANALYSIS_API_KEY`, then `AA_API_TOKEN`. Their terms ask that they be credited wherever their data
appears, and the roster does.

Models & keys and Rankings are also on DSH's Plugins page, under **dsh-llm-roster**.

## Settings

In the profile's patch, `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: llm-roster
  config:
    aliases:                       # a model Artificial Analysis lists under another name
      my-gateway/fast-one: gpt-6-luna
    aaKeyEnv: MY_AA_KEY            # where your Artificial Analysis key is (one named on the Rankings tab wins;
                                   # then ARTIFICIAL_ANALYSIS_API_KEY, AA_API_TOKEN)
```

## Where things are kept

Everything about your providers is in DSH's own settings and credential store; the roster keeps nothing of it.
The roster keeps its own files in `$DSH_HOME/llm-roster/` (`~/.dsh/llm-roster/`):

| File | What it holds |
| --- | --- |
| `roster.json` | your art picks (`provider/model` → `gpt/high` or `custom:<id>`), your uploads' names, and the variable your Artificial Analysis key is in, if you named one |
| `art/<id>.<ext>` | the pictures you uploaded |
| `aa.json` | the rankings, once fetched again |

## How it works

| File | What it does |
| --- | --- |
| [`plugin/client.js`](plugin/client.js) | The web half (React from DSH). It puts the avatar in the `conversation.input.right` slot and renders the roster dialog and the Plugins page. It switches models through `modelDirectories.directoryFor(session).select()`. It writes model lists and `apiKeyEnv` with `remote.settings.mutate`, stores keys with `remote.credentials.set`, and reads catalogs with `remote.llm.discoverModels`. |
| [`plugin/index.js`](plugin/index.js) | The DSH plugin (`llm-roster`). It mounts the routes on DSH's API and resolves keys through DSH's credential store, then the environment. |
| [`plugin/server.js`](plugin/server.js) | The routes, below. |
| [`plugin/roster.js`](plugin/roster.js) | Which character and tier each model is, your picks, and your uploads. |
| [`plugin/rankings.js`](plugin/rankings.js) | The Artificial Analysis list: matching a model to its slug, ranks, and fetching the list again. |
| [`plugin/providers.js`](plugin/providers.js) | The balance and live-list endpoints of each provider, at fixed official addresses. |
| [`art/`](art) | The characters' art and [`art.json`](art/art.json). Credits are in [`art/CREDITS.md`](art/CREDITS.md). |
| [`data/`](data) | The shipped rankings snapshot. |

Keys never reach the page. A balance or a live list is asked by the server, using the key DSH resolves for the
provider's credential reference. It is sent only to that provider's official address, never to an address the page
names.

The routes are on DSH's API, behind its sign-in and for its owner only:

| Route | |
| --- | --- |
| `GET /api/llm-roster.state` | tiers, characters, your uploads, the rankings' date, what each provider offers |
| `POST /api/llm-roster.resolve` | `{models: [{provider, id}]}` → each one's art, character, tier and rankings |
| `POST /api/llm-roster.pick` | `{model: 'provider/model', art: 'gpt/high' \| 'custom:<id>' \| null}` |
| `POST /api/llm-roster.upload?name=` | the picture as the body → `{id}` |
| `POST /api/llm-roster.forget` | `{upload: id}` |
| `POST /api/llm-roster.settings` | `{aaKeyEnv: '<variable>' \| null}`: where your Artificial Analysis key is |
| `GET /api/llm-roster.image` | `?art=<character>/<tier or face>` or `?upload=<id>` |
| `GET/POST /api/llm-roster.rankings` | the top models (`?top=`), or fetch them again |
| `GET /api/llm-roster.balance` | `?provider=<route>&ref=<credential reference>` |
| `GET /api/llm-roster.live` | `?provider=<route>&ref=<credential reference>` |

## Development

```sh
npm test                                              # node --test: the server half, no DSH or network needed
python3 tools/import-art.py ~/Projects/DiscordStudyBot  # art/ again from a ChimeraArchiveHarness checkout
AA_API_TOKEN=... node tools/aa-snapshot.mjs           # a new rankings snapshot in data/
```

For a local checkout, `dsh plugin --profile web add link:/path/to/dsh-llm-roster` uses it in place.

## License

- **Code:** [MIT](LICENSE).
- **Art (`art/`):** CC BY-NC-SA 4.0, so non-commercial only. These are AI-generated adaptations of character
  designs by [ZipZipPipe](https://space.bilibili.com/4168597/). DeepSeek-chan, the original character, is by
  [上善无形](https://space.bilibili.com/4456176). See [`art/CREDITS.md`](art/CREDITS.md).
- **Rankings data (`data/`):** Artificial Analysis's, used under their terms with credit to them.
