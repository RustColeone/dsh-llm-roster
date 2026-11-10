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

**The avatar.** The face of the session's model at its tier: each tier of each character has its own face, so you
can tell at a glance which model you are on. It is ringed in the tier's rarity colour, and it opens the roster.

**Roster.** Every model DSH's picker offers, plus the roster's lineup of mainstream models, each as a card with:

- the character's art for the model's tier, and the rarity of that tier;
- the model's Artificial Analysis Intelligence Index, and its rank among the models they measure;
- a **…** button that opens the character's page.

A click on a ready card switches the session to that model. A card that can't be used yet says why:

| Card | Meaning |
| --- | --- |
| **Not available**: please add an API key | No key for the provider was found. A click opens the page where you can add one. |
| **API key rejected** | The provider refused the key when the roster asked it for usage. |
| **Not in use** | The key works, but the model isn't one of the provider's Used models yet. Its page adds it. |

Each key is tested by asking the provider for usage: its balance where it reports one, otherwise the models the key
can call. A result is kept for ten minutes, and the **Test key** button asks again. DeepSeek models need no key when
you're signed in to a DeepSeek account in DSH. They then come through the account, and a DeepSeek card's page lets
you choose the account or the API key instead. You can filter by provider or to available models only, and sort by
provider or by rank.

**A character's page** (the **…** button) has:

- **Showcase and gallery:** the big card art, and every tier of the character. Click a tier to preview it, then
  **Equip this art**.
- **Stats:** intelligence, coding and agentic bars, rank, price, speed, and the efforts Artificial Analysis measured.
- **Equipment:** the card art and the avatar, each changeable on its own. Pick any character's art or face, or upload
  a picture (PNG, JPEG, WebP or GIF, up to 4 MB).
- **In the roster:** whether the model is Used or Ignored, with **Move to Ignored**.
- **Provider:** the provider's key, with a test and the balance.
- **Use this model**, or **Add and use this model** for one not in use yet.

**The + card** adds a model the lineup doesn't have. Choose a provider (one you haven't set up is added, with a key
field), type the model id or pick it from the catalog or the provider's live list, give it a name, and choose its art
and avatar. It joins the provider's Used models, so DSH's picker offers it too.

| Tier | Art | Rarity |
| --- | --- | --- |
| Chibi | a chibi | R |
| Middle-schooler | middle-school uniform | SR |
| High-schooler | high-school blazer | SSR |
| University student | grown-up, on campus | UR |

Five characters ship: GPT, Claude, Gemini, DeepSeek and Grok, each with a card picture and a face for every tier.
[`art/art.json`](art/art.json) says which mainstream model is which character and tier (GPT-6 Luna a chibi, GPT-6.1
Sol a high-schooler, Claude Fable a university student, …), and those models are the roster's lineup. Any other model
is matched by its id (`gpt…`, `claude…`, `gemini…`, `grok…`, `deepseek…`, also behind OpenRouter's `vendor/` prefix)
or by its provider, and gets its tier from the words in its id (flash, mini and haiku are chibis; pro and opus are
high-schoolers; …).

**Models & keys.** Each provider you have configured in DSH gets a card:

- **API key.** You can paste a key, which is stored write-only in DSH's credential store, exactly as DSH's Models page
  stores it. Or you can name the environment variable that holds it, which sets the provider's `apiKeyEnv`. A dot says
  whether the key is set and where it comes from. **Test key** asks the provider whether it works.
- **Balance**, for providers whose API reports one: DeepSeek, OpenRouter and Moonshot. OpenAI, Anthropic, Google and
  xAI don't report one for ordinary keys.
- **Used and Ignored models, as pills.** A click moves a model from one to the other.
  - Used is the provider's model list in DSH's settings (`providers.<route>.models` for pi-ai providers, `models` for
    DeepSeek), so the Used models are exactly what DSH's model picker and the roster offer. A provider with no list
    uses its whole catalog until you first move one out.
  - Ignored shows what **Fetch catalog** found: DSH's installed catalog, with no network call.
  - **Fetch live list** asks the provider itself which models your key can call. That finds models newer than DSH's
    catalog, such as Claude Fable 5.2 on its release day. Picture, speech and embedding models are left out.
  - The small face on each Used pill changes that model's avatar.
- **Use all and Ignore all.**
  - **For DeepSeek**, Ignore all leaves its model list empty, and Use all gives DSH's own list back.
  - **For a pi-ai provider**, a provider with no model list serves its whole catalog. So Ignore all sets the provider
    aside: it leaves DSH's settings, with its key reference and model list kept in the roster's file. **Use again**
    puts it back exactly as it was.
- **Remove provider** takes a provider you added out of DSH's settings, after a confirmation. It can also delete the
  key stored for it in DSH. Providers that are part of DSH's own setup can't be removed or set aside here.

**DeepSeek account** shows whether you're signed in. Signed in, DeepSeek's models need no API key.

**Add a provider…** adds any provider DSH can route but you haven't set up yet.

The roster speaks English and Chinese, following DSH's language.

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
| `roster.json` | your art and avatar picks (`provider/model` → `gpt/high`, `gpt/face-high` or `custom:<id>`), your uploads' names, the providers you set aside with Ignore all (as they were in DSH's settings), and the variable your Artificial Analysis key is in, if you named one |
| `art/<id>.<ext>` | the pictures you uploaded |
| `aa.json` | the rankings, once fetched again |

## How it works

| File | What it does |
| --- | --- |
| [`plugin/client.js`](plugin/client.js) | The web half (React from DSH). It puts the avatar in the `conversation.input.right` slot and renders the roster dialog and the Plugins page. It switches models through `modelDirectories.directoryFor(session).select()`. It writes model lists and `apiKeyEnv` with `remote.settings.mutate`, stores keys with `remote.credentials.set`, and reads catalogs with `remote.llm.discoverModels`. |
| [`plugin/index.js`](plugin/index.js) | The DSH plugin (`llm-roster`). It mounts the routes on DSH's API and resolves keys through DSH's credential store, then the environment. |
| [`plugin/server.js`](plugin/server.js) | The routes, below. |
| [`plugin/roster.js`](plugin/roster.js) | Which character and tier each model is, the lineup, your picks of art and avatar, your uploads, and set-aside providers. |
| [`plugin/rankings.js`](plugin/rankings.js) | The Artificial Analysis list: matching a model to its slug, ranks, and fetching the list again. |
| [`plugin/providers.js`](plugin/providers.js) | Each provider's balance and live-list endpoints, at fixed official addresses, and the key check built on them. |
| [`art/`](art) | The characters' art and [`art.json`](art/art.json). Credits are in [`art/CREDITS.md`](art/CREDITS.md). |
| [`data/`](data) | The shipped rankings snapshot. |

Keys never reach the page. A key check, a balance or a live list is asked by the server, using the key DSH resolves
for the provider's credential reference. It is sent only to that provider's official address, never to an address the page
names.

The routes are on DSH's API, behind its sign-in and for its owner only:

| Route | |
| --- | --- |
| `GET /api/llm-roster.state` | tiers, characters, the lineup, your uploads, set-aside providers, the rankings' date and key names, what each provider offers |
| `POST /api/llm-roster.resolve` | `{models: [{provider, id}]}` → each one's art, avatar, character, tier, name and rankings |
| `POST /api/llm-roster.pick` | `{model: 'provider/model', art?: 'gpt/high' \| 'custom:<id>' \| null, face?: 'gpt/face-high' \| 'custom:<id>' \| null}` |
| `POST /api/llm-roster.upload?name=` | the picture as the body → `{id}` |
| `POST /api/llm-roster.forget` | `{upload: id}` |
| `POST /api/llm-roster.settings` | `{aaKeyEnv: '<variable>' \| null}`: where your Artificial Analysis key is |
| `POST /api/llm-roster.park` / `unpark` | `{provider, ns, path, profile}` / `{provider}`: a provider set aside by Ignore all, and put back |
| `GET /api/llm-roster.image` | `?art=<character>/<tier, face or face-tier>` or `?upload=<id>` |
| `GET/POST /api/llm-roster.rankings` | the top models (`?top=`), or fetch them again |
| `GET /api/llm-roster.check` | `?provider=<route>&ref=<credential reference>&fresh=1`: does the key work (`ok`, `missing`, `rejected`, `error`, `untested`) |
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
