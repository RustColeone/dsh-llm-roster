# dsh-llm-roster

English · [简体中文](README.zh-CN.md)

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
- a **…** button that opens the character's page;
- a red **⚠** when a call to its model (or its provider's key) failed lately, with why on hover (see **Why calls
  failed lately**, below).

A click on a ready card switches the session to that model. A card that can't be used yet says why:

| Card | Meaning |
| --- | --- |
| **Not available**: please add an API key | No key for the provider was found. A click opens the page where you can add one. |
| **API key rejected** | The provider refused the key when the roster asked it for usage. |
| **Not in use** | The key works, but the model isn't one of the provider's Used models yet. Its page adds it. |

Each key is tested by asking the provider for usage: its balance where it reports one, otherwise the models the key
can call. A result is kept for ten minutes, and the **Test key** button asks again. DeepSeek models need no key when
you're signed in to a DeepSeek account in DSH. They then come through the account, and a DeepSeek card's page lets
you choose the account or the API key instead.

The roster opens on **Available**: the models you can use now. **All** shows every character, with what each one
needs, and a provider's chip shows its models alone.

You can sort by provider, by rank, or by release date. By provider, a line with each provider's name (▸ DeepSeek ───)
heads its cards. **Divide by provider** turns the lines off and on again, and the roster keeps your choice in this
browser. DeepSeek's account and her API key are one provider there: each DeepSeek model is one card, through the one or
the other, and its card says which. In the release-date sort, newest comes first and each card
shows its date. A model's release date is, in this order:

1. Artificial Analysis's, where they measure it.
2. The day OpenRouter listed the model, whichever provider you use it through (Volcengine's
   `doubao-seed-2-1-turbo-260628` gets OpenRouter's date for Seed 2.1 Turbo).
3. For a lineup model neither of them lists, the date the roster gives it in
   [`plugin/models.json`](plugin/models.json): the day its maker announced it (Seed 2.1 Pro, 2026-06-23).
4. The date written in its id, if there is one (`claude-3-5-haiku-20241022`, or a build stamp like Volcengine's
   `doubao-seed-2-1-pro-260628`).
5. Otherwise, **the day the roster first saw it**, shown with a `~` (`~2026-11-12`). A model in none of the lists we
   have can only be newer than them, so a "Claude Fable 5.5" turning up tomorrow counts as released tomorrow. That
   day is kept in your DSH home, so it doesn't move, until Artificial Analysis or OpenRouter publish a date for the
   model. Their date then replaces it.

The plugin ships snapshots of both lists, and **Fetch again** on the Rankings tab updates them. OpenRouter's list is
public, so its part needs no key. A character's page shows her release date under her name. One limit: a model that
OpenRouter has stopped listing, and that carries no date in its id, also gets the day it was first seen.

**A character's page** (the **…** button) has:

- **Showcase and gallery:** the big card art, and every picture the art pack has of the character (her four tiers,
  and any more). Click one to preview it, then **Equip this art**.
- **Stats**, from Artificial Analysis:
  - bars for the Intelligence Index and their six capability indexes (engineering, finance, economics, legal, health,
    strategy & ops);
  - her rank;
  - the cost of one Intelligence Index task, and of the whole index;
  - with a Pro key, the time and tokens a task takes;
  - price, speed, and how long until the first answer token (thinking included);
  - every effort they measured, with its index and cost per task.
- **Equipment:** the card art and the avatar, each changeable on its own. Pick any picture the art pack has, her own
  listed first (her tiers' and any more in her folder), any other character's, or upload a picture (PNG, JPEG, WebP or
  GIF, up to 4 MB). Your choices are changes to the pack in use, written into it when you export it (see **Art
  packs**).
- **In the roster:** whether the model is Used or Ignored, with **Move to Ignored**.
- **Served through** (for a lineup model): which provider and key serve the character. The choices are her own
  provider, OpenRouter, or an OpenAI-compatible endpoint of yours, and **+ OpenAI-compatible endpoint** adds one.
  - Her models are matched by name among the ones that provider offers, so OpenRouter's `anthropic/claude-opus-5.5`
    is Anthropic's `claude-opus-5-5`. A family name in front and a build stamp at the end don't count, so
    Volcengine's `doubao-seed-2-1-turbo-260628` is Seed 2.1 Turbo (with several builds, the newest).
  - A model it doesn't offer says **Not offered there**. So does a lineup model OpenRouter doesn't list, for a
    character who comes through OpenRouter by default.
  - So with only an OpenRouter key, every character can still be played: GPT, Claude, Kimi, GLM and the rest.
- **Provider:** the provider's key, with a test and the balance, and why its calls failed lately (this model's
  marked).
- **Use this model**, or **Add and use this model** for one not in use yet.

**The + card** adds a model the lineup doesn't have. Choose a provider, or a new OpenAI-compatible endpoint (a
provider you haven't set up is added, with a key field). Type the model id or pick it from the catalog or the
provider's live list, give it a name, and choose its art and avatar. It joins the provider's Used models, so DSH's
picker offers it too.

**An OpenAI-compatible endpoint** is any service that speaks OpenAI's Chat Completions API: a relay, a gateway, or a
server of your own. Give it a name, its base URL and its key (or the environment variable holding it), let DSH find
its models, and choose the ones to use. It becomes a provider route in DSH's settings like any other, and its key is
stored write-only. The roster doesn't try to support every provider's own API itself: DSH already speaks them natively
(Anthropic Messages for Claude, Google's API for Gemini, Mistral's, OpenAI's Responses, Chat Completions for Kimi, GLM
and DeepSeek), and anything else can come in as an OpenAI-compatible key.

| Tier | Art | Rarity |
| --- | --- | --- |
| Chibi | a chibi | R |
| Middle-schooler | middle-school uniform | SR |
| High-schooler | high-school blazer | SSR |
| University student | grown-up, on campus | UR |

Those are the bundled art pack's names and pictures. Another pack can call the tiers anything (Squire, Page, Knight,
Paladin) and draw the characters any way: see **Art packs** below.

Fourteen characters ship, each with a card picture and a face for every tier:

- GPT, Claude, Gemini, DeepSeek and Grok, from their own providers;
- Kimi, GLM, Qwen, Mistral, MiniMax, Llama, Doubao, Perplexity and Hunyuan, through OpenRouter by default.

Doubao is ByteDance's Seed family. OpenRouter lists Seed 2.1 Turbo, 2.0 Code, 2.0 Lite and 2.0 Mini. ByteDance's
flagship, Seed 2.1 Pro, is only on its own cloud, Volcengine Ark, so its card says **Not offered there**. To play it,
add Ark as an OpenAI-compatible endpoint on Doubao's page (base URL `https://ark.cn-beijing.volces.com/api/v3`, your
Ark key) and send her through it. Ark's own ids, such as `doubao-seed-2-1-pro-260628`, are matched to the lineup and
keep its tiers. Artificial Analysis doesn't measure the Seed models, so their cards have no rankings.

[`plugin/models.json`](plugin/models.json) says which mainstream model is which character and tier (GPT-6 Luna a chibi, GPT-6.1
Sol a high-schooler, Claude Fable a university student, Kimi K3 a high-schooler and K3.1 Pro a university student, …),
and those models are the roster's lineup. A few more are named there by pattern (Kimi's K3 256K, `kimi-k3*256k*`, is
a chibi). Any other model is matched by its id (`gpt…`, `claude…`, `kimi…`, `glm…`, `qwen…`, `sonar…`, …, also
behind OpenRouter's `vendor/` prefix) or by its provider. It gets its tier from the words in its id: flash, mini and
haiku are chibis; pro and opus are high-schoolers; prime, fable and deep research are university students; and so on.

Last generation's models are left out until you choose them: Kimi for Coding's (`kimi-for-coding*`). A provider that
serves its whole catalog shows them under Ignored on Models & keys, and counts them below the cards; moving one to
Used brings its card back.

A provider that serves its whole catalog (OpenRouter with no model list, which has hundreds) shows only the models the
roster knows as characters. A note counts the rest, which DSH's picker still offers, and links to Models & keys to
choose the ones you use.

**Models & keys.** Each provider you have configured in DSH gets a card:

- **API key.** You can paste a key, which is stored write-only in DSH's credential store, exactly as DSH's Models page
  stores it. Or you can name the environment variable that holds it, which sets the provider's `apiKeyEnv`. A dot says
  whether the key is set and where it comes from. **Test key** asks the provider whether it works.
- **Balance**, for providers whose API reports one: DeepSeek, OpenRouter and Moonshot.
- **Spend or credit**, for OpenAI, Anthropic and xAI, shown under the API key as soon as the card opens. These
  providers tell it only to a key allowed to read it, which usually may not call the models (an Anthropic
  organization key needs a workspace DSH doesn't name), so it gets a field of its own, folded away under the API key
  since it's seldom needed: **▸ Admin key (spend)** or **▸ Management key (credit)**, which says when one is set. It's
  optional; paste it (stored write-only in DSH's credential store, like the API key)
  or set its variable. The roster only reads with it; without one, it asks with the API key. A key that may not read it
  shows nothing and isn't kept as a failure; its **Test key** says why, and which key it asked with.

  | Provider | Shows | Spend key | Variable |
  | --- | --- | --- | --- |
  | OpenAI | spent this month (its Costs API) | an admin key, or a key with the `api.usage.read` permission | `OPENAI_ADMIN_KEY` |
  | Anthropic | spent this month (its cost report) | an Admin key, or an organization-scoped key allowed to read costs | `ANTHROPIC_ADMIN_KEY` |
  | xAI | prepaid credit left | a team's management key | `XAI_MANAGEMENT_KEY` (or `XAI_MANAGEMENT_API_KEY`) |

  Google tells neither to any key: Gemini's spend is on AI Studio's and Google Cloud's billing pages only. A spend key
  can do more than read costs; the roster only reads with it, and where the provider lets a key be limited (xAI's
  management keys can be), limit it to billing.
- **Why calls failed lately**, below.
- **Used and Ignored models, as pills.** A click moves a model from one to the other.
  - Used is the provider's model list in DSH's settings (`providers.<route>.models` for pi-ai providers, `models` for
    DeepSeek), so the Used models are exactly what DSH's model picker and the roster offer. A provider with no list
    uses its whole catalog until you first move one out.
  - Ignored shows what **Fetch catalog** found: DSH's installed catalog, with no network call.
  - Ignored is sorted newest first, each model with its release date (models of no known date last). A long list
    such as OpenRouter's therefore opens on the models that just came out. **A–Z** sorts it by name instead. The
    models found for a new OpenAI-compatible endpoint, and the + card's suggestions, come newest first too.
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

**DeepSeek account** shows whether you're signed in. Signed in, DeepSeek's models need no API key, and the card shows
the account's balance (topped up and granted) as DSH itself reads it, the same as Settings → Account.

**Why calls failed lately.** The roster watches every model call DSH makes (it passes DSH's `llm/stream` along
untouched) and keeps the ones that failed, with why: DSH's code for it (key not accepted, out of quota or balance,
rate limited, timed out, …), the HTTP status and the provider's message, by provider and model. A failed key check is
kept too. They show on the provider's card in Models & keys, on a character's page (her model's marked), and as a red
**⚠** on a card. A call that succeeds again lets them go: that model's failures, and the ones that were the
provider's as a whole (its key, its balance, its rate, its service). **Clear** lets them go by hand. A call you stopped
is no failure. They are kept in DSH's home (`failures.json`, the newest 12 for each provider), with anything that looks
like a key in a provider's message hidden.

**Add a provider…** adds any provider DSH can route but you haven't set up yet, or a new OpenAI-compatible endpoint.
An endpoint's key is tested by DSH itself, which lists its models with the key it keeps.

The roster speaks English and Chinese, following DSH's language.

**Rankings.** Artificial Analysis's leaderboard: every model they measure, each listed once at its best effort, or
with **Every effort**, each effort as its own entry. The columns are:

- the Intelligence Index;
- the cost of one task of the index;
- with a Pro key, the time and the tokens a task takes;
- speed, price, and release date.

Click a column to sort by it, and again to reverse it. Type to find a model or its maker, and **In your roster**
narrows the list to your models, which are highlighted anyway. The plugin ships a snapshot (the date is shown).

Artificial Analysis no longer publishes a Coding or an Agentic index (their API returns both as empty), so the roster
shows their six capability indexes instead. Their free list has the cost of a task but not its time or tokens, which
are in their Pro list. With a Pro key, **Fetch again** reads the Pro list, and those two columns appear. The tokens of
a task are what it writes, reasoning included: the output part of a task's cost, divided by the price of an output
token.

**Fetch again** downloads the current list, which needs your own free key from
[artificialanalysis.ai](https://artificialanalysis.ai). Paste it on the Rankings tab, where it is stored write-only in
DSH's credential store like a provider's key. Or name the environment variable that holds it. Otherwise the roster
reads `ARTIFICIAL_ANALYSIS_API_KEY`, then `AA_API_TOKEN`. Their terms ask that they be credited wherever their data
appears, and the roster does.

**Summon.** A gacha has to have a gacha. Summon draws cards from the roster's own pool, just for fun. The ✦ are free,
nothing is bought and no model is called. A summoned character doesn't give you its model: using one still takes its
key. The pool is the lineup's models as characters (university students ★5, high-schoolers ★4, the rest ★3), plus 19
pieces of LLM-themed equipment (Infinite Context, No Rate Limit, Valid JSON, Em Dash, …). The numbers are Fate/Grand
Order's published summon rates:

| | Character | Equipment |
| --- | --- | --- |
| ★5 | 1% | 4% |
| ★4 | 3% | 12% |
| ★3 | 40% | 40% |

- A single summon costs 3 ✦. A ×10 costs 30 ✦ and deals 11 cards, at least one of them ★4 or better and at least
  one a character.
- Each banner has a pickup ★5, which is 0.8% of that 1%. It is the newest university student unless you choose
  another. You can add a pickup ★4, which is 1.5% of its 3%.
- If the pickup ★5 hasn't come in 329 summons on its banner, the 330th is it, once per banner.

A summon plays out in two beats:

1. **The charge.** The stars rush past and tokens stream into a ring that draws itself in. At the core, the ring's
   light turns with a shockwave: rainbow, with rays, for a ★5 character; gold for a ★4 character or ★5 equipment.
   Then it bursts into a flash.
2. **The deal.** The cards fly out of the ring face down, their backs already glowing with what they are. They flip
   one by one, and a light sweeps each card. A ★4 or ★5 pops and throws off stars, and a ★5 keeps a rainbow glow.

A click skips ahead. Each card you get goes into the album, and a summoned character opens its page.

**The feel.** Cards behave like boxed games on a shelf. Under the pointer a card lifts and leans toward it, a
glossy band and a highlight follow the pointer across it, and ★4 and ★5 cards have a foil that shifts as they lean.
The same goes for a character's big art, the album and the summon banner, whose art moves a little with the
pointer. All of this, and every animation, is off when your system asks for reduced motion.

**Art packs.** How the characters look, and what they and their tiers are called, come from an art pack. A pack
doesn't change who a model is (her character, her tier and its rarity, the lineup), only how she's dressed and named.
Two packs come with the roster, and are yours from the first time it starts:

- **Academy**, the student pack, in use until you choose another: every one of the fourteen characters from chibi to
  middle-schooler, high-schooler and university student, drawn after ZipZipPipe's designs. It is also the bundled
  pictures (`art/`): what any pack doesn't have comes from them.
- **Original**, an extra: every one of the fourteen characters in her art stages, the tiers (Stage 2, Stage 3, and
  the awakened Stage 4), with her chibi as the chibi. Her bond pictures (a café, at home, a summer festival) are more
  cards to choose from on her page, and her mood faces (happy, calm, worried, sad) more avatars. The first five (GPT,
  Claude, Gemini, DeepSeek and Grok) are as ChimeraArchiveHarness first drew them; the other nine were drawn for this
  pack with the same prompts. It ships as [`packs/original.zip`](packs). (A roster before 0.5.3 added it as **Original Students**,
  with the first five alone; that one stays in your packs until you remove it.)

**Switch packs on the go** with the **Art pack** menu on the Roster tab, or start a **New empty pack** there. Every
card, avatar, gallery and the summon change at once. The **Art packs** tab lists your packs:

- **Use** one.
- **Export .zip** saves one, with your changes to it (below).
- **Remove** deletes one. A pack that comes with the roster stays removed until you add it again under **Comes with
  the roster**. When an update of the roster brings a newer version of it, the button there says **Update**.
- **Import a .zip or pack.json** adds one.
- **Fetch** adds one from a link: a GitHub repository (`https://github.com/you/your-pack`), a folder in one
  (`…/tree/main/packs/knights`), a .zip on GitHub (`…/blob/main/packs/knights.zip`), or any link to a .zip.

Importing a pack of the same name again replaces it, which is how you update one.

**Your changes.** On a character's page you choose the card and the avatar of a model: any picture of the pack's, or
one you upload. A pack is never written to once you have it, so it can't be broken. What you choose and upload is
kept beside it, as your changes to that pack, and worn over it. The pack's card on the Art packs tab says how many
there are. **Export .zip** writes them into the export:

- its `pack.json` names the pictures you chose for each model,
- and the .zip holds every picture: the pack's own, the ones you uploaded, and any bundled picture you chose.

So if a pack has ten pictures of DeepSeek and you choose the second for DeepSeek V4 Pro, the exported `pack.json` has
`"deepseek-v4-pro": { "art": "deepseek/image2.webp" }` and the .zip has all ten. **Discard changes** lets them go,
and the pack is as it came.

A pack is a folder: a `pack.json` that names every picture by its file, and folders of pictures, one per character.

```
knights/
  pack.json
  claude/
    knight.png          her card at the high tier (which pack.json says)
    knight-face.png     her avatar there
    opus.png            any more pictures: more to choose from on her page
    festival.png
  deepseek/
    image1.webp … image10.webp
    face-2.webp
```

```json
{
  "name": "Knights",
  "zh-CN": "骑士团",
  "version": "1.0.0",
  "author": "you",
  "license": "CC BY 4.0",
  "description": { "name": "The roster as an order of knights.", "zh-CN": "把名册变成骑士团。" },
  "tiers": {
    "chibi": "Squire",
    "middle": { "name": "Page", "zh-CN": "侍从" },
    "high": { "name": "Knight", "zh-CN": "骑士" },
    "university": { "name": "Paladin", "zh-CN": "圣骑士" }
  },
  "characters": {
    "claude": {
      "name": "Sir Claude",
      "zh-CN": "克劳德爵士",
      "art": { "high": "claude/knight.png" },
      "face": { "high": "claude/knight-face.png" }
    }
  },
  "models": {
    "deepseek-v4-pro": { "art": "deepseek/image2.webp", "face": "deepseek/face-2.webp" },
    "claude-opus-*": { "art": "claude/opus.png" }
  },
  "pictures": {
    "claude/festival.png": { "name": "Summer festival", "zh-CN": "夏日祭" }
  }
}
```

- **Every picture is named by its file,** one folder deep (`claude/knight.png`): `.webp`, `.png`, `.jpg` or `.gif`.
  Or by a pattern, as `ls` takes one: `*` for any run of characters and `?` for one, neither across a `/`; `[abc]`
  for one of them, `[!abc]` for none of them. It is the first file that matches, in `ls` order (`b10.png` before
  `b2.png`): the pack's own pictures (and yours) first, else the bundled ones. So `deepseek/image*.webp` is
  `deepseek/image1.webp`, and `*/opus.png` the first folder's `opus.png`.
- **`characters`**: each character's name, and her card (`art`) and avatar (`face`) at each tier (`chibi`, `middle`,
  `high`, `university`).
- **`models`**: a model's own card and avatar, either or both, by its id (`deepseek-v4-pro`) or by a pattern
  (`claude-opus-*` is every Opus, the ones still to come included; `*-flash` every Flash; `gpt-6.[01]-*`). The first entry that fits a model, in the order they are written, is its; the
  pictures you choose come before them all. A model none fits wears its character's at its tier. An id fits as the
  provider writes it or as the roster matches models (`gpt-6.1-*` and `gpt-6-1-*` are the same).
- **The pictures in a character's folder are hers to choose** on her page: in her gallery, and first under **Change**
  for her card and her avatar. A picture whose file name starts with `face` is an avatar; any other is a card. The
  folders are named after the characters: `gpt`, `claude`, `gemini`, `deepseek`, `grok`, `kimi`, `glm`, `qwen`,
  `mistral`, `minimax`, `llama`, `doubao`, `perplexity` and `hunyuan`.
- **`pictures`** names a picture, by its file; else it is called by its file's name (`image2.webp` is Image2).
- **Names** are a plain string, or a `name` with other languages beside it by their language codes: `zh-CN`, `zh-TW`,
  `ja`, … in any case. A page in Chinese takes `zh-CN`, else a plain `zh`, else another Chinese one, else `name`. The
  pack's own name and its `description` are given the same way.
- **`version`** is the pack's own, shown beside its name; for a pack that comes with the roster, it is how the roster
  tells that an update brought a newer one. `roster` is the roster's version it was exported from, written in on
  export.
- **Nothing has to be there.** A tier's name, a character's name or picture the pack doesn't have comes from the
  bundled pictures (Academy). A new empty pack wears them all until you choose.
- **A mistake is said, not hidden.** A file that is not there, a pattern no file matches, or something that is no
  picture's file at all is listed on the pack's card on the Art packs tab (`models.gpt-6-astra.art: "claude/zzz*.png"
  matches no picture`), and that line is worn as if it were not written.

**Picture sizes.** Any size works: a picture is scaled and cropped to fill its place. These keep the crop where you
want it:

| Picture | Ratio | Suggested size | What shows |
| --- | --- | --- | --- |
| A card | 2:3, portrait | 768 × 1152 (sharp on high-DPI screens), or 512 × 768 as the bundled ones | The whole card on her page. On the roster's cards the rarity sits top left and her name over the bottom quarter, so keep her face in the upper third. Another ratio is cropped to 2:3, keeping the top. |
| A chibi card | 2:3, transparent background | 512 × 768 | The figure standing in the lower half, as the bundled chibis do. |
| An avatar | 1:1, square | 256 × 256 (192 × 192 at least) | A circle. Keep the face centred, with a little room around it; another ratio is cropped around a point 30% from the top. |

`.webp` keeps packs smallest (the bundled cards are about 40–80 KB each); `.png`, `.jpg` and `.gif` work too. A
picture in a .zip is at most 16 MB, and one you upload at most 4 MB.

To make a pack by hand, export one (or start a new empty one, choose pictures and export it), change what you like,
zip it again and import it. To share a pack, put its folder on GitHub; anyone can fetch it by its link. Your packs are
kept in `~/.dsh/llm-roster/packs/<name>/` and your changes in `~/.dsh/llm-roster/changes/<name>/`; a pack's files can
be edited there too, and the roster shows them the next time it opens.

**A new character.** A pack dresses the characters the roster knows; it can't add one. Who the characters are, which
models are each one's and at which tier, is the roster's own list, [`plugin/models.json`](plugin/models.json), and you
can add to it yourself. Add her under `characters`, with her home provider, the patterns of her model ids and her
providers, and put her models in `lineup` by tier (a model you don't want as a card of its own, by id or pattern, in
`models`; one to leave out until chosen in `ignored`):

```json
"characters": {
  "phi": { "home": "openrouter", "vendor": "microsoft", "match": ["^phi"], "providers": ["azure"] }
},
"lineup": {
  "phi-5": "phi/high"
}
```

Then give her pictures and a name in a pack (`"characters": { "phi": { "name": "Phi", "art": { "high": "phi/high.webp" } } }`).
Until a pack draws her, her cards show her initials. The file is the installed plugin's
(`~/.dsh/profiles/web/node_modules/dsh-llm-roster/plugin/models.json`), and an update of the roster replaces it, so
keep a copy of your changes, or send them as a pull request.

Models & keys, Rankings and Art packs are also on DSH's Plugins page, under **dsh-llm-roster**.

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
| `roster.json` | the art pack in use, the provider each character goes through, the providers you set aside with Ignore all (as they were in DSH's settings), the packs that came with the roster already added once, and the variable your Artificial Analysis key is in, if you named one |
| `packs/<name>/` | your art packs, each as its folder (`pack.json` and folders of pictures), as you got them: the ones that came with the roster, new empty ones, and the ones you imported or fetched |
| `changes/<name>/` | your changes to a pack: the pictures you chose for models (a `pack.json` of `models`) and the ones you uploaded |
| `aa.json` | the rankings, once fetched again |
| `openrouter.json` | the release dates from OpenRouter, once fetched again |
| `seen.json` | the day each model with no published release date was first seen (let go once one is published) |
| `failures.json` | why calls failed lately, by provider and model, until a call succeeds again |

What you summon is kept in your browser instead (`localStorage`, under `dsh-llm-roster.summon`), so each browser has
its own album.

## How it works

| File | What it does |
| --- | --- |
| [`plugin/client.js`](plugin/client.js) | The web half (React from DSH). It puts the avatar in the `conversation.input.right` slot and renders the roster dialog and the Plugins page. It switches models through `modelDirectories.directoryFor(session).select()`. It writes model lists and `apiKeyEnv` with `remote.settings.mutate`, stores keys with `remote.credentials.set`, and reads catalogs with `remote.llm.discoverModels`. |
| [`plugin/index.js`](plugin/index.js) | The DSH plugin (`llm-roster`). It mounts the routes on DSH's API, resolves keys through DSH's credential store, then the environment, and watches DSH's model calls (`llm/stream`, passed along untouched) for why they fail. |
| [`plugin/failures.js`](plugin/failures.js) | Why calls failed lately: kept by provider and model, counted, let go when a call succeeds again. |
| [`plugin/server.js`](plugin/server.js) | The routes, below. |
| [`plugin/roster.js`](plugin/roster.js) | Which character and tier each model is, the lineup, the picture and avatar each one wears, the pack in use, set-aside providers, and the provider each character goes through. |
| [`plugin/models.json`](plugin/models.json) | Who each model is: each character's ids, providers and home provider, the lineup by tier, more models by pattern, the ones left out until chosen, the words that tell a tier, and the release dates of lineup models no list has. |
| [`plugin/packs.js`](plugin/packs.js) | Art packs: reading one (its names and pictures by file, with your changes over it, over the bundled pictures), keeping one from a .zip or a GitHub link, adding the ones that come with the roster, making an empty one, your changes, and exporting a pack with them. |
| [`plugin/zip.js`](plugin/zip.js) | .zip files, read and written with Node's own zlib: no file outside the archive, no encrypted or ZIP64 entries, and size limits. |
| [`plugin/rankings.js`](plugin/rankings.js) | The Artificial Analysis list: matching a model to its slug, ranks, the leaderboard, and fetching the list again (the Pro list with a Pro key). |
| [`plugin/providers.js`](plugin/providers.js) | Each provider's balance, spend (with a key allowed to read it) and live-list endpoints, at fixed official addresses, and the key check built on them. |
| [`art/`](art) | The bundled art pack, *Academy*: [`pack.json`](art/pack.json) and a folder of pictures per character. Credits are in [`art/CREDITS.md`](art/CREDITS.md). |
| [`packs/`](packs) | The packs that come with the roster, as .zip files: [`original.zip`](packs/original.zip), made by [`original-pack.py`](tools/original-pack.py). Its credits are in the .zip (`CREDITS.md`). |
| [`tools/`](tools) | [`import-art.py`](tools/import-art.py) brings in the five ChimeraArchiveHarness characters. [`draw-art.py`](tools/draw-art.py) draws the others from [`characters.yml`](tools/characters.yml) with OpenAI's image model (Academy's tiers, and with `--original` the Original pack's stages, bond pictures and mood faces). [`original-pack.py`](tools/original-pack.py) makes the Original pack. [`aa-snapshot.mjs`](tools/aa-snapshot.mjs) refreshes the rankings and release-date snapshots. |
| [`data/`](data) | The shipped snapshots: Artificial Analysis's rankings, and OpenRouter's release dates. |

Keys never reach the page. A key check, a balance or a live list is asked by the server, using the key DSH resolves
for the provider's credential reference. It is sent only to that provider's official address, never to an address the page
names. An OpenAI-compatible endpoint of yours is asked by DSH itself, at the address in its settings.

The routes are on DSH's API, behind its sign-in and for its owner only:

| Route | |
| --- | --- |
| `GET /api/llm-roster.state` | the tiers and characters as the art pack in use names and pictures them, the pack, the lineup, your uploads, set-aside providers, the rankings' date and key names, what each provider offers |
| `POST /api/llm-roster.resolve` | `{models: [{provider, id}]}` → each one's art, avatar, character, tier, name and rankings |
| `POST /api/llm-roster.pick` | `{model: 'provider/model', art?: 'deepseek/image2.webp' \| null, face?: 'deepseek/face-2.webp' \| null}`: a change to the pack in use |
| `POST /api/llm-roster.upload?name=&character=` | the picture as the body → `{file}`, added to the pack in use as a change |
| `POST /api/llm-roster.forget` | `{file}`: a picture you added, taken back |
| `POST /api/llm-roster.settings` | `{aaKeyEnv: '<variable>' \| null}`: where your Artificial Analysis key is |
| `POST /api/llm-roster.park` / `unpark` | `{provider, ns, path, profile}` / `{provider}`: a provider set aside by Ignore all, and put back |
| `POST /api/llm-roster.route` | `{character, provider \| null}`: the provider a character's lineup goes through |
| `GET /api/llm-roster.image` | `?art=<folder>/<file>` (a picture of the pack in use, `deepseek/high.webp`; `&pack=<id>` for another pack's) |
| `GET /api/llm-roster.packs` | the art packs you have, the one in use, and the ones that come with the roster |
| `POST /api/llm-roster.packs` | `{use: id}`, `{create: name}`, `{remove: id}`, `{discard: id}` (your changes to it), `{fetch: '<GitHub or .zip link>'}`, or `{add: 'academy' \| '<file>'}` for one that comes with the roster |
| `POST /api/llm-roster.pack-import?name=` | a pack's .zip, or a lone `pack.json`, as the body |
| `GET /api/llm-roster.pack-export?id=` | the pack as a .zip, with your changes to it |
| `GET /api/llm-roster.released` | every release date known, by model slug (Artificial Analysis's over OpenRouter's), and the days models were first seen |
| `POST /api/llm-roster.released` | `{ids}` → `{dates: {id: {date, seen}}}`: the release dates of a list of models, a model of no published date stamped as first seen today |
| `GET/POST /api/llm-roster.rankings` | the leaderboard (`?top=`, `&sort=released` for the newest, `&efforts=1` for every effort), or fetch the release dates and the rankings again |
| `GET/POST /api/llm-roster.failures` | why calls failed lately, the newest first; `{clear: provider \| null}` lets them go |
| `GET /api/llm-roster.check` | `?provider=<route>&ref=<credential reference>&fresh=1`: does the key work (`ok`, `missing`, `rejected`, `error`, `untested`) |
| `GET /api/llm-roster.balance` | `?provider=<route>&ref=<credential reference>` |
| `GET /api/llm-roster.usage` | `?provider=<route>&ref=<credential reference>&fresh=1`: what the account spent this month, or has left, read with the spend key, else the API key (`ok` with `spent` and/or `credit` and the `key` read with, `missing`, `rejected`, `error`, `untested`) |
| `GET /api/llm-roster.live` | `?provider=<route>&ref=<credential reference>` |

## Development

```sh
npm test                                              # node --test: the server half, art packs and the summon odds, no DSH or network needed
python3 tools/import-art.py ~/Projects/DiscordStudyBot  # art/ again from a ChimeraArchiveHarness checkout
python3 tools/draw-art.py --dry-run                   # the other characters' tiers: what it would draw
python3 tools/draw-art.py --env-file .env             # draw what is missing (OPENAI_API_KEY; needs openai, pillow, pyyaml)
python3 tools/draw-art.py --faces-only                # crop the avatars again after tuning `faces` in characters.yml
python3 tools/draw-art.py --original --env-file .env  # the other characters' Original pictures
python3 tools/original-pack.py ~/Projects/DiscordStudyBot  # packs/original.zip again (needs pillow)
AA_API_TOKEN=... node tools/aa-snapshot.mjs           # new snapshots in data/ (release dates even with no key)
```

To add a character, give her an entry in [`tools/characters.yml`](tools/characters.yml) (her standing art, look,
motif and role). Then add her to [`plugin/models.json`](plugin/models.json) (her home provider, the ids that are hers,
and her lineup by tier) and her name to [`art/pack.json`](art/pack.json). Draw her with `draw-art.py`, and check her
faces.

For a local checkout, `dsh plugin --profile web add link:/path/to/dsh-llm-roster` uses it in place.

## License

- **Code:** [MIT](LICENSE).
- **Art (`art/` and the packs in `packs/`):** CC BY-NC-SA 4.0, so non-commercial only. These are AI-generated adaptations of character
  designs by [ZipZipPipe](https://space.bilibili.com/4168597/). DeepSeek-chan, the original character, is by
  [上善无形](https://space.bilibili.com/4456176). See [`art/CREDITS.md`](art/CREDITS.md).
- **Data (`data/`):** the rankings are Artificial Analysis's, used under their terms with credit to them; the release
  dates are from OpenRouter's public model list.
