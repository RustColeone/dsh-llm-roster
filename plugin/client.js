// The roster's client half, for DSH's web page, which loads it as a plugin bundle (React is all it needs).
//
//   - An avatar beside the composer's model picker (the `conversation.input.right` slot, just left of it): the face of
//     the session's model at its tier, ringed in its rarity. A click opens the roster.
//   - Roster: every model DSH's picker offers, and the roster's lineup of mainstream models besides, each a character
//     card (art by tier, rarity, Artificial Analysis rankings). A card switches the session to its model, through the
//     same model directory DSH's picker uses; a card that cannot be used yet says why (no API key, a key the provider
//     refused, not in use). Each card's … opens its page: its art and gallery, its stats, and its equipment (art,
//     avatar, the provider's key, whether it is in use). The + card adds a model the lineup does not have.
//   - Models & keys (also under Plugins → dsh-llm-roster): each provider's key (stored write-only, as DSH's Models page
//     stores it) or the variable holding it, a test of it, its balance (the DeepSeek account's, as DSH reads it), why
//     its calls failed lately (until one succeeds again), and its models as pills, Used or Ignored (Used
//     is the provider's model list in DSH's settings, so they are exactly what DSH's picker offers); every model
//     ignored at once, the provider removed, and DeepSeek's account sign-in, which needs no key.
//   - Rankings: Artificial Analysis's leaderboard, as of the date shown (each model, or every effort, sorted by any
//     column: the index, the cost of an index task, with a Pro key its time and tokens, speed, price, release), fetched
//     again with your own key.
//   - Art packs: how the characters look and what they and their tiers are called. Your packs (the two that come with
//     the roster, new empty ones, and ones imported from a .zip or a lone pack.json or fetched from a GitHub link),
//     switched on the go; the pictures you choose and upload are changes kept beside the pack in use, written into it
//     when you export it as a .zip.
//   - Summon: a gacha of the roster's own cards, for fun (free ✦, nothing bought, no model called), at the usual
//     mobile-gacha rates, with a pickup banner, the ×10's floor, the 330th's guarantee and an album kept in the browser.
//
// Pictures, rankings, key checks, balances and live model lists come from the plugin's routes (plugin/server.js);
// keys never reach the page.
window.__ModuleLoader__.load({
  id: 'dsh-llm-roster',
  factory: require => {
    const module = { exports: {} }
    const imported = require('react')
    const React = typeof imported.createElement === 'function' ? imported : imported.default
    const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } = React
    const h = React.createElement
    const dom = require('react-dom')
    const createPortal = dom?.createPortal ?? dom?.default?.createPortal

    const PACKAGE = 'dsh-llm-roster'
    const NS = 'llm-roster'
    const API = {
      state: 'api/llm-roster.state', resolve: 'api/llm-roster.resolve', pick: 'api/llm-roster.pick',
      upload: 'api/llm-roster.upload', forget: 'api/llm-roster.forget', settings: 'api/llm-roster.settings',
      park: 'api/llm-roster.park', unpark: 'api/llm-roster.unpark', route: 'api/llm-roster.route', image: 'api/llm-roster.image',
      rankings: 'api/llm-roster.rankings', check: 'api/llm-roster.check', balance: 'api/llm-roster.balance', usage: 'api/llm-roster.usage', stars: 'api/llm-roster.stars',
      live: 'api/llm-roster.live', released: 'api/llm-roster.released', packs: 'api/llm-roster.packs', failures: 'api/llm-roster.failures',
      packImport: 'api/llm-roster.pack-import', packExport: 'api/llm-roster.pack-export'
    }
    const RARITY = { R: 1, SR: 2, SSR: 3, UR: 4 }
    const TIER_ORDER = ['chibi', 'middle', 'high', 'university']
    const STATUS_ORDER = { ready: 0, unused: 1, checking: 2, error: 3, rejected: 4, nokey: 5, absent: 6 }
    const ACCOUNT = 'deepseek-account'
    const COMPATIBLE = '#openai-compatible' // the choice of a new OpenAI-compatible endpoint, among the providers
    const DEEPSEEK_ROUTES = [ACCOUNT, 'deepseek-official'] // one model reached two ways: one card

    const EN = {
      'avatar.title': 'Roster: {model}',
      'avatar.none': 'Roster: pick a model',
      'dialog.title': 'Roster',
      'tab.roster': 'Roster',
      'tab.models': 'Models & keys',
      lang: 'en',
      'tab.rankings': 'Rankings',
      'tab.packs': 'Art packs',
      close: 'Close',
      back: 'Roster',
      'tier.chibi': 'Chibi',
      'tier.middle': 'Middle-schooler',
      'tier.high': 'High-schooler',
      'tier.university': 'University student',
      'tier.custom': 'Your own',
      'roster.all': 'All',
      'roster.available': 'Available',
      'roster.filterBy': 'Filter by',
      'roster.sortBy': 'Sort by',
      'roster.sort.provider': 'By provider',
      'roster.sort.rank': 'By rank',
      'roster.sort.released': 'By release date',
      'roster.lines': 'Divide by provider',
      'roster.move': 'Drag the grip to move it (Alt+← → with the keyboard): the cards follow, by provider.',
      'roster.releasedNote': 'Release dates: Artificial Analysis\'s, else the day OpenRouter listed the model (as of {date}); ~ marks the day a newer model was first seen here.',
      'page.released': 'Released {date}',
      'released.seen': 'First seen here on {date}: no published release date yet',
      'roster.inUse': 'In use',
      'roster.loading': 'Reading the models…',
      'roster.switching': 'Switching…',
      'roster.unavailable': 'This session cannot change its model.',
      'roster.rank': '#{rank} of {of}',
      'roster.hint': 'A card switches this session to its model; … opens its page. Effort is in DSH\'s model picker.',
      'roster.more': 'Details',
      'roster.add': 'Add a model',
      'roster.noneAvailable': 'No model here can be used yet. All shows every character, and what each one needs.',
      'roster.addHint': 'One the roster does not have',
      'status.ready': 'Ready',
      'status.unused': 'Not in use',
      'status.unusedHint': 'Its key works: add it to the roster',
      'status.nokey': 'Not available',
      'status.nokeyHint': 'Please add an API key',
      'status.nokeyDeepseek': 'Please add an API key, or sign in to your DeepSeek account in DSH\'s settings',
      'status.rejected': 'API key rejected',
      'status.rejectedHint': 'The provider refused the key',
      'status.error': 'Provider not reachable',
      'status.checking': 'Checking the key…',
      credit: 'Rankings: Artificial Analysis Intelligence Index v{version}, as of {date}.',
      'credit.none': 'No rankings yet.',
      'page.use': 'Use this model',
      'page.useAdd': 'Add and use this model',
      'page.inUse': 'In use in this session',
      'page.needKey': 'Add an API key below first.',
      'page.stats': 'Stats',
      'page.intelligence': 'Intelligence',
      'cap.engineering': 'Engineering',
      'cap.finance': 'Finance',
      'cap.economics': 'Economics',
      'cap.legal': 'Legal',
      'cap.health': 'Health',
      'cap.strategy': 'Strategy & ops',
      'page.taskCost': 'Cost per AA task',
      'page.taskTime': 'Time per AA task',
      'page.taskTokens': 'Tokens per AA task',
      'page.tokensValue': '{tokens} written',
      'page.latency': 'First answer',
      'page.latencyValue': 'after {time}',
      'page.indexCost': 'The whole index',
      'page.rank': 'Rank',
      'page.price': 'Price (in / out, $ per M)',
      'page.speed': 'Speed',
      'page.speedValue': '{speed} tokens/s',
      'page.efforts': 'Measured at',
      'page.noStats': 'Artificial Analysis has not measured this model.',
      'page.equipment': 'Equipment',
      'page.art': 'Art',
      'page.avatar': 'Avatar',
      'page.change': 'Change',
      'page.gallery': 'Gallery',
      'page.equip': 'Equip this art',
      'page.provider': 'Provider',
      'page.roster': 'In the roster',
      'page.rosterUsed': 'Used: DSH\'s model picker offers it',
      'page.rosterIgnored': 'Ignored',
      'page.ignore': 'Move to Ignored',
      'page.route': 'Through',
      'page.routeAccount': 'DeepSeek account (no key)',
      'page.routeKey': 'DeepSeek API key',
      'add.title': 'Add a model',
      'add.intro': 'A model the roster\'s lineup does not have: it joins the provider\'s Used models, so DSH\'s picker offers it too.',
      'add.provider': 'Provider',
      'add.newProvider': '{name} (add)',
      'add.model': 'Model id',
      'add.modelHint': 'As the provider names it, such as gpt-6.1-sol',
      'add.name': 'Display name (optional)',
      'add.art': 'Art',
      'add.avatar': 'Avatar',
      'add.auto': 'Automatic',
      'add.sameAsArt': 'From the art',
      'add.save': 'Add to the roster',
      'add.saving': 'Adding…',
      'add.needModel': 'Enter the model\'s id.',
      'add.compatible': 'OpenAI-compatible endpoint (new)…',
      'roster.hidden': '{count} more models from {provider}\'s whole catalog are in DSH\'s picker: choose the ones you use under Models & keys.',
      'status.absent': 'Not offered there',
      'status.absentHint': '{provider} does not offer it: choose another way on its page',
      'page.through': 'Served through',
      'page.throughHint': 'Which provider and key serve {name}: her own, OpenRouter, or an OpenAI-compatible endpoint of yours. Her models are matched by name among the ones it offers.',
      'page.throughOwn': '{provider} (her own)',
      'page.addCompatible': '+ OpenAI-compatible endpoint',
      'compat.title': 'A new OpenAI-compatible endpoint',
      'compat.hint': 'Any service that speaks OpenAI\'s Chat Completions API: a relay like OpenRouter, a gateway, or a server of your own.',
      'compat.name': 'Name',
      'compat.baseURL': 'Base URL',
      'compat.key': 'API key',
      'compat.env': 'or the variable holding it',
      'compat.find': 'Find its models',
      'compat.found': '{count} models found: click the ones to use.',
      'compat.models': 'Model ids (separated by commas)',
      'compat.pick': 'Choose at least one model.',
      'compat.add': 'Add the endpoint',
      'compat.badURL': 'The base URL is an http or https address.',
      'compat.needName': 'Give it a name.',
      'compat.taken': 'A provider of that name exists already.',
      'models.intro': 'Each provider\'s key, balance and models. Used models are the ones DSH\'s model picker offers; a click moves a model between Used and Ignored.',
      'models.loading': 'Reading the providers…',
      'models.readOnly': 'This DSH\'s settings cannot be changed from the page.',
      'models.add': 'Add a provider…',
      'models.adding': 'Adding…',
      'models.useAll': 'Use all',
      'models.ignoreAll': 'Ignore all',
      'models.ignoreAllFixed': 'This provider is part of DSH\'s own setup; ignore its models one by one.',
      'models.remove': 'Remove provider',
      'models.removeFixed': 'This provider is part of DSH\'s own setup and cannot be removed here.',
      'models.removeConfirm': 'Remove {name}? Its models leave DSH\'s picker and the roster.',
      'models.removeKey': 'Also delete its key stored in DSH',
      'models.removeYes': 'Remove',
      cancel: 'Cancel',
      'parked.title': 'Every model ignored',
      'parked.hint': 'Set aside with its key and models as they were; nothing of it is in DSH\'s picker.',
      'parked.restore': 'Use again',
      'account.title': 'DeepSeek account',
      'account.balance': 'Balance: {amounts}',
      'account.topped': 'topped up {amount}',
      'account.granted': 'granted {amount}',
      'account.balanceFailed': 'Its balance could not be read just now (DSH\'s Settings → Account shows it).',
      'failures.title': 'Why calls failed lately',
      'failures.clear': 'Clear',
      'failures.check': '(key check)',
      'failures.hint': 'Kept until a call to this provider succeeds again.',
      'failures.last': 'Last call failed: {why}. {message}',
      'failures.code.QUOTA': 'Out of quota or balance',
      'failures.code.ACCOUNT_QUOTA': 'No balance on the account',
      'failures.code.RATE_LIMIT': 'Rate limited',
      'failures.code.INVALID_CREDENTIAL': 'Key not accepted',
      'failures.code.KEY_REJECTED': 'Key rejected',
      'failures.code.UNREACHABLE': 'Provider not reached',
      'failures.code.CONTEXT_WINDOW_EXCEEDED': 'Too long for the model',
      'failures.code.EMPTY_RESPONSE': 'Empty answer',
      'failures.code.AUTH': 'Key not accepted',
      'failures.code.MISSING_CREDENTIAL': 'No key',
      'failures.code.ACCOUNT_SIGN_IN_REQUIRED': 'Sign-in needed',
      'failures.code.SERVER': 'The provider failed',
      'failures.code.TIMEOUT': 'Timed out',
      'failures.code.TRANSPORT': 'Connection failed',
      'failures.code.UNKNOWN_MODEL': 'No such model',
      'failures.code.INVALID_REQUEST': 'Request refused',
      'account.signedIn': 'Signed in to your DeepSeek account: its models need no API key.',
      'account.signedOut': 'Not signed in to a DeepSeek account. Sign in from DSH\'s Settings → Account to use DeepSeek without an API key.',
      'key.title': 'API key',
      'key.stored': 'stored in DSH',
      'key.env': 'from the environment',
      'key.missing': 'not set',
      'key.unknown': 'unknown',
      'key.paste': 'Paste a new key',
      'key.save': 'Save key',
      'key.saved': 'Key saved.',
      'key.envName': 'Environment variable',
      'key.envSave': 'Use variable',
      'key.envSaved': 'The provider now reads {name}.',
      'key.envBad': 'A variable name is letters, digits and underscores, not starting with a digit.',
      'key.test': 'Test key',
      'key.testing': 'Testing…',
      'check.ok': 'The key works.',
      'check.okModels': 'The key works: it can call {count} models.',
      'check.missing': 'No key found.',
      'check.rejected': 'The provider refused the key.',
      'check.error': 'The provider could not be asked: {detail}',
      'check.untested': 'The roster cannot test this provider\'s key.',
      'balance.button': 'Balance',
      'balance.none': 'This provider reports no balance through its API.',
      'balance.missing': 'No key to ask with.',
      'balance.granted': 'granted {amount}',
      'balance.topped': 'topped up {amount}',
      'balance.used': 'used {amount}',
      'usage.admin': 'Admin key (spend)',
      'usage.adminHint': 'Optional. {name} tells what the account spent only to a key allowed to read it, such as an admin key made in its console, which may not call the models. The roster only reads with it; without one, it asks with the API key above.',
      'usage.management': 'Management key (credit)',
      'usage.managementHint': 'Optional. {name} tells the credit left only to a team\'s management key, made in its console, which may not call the models. The roster only reads with it; without one, it asks with the API key above.',
      'usage.spent': 'Spent this month:',
      'usage.credit': 'Credit left:',
      'used.title': 'Used ({count})',
      'used.all': 'The provider\'s whole catalog is in use ({count}). Click a model to narrow it down.',
      'used.leftOut': 'Its last generation\'s models ({count}) are left out until you choose them.',
      'ignored.title': 'Ignored ({count})',
      'ignored.none': 'Nothing else found yet: fetch the catalog or the provider\'s live list.',
      'ignored.filter': 'Filter',
      'ignored.sort.released': 'Newest first',
      'ignored.sort.name': 'A–Z',
      'ignored.more': '{count} more: filter to find them',
      'fetch.catalog': 'Fetch catalog',
      'fetch.live': 'Fetch live list',
      'fetch.liveTitle': 'Ask the provider itself which models your key can call, for models newer than DSH\'s catalog.',
      'fetch.found': '{count} models found.',
      'fetch.newTag': 'new',
      'art.title': 'Art for {model}',
      'face.title': 'Avatar for {model}',
      'art.default': 'Default',
      'art.upload': 'Upload a picture…',
      'art.forget': 'Take this picture back',
      'art.yours': 'Your pictures',
      'packs.intro': 'An art pack is how the characters look and what they and their tiers are called: a pack.json that names every picture by its file, and folders of pictures. Who each model is stays the same. The pictures you choose and upload are changes, kept beside the pack in use; exporting it writes them into the .zip, with every picture it uses. Anything a pack does not have comes from the bundled pictures.',
      'packs.inUse': 'In use',
      'packs.use': 'Use',
      'packs.export': 'Export .zip',
      'packs.remove': 'Remove',
      'packs.removeSure': 'Remove it',
      'packs.by': 'by {author}',
      'packs.counts': '{pictures} pictures of {characters} characters',
      'packs.countsOf': '{pictures} pictures of {names}',
      'packs.countsNone': 'No pictures of its own: it wears the bundled ones until you choose',
      'packs.folder': 'Kept in {folder}.',
      'packs.changes': '{count} changes of yours, beside the pack: exporting it writes them in.',
      'packs.discard': 'Discard changes',
      'packs.discardSure': 'Discard them',
      'packs.new': '+ New empty pack…',
      'packs.newName': 'Name of the new pack',
      'packs.create': 'Create',
      'packs.unknown': 'Folders that are no character the roster knows, left out: {names}',
      'packs.add': 'Add a pack',
      'packs.included': 'Comes with the roster',
      'packs.includedAdd': 'Add',
      'packs.includedAgain': 'Add again',
      'packs.includedHave': 'Added: put it back as it came',
      'packs.includedUpdate': 'Update to v{version}',
      'packs.switch': 'Art pack',
      'packs.exportedFrom': 'Exported from the roster {version}',
      'packs.import': 'Import a .zip or pack.json',
      'packs.importing': 'Importing…',
      'packs.link': 'https://github.com/you/your-pack',
      'packs.fetch': 'Fetch',
      'packs.fetching': 'Fetching…',
      'packs.linkHint': 'A GitHub repository, a folder in one (…/tree/main/packs/knights), or a link to a .zip. Importing a pack of the same name again replaces it.',
      'packs.added': 'Added {name}: {kept} files.',
      'packs.skipped': ' {count} other files left out ({names}).',
      'packs.how': 'Making a pack',
      'packs.how1': 'Choose pictures on the characters\' pages (or upload your own), then export the pack and unzip it: its pack.json has your choices, and its folders every picture.',
      'packs.how2': 'Change pack.json with any text editor: the names (the pack\'s, each tier\'s: \"high\": { \"name\": \"Knight\", \"zh-CN\": \"骑士\" }, each character\'s), and which file is which picture. Other languages go beside \"name\" by their codes (zh-CN, zh-TW, ja…).',
      'packs.how3': 'Each character\'s card and avatar at each tier are files: \"deepseek\": { \"art\": { \"high\": \"deepseek/high.webp\" }, \"face\": { \"high\": \"deepseek/face-high.webp\" } } (.webp, .png, .jpg or .gif), or patterns as ls takes them: \"deepseek/image*.webp\" is the first that matches, in ls order. Cards are 2:3 (768 × 1152, or 512 × 768), with her face in the upper third; avatars are square (256 × 256), the face centred.',
      'packs.how4': 'Every picture in a character\'s folder is hers to choose on her page (an avatar\'s file name starts with face). A model\'s own picture: \"models\": { \"deepseek-v4-pro\": { \"art\": \"deepseek/image2.webp\", \"face\": \"deepseek/face-2.webp\" } }; with wildcards, \"claude-opus-*\" is every Opus. The first that fits is the one.',
      'packs.how5': 'Zip the folder and import it here, or put it on GitHub and fetch it by its link.',
      'art.portrait': 'Portrait',
      'aa.title': 'Your Artificial Analysis key',
      'aa.hint': 'Free from artificialanalysis.ai (sign in, then API keys). Only needed to fetch the rankings again.',
      'aa.envHint': 'Variable to read (else {names})',
      'rankings.intro': 'Artificial Analysis\'s leaderboard: Intelligence Index v{version}, as of {date}.',
      'rankings.count': '{count} models, each at its best effort',
      'rankings.countEfforts': '{count} entries, every effort measured',
      'rankings.filter': 'Find a model or maker',
      'rankings.mine': 'In your roster',
      'rankings.efforts': 'Every effort',
      'rankings.none': 'No model matches.',
      'rankings.taskCost': '$ / task',
      'rankings.taskTime': 'Time / task',
      'rankings.taskTokens': 'Tokens / task',
      'rankings.speed': 'Tokens/s',
      'rankings.released': 'Released',
      'rankings.sortBy': 'Sort by {column}',
      'rankings.taskNote': 'Per task: what one task of the Intelligence Index costs (their free list has it). The time and tokens a task takes are in their Pro list: fetched with a Pro key, they show here too.',
      'rankings.refresh': 'Fetch again',
      'rankings.refreshing': 'Fetching…',
      'rankings.needKey': 'Fetching needs a free key from artificialanalysis.ai: paste it above, or name the variable that holds it.',
      'rankings.model': 'Model',
      'rankings.index': 'Intelligence',
      'rankings.price': 'In / out $ per M',
      'rankings.yours': 'in your roster',
      'rankings.source': 'Data: Artificial Analysis',
      'tab.summon': 'Summon',
      'summon.loading': 'Loading the pool…',
      'summon.banner': 'Pickup summon',
      'summon.pickup5': 'Pickup ★5',
      'summon.pickup4': 'Pickup ★4',
      'summon.none': 'None',
      'summon.one': 'Summon ×1',
      'summon.ten': 'Summon ×10 +1',
      'summon.cost': '{cost} ✦',
      'summon.spent': 'Spent {spent} ✦',
      'summon.count': '{count} summons',
      'summon.fives': '★5 characters: {count}',
      'summon.pity': '{count}/330: the 330th is {name} if not before',
      'summon.pityDone': '{name} came: this banner\'s guarantee is used',
      'summon.free': 'The ✦ are free: nothing is bought, no model is called, and a summoned character is not its model (using one still takes its key, in Models & keys).',
      'summon.rates': 'Rates',
      'summon.kind.character': 'Character',
      'summon.kind.equipment': 'Equipment',
      'summon.rule.pickup5': 'The pickup ★5 is 0.8% of the ★5 characters\' 1%; the other ★5 characters share the 0.2% left.',
      'summon.rule.pickup4': 'The pickup ★4 is 1.5% of the ★4 characters\' 3%.',
      'summon.rule.ten': 'A ×10 summon costs 30 ✦ and deals 11 cards, at least one of them ★4 or better and at least one a character.',
      'summon.rule.pity': 'If the pickup ★5 has not come in 329 summons on its banner, the 330th is it (once per banner).',
      'summon.rule.pool': 'The characters are the roster\'s lineup: {five} ★5, {four} ★4, the rest ★3.',
      'summon.album': 'Album {owned}/{total}',
      'summon.reset': 'Start over',
      'summon.resetSure': 'Forget every summon',
      'summon.back': 'Banner',
      'summon.skip': 'Skip',
      'summon.new': 'NEW',
      'summon.pityTag': 'Guaranteed',
      'summon.thinking': 'thinking…',
      'summon.prompt': '› summon ×{count}',
      'summon.open': 'Open {name}\'s page',
      'summon.owned': '×{count}',
      'summon.unknown': 'Not summoned yet',
      'summon.tally': '★5 ×{five} · ★4 ×{four}',
      'summon.mode': '✦',
      'summon.mode.free': 'Free',
      'summon.mode.earned': 'Earned',
      'summon.mode.freeHint': 'As many as you like.',
      'summon.mode.earnedHint': 'They come now and then as DSH\'s model calls succeed; a summon spends them.',
      'summon.balance': 'You have {count} ✦',
      'summon.earnedTotal': '{count} ✦ earned while you worked',
      'summon.gain': '+{count} ✦',
      'summon.short': 'Not enough ✦ yet.',
      'summon.code': 'Cheat code',
      'summon.codeEnter': 'Enter',
      'summon.code.added': '+{count} ✦',
      'summon.code.reveal': 'The whole album is revealed.',
      'summon.code.unknown': 'Nothing happens.',
      'summon.rule.earn': 'Earned: each model call that succeeds rolls once, and once more for every 2,000 tokens it writes (up to 25); a roll may drop 1 ✦ (30%), 3 ✦ (6%) or 10 ✦ (1%).',
      'summon.view': 'View {name}',
      'summon.kind.outfit': 'Outfit',
      'summon.outfit.text': 'A picture from the art pack {pack}.',
      'summon.album.character': 'Characters {owned}/{total}',
      'summon.album.equipment': 'Equipment {owned}/{total}',
      'summon.rule.outfits': 'The equipment has an outfit for every picture in the art pack in use that no other card shows: ★4, unless the pack gives it other stars.',
      'viewer.prev': 'Previous',
      'viewer.next': 'Next',
      'viewer.zoomIn': 'Zoom in',
      'viewer.zoomOut': 'Zoom out',
      'viewer.fit': 'Fit',
      'viewer.hint': 'Scroll to zoom where you point, drag to move (let go moving to fling it), double-click to zoom in or fit; ← → for the others; Esc, × or a click beside the picture to close.',
      'equip.context.name': 'Infinite Context',
      'equip.context.text': 'Remembers the whole conversation. Even that part.',
      'equip.nolimit.name': 'No Rate Limit',
      'equip.nolimit.text': '429 is just a number.',
      'equip.freetier.name': 'Free Tier, Forever',
      'equip.freetier.text': 'The bill never comes.',
      'equip.firsttry.name': 'Works on the First Try',
      'equip.firsttry.text': 'No retries needed. Suspicious.',
      'equip.agi.name': 'AGI (Preview)',
      'equip.agi.text': 'Arriving in two weeks.',
      'equip.cachehit.name': 'Prompt Cache Hit',
      'equip.cachehit.text': 'This one is 90% off.',
      'equip.json.name': 'Valid JSON',
      'equip.json.text': 'Every bracket closed.',
      'equip.toolcall.name': 'The Right Tool',
      'equip.toolcall.text': 'Called with the right arguments, too.',
      'equip.cot.name': 'Chain of Thought',
      'equip.cot.text': 'Thinks before answering. At length.',
      'equip.sysprompt.name': 'Perfect System Prompt',
      'equip.sysprompt.text': 'Followed to the letter.',
      'equip.temp0.name': 'Temperature 0',
      'equip.temp0.text': 'Same answer every time. Mostly.',
      'equip.retry.name': 'Retry',
      'equip.retry.text': 'Have you tried asking again?',
      'equip.maxtokens.name': 'Max Tokens',
      'equip.maxtokens.text': 'And then the answer stopped mid-',
      'equip.timeout.name': 'Timeout',
      'equip.timeout.text': 'Still thinking…',
      'equip.emdash.name': 'Em Dash',
      'equip.emdash.text': 'Used — generously.',
      'equip.apology.name': 'Sorry for the Confusion',
      'equip.apology.text': 'Apologizes, changes nothing.',
      'equip.lgtm.name': 'LGTM',
      'equip.lgtm.text': 'Looks good to me. Ship it.',
      'equip.hello.name': 'Hello, World',
      'equip.hello.text': 'Everyone\'s first words.',
      'equip.delve.name': 'Delve',
      'equip.delve.text': 'Let\'s delve into it.',
      failed: 'Failed: {error}'
    }
    const ZH = {
      ...EN,
      'avatar.title': '角色：{model}',
      'avatar.none': '角色：选择模型',
      'dialog.title': '角色名册',
      'tab.roster': '名册',
      'tab.models': '模型与密钥',
      lang: 'zh-CN',
      'tab.rankings': '排行',
      'tab.packs': '立绘包',
      close: '关闭',
      back: '名册',
      'tier.chibi': 'Q版',
      'tier.middle': '初中生',
      'tier.high': '高中生',
      'tier.university': '大学生',
      'tier.custom': '自定义',
      'roster.all': '全部',
      'roster.available': '可用',
      'roster.filterBy': '筛选',
      'roster.sortBy': '排列',
      'roster.sort.provider': '按服务商',
      'roster.sort.rank': '按排名',
      'roster.sort.released': '按发布时间',
      'roster.releasedNote': '发布时间：优先取 Artificial Analysis 的记录，否则取 OpenRouter 上架模型的日期（截至 {date}）；带 ~ 的是更新的模型在这里首次出现的日期。',
      'page.released': '发布于 {date}',
      'released.seen': '于 {date} 首次在这里出现：尚无公开的发布日期',
      'roster.inUse': '使用中',
      'roster.loading': '正在读取模型……',
      'roster.switching': '切换中……',
      'roster.unavailable': '这个会话不能更换模型。',
      'roster.rank': '第 {rank} / {of} 名',
      'roster.hint': '点击卡片即可把这个会话切换到该模型；点击 … 查看角色详情。思考强度在 DSH 的模型选择器里调。',
      'roster.more': '详情',
      'roster.add': '添加模型',
      'roster.addHint': '名册里没有的模型',
      'status.ready': '可用',
      'status.unused': '未启用',
      'status.unusedHint': '密钥可用：加入名册即可使用',
      'status.nokey': '不可用',
      'status.nokeyHint': '请添加 API 密钥',
      'status.nokeyDeepseek': '请添加 API 密钥，或在 DSH 设置中登录 DeepSeek 账号',
      'status.rejected': 'API 密钥被拒绝',
      'status.rejectedHint': '服务商拒绝了这个密钥',
      'status.error': '无法连接服务商',
      'status.checking': '正在检查密钥……',
      credit: '排行：Artificial Analysis 智能指数 v{version}，截至 {date}。',
      'credit.none': '还没有排行数据。',
      'page.use': '使用这个模型',
      'page.useAdd': '加入并使用这个模型',
      'page.inUse': '这个会话正在使用',
      'page.needKey': '请先在下方添加 API 密钥。',
      'page.stats': '属性',
      'page.intelligence': '智能',
      'cap.engineering': '工程',
      'cap.finance': '财务',
      'cap.economics': '经济',
      'cap.legal': '法律',
      'cap.health': '医疗',
      'cap.strategy': '战略运营',
      'page.taskCost': '每个 AA 任务成本',
      'page.taskTime': '每个 AA 任务耗时',
      'page.taskTokens': '每个 AA 任务 token 数',
      'page.tokensValue': '输出 {tokens}',
      'page.latency': '首答',
      'page.latencyValue': '{time} 后',
      'page.indexCost': '整个指数',
      'page.rank': '排名',
      'page.price': '价格（输入 / 输出，每百万 $）',
      'page.speed': '速度',
      'page.speedValue': '每秒 {speed} 个 token',
      'page.efforts': '测评的思考强度',
      'page.noStats': 'Artificial Analysis 还没有测评这个模型。',
      'page.equipment': '装备',
      'page.art': '立绘',
      'page.avatar': '头像',
      'page.change': '更换',
      'page.gallery': '图鉴',
      'page.equip': '装备这张立绘',
      'page.provider': '服务商',
      'page.roster': '名册状态',
      'page.rosterUsed': '使用中：DSH 的模型选择器里有它',
      'page.rosterIgnored': '已忽略',
      'page.ignore': '移到忽略',
      'page.route': '使用方式',
      'page.routeAccount': 'DeepSeek 账号（无需密钥）',
      'page.routeKey': 'DeepSeek API 密钥',
      'add.title': '添加模型',
      'add.intro': '添加名册阵容里没有的模型：它会加入该服务商「使用中」的模型，DSH 的模型选择器里也会出现。',
      'add.provider': '服务商',
      'add.newProvider': '{name}（添加）',
      'add.model': '模型 ID',
      'add.modelHint': '服务商使用的名称，例如 gpt-6.1-sol',
      'add.name': '显示名称（可选）',
      'add.art': '立绘',
      'add.avatar': '头像',
      'add.auto': '自动',
      'add.sameAsArt': '取自立绘',
      'add.save': '加入名册',
      'add.saving': '添加中……',
      'add.needModel': '请输入模型 ID。',
      'add.compatible': 'OpenAI 兼容接口（新建）……',
      'roster.hidden': '{provider} 的完整目录里还有 {count} 个模型在 DSH 的模型选择器中：可以在「模型与密钥」里挑选要用的。',
      'status.absent': '这里没有',
      'status.absentHint': '{provider} 没有提供它：请在详情页换一种方式',
      'page.through': '通过',
      'page.throughHint': '由哪个服务商和密钥为 {name} 提供服务：她自己的、OpenRouter，或你的 OpenAI 兼容接口。她的模型会按名称在其中匹配。',
      'page.throughOwn': '{provider}（她自己的）',
      'page.addCompatible': '+ OpenAI 兼容接口',
      'compat.title': '新建 OpenAI 兼容接口',
      'compat.hint': '任何支持 OpenAI Chat Completions API 的服务：OpenRouter 这样的中转、网关，或你自己的服务器。',
      'compat.name': '名称',
      'compat.baseURL': 'Base URL',
      'compat.key': 'API 密钥',
      'compat.env': '或保存它的环境变量',
      'compat.find': '查找它的模型',
      'compat.found': '找到 {count} 个模型：点击选择要用的。',
      'compat.models': '模型 ID（用逗号分隔）',
      'compat.pick': '至少选择一个模型。',
      'compat.add': '添加接口',
      'compat.badURL': 'Base URL 必须是 http 或 https 地址。',
      'compat.needName': '请填写名称。',
      'compat.taken': '已有同名的服务商。',
      'models.intro': '每个服务商的密钥、余额和模型。「使用中」的模型就是 DSH 模型选择器里列出的模型；点击即可在「使用中」和「忽略」之间移动。',
      'models.loading': '正在读取服务商……',
      'models.readOnly': '这个 DSH 的设置不能在网页上修改。',
      'models.add': '添加服务商……',
      'models.adding': '添加中……',
      'models.useAll': '全部使用',
      'models.ignoreAll': '全部忽略',
      'models.ignoreAllFixed': '这个服务商属于 DSH 自带的配置，请逐个忽略它的模型。',
      'models.remove': '移除服务商',
      'models.removeFixed': '这个服务商属于 DSH 自带的配置，不能在这里移除。',
      'models.removeConfirm': '移除 {name}？它的模型会从 DSH 的模型选择器和名册中消失。',
      'models.removeKey': '同时删除存放在 DSH 中的密钥',
      'models.removeYes': '移除',
      cancel: '取消',
      'parked.title': '已全部忽略',
      'parked.hint': '连同密钥和模型原样保存；DSH 的模型选择器里不会有它的模型。',
      'parked.restore': '重新使用',
      'account.title': 'DeepSeek 账号',
      'account.signedIn': '已登录 DeepSeek 账号：它的模型不需要 API 密钥。',
      'account.signedOut': '未登录 DeepSeek 账号。在 DSH 的「设置 → 账号」中登录后，无需 API 密钥即可使用 DeepSeek。',
      'key.title': 'API 密钥',
      'key.stored': '已存入 DSH',
      'key.env': '来自环境变量',
      'key.missing': '未设置',
      'key.unknown': '未知',
      'key.paste': '粘贴新密钥',
      'key.save': '保存密钥',
      'key.saved': '密钥已保存。',
      'key.envName': '环境变量',
      'key.envSave': '使用该变量',
      'key.envSaved': '该服务商现在读取 {name}。',
      'key.envBad': '变量名只能包含字母、数字和下划线，且不能以数字开头。',
      'key.test': '测试密钥',
      'key.testing': '测试中……',
      'check.ok': '密钥可用。',
      'check.okModels': '密钥可用：可以调用 {count} 个模型。',
      'check.missing': '没有找到密钥。',
      'check.rejected': '服务商拒绝了这个密钥。',
      'check.error': '无法询问服务商：{detail}',
      'check.untested': '名册无法测试这个服务商的密钥。',
      'balance.button': '余额',
      'balance.none': '这个服务商的 API 不提供余额查询。',
      'balance.missing': '没有可用的密钥。',
      'balance.granted': '赠送 {amount}',
      'balance.topped': '充值 {amount}',
      'balance.used': '已用 {amount}',
      'used.title': '使用中（{count}）',
      'used.all': '正在使用该服务商的完整目录（{count} 个）。点击某个模型即可开始筛选。',
      'ignored.title': '忽略（{count}）',
      'ignored.none': '暂时没有其他模型：可以拉取目录或服务商的实时列表。',
      'ignored.filter': '筛选',
      'ignored.sort.released': '最新在前',
      'ignored.sort.name': '按名称',
      'ignored.more': '还有 {count} 个：请筛选查找',
      'fetch.catalog': '拉取目录',
      'fetch.live': '拉取实时列表',
      'fetch.liveTitle': '直接询问服务商你的密钥能调用哪些模型，可以找到比 DSH 目录更新的模型。',
      'fetch.found': '找到 {count} 个模型。',
      'fetch.newTag': '新',
      'art.title': '{model} 的立绘',
      'face.title': '{model} 的头像',
      'art.default': '默认',
      'art.upload': '上传图片……',
      'art.forget': '撤下这张图片',
      'art.yours': '你的图片',
      'packs.intro': '一个立绘包决定角色的外观，以及角色和层级叫什么：其中 pack.json 按文件名给每张图片命名，还有存放图片的文件夹。每个模型是谁保持不变。你选择或上传的图片属于改动，保存在正在使用的立绘包旁边；导出时会把它们写入 .zip，并包含它用到的每张图片。立绘包没有的内容都来自内置立绘包。',
      'packs.inUse': '使用中',
      'packs.use': '使用',
      'packs.export': '导出 .zip',
      'packs.remove': '移除',
      'packs.removeSure': '移除它',
      'packs.by': '作者：{author}',
      'packs.counts': '{characters} 个角色的 {pictures} 张图片',
      'packs.countsOf': '{names} 的 {pictures} 张图片',
      'packs.countsNone': '它没有自己的图片：在你选择之前，会使用内置立绘包的图片。',
      'packs.folder': '保存在 {folder}。',
      'roster.move': '拖动小把手可移动它（键盘用 Alt+← →）：按服务商排序时，卡片会跟随此顺序。',
      'summon.rule.outfits': '装备包含「服装」：当前使用的立绘包中，每张未被其他卡面展示的立绘都会成为服装；★4，除非该立绘包为其指定其他星级。',
      'summon.album.equipment': '装备 {owned}/{total}',
      'summon.album.character': '角色 {owned}/{total}',
      'summon.outfit.text': '来自立绘包「{pack}」的立绘',
      'summon.kind.outfit': '服装',
      'viewer.hint': '滚轮在光标处缩放，拖动移动（移动中松开可甩出），双击放大或适应窗口；← → 切换，Esc、× 或点击图片外侧关闭。',
      'viewer.fit': '适应窗口',
      'viewer.zoomOut': '缩小',
      'viewer.zoomIn': '放大',
      'viewer.next': '下一张',
      'viewer.prev': '上一张',
      'summon.view': '查看 {name}',
      'summon.rule.earn': '赚取：每次模型调用成功后掷一次骰，模型每输出 2,000 个 token 再掷一次（最多 25 次）；掷骰可能掉落 1 ✦（30%）、3 ✦（6%）或 10 ✦（1%）。',
      'summon.code.unknown': '什么也没有发生。',
      'summon.code.reveal': '图鉴已全部解锁。',
      'summon.code.added': '+{count} ✦',
      'summon.codeEnter': '确认',
      'summon.short': '✦ 还不够。',
      'summon.gain': '+{count} ✦',
      'summon.earnedTotal': '工作期间共赚取 {count} ✦',
      'summon.balance': '你有 {count} ✦',
      'summon.mode.earnedHint': '当 DSH 的模型调用成功时偶尔会掉落 ✦；召唤会消耗。',
      'summon.mode.freeHint': '不限数量。',
      'summon.mode.earned': '赚取',
      'summon.mode.free': '免费',
      'summon.mode': '✦',
      'usage.managementHint': '可选。{name} 只把剩余余额告诉在其控制台创建的团队管理密钥；该密钥不能调用模型。名册只用它读取；没有它时，就用上面的 API 密钥查询。',
      'usage.adminHint': '可选。{name} 只把账户消费情况告诉有权读取的密钥，例如在其控制台创建的管理员密钥；该密钥不能调用模型。名册只用它读取；没有它时，就用上面的 API 密钥查询。',
      'usage.management': '管理密钥（余额）',
      'usage.admin': '管理员密钥（消费）',
      'roster.lines': '按服务商分组',
      'used.leftOut': '该服务商上一代的 {count} 个模型需你选择后才会启用。',
      'roster.noneAvailable': '这里还没有可用的模型。「全部」会显示所有角色，以及各自需要什么。',
      'usage.credit': '剩余余额：',
      'usage.spent': '本月消费：',
      'failures.code.INVALID_REQUEST': '请求被拒绝',
      'failures.code.UNKNOWN_MODEL': '无此模型',
      'failures.code.TRANSPORT': '连接失败',
      'failures.code.TIMEOUT': '超时',
      'failures.code.SERVER': '服务商出错',
      'failures.code.ACCOUNT_SIGN_IN_REQUIRED': '需要登录',
      'failures.code.MISSING_CREDENTIAL': '没有密钥',
      'failures.code.AUTH': '密钥不被接受',
      'failures.code.EMPTY_RESPONSE': '空回复',
      'failures.code.CONTEXT_WINDOW_EXCEEDED': '超出上下文长度',
      'failures.code.UNREACHABLE': '无法连接服务商',
      'failures.code.KEY_REJECTED': '密钥被拒绝',
      'failures.code.INVALID_CREDENTIAL': '密钥不被接受',
      'failures.code.RATE_LIMIT': '被限流',
      'failures.code.ACCOUNT_QUOTA': '账号无余额',
      'failures.code.QUOTA': '配额或余额不足',
      'failures.last': '上次调用失败：{why}。{message}',
      'failures.hint': '保留到该服务商下一次调用成功为止。',
      'failures.check': '（密钥检查）',
      'failures.clear': '清除',
      'failures.title': '最近调用失败原因',
      'account.balanceFailed': '刚刚没能读取它的余额（DSH 的「设置 → 账号」里可以查看）。',
      'account.granted': '赠送 {amount}',
      'account.topped': '充值 {amount}',
      'account.balance': '余额：{amounts}',
      'packs.create': '创建',
      'packs.newName': '新立绘包的名称',
      'packs.new': '+ 新建空白立绘包……',
      'packs.discardSure': '放弃这些改动',
      'packs.discard': '放弃改动',
      'packs.changes': '你的 {count} 处改动，保存在立绘包旁：导出时会写入其中。',
      'packs.unknown': '名册不认识的文件夹已忽略：{names}',
      'packs.add': '添加立绘包',
      'packs.included': '名册自带',
      'packs.includedAdd': '添加',
      'packs.includedAgain': '再次添加',
      'packs.includedHave': '已添加：恢复为自带状态',
      'packs.includedUpdate': '更新到 v{version}',
      'packs.switch': '立绘包',
      'packs.exportedFrom': '从名册 {version} 导出',
      'packs.import': '导入 .zip 或 pack.json',
      'packs.importing': '导入中……',
      'packs.link': 'https://github.com/you/your-pack',
      'packs.fetch': '拉取',
      'packs.fetching': '拉取中……',
      'packs.linkHint': '一个 GitHub 仓库、仓库里的某个文件夹（…/tree/main/packs/knights），或者一个 .zip 链接。导入同名立绘包会替换掉原有内容。',
      'packs.added': '已添加 {name}：保留了 {kept} 个文件。',
      'packs.skipped': ' {count} 个其他文件被忽略（{names}）。',
      'packs.how': '制作立绘包',
      'packs.how1': '在角色页面上挑选图片（或上传自己的图片），然后导出立绘包并解压：其中的 pack.json 记录了你的选择，文件夹里是每张图片。',
      'packs.how2': '用任意文本编辑器修改 pack.json：名称（立绘包的、每个层级的："high": { "name": "Knight", "zh-CN": "骑士" }，以及每个角色的），以及哪个文件对应哪张图片。其他语言写在 "name" 旁边，用语言代码（zh-CN、zh-TW、ja……）。',
      'packs.how3': '每个角色在每个层级的卡面和头像都是文件："deepseek": { "art": { "high": "deepseek/high.webp" }, "face": { "high": "deepseek/face-high.webp" } }（.webp、.png、.jpg 或 .gif），也可以是 ls 命令可接受的模式：例如 "deepseek/image*.webp" 会按 ls 顺序取第一个匹配的文件。卡面为 2:3（768 × 1152，或 512 × 768），她的脸部位于上三分之一；头像为正方形（256 × 256），脸部居中。',
      'packs.how4': '角色文件夹里的每张图片都可以在她的页面上选用（头像文件名以 face 开头）。模型专属的立绘："models": { "deepseek-v4-pro": { "art": "deepseek/image2.webp", "face": "deepseek/face-2.webp" } }；用通配符时，"claude-opus-*" 表示每个 Opus。以第一个匹配的为准。',
      'packs.how5': '把文件夹压缩后导入这里，或放到 GitHub 上用链接拉取。',
      'art.portrait': '肖像',
      'aa.title': '你的 Artificial Analysis 密钥',
      'aa.hint': '在 artificialanalysis.ai 免费获取（登录后进入 API keys）。只有重新拉取排行时才需要。',
      'aa.envHint': '读取的变量（否则依次读取 {names}）',
      'rankings.intro': 'Artificial Analysis 排行榜：智能指数 v{version}，截至 {date}。',
      'rankings.count': '{count} 个模型，各取其最佳思考强度',
      'rankings.countEfforts': '{count} 条记录，包含所有已测评的思考强度',
      'rankings.filter': '查找模型或厂商',
      'rankings.mine': '在你的名册中',
      'rankings.efforts': '所有思考强度',
      'rankings.none': '没有匹配的模型。',
      'rankings.taskCost': '$ / 任务',
      'rankings.taskTime': '时间 / 任务',
      'rankings.taskTokens': 'Token / 任务',
      'rankings.speed': 'Token/秒',
      'rankings.released': '发布时间',
      'rankings.sortBy': '按 {column} 排序',
      'rankings.taskNote': '按任务计算：智能指数中一个任务的费用（他们的免费榜单里有）。一次任务所需的时间和 token 在 Pro 榜单中：用 Pro 密钥拉取后也会显示在这里。',
      'rankings.refresh': '重新拉取',
      'rankings.refreshing': '拉取中……',
      'rankings.needKey': '拉取需要 artificialanalysis.ai 的免费密钥：在上方粘贴，或填写保存它的环境变量名。',
      'rankings.model': '模型',
      'rankings.index': '智能',
      'rankings.price': '输入 / 输出（每百万 $）',
      'rankings.yours': '在你的名册中',
      'rankings.source': '数据：Artificial Analysis',
      'tab.summon': '召唤',
      'summon.loading': '正在载入卡池……',
      'summon.banner': '概率 UP 召唤',
      'summon.pickup5': '★5 UP',
      'summon.pickup4': '★4 UP',
      'summon.none': '无',
      'summon.one': '召唤 ×1',
      'summon.ten': '召唤 ×10 +1',
      'summon.cost': '{cost} ✦',
      'summon.spent': '已花费 {spent} ✦',
      'summon.count': '{count} 次召唤',
      'summon.fives': '★5 角色：{count}',
      'summon.pity': '{count}/330：若之前未出，第 330 次必是 {name}',
      'summon.pityDone': '已获得 {name}：本卡池的保底已用掉',
      'summon.free': '✦ 是免费的：不花钱，不调用任何模型；召唤到角色也不等于拥有它的模型（要使用它，仍需在“模型与密钥”里配置密钥）。',
      'summon.rates': '概率',
      'summon.kind.character': '角色',
      'summon.kind.equipment': '装备',
      'summon.rule.pickup5': 'UP 的 ★5 占 ★5 角色 1% 中的 0.8%；其余 ★5 角色平分剩下的 0.2%。',
      'summon.rule.pickup4': 'UP 的 ★4 占 ★4 角色 3% 中的 1.5%。',
      'summon.rule.ten': '×10 召唤花费 30 ✦，发 11 张卡，其中至少一张 ★4 及以上，至少一张是角色。',
      'summon.rule.pity': '在同一卡池召唤 329 次仍未出 UP 的 ★5 时，第 330 次必定是它（每个卡池一次）。',
      'summon.rule.pool': '角色来自名册的阵容：{five} ★5，{four} ★4，其余 ★3。',
      'summon.album': '图鉴 {owned}/{total}',
      'summon.reset': '重新开始',
      'summon.resetSure': '清空所有召唤记录',
      'summon.back': '卡池',
      'summon.skip': '跳过',
      'summon.new': '新',
      'summon.pityTag': '保底',
      'summon.thinking': '思考中……',
      'summon.prompt': '› summon ×{count}',
      'summon.open': '打开 {name} 的页面',
      'summon.owned': '×{count}',
      'summon.unknown': '尚未召唤到',
      'summon.code': '作弊码',
      'summon.tally': '★5 ×{five} · ★4 ×{four}',
      'equip.context.name': '无限上下文',
      'equip.context.text': '记得整段对话，连那一段也记得。',
      'equip.nolimit.name': '无速率限制',
      'equip.nolimit.text': '429 只是个数字。',
      'equip.freetier.name': '永久免费额度',
      'equip.freetier.text': '账单永远不会来。',
      'equip.firsttry.name': '一次就跑通',
      'equip.firsttry.text': '不用重试。很可疑。',
      'equip.agi.name': 'AGI（预览版）',
      'equip.agi.text': '两周后上线。',
      'equip.cachehit.name': '提示缓存命中',
      'equip.cachehit.text': '这次打一折。',
      'equip.json.name': '合法的 JSON',
      'equip.json.text': '每个括号都闭合了。',
      'equip.toolcall.name': '对的工具',
      'equip.toolcall.text': '参数也传对了。',
      'equip.cot.name': '思维链',
      'equip.cot.text': '先想再答，想很久。',
      'equip.sysprompt.name': '完美的系统提示词',
      'equip.sysprompt.text': '一字不差地照做。',
      'equip.temp0.name': '温度 0',
      'equip.temp0.text': '每次回答都一样。大概。',
      'equip.retry.name': '重试',
      'equip.retry.text': '再问一次试试？',
      'equip.maxtokens.name': '最大 Token 数',
      'equip.maxtokens.text': '然后回答就断在了——',
      'equip.timeout.name': '超时',
      'equip.timeout.text': '还在思考……',
      'equip.emdash.name': '破折号',
      'equip.emdash.text': '用得——很大方。',
      'equip.apology.name': '抱歉造成困惑',
      'equip.apology.text': '道了歉，什么都没改。',
      'equip.lgtm.name': '看着没问题',
      'equip.lgtm.text': 'LGTM，直接合并吧。',
      'equip.hello.name': '你好，世界',
      'equip.hello.text': '每个程序的第一句话。',
      'equip.delve.name': '深入探讨',
      'equip.delve.text': '让我们深入探讨一下。',
      failed: '失败：{error}'
    }

    // ---- small helpers ----
    /** `{name}` in a sentence filled in. */
    const format = (text, values = {}) => String(text).replace(/\{(\w+)\}/g, (all, key) =>
      Object.hasOwn(values, key) ? String(values[key]) : all)
    const english = (key, values) => format(EN[key] ?? key, values)
    /** DSH's words for the plugin (`words`, from a slot's `t`), filled in by us. */
    const wordsOf = words => (key, values) => format(typeof words === 'function' ? (words(key) ?? EN[key] ?? key) : (EN[key] ?? key), values)
    const getPath = (value, path) => path.reduce((at, key) => (at === null || at === undefined ? undefined : at[key]), value)
    const hasPath = (value, path) => path.length > 0 && getPath(value, path) !== undefined
    // The reference a provider's key is under when its profile names none: DSH's Models page derives `<ROUTE>_API_KEY`;
    // DeepSeek's adapter reads DEEPSEEK_API_KEY by default.
    const deriveKeyRef = provider => `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
    const DEFAULT_REFS = { 'deepseek-official': 'DEEPSEEK_API_KEY' }
    const REF = /^[A-Za-z_][A-Za-z0-9_]*$/
    const bare = model => String(model ?? '').toLowerCase().split('/').pop()
    const money = value => (Number(value) >= 1 ? Number(value).toFixed(2) : Number(value).toFixed(3)).replace(/\.?0+$/, '') || '0'
    /** A count as people read it: 1.2k, 3.4M. */
    const count = value => value >= 1e6 ? `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1)}k` : String(value)
    /** A time in seconds as people read it: 42 s, 3m 05s, 1h 02m. */
    const duration = seconds => {
      const whole = Math.round(seconds)
      if (whole < 60) return `${whole} s`
      if (whole < 3600) return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`
      return `${Math.floor(whole / 3600)}h ${String(Math.floor(whole % 3600 / 60)).padStart(2, '0')}m`
    }
    /** A fact of a character's page, when it is known. */
    const fact = (label, value, shown) => value === null || value === undefined ? null
      : h(React.Fragment, null, h('dt', null, label), h('dd', null, shown(value)))
    // Artificial Analysis's capability indexes, as the server names them
    const CAPABILITIES = ['engineering', 'finance', 'economics', 'legal', 'health', 'strategy']
    /** A picture's address: an upload's, or the art pack in use's (`pack`: another pack's, for its preview); the pack's
     * stamp in it (what its files are now), so a changed pack is not shown from the browser's cache. `thumb`: its
     * thumbnail, for where it shows small (the server sends the picture itself when it cannot make one). */
    const pictureUrl = (picture, pack = null, thumb = false) => !picture ? null
      : `${API.image}?art=${encodeURIComponent(picture)}${pack ? `&pack=${encodeURIComponent(pack.id)}&v=${pack.stamp}`
        : shared.state?.pack?.stamp ? `&v=${shared.state.pack.stamp}` : ''}${thumb ? '&size=thumb' : ''}`
    /** A name as the art pack gives it ({ name, names: { 'zh-cn': … } }), in the page's language: its own code
     * (zh-CN), else the language's (zh), else another of the language's (zh-TW), else `name`. */
    const named = (about, t) => {
      if (!about) return null
      const lang = String(t('lang')).toLowerCase(), base = lang.split('-')[0], names = about.names ?? {}
      return names[lang] ?? names[base] ?? Object.entries(names).find(([key]) => key.split('-')[0] === base)?.[1] ?? about.name
    }
    const tierName = (state, tier, t) => named(state?.tiers?.[tier], t) ?? t(`tier.${tier}`)
    const characterName = (state, character, t) => named(state?.characters?.[character], t) ?? character
    /** A picture's label (by its file, `claude/festival.webp`): the name its pack gives it, else Portrait, else its
     * tier's name, else its file's (Festival). */
    const pictureLabel = (state, picture, t) => {
      const file = String(picture ?? '')
      const label = state?.pack?.labels?.[file]
      if (label?.name) return named(label, t)
      const stem = file.split('/').pop().replace(/\.[^.]*$/, '')
      if (/^face$/i.test(stem)) return t('art.portrait')
      const about = state?.characters?.[file.split('/')[0]]
      const tier = TIER_ORDER.find(found => about?.art?.[found] === file) ?? TIER_ORDER.find(found => about?.face?.[found] === file)
      if (tier) return tierName(state, tier, t)
      const plain = stem.replace(/^face[-_ ]?/i, '').replace(/[-_]+/g, ' ').trim()
      return plain ? plain[0].toUpperCase() + plain.slice(1) : stem
    }
    /** The card and the avatar a character wears at a tier, as the art pack has them. */
    const tierArt = (state, character, tier) => state?.characters?.[character]?.art?.[tier] ?? null
    const tierFace = (state, character, tier) => state?.characters?.[character]?.face?.[tier] ?? null
    const initials = text => String(text || '?').replace(/^.*\//, '').split(/[-_.\s]+/).filter(Boolean).slice(0, 2)
      .map(word => word[0].toUpperCase()).join('')
    const errorText = error => String(error?.message ?? error)
    const modelId = model => (typeof model === 'string' ? model : model.id)

    async function get (route) {
      const response = await fetch(route, { cache: 'no-store', credentials: 'same-origin' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      return body
    }
    async function post (route, body, { raw = false, type } = {}) {
      const response = await fetch(route, { method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'content-type': raw ? type : 'application/json' }, body: raw ? body : JSON.stringify(body ?? {}) })
      const answer = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(answer.error || `HTTP ${response.status}`)
      return answer
    }
    /** A Remote's answer, or its error thrown. */
    const unwrap = response => {
      if (response && response.ok === false) throw new Error(response.error?.message ?? response.error?.code ?? 'refused')
      return response?.ok === true ? response.value : response
    }

    // ---- what the page knows, shared by every view, kept for the page's life ----
    // resolved: `provider/model` → the server's word on it (art, face, character, tier, name, rankings)
    // state: the server's state; providers: DSH's settings and provider directory; checks: provider → its key's check
    const resolved = new Map()
    let shared = { version: 0, generation: 0, state: null, providers: null, checks: {}, usage: {}, routeModels: {}, released: null, packs: null, account: null }
    const listeners = new Set()
    const bump = (changes = {}) => { shared = { ...shared, ...changes, version: shared.version + 1 }; for (const listener of listeners) listener() }
    const sharedStore = { subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      getSnapshot: () => shared }
    const useShared = () => useSyncExternalStore(sharedStore.subscribe, sharedStore.getSnapshot)
    const asking = new Set()

    async function resolve (models) {
      const missing = models.filter(model => !resolved.has(`${model.provider}/${model.id}`) &&
        !asking.has(`${model.provider}/${model.id}`))
      if (!missing.length) return
      for (const model of missing) asking.add(`${model.provider}/${model.id}`)
      try {
        const answer = await post(API.resolve, { models: missing.map(({ provider, id }) => ({ provider, id })) })
        for (const found of answer.models) resolved.set(`${found.provider}/${found.id}`, found)
      } finally {
        for (const model of missing) asking.delete(`${model.provider}/${model.id}`)
        bump()
      }
    }
    async function loadState () { bump({ state: await get(API.state) }); return shared.state }
    /** Why calls failed lately (the server keeps them until a call succeeds again): read again into the state. */
    async function loadFailures () {
      const { failures } = await get(API.failures)
      if (shared.state) bump({ state: { ...shared.state, failures } })
      return failures
    }
    /** The failures kept for a provider (and, with `model`, the ones of that model or of the provider as a whole). */
    const failuresOf = (state, provider, model = null) => (state?.failures ?? []).filter(found => found.provider === provider &&
      (model === null || !found.model || found.model === model || found.model === bare(model)))
    /** The art packs you have, the one in use, and the ones that come with the roster. */
    async function loadPacks () { bump({ packs: await get(API.packs) }); return shared.packs }
    function usePacks () {
      const { packs } = useShared()
      useEffect(() => { if (!packs) loadPacks().catch(() => {}) }, [])
      return packs
    }
    /** After a change of art pack: the packs, the state, and every card's picture and name again. */
    async function packsChanged () { await Promise.all([loadPacks(), loadState()]); forgetResolved() }
    function forgetResolved () { resolved.clear(); datesById.clear(); bump({ generation: shared.generation + 1 }) }

    /** The server's word on these models (re-rendering as it arrives). */
    function useResolved (models) {
      const { generation } = useShared()
      const key = models.map(model => `${model.provider}/${model.id}`).join('\n')
      useEffect(() => { if (models.length) resolve(models).catch(() => {}) }, [key, generation])
      return model => resolved.get(`${model.provider}/${model.id}`) ?? null
    }
    function useRosterState () {
      const { state } = useShared()
      useEffect(() => { if (!state) loadState().catch(() => {}) }, [])
      return state
    }

    // DSH's settings (redacted) and its provider directory: which providers are set up, how, and which could be.
    let loadingProviders = null
    function loadProviders (remote) {
      loadingProviders ??= Promise.all([remote.settings.describe(), remote.llm.listConfigurableProviders()])
        .then(([described, configurable]) => {
          const view = unwrap(described)
          bump({ providers: { view, entries: unwrap(configurable), namespaces: new Map(view.namespaces.map(item => [item.ns, item])), error: null } })
          return shared.providers
        })
        .catch(error => { bump({ providers: { ...(shared.providers ?? {}), error: errorText(error) } }); throw error })
        .finally(() => { loadingProviders = null })
      return loadingProviders
    }
    function useProviders (remote) {
      const { providers } = useShared()
      useEffect(() => { if (remote && !providers) loadProviders(remote).catch(() => {}) }, [remote])
      return providers
    }

    /** What the page knows of one provider: its directory entry, settings, profile and key reference. */
    function providerInfo (providers, provider) {
      const entry = providers?.entries?.find(item => item.provider === provider) ?? null
      const namespace = entry ? providers.namespaces.get(entry.settingsNs) ?? null : null
      const configured = Boolean(namespace && (entry.settingsPath.length === 0 || getPath(namespace.value, entry.settingsPath) !== undefined))
      const profile = configured ? (getPath(namespace.value, entry.settingsPath) ?? {}) : {}
      const named = typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv ? profile.apiKeyEnv : undefined
      const ref = named ?? DEFAULT_REFS[provider] ?? deriveKeyRef(provider)
      const used = Array.isArray(profile.models) ? profile.models : null
      const removable = configured && entry.settingsPath.length > 0 && hasPath(namespace.user ?? namespace.value, entry.settingsPath) &&
        !hasPath(namespace.base, entry.settingsPath)
      return { provider, entry, namespace, configured, profile, named, ref, used, removable,
        writable: providers?.view?.writable !== false, whole: entry?.settingsPath.length === 0 }
    }

    /** Write DSH's settings (path ops), again once over a newer revision; then read them again. */
    async function writeSettings (remote, ns, ops) {
      let revision = shared.providers?.namespaces.get(ns)?.revision
      for (let tries = 0; tries < 2; tries++) {
        const response = await remote.settings.mutate(ns, ops, revision)
        if (response?.ok !== false) { await loadProviders(remote); return }
        if (response.error?.code !== 'settings/conflict' || tries) throw new Error(response.error?.message ?? 'refused')
        revision = unwrap(await remote.settings.describe()).namespaces.find(item => item.ns === ns)?.revision
      }
    }

    /** Ask whether a provider's key works: the server asks the provider for its usage (a check stands a while); an
     * OpenAI-compatible endpoint of yours is asked by DSH itself, for its models, with the key it keeps. */
    async function checkKey (provider, ref, fresh = false, remote = null) {
      bump({ checks: { ...shared.checks, [provider]: { ...(shared.checks[provider] ?? {}), pending: true } } })
      let found
      try {
        const info = providerInfo(shared.providers, provider)
        if (info.entry?.declared && remote) {
          try {
            const models = unwrap(await remote.llm.discoverModels(info.entry.settingsNs, { provider }))
            found = { status: 'ok', models: models.length }
          } catch (error) {
            const said = errorText(error)
            found = { status: /missing|no credential/i.test(said) ? 'missing' : /401|403|unauthori|forbidden|invalid.*key/i.test(said) ? 'rejected' : 'error', detail: said }
          }
        } else {
          found = await get(`${API.check}?provider=${encodeURIComponent(provider)}&ref=${encodeURIComponent(ref ?? '')}${fresh ? '&fresh=1' : ''}`)
        }
      } catch (error) { found = { status: 'error', detail: errorText(error) } }
      bump({ checks: { ...shared.checks, [provider]: found } })
      // (the server keeps a check that failed as a failure, and lets them go when one works: read them again)
      if (shared.state && !(providerInfo(shared.providers, provider).entry?.declared && remote)) loadFailures().catch(() => {})
      return found
    }

    /** What the account spent this month, or has left, read with the provider's spend key, else its API key (the server
     * asks; what it was told stands a while). Only `ok` is shown unasked: a key that calls the models may well not read
     * the spend, and that is no failure. */
    async function askUsage (provider, ref, fresh = false) {
      bump({ usage: { ...shared.usage, [provider]: { ...(shared.usage[provider] ?? {}), pending: true } } })
      let found
      try { found = await get(`${API.usage}?provider=${encodeURIComponent(provider)}&ref=${encodeURIComponent(ref ?? '')}${fresh ? '&fresh=1' : ''}`) } catch (error) { found = { status: 'error', detail: errorText(error) } }
      bump({ usage: { ...shared.usage, [provider]: found } })
      return found
    }

    /** A pattern as `ls` matches one (`*` any run of characters, `?` one, `[ab]` one of them), as a RegExp. */
    function globOf (pattern) {
      let out = ''
      const text = String(pattern).toLowerCase()
      for (let at = 0; at < text.length; at++) {
        const char = text[at]
        const end = char === '[' ? text.indexOf(']', at + 2) : -1
        if (char === '*') out += '[^/]*'
        else if (char === '?') out += '[^/]'
        else if (end > 0) { const body = text.slice(at + 1, end).replace(/\\/g, '\\\\'); out += `[${/^[!^]/.test(body) ? `^${body.slice(1)}` : body}]`; at = end }
        else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      }
      return new RegExp(`^${out}$`)
    }
    /** Whether the roster leaves a model out until you choose it (models.json's `ignored`: last generation's). */
    const ignoredByDefault = (state, id) => (state?.ignored ?? []).some(pattern =>
      [globOf(pattern), globOf(String(pattern).toLowerCase().replace(/[^a-z0-9*?[\]!-]+/g, '-'))].some(rule => rule.test(bare(id)) || rule.test(slugOf(id))))
    /** A provider's Used models when it has no list of its own: its whole catalog, but for the ones left out until chosen. */
    const usedByDefault = (state, catalog) => catalog.filter(model => !ignoredByDefault(state, model.id))

    /** A model id as it is matched across providers: no vendor, lowercase, words joined by dashes (OpenRouter's
     * `anthropic/claude-opus-5.5` is Anthropic's `claude-opus-5-5`). */
    const slugOf = id => bare(id).replace(/[^a-z0-9]+/g, '-')
    const undatedSlug = slug => slug.replace(/-(\d{8}|\d{6}|\d{4}-\d{2}-\d{2}|latest)$/, '')
    /** The names a provider's model may be the lineup's under (as the server's `formsOf`): its own, without a date or
     * build stamp at the end, and without its family's name in front (Volcengine's `doubao-seed-2-1-turbo-260628` is
     * the lineup's `seed-2-1-turbo`). */
    const formsOf = id => {
      const plain = undatedSlug(slugOf(id))
      return [...new Set([slugOf(id), plain, plain.replace(/^[a-z]+-(?=[a-z])/, '')])]
    }
    /** Whether a provider's model `id` is the lineup's `model`. */
    const sameModel = (id, model) => formsOf(id).some(form => form === slugOf(model) || form === undatedSlug(slugOf(model)))
    /** The one of a provider's `ids` that is the lineup's `model`: the same name, else its newest build. */
    const matchOf = (ids, model) => ids.find(id => slugOf(id) === slugOf(model)) ??
      ids.filter(id => sameModel(id, model)).sort().at(-1)
    // Release dates of the models in the page's lists, as the server gives them: Artificial Analysis's, else
    // OpenRouter's, else the date in the id, else the day the model was first seen (`seen`, an estimate it keeps).
    const datesById = new Map() // id → { date, seen }
    const askingDates = new Set()
    async function askDates (ids) {
      const missing = [...new Set(ids)].filter(id => !datesById.has(id) && !askingDates.has(id)).slice(0, 1000)
      if (!missing.length) return
      for (const id of missing) askingDates.add(id)
      try {
        const answer = await post(API.released, { ids: missing })
        for (const [id, about] of Object.entries(answer.dates ?? {})) datesById.set(id, about)
      } catch { /* no dates: the lists keep their order */ } finally {
        for (const id of missing) askingDates.delete(id)
        bump()
      }
    }
    /** The release dates of `ids` (asked for once): `dateOf(id)` is its date or null, `dateOf.seen(id)` whether that is
     * only the day it was first seen, and `dateOf.label(id)` the date as shown (`~` before an estimate). */
    function useReleasedDates (ids = []) {
      const { generation } = useShared()
      const key = ids.join('\n')
      useEffect(() => { if (ids.length) askDates(ids) }, [key, generation])
      const dateOf = id => datesById.get(id)?.date ?? null
      dateOf.seen = id => Boolean(datesById.get(id)?.seen)
      dateOf.label = id => dateOf(id) ? `${dateOf.seen(id) ? '~' : ''}${dateOf(id)}` : null
      return dateOf
    }
    /** A release date as shown: `~` before the day a model was only first seen. */
    const dateLabel = (date, seen) => date ? `${seen ? '~' : ''}${date}` : null
    /** Models newest first (by `dateOf`), the ones of no known date last, then by id. */
    const newestFirst = dateOf => (one, other) => String(dateOf(other.id) ?? '').localeCompare(String(dateOf(one.id) ?? '')) ||
      String(one.id).localeCompare(String(other.id))

    /** The models a provider a character goes through offers: DSH's catalog for it (or, for an endpoint of yours, what
     * DSH reads from it with the key it keeps), and for OpenRouter its live list too. */
    async function loadRouteModels (remote, provider) {
      if (shared.routeModels?.[provider]?.status === 'loading') return
      bump({ routeModels: { ...shared.routeModels, [provider]: { status: 'loading', ids: [] } } })
      const ids = new Set()
      let failed = null
      const info = providerInfo(shared.providers ?? await loadProviders(remote), provider)
      if (info.entry) {
        try { for (const model of unwrap(await remote.llm.discoverModels(info.entry.settingsNs, { provider }))) ids.add(model.id) } catch (error) { failed = errorText(error) }
      }
      if (shared.state?.providers?.[provider]?.models) {
        try { for (const model of (await get(`${API.live}?provider=${encodeURIComponent(provider)}&ref=${encodeURIComponent(info.ref)}`)).models) ids.add(model.id) } catch (error) { failed ??= errorText(error) }
      }
      bump({ routeModels: { ...shared.routeModels, [provider]: { status: ids.size || !failed ? 'ready' : 'error', ids: [...ids], error: failed } } })
    }

    /** Add a model to a provider's Used models (setting the provider up, or putting it back, first if it must be). */
    async function addModel (remote, provider, model, { catalog = [], keyName } = {}) {
      let providers = shared.providers ?? await loadProviders(remote)
      const parked = shared.state?.parked?.[provider]
      if (parked) {
        await writeSettings(remote, parked.ns, [{ op: 'set', path: parked.path, value: parked.profile ?? {} }])
        await post(API.unpark, { provider }); await loadState()
        providers = shared.providers
      }
      const info = providerInfo(providers, provider)
      if (!info.entry || !info.namespace) throw new Error(`DSH cannot route ${provider}`)
      const entryOf = Object.fromEntries(Object.entries({ id: model.id, name: model.name, contextWindow: model.contextWindow,
        maxTokens: model.maxTokens }).filter(([, value]) => value !== undefined && value !== null && value !== ''))
      if (!info.configured) {
        const profile = { ...(keyName && keyName !== info.ref ? { apiKeyEnv: keyName } : {}), models: [entryOf] }
        await writeSettings(remote, info.entry.settingsNs, [{ op: 'set', path: [...info.entry.settingsPath], value: profile }])
        return
      }
      const current = info.used ?? usedByDefault(shared.state, catalog).map(found => ({ id: found.id }))
      if (current.some(found => modelId(found) === model.id)) return
      await writeSettings(remote, info.entry.settingsNs, [{ op: 'set', path: [...info.entry.settingsPath, 'models'], value: [...current, entryOf] }])
    }

    /** A model directory's snapshot (the one DSH's picker renders from). */
    const useDirectory = directory => useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot)
    /** The models DSH's picker offers, in its order, each with its provider. */
    const catalogOf = snapshot => (snapshot.groups ?? []).flatMap(group => (group.models ?? [])
      .map(model => ({ provider: group.id, providerName: group.name ?? group.id, id: model.id, name: model.name ?? model.id })))
    const providerName = (provider, snapshot, providers) => snapshot?.groups?.find(group => group.id === provider)?.name ??
      providers?.entries?.find(entry => entry.provider === provider)?.displayName ?? provider

    /** The roster's cards: DSH's catalog, then the lineup models it does not have, each with whether it can be used. */
    function useCards (directory, remote) {
      const snapshot = useDirectory(directory)
      const state = useRosterState()
      const providers = useProviders(remote)
      const { checks, routeModels } = useShared()
      const catalog = useMemo(() => catalogOf(snapshot), [snapshot.groups])
      const current = snapshot.pending ?? snapshot.current
      const routes = state?.routes ?? {}
      const { cards, hidden } = useMemo(() => {
        // A provider serving its whole catalog of many models (OpenRouter with no list) shows only the models the roster
        // knows as characters; the rest stay in DSH's picker, counted.
        const known = new Set((state?.lineup ?? []).map(item => slugOf(item.id)))
        const big = new Set((snapshot.groups ?? []).filter(group => (group.models?.length ?? 0) > 40 &&
          !providerInfo(providers, group.id).used).map(group => group.id))
        const hidden = {}
        // DeepSeek's account and its API key reach the same models: one card each, through the account unless the session
        // already uses the key (its page chooses)
        const merged = [], deepseek = new Map()
        for (const model of catalog) {
          const card = { ...model, source: 'catalog' }
          const leftOut = ignoredByDefault(state, model.id) && !(providerInfo(providers, model.provider).used ?? []).some(used => modelId(used) === model.id)
          if (leftOut || (big.has(model.provider) && !formsOf(model.id).some(form => known.has(form)))) { hidden[model.provider] = (hidden[model.provider] ?? 0) + 1; continue }
          if (!DEEPSEEK_ROUTES.includes(model.provider)) { merged.push(card); continue }
          const found = deepseek.get(bare(model.id))
          if (found) { found.routes.push(card); continue }
          const entry = { ...card, routes: [card] }
          deepseek.set(bare(model.id), entry); merged.push(entry)
        }
        for (const entry of deepseek.values()) {
          const preferred = entry.routes.find(route => current?.provider === route.provider && current?.model === route.id) ??
            entry.routes.find(route => route.provider === ACCOUNT) ?? entry.routes[0]
          Object.assign(entry, { provider: preferred.provider, providerName: preferred.providerName, id: preferred.id, name: preferred.name })
        }
        // the lineup models DSH does not offer yet, each through the provider its character goes through: her own, or
        // OpenRouter or an endpoint of yours, where it is matched by name among the models that provider offers
        const have = new Set(catalog.flatMap(model => formsOf(model.id)))
        const lineup = []
        for (const item of state?.lineup ?? []) {
          const via = routes[item.character] ?? item.provider
          const card = { provider: via, id: item.id, name: item.name, source: 'lineup', lineupId: item.id, character: item.character }
          if (via !== item.provider) {
            const offered = routeModels[via]
            if (!offered || offered.status === 'loading') card.pendingRoute = true
            else {
              const match = matchOf(offered.ids, item.id)
              if (match) card.id = match; else card.absent = true
            }
          } else if (item.listed === false) card.absent = true // (a lineup model OpenRouter does not list, as of its list)
          if (have.has(slugOf(card.id))) continue
          lineup.push({ ...card, providerName: providerName(via, snapshot, providers) })
        }
        return { cards: [...merged, ...lineup], hidden }
      }, [catalog, state?.lineup, state?.ignored, providers, current?.provider, current?.model, JSON.stringify(routes), routeModels])
      // the models of the providers characters go through, and once each, whether the keys work
      const through = [...new Set(Object.values(routes))]
      useEffect(() => {
        if (!state || !remote || !providers) return
        for (const provider of through) if (!shared.routeModels[provider]) loadRouteModels(remote, provider).catch(() => {})
      }, [through.join(), Boolean(state), Boolean(providers)])
      const offered = state?.providers ?? {}
      const toCheck = [...new Set(cards.filter(card => card.provider !== ACCOUNT && (card.source === 'lineup' || offered[card.provider]))
        .map(card => card.provider))]
      useEffect(() => {
        if (!state || (remote && !providers)) return
        for (const provider of toCheck) {
          if (!shared.checks[provider]) checkKey(provider, providerInfo(providers, provider).ref, false, remote).catch(() => {})
        }
      }, [toCheck.join(), Boolean(state), Boolean(providers), checks])
      const statusOf = card => {
        const found = checks[card.provider]
        if (card.source === 'catalog') return found?.status === 'rejected' ? 'rejected' : 'ready'
        if (card.absent) return 'absent'
        if (card.pendingRoute || !found?.status) return 'checking'
        return { missing: 'nokey', rejected: 'rejected', error: 'error' }[found.status] ?? 'unused'
      }
      return { snapshot, state, providers, catalog, hidden, cards: cards.map(card => ({ ...card, status: statusOf(card) })) }
    }

    // ---- pieces ----
    function Face ({ face, label, size = 26, className = '' }) {
      const [broken, setBroken] = useState(false)
      const url = pictureUrl(face)
      useEffect(() => setBroken(false), [url])
      const style = { width: size, height: size }
      if (!url || broken) return h('span', { className: `lr-face lr-face-none ${className}`, style }, initials(label))
      return h('img', { className: `lr-face ${className}`, style, src: url, alt: '', draggable: false, onError: () => setBroken(true) })
    }
    /** A card's picture (`thumb`: its thumbnail, where it shows small). */
    function Art ({ art, label, className = '', thumb = false }) {
      const [broken, setBroken] = useState(false)
      const url = pictureUrl(art, null, thumb)
      useEffect(() => setBroken(false), [url])
      return url && !broken
        ? h('img', { className, src: url, alt: '', loading: 'lazy', draggable: false, onError: () => setBroken(true) })
        : h('span', { className: `lr-card-blank ${className}` }, initials(label))
    }
    const rarityOf = (found, state) => found?.tier ? state?.tiers?.[found.tier]?.rarity ?? 'R' : 'R'
    const whoOf = (found, state, t) => found?.character
      ? `${characterName(state, found.character, t)} · ${tierName(state, found.tier, t)}`
      : found?.own ? t('tier.custom') : null

    function Card ({ card, found, state, current, busy, onPick, onMore, sort, index = 0, t }) {
      const rarity = rarityOf(found, state)
      const aa = found?.aa
      const name = card.source === 'catalog' ? card.name : (found?.name ?? card.name ?? card.id)
      const blocked = card.status !== 'ready'
      const hint = { unused: t('status.unusedHint'), nokey: card.provider.startsWith('deepseek') ? t('status.nokeyDeepseek') : t('status.nokeyHint'),
        rejected: t('status.rejectedHint'), absent: t('status.absentHint', { provider: card.providerName }) }[card.status]
      const failed = failuresOf(state, card.provider, card.id)[0]
      return h('div', { className: 'lr-card lr-tilt', 'data-rarity': rarity, 'data-current': current ? '' : undefined,
        'data-status': card.status, style: { '--n': index } },
      h('button', { type: 'button', className: 'lr-card-main', disabled: busy, title: `${card.providerName} · ${card.id}`,
        onClick: () => (blocked ? onMore(card) : onPick(card)) },
      h('span', { className: 'lr-card-art' }, h(Art, { art: found?.art, label: name, thumb: true })),
      h('span', { className: 'lr-rarity' }, rarity),
      current ? h('span', { className: 'lr-ribbon' }, t('roster.inUse')) : null,
      blocked ? h('span', { className: 'lr-veil' },
        h('strong', null, t(`status.${card.status}`)), hint ? h('span', null, hint) : null) : null,
      h('span', { className: 'lr-card-text' },
        h('span', { className: 'lr-card-who' }, whoOf(found, state, t) ?? card.providerName),
        h('span', { className: 'lr-card-name' }, name),
        h('span', { className: 'lr-card-meta' },
          h('span', null, card.providerName),
          sort === 'released' ? h('span', { className: 'lr-date', title: found?.releasedSeen ? t('released.seen', { date: found.released }) : undefined },
            dateLabel(found?.released, found?.releasedSeen) ?? '—')
            : aa ? h('span', { title: t('roster.rank', { rank: aa.rank, of: aa.of }) }, `AA ${aa.intelligence} · #${aa.rank}`) : null))),
      failed ? h('span', { className: 'lr-failed', title: t('failures.last', { why: failureName(failed.code, t), message: failed.message }),
        'aria-label': t('failures.last', { why: failureName(failed.code, t), message: failed.message }) }, '⚠') : null,
      h('button', { type: 'button', className: 'lr-more', title: t('roster.more'), 'aria-label': `${t('roster.more')}: ${name}`,
        onClick: () => onMore(card) }, '…'),
      rarity === 'UR' || rarity === 'SSR' ? h('span', { className: 'lr-holo', 'aria-hidden': 'true' }) : null,
      h('span', { className: 'lr-gloss', 'aria-hidden': 'true' }))
    }

    function Credit ({ state, t }) {
      const about = state?.rankings
      return h('div', { className: 'lr-credit' },
        about?.as_of ? t('credit', { version: about.version ?? '?', date: about.as_of }) : t('credit.none'), ' ',
        h('a', { href: 'https://artificialanalysis.ai', target: '_blank', rel: 'noreferrer' }, 'artificialanalysis.ai'))
    }

    // the roster's filter and sort, as you left them (while DSH's page is open): Available first, by provider; whether a
    // line heads each provider's cards in that sort (yours to turn off), and the providers' order (yours to drag), both
    // kept in this browser
    const LINES_KEY = 'dsh-llm-roster.lines'
    const ORDER_KEY = 'dsh-llm-roster.order'
    const shownAs = { filter: 'available', sort: 'provider',
      lines: (() => { try { return localStorage.getItem(LINES_KEY) !== 'off' } catch { return true } })(),
      order: (() => {
        try {
          const kept = JSON.parse(localStorage.getItem(ORDER_KEY))
          return Array.isArray(kept) ? kept.filter(id => typeof id === 'string').slice(0, 200) : []
        } catch { return [] }
      })() }
    /** A grip's six dots: drawn, so the pill's text is its name alone. */
    const GRIP = h => h('svg', { width: 6, height: 10, viewBox: '0 0 6 10', 'aria-hidden': 'true', focusable: 'false' },
      [[1, 1], [5, 1], [1, 5], [5, 5], [1, 9], [5, 9]].map(([cx, cy]) => h('circle', { key: `${cx}${cy}`, cx, cy, r: 1, fill: 'currentColor' })))
    /** How far above or below the pills a dragged one may be let go and still go somewhere (px). */
    const AWAY = 40
    /** Where a dragged pill would go, from the pills' boxes (in their order, its own among them at `from`) and the
     * pointer: the gap nearest it, on its own line first. Gives the place it would take (`at`) and where to draw the
     * marker (`x`, `top`, `bottom`; no `x` when that is where it is already); null when the pointer is well away from the
     * pills (let go there, it stays where it was). */
    const insertion = (boxes, from, x, y, gap = 6) => {
      if (!boxes.length) return null
      if (y < Math.min(...boxes.map(box => box.top)) - AWAY || y > Math.max(...boxes.map(box => box.bottom)) + AWAY) return null
      let near = null
      boxes.forEach((box, index) => {
        // (a line away counts for more than any distance along one)
        const far = Math.max(box.top - y, 0, y - box.bottom) * 10000 + Math.max(box.left - x, 0, x - box.right)
        if (!near || far < near.far) near = { index, box, far }
      })
      const after = x > (near.box.left + near.box.right) / 2
      const before = near.index + (after ? 1 : 0) // the gap: before this pill
      const at = before > from ? before - 1 : before
      if (at === from) return { at }
      return { at, x: after ? near.box.right + gap / 2 : near.box.left - gap / 2, top: near.box.top, bottom: near.box.bottom }
    }
    function RosterTab ({ remote, directory, available, onPicked, onPage, onTab, t }) {
      const { snapshot, state, cards, hidden, providers: configured } = useCards(directory, remote)
      const lookup = useResolved(cards)
      const [chosen, setChosen] = useState(shownAs)
      const setFilter = filter => { shownAs.filter = filter; setChosen({ ...shownAs }) }
      const setSort = sort => { shownAs.sort = sort; setChosen({ ...shownAs }) }
      const setLines = lines => {
        shownAs.lines = lines; setChosen({ ...shownAs })
        try { localStorage.setItem(LINES_KEY, lines ? 'on' : 'off') } catch { /* for this visit only */ }
      }
      const setOrder = order => {
        shownAs.order = order; setChosen({ ...shownAs })
        try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)) } catch { /* for this visit only */ }
      }
      const { sort, lines } = chosen
      const [busy, setBusy] = useState(null)
      const [dragging, setDragging] = useState(null) // the provider whose pill is being dragged
      const dragged = useRef(false) // a drag just ended: its pill's click is no filter
      const [failure, setFailure] = useState(null)
      const current = snapshot.pending ?? snapshot.current
      // a provider's cards, to filter and line up by; DeepSeek's account and its API key are one (a model of hers is one
      // card, through the one or the other: its card says which)
      const deepseekName = (found => found === 'deepseek-official' ? 'DeepSeek' : found)(providerName('deepseek-official', snapshot, configured))
      const groupOf = card => card.provider === ACCOUNT ? 'deepseek-official' : card.provider
      // the providers as their cards come, in the order you dragged them to (one you have not placed: after, as it comes)
      const placed = new Map(chosen.order.map((id, index) => [id, index]))
      const providers = [...new Map(cards.map(card => [groupOf(card), groupOf(card) === 'deepseek-official' ? deepseekName : card.providerName])).entries()]
        .map((entry, index) => [entry, placed.get(entry[0]) ?? chosen.order.length + index]).sort((one, other) => one[1] - other[1]).map(([entry]) => entry)
      const nameOf = new Map(providers)
      const latest = useRef(providers)
      latest.current = providers
      /** Put provider `id` at place `at` among those shown, the rest closing up; kept with the places of providers not
       * shown now. */
      const place = (id, at) => {
        const ids = latest.current.map(([found]) => found)
        const from = ids.indexOf(id)
        const to = Math.min(ids.length - 1, Math.max(0, at))
        if (from < 0 || to === from) return
        ids.splice(from, 1)
        ids.splice(to, 0, id)
        setOrder([...ids, ...chosen.order.filter(found => !ids.includes(found))])
      }
      /** Drag a provider's pill by its grip: a copy of it floats under the pointer while the pill keeps its place, dimmed;
       * a marker shows the gap it would go to, and it goes there when let go. Let go well away from the pills, or Esc:
       * it stays. */
      const drag = (event, id) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        event.preventDefault()
        const pill = event.currentTarget.closest('[data-provider]')
        const row = pill.closest('.lr-chips')
        const start = { x: event.clientX, y: event.clientY }
        let lifted = null // the floating copy and the marker, once the pointer has moved
        let target = null // where it would go
        const lift = () => {
          const box = pill.getBoundingClientRect()
          const ghost = pill.cloneNode(true)
          ghost.removeAttribute('data-provider')
          ghost.removeAttribute('title')
          ghost.classList.remove('lr-dragging')
          ghost.classList.add('lr-ghost')
          ghost.setAttribute('aria-hidden', 'true')
          ghost.style.width = `${box.width}px`
          ghost.style.height = `${box.height}px`
          const marker = document.createElement('span')
          marker.className = 'lr-insert'
          marker.hidden = true
          row.append(ghost, marker)
          // where left 0, top 0 puts it: the window's corner, or the box an element fixed in place is put in here
          const origin = ghost.getBoundingClientRect()
          document.documentElement.classList.add('lr-sorting')
          setDragging(id)
          return { ghost, marker, origin, grab: { x: start.x - box.left, y: start.y - box.top } }
        }
        const move = found => {
          if (!lifted && Math.hypot(found.clientX - start.x, found.clientY - start.y) < 4) return
          lifted ??= lift()
          const { ghost, marker, origin, grab } = lifted
          ghost.style.transform = `translate(${found.clientX - grab.x - origin.left}px, ${found.clientY - grab.y - origin.top}px)`
          const pills = [...row.querySelectorAll('[data-provider]')]
          const gap = parseFloat(window.getComputedStyle(row).columnGap) || 6
          target = insertion(pills.map(other => other.getBoundingClientRect()), pills.indexOf(pill), found.clientX, found.clientY, gap)
          ghost.classList.toggle('lr-astray', !target)
          if (target?.x === undefined) { marker.hidden = true; return }
          const frame = row.getBoundingClientRect()
          marker.style.left = `${target.x - frame.left}px`
          marker.style.top = `${target.top - frame.top - 3}px`
          marker.style.height = `${target.bottom - target.top + 6}px`
          marker.hidden = false
        }
        const end = drop => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', cancel)
          window.removeEventListener('keydown', key, true)
          if (!lifted) return
          lifted.ghost.remove()
          lifted.marker.remove()
          document.documentElement.classList.remove('lr-sorting')
          setDragging(null)
          dragged.current = true
          setTimeout(() => { dragged.current = false }, 0)
          if (drop && target) place(id, target.at)
        }
        const up = () => end(true)
        const cancel = () => end(false)
        // Esc puts it back, and only that (not the roster closing)
        const key = found => { if (found.key === 'Escape') { found.preventDefault(); found.stopPropagation(); cancel() } }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', cancel)
        window.addEventListener('keydown', key, true)
      }
      // (a provider chosen before that has no cards now: Available)
      const filter = ['all', 'available'].includes(chosen.filter) || providers.some(([id]) => id === chosen.filter) ? chosen.filter : 'available'

      const shown = cards.filter(card => filter === 'all' || (filter === 'available' ? card.status === 'ready' : groupOf(card) === filter))
      const strength = card => [RARITY[rarityOf(lookup(card), state)] ?? 0, lookup(card)?.aa?.intelligence ?? -1]
      if (sort === 'rank') {
        shown.sort((one, other) => (STATUS_ORDER[one.status] > 0) - (STATUS_ORDER[other.status] > 0) ||
          (lookup(other)?.aa?.intelligence ?? -1) - (lookup(one)?.aa?.intelligence ?? -1))
      } else if (sort === 'released') {
        // newest first; a model with no date known last; on the same day, the stronger first
        shown.sort((one, other) => String(lookup(other)?.released ?? '').localeCompare(String(lookup(one)?.released ?? '')) ||
          (lookup(other)?.aa?.intelligence ?? -1) - (lookup(one)?.aa?.intelligence ?? -1))
      } else {
        const order = new Map(providers.map(([id], index) => [id, index]))
        shown.sort((one, other) => order.get(groupOf(one)) - order.get(groupOf(other)) ||
          STATUS_ORDER[one.status] - STATUS_ORDER[other.status] ||
          strength(other)[0] - strength(one)[0] || strength(other)[1] - strength(one)[1])
      }

      async function pick (card) {
        if (!available) return setFailure(t('roster.unavailable'))
        setBusy(`${card.provider}/${card.id}`); setFailure(null)
        try {
          const result = await directory.select({ provider: card.provider, model: card.id })
          if (result && result.ok === false) throw new Error(result.error?.message ?? 'refused')
          onPicked()
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(null) }
      }

      if (!cards.length && (snapshot.status === 'loading' || snapshot.status === 'idle' || !state)) {
        return h('div', { className: 'lr-empty' }, t('roster.loading'))
      }
      return h('div', { className: 'lr-roster' },
        // three rows, each where it always is: the filters, the sorts, then the provider lines' box and the art pack (the box
        // keeps its place in the other sorts, unseen, so nothing moves under the pointer)
        h('div', { className: 'lr-toolbar lr-roster-tools' },
          h('div', { className: 'lr-tools-row' },
            h('span', { className: 'lr-label lr-tools-label', id: 'lr-filter-by' }, t('roster.filterBy')),
            h('div', { className: 'lr-chips', role: 'group', 'aria-labelledby': 'lr-filter-by' },
              [['all', t('roster.all')], ['available', t('roster.available')], ...providers].map(([id, label]) => {
                // a provider's pill has a grip, to drag it elsewhere (Alt+← → with the keyboard); the cards follow
                const movable = id !== 'all' && id !== 'available'
                return h('button', {
                  key: id, type: 'button', className: `lr-chip${filter === id ? ' lr-on' : ''}${movable ? ' lr-movable' : ''}${dragging === id ? ' lr-dragging' : ''}`,
                  'data-provider': movable ? id : undefined, title: movable ? t('roster.move') : undefined,
                  onClick: () => { if (!dragged.current) setFilter(id) },
                  onKeyDown: movable ? event => {
                    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                      event.preventDefault()
                      place(id, latest.current.findIndex(([found]) => found === id) + (event.key === 'ArrowLeft' ? -1 : 1))
                    }
                  } : undefined
                },
                movable ? h('span', { className: 'lr-grip', onPointerDown: event => drag(event, id) }, GRIP(h)) : null,
                label)
              }))),
          h('div', { className: 'lr-tools-row' },
            h('span', { className: 'lr-label lr-tools-label', id: 'lr-sort-by' }, t('roster.sortBy')),
            h('div', { className: 'lr-chips', role: 'group', 'aria-labelledby': 'lr-sort-by' },
              ['provider', 'rank', 'released'].map(id => h('button', {
                key: id, type: 'button', className: `lr-chip${sort === id ? ' lr-on' : ''}`, onClick: () => setSort(id)
              }, t(`roster.sort.${id}`))))),
          h('div', { className: 'lr-roster-options' },
            h('label', { className: 'lr-check-row lr-lines', 'data-shown': sort === 'provider' ? '' : undefined, 'aria-hidden': sort === 'provider' ? undefined : 'true' },
              h('input', { type: 'checkbox', checked: lines, disabled: sort !== 'provider', tabIndex: sort === 'provider' ? undefined : -1,
                onChange: event => setLines(event.target.checked) }), t('roster.lines')),
            h(PackSwitch, { t }))),
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
        !shown.length && filter === 'available' ? h('div', { className: 'lr-note lr-row lr-between' },
          h('span', null, t('roster.noneAvailable')),
          h('span', { className: 'lr-row' },
            h('button', { type: 'button', className: 'lr-button lr-small', onClick: () => setFilter('all') }, t('roster.all')),
            onTab ? h('button', { type: 'button', className: 'lr-button lr-small', onClick: () => onTab('models') }, t('tab.models')) : null)) : null,
        h('div', { className: 'lr-grid' },
          shown.flatMap((card, index) => [
            // by provider: a line before each provider's cards, with its name, to find them by
            sort === 'provider' && lines && (index === 0 || groupOf(card) !== groupOf(shown[index - 1]))
              ? h('div', { key: `group:${groupOf(card)}`, className: 'lr-group', role: 'separator', 'data-provider': groupOf(card) },
                h('span', { className: 'lr-group-arrow', 'aria-hidden': 'true' }, '▸'), h('span', null, nameOf.get(groupOf(card))),
                h('span', { className: 'lr-group-line', 'aria-hidden': 'true' }))
              : null,
            h(Card, {
              key: `${card.provider}/${card.id}`, card, found: lookup(card), state, t, busy: busy !== null, sort, index,
              current: current?.provider === card.provider && current?.model === card.id,
              onPick: pick, onMore: chosen => onPage({ kind: 'character', card: chosen })
            })
          ].filter(Boolean)),
          h('button', { type: 'button', className: 'lr-card lr-add-card lr-tilt', style: { '--n': shown.length }, onClick: () => onPage({ kind: 'add' }) },
            h('span', { className: 'lr-plus' }, '+'), h('strong', null, t('roster.add')), h('span', null, t('roster.addHint')))),
        Object.entries(hidden).map(([provider, count]) => h('div', { key: provider, className: 'lr-note lr-row lr-between' },
          h('span', null, t('roster.hidden', { count, provider: providerName(provider, snapshot, null) })),
          onTab ? h('button', { type: 'button', className: 'lr-button lr-small', onClick: () => onTab('models') }, t('tab.models')) : null)),
        h('div', { className: 'lr-foot' }, h('span', null, busy ? t('roster.switching') : t('roster.hint')),
          sort === 'released' ? h('span', { className: 'lr-credit' }, t('roster.releasedNote', { date: state?.rankings?.released_as_of ?? '?' }))
            : h(Credit, { state, t })))
    }

    // ---- pictures: choosing a card picture or an avatar ----
    /** Tiles of every picture of a kind (`art`: each character's cards; `face`: her avatars), hers (`first`) first;
     * `value` is the chosen one (null: the default). A picture uploaded goes into her folder of the pack in use, as a
     * change to it; one you added can be taken back. */
    function PictureTiles ({ kind, value, onChoose, t, defaultLabel, defaultValue = null, first = null }) {
      const state = useRosterState()
      const [failure, setFailure] = useState(null)
      const input = useRef(null)
      const upload = async file => {
        if (!file) return
        try {
          const added = await post(`${API.upload}?name=${encodeURIComponent(file.name)}${first ? `&character=${encodeURIComponent(first)}` : ''}`, file, { raw: true, type: file.type })
          await loadState(); onChoose(added.file)
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      const forget = async file => {
        try { await post(API.forget, { file }); await loadState(); forgetResolved() } catch (error) {
          setFailure(t('failed', { error: errorText(error) }))
        }
      }
      const added = new Set(state?.pack?.added ?? [])
      const characters = state ? Object.keys(state.characters).sort((one, other) => (other === first) - (one === first)) : []
      const pictures = name => (kind === 'art' ? state.characters[name].pictures : state.characters[name].faces) ?? []
      const tile = (picture, label) => h('div', { key: picture, className: 'lr-tile-holder' },
        h('button', { type: 'button', className: `lr-tile lr-tile-${kind}${value === picture ? ' lr-on' : ''}`, title: label,
          'aria-label': label, onClick: () => onChoose(picture) }, h('img', { src: pictureUrl(picture, null, true), alt: '', loading: 'lazy' })),
        added.has(picture) ? h('button', { type: 'button', className: 'lr-tile-forget', title: t('art.forget'), 'aria-label': t('art.forget'),
          onClick: () => forget(picture) }, '×') : null)
      const group = (key, label, files) => files.length ? h('div', { key, className: 'lr-art-group' }, h('div', { className: 'lr-label' }, label),
        h('div', { className: `lr-tiles lr-tiles-${kind}` }, files.map(picture => tile(picture, `${label} · ${pictureLabel(state, picture, t)}`)))) : null
      return h('div', { className: 'lr-pictures' },
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        h('div', { className: 'lr-row' },
          h('button', { type: 'button', className: `lr-button${value === defaultValue ? ' lr-on-button' : ''}`, onClick: () => onChoose(defaultValue) },
            defaultLabel ?? t('art.default')),
          h('button', { type: 'button', className: 'lr-button lr-primary', onClick: () => input.current?.click() }, t('art.upload')),
          h('input', { ref: input, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true,
            onChange: event => { upload(event.target.files?.[0]); event.target.value = '' } })),
        group('uploads', t('art.yours'), state?.pack?.uploads ?? []),
        characters.map(name => group(name, characterName(state, name, t), pictures(name))))
    }

    function PicturePicker ({ kind, model, onClose, t }) {
      const lookup = useResolved([model])
      const found = lookup(model)
      const [failure, setFailure] = useState(null)
      const choose = async picture => {
        try {
          await post(API.pick, { model: `${model.provider}/${model.id}`, [kind]: picture })
          forgetResolved(); onClose()
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      return h(Modal, { title: t(kind === 'art' ? 'art.title' : 'face.title', { model: model.name ?? model.id }), onClose, t, small: true },
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        h(PictureTiles, { kind, value: found?.own || kind === 'face' ? found?.[kind] : null, onChoose: choose, t, first: found?.character ?? model.character ?? null }))
    }

    // ---- a provider's key: status, paste, variable, test, balance ----
    function KeySection ({ remote, info, t }) {
      const { checks, usage: spends } = useShared()
      const state = useRosterState()
      const [described, setDescribed] = useState(null)
      const [keyDraft, setKeyDraft] = useState('')
      const [envDraft, setEnvDraft] = useState(info.named ?? '')
      const [note, setNote] = useState(null)
      const [failure, setFailure] = useState(null)
      const [busy, setBusy] = useState(false)
      const [balance, setBalance] = useState(null)
      const found = checks[info.provider]
      useEffect(() => setEnvDraft(info.named ?? ''), [info.named])
      // what the account spent, or has left, where the provider tells it to this key (asked once, again on a test)
      const spendable = Boolean(state?.providers?.[info.provider]?.usage) && info.configured
      const spend = spends[info.provider]
      useEffect(() => { if (spendable && !spend) askUsage(info.provider, info.ref).catch(() => {}) }, [spendable, info.provider, info.ref, Boolean(spend)])
      const askSpend = ref => { if (spendable) askUsage(info.provider, ref, true).catch(() => {}) }
      const describe = useCallback(async () => {
        try {
          const refs = [...new Set([info.ref, ...(info.named ? [] : info.entry?.nativeAuth?.env ?? [])])].filter(name => REF.test(name)).slice(0, 64)
          const answer = unwrap(await remote.credentials.describe(refs))
          setDescribed(refs.map(name => ({ name, ...answer[name] })).find(item => item.configured) ?? { name: info.ref, ...answer[info.ref] })
        } catch { setDescribed({ name: info.ref, unknown: true }) }
      }, [info.ref, info.named])
      useEffect(() => { describe() }, [describe])

      const run = async work => {
        setBusy(true); setFailure(null); setNote(null)
        try { await work() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      const saveKey = () => run(async () => {
        const value = keyDraft.trim()
        if (!value) return
        if (!info.configured && info.entry) {
          await writeSettings(remote, info.entry.settingsNs, [{ op: 'set', path: [...info.entry.settingsPath], value: { apiKeyEnv: info.ref } }])
        } else if (!info.named && info.entry?.settingsNs === 'llm-pi-ai') {
          await writeSettings(remote, info.entry.settingsNs, [{ op: 'set', path: [...info.entry.settingsPath, 'apiKeyEnv'], value: info.ref }])
        }
        unwrap(await remote.credentials.set(info.ref, value))
        setKeyDraft(''); setNote(t('key.saved'))
        await describe(); await checkKey(info.provider, info.ref, true, remote); askSpend(info.ref)
      })
      const saveEnv = () => run(async () => {
        const name = envDraft.trim()
        if (name && !REF.test(name)) throw new Error(t('key.envBad'))
        const path = info.configured ? [...info.entry.settingsPath, 'apiKeyEnv'] : [...info.entry.settingsPath]
        const ops = info.configured ? [name ? { op: 'set', path, value: name } : { op: 'unset', path }] : [{ op: 'set', path, value: { apiKeyEnv: name } }]
        await writeSettings(remote, info.entry.settingsNs, ops)
        setNote(name ? t('key.envSaved', { name }) : null)
        await checkKey(info.provider, name || info.ref, true, remote); askSpend(name || info.ref)
      })
      const test = () => run(async () => { await checkKey(info.provider, info.ref, true, remote); askSpend(info.ref) })
      const askBalance = () => run(async () => {
        setBalance(await get(`${API.balance}?provider=${encodeURIComponent(info.provider)}&ref=${encodeURIComponent(info.ref)}`))
      })
      const status = described?.unknown ? 'unknown' : described?.configured ? (described.source === 'env' || described.source === 'environment' ? 'env' : 'stored') : 'missing'
      const offered = state?.providers?.[info.provider]
      const checkText = found?.status ? (found.status === 'ok' && found.models ? t('check.okModels', { count: found.models })
        : t(`check.${found.status}`, { detail: found.detail ?? '' })) : null
      const editable = info.writable && Boolean(info.entry)
      const cash = money => money.currency === 'USD' ? `$${money.amount.toFixed(2)}` : `${money.amount.toFixed(2)} ${money.currency}`
      const spent = spend?.status === 'ok' ? [
        spend.spent ? h('div', { key: 'spent' }, t('usage.spent'), ' ', h('strong', null, cash(spend.spent))) : null,
        spend.credit ? h('div', { key: 'credit' }, t('usage.credit'), ' ', h('strong', null, cash(spend.credit))) : null
      ].filter(Boolean) : []
      return h('div', { className: 'lr-field lr-key' },
        h('span', { className: 'lr-label' }, t('key.title')),
        h('span', { className: 'lr-key-status', 'data-status': status },
          h('span', { className: 'lr-dot' }), h('code', null, described?.name ?? info.ref), ' ', t(`key.${status}`),
          checkText ? h('span', { className: 'lr-check', 'data-check': found.status }, ' · ', checkText) : null),
        h('div', { className: 'lr-row' },
          h('input', { className: 'lr-input', type: 'password', autoComplete: 'new-password', placeholder: t('key.paste'),
            value: keyDraft, disabled: busy || !editable, onChange: event => setKeyDraft(event.target.value),
            onKeyDown: event => { if (event.key === 'Enter') saveKey() } }),
          h('button', { type: 'button', className: 'lr-button', disabled: busy || !keyDraft.trim() || !editable, onClick: saveKey }, t('key.save'))),
        h('div', { className: 'lr-row' },
          h('input', { className: 'lr-input lr-mono', placeholder: `${t('key.envName')} (${info.ref})`, value: envDraft,
            disabled: busy || !editable, onChange: event => setEnvDraft(event.target.value),
            onKeyDown: event => { if (event.key === 'Enter') saveEnv() } }),
          h('button', { type: 'button', className: 'lr-button', disabled: busy || !editable || envDraft.trim() === (info.named ?? ''), onClick: saveEnv }, t('key.envSave'))),
        h('div', { className: 'lr-row' },
          offered || info.entry?.declared ? h('button', { type: 'button', className: 'lr-button', disabled: busy || found?.pending, onClick: test },
            found?.pending ? t('key.testing') : t('key.test')) : null,
          offered?.balance ? h('button', { type: 'button', className: 'lr-button', disabled: busy, onClick: askBalance }, t('balance.button')) : null),
        balance ? h('div', { className: 'lr-balance' },
          balance.missing ? t('balance.missing') : !balance.offered ? t('balance.none')
            : balance.balances.map((item, index) => h('div', { key: index },
              h('strong', null, `${money(item.amount)} ${item.currency}`), ' ',
              h('span', { className: 'lr-dim' }, [
                Number.isFinite(item.granted) && item.granted ? t('balance.granted', { amount: money(item.granted) }) : null,
                Number.isFinite(item.topped) && item.topped ? t('balance.topped', { amount: money(item.topped) }) : null,
                Number.isFinite(item.used) && item.used ? t('balance.used', { amount: money(item.used) }) : null
              ].filter(Boolean).join(' · ')))),
          balance.note ? h('div', { className: 'lr-dim' }, balance.note) : null) : null,
        spent.length ? h('div', { className: 'lr-balance lr-spend' }, spent) : null,
        note ? h('div', { className: 'lr-note' }, note) : null,
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
        spendable ? h(UsageKey, { remote, info, usage: state.providers[info.provider].usage, name: info.entry?.displayName || info.provider, t }) : null)
    }

    /** The provider's spend key (its admin or management key), which may read what the account spent or has left but
     * may not call the models: pasted (kept write-only in DSH's credential store, under the first name the server reads)
     * or in the environment. The roster only reads with it; without one, it asks with the API key. What it reads shows
     * under the API key; only a test says why it was not read. Folded away until opened: it is seldom needed. */
    function UsageKey ({ remote, info, usage, name, t }) {
      const found = useShared().usage[info.provider]
      const [open, setOpen] = useState(false)
      const [described, setDescribed] = useState(null)
      const [keyDraft, setKeyDraft] = useState('')
      const [tested, setTested] = useState(false)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const keys = usage.keys
      const describe = useCallback(async () => {
        try {
          const answer = unwrap(await remote.credentials.describe(keys.filter(key => REF.test(key))))
          setDescribed(keys.map(key => ({ name: key, ...answer[key] })).find(item => item.configured) ?? { name: keys[0], configured: false })
        } catch { setDescribed({ name: keys[0], unknown: true }) }
      }, [keys.join()])
      useEffect(() => { describe() }, [describe])
      const run = async work => {
        setBusy(true); setFailure(null)
        try { await work() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      const test = () => run(async () => { await askUsage(info.provider, info.ref, true); setTested(true) })
      const saveKey = () => run(async () => {
        const value = keyDraft.trim()
        if (!value) return
        unwrap(await remote.credentials.set(keys[0], value))
        setKeyDraft(''); await describe()
        await askUsage(info.provider, info.ref, true); setTested(true)
      })
      const status = described?.unknown ? 'unknown' : described?.configured ? (described.source === 'env' || described.source === 'environment' ? 'env' : 'stored') : 'missing'
      // (a test says which key it read with: this one, or the API key when this one is not set)
      const said = tested && found?.status && !found.pending
        ? `${found.key ? `${found.key}: ` : ''}${t(`check.${found.status}`, { detail: found.detail ?? '' })}` : null
      return h('div', { className: 'lr-usage', 'data-open': open ? '' : undefined },
        h('button', { type: 'button', className: 'lr-usage-toggle', 'aria-expanded': open, onClick: () => setOpen(!open) },
          h('span', { className: 'lr-usage-arrow', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
          h('span', { className: 'lr-label' }, t(`usage.${usage.kind}`)),
          described?.configured ? h('span', { className: 'lr-dim' }, ` · ${t(`key.${status}`)}`) : null),
        open ? h(React.Fragment, null,
          h('span', { className: 'lr-dim' }, t(`usage.${usage.kind}Hint`, { name })),
          h('span', { className: 'lr-key-status', 'data-status': status },
            h('span', { className: 'lr-dot' }), h('code', null, described?.name ?? keys[0]), ' ', t(`key.${status}`),
            said ? h('span', { className: 'lr-check', 'data-check': found.status }, ' · ', said) : null),
          h('div', { className: 'lr-row' },
            h('input', { className: 'lr-input', type: 'password', autoComplete: 'new-password', placeholder: t('key.paste'),
              value: keyDraft, disabled: busy, onChange: event => setKeyDraft(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') saveKey() } }),
            h('button', { type: 'button', className: 'lr-button', disabled: busy || !keyDraft.trim(), onClick: saveKey }, t('key.save')),
            h('button', { type: 'button', className: 'lr-button', disabled: busy || Boolean(found?.pending), onClick: test },
              busy && found?.pending ? t('key.testing') : t('key.test'))),
          failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null) : null)
    }

    /** Whether you are signed in to a DeepSeek account; `withBalance`: and its balance (for the account's own card or a
     * model it serves, not an API key's: that has its own). */
    function AccountNote ({ snapshot, t, withBalance = false }) {
      const signedIn = (snapshot?.groups ?? []).some(group => group.id === ACCOUNT && group.models?.length)
      const balance = useAccountBalance(signedIn && withBalance, t)
      const money = wallet => `${wallet.currency === 'USD' ? '$' : '¥'}${wallet.balance}`
      return h('div', { className: 'lr-note', 'data-account': signedIn ? 'in' : 'out' },
        signedIn ? t('account.signedIn') : t('account.signedOut'),
        balance?.status === 'ready' ? h('div', { className: 'lr-account-balance' }, t('account.balance', {
          amounts: [...balance.value.map(wallet => t('account.topped', { amount: money(wallet) })),
            ...balance.bonusWallets.map(wallet => t('account.granted', { amount: money(wallet) }))].join(' · ') || money({ currency: 'CNY', balance: '0' })
        })) : balance?.status === 'failed' ? h('div', { className: 'lr-dim' }, t('account.balanceFailed')) : null)
    }
    /** The DeepSeek account's balance, as DSH reads it (its account service, with DSH's own version): its topped-up and
     * granted wallets; null while not asked or unknown. */
    function useAccountBalance (signedIn, t) {
      const { account, state } = useShared()
      const [found, setFound] = useState(null)
      const version = state?.dsh?.version
      useEffect(() => {
        if (!account?.getBalance || !signedIn || !version) return
        let live = true
        account.getBalance({ version, locale: String(t('lang')).split('-')[0], timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 })
          .then(result => { if (live) setFound(result?.ok ? result.value : { status: 'failed' }) })
          .catch(() => { if (live) setFound({ status: 'failed' }) })
        return () => { live = false }
      }, [account, signedIn, version])
      return found
    }

    // ---- why calls failed lately ----
    /** A provider's failures kept (its model calls and key checks), the newest first, until a call succeeds again; this
     * model's marked. A Clear button lets them go. */
    function FailureLog ({ provider, model = null, t }) {
      const state = useRosterState()
      const [busy, setBusy] = useState(false)
      const found = failuresOf(state, provider)
      if (!found.length) return null
      const clear = async () => {
        setBusy(true)
        try { const answer = await post(API.failures, { clear: provider }); bump({ state: { ...shared.state, failures: answer.failures } }) } catch { /* as it was */ } finally { setBusy(false) }
      }
      return h('div', { className: 'lr-failures', role: 'status' },
        h('div', { className: 'lr-row lr-between' },
          h('span', { className: 'lr-label' }, t('failures.title')),
          h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy, onClick: clear }, t('failures.clear'))),
        h('ul', null, found.map((entry, index) => h('li', { key: index, 'data-mine': model && entry.model && bare(entry.model) === bare(model) ? '' : undefined },
          h('span', { className: 'lr-failure-code' }, failureName(entry.code, t)),
          entry.status ? h('span', { className: 'lr-dim' }, ` HTTP ${entry.status}`) : null,
          entry.model ? h('code', null, ` ${entry.model}`) : entry.source === 'check' ? h('span', { className: 'lr-dim' }, ` ${t('failures.check')}`) : null,
          entry.count > 1 ? h('span', { className: 'lr-dim' }, ` ×${entry.count}`) : null,
          h('span', { className: 'lr-dim lr-failure-when' }, ` · ${whenOf(entry.at)}`),
          entry.message ? h('div', { className: 'lr-failure-message' }, entry.message) : null))),
        h('div', { className: 'lr-dim' }, t('failures.hint')))
    }
    /** A failure's code as people read it (DSH's codes; others as they are). */
    const failureName = (code, t) => { const word = t(`failures.code.${code}`); return word === `failures.code.${code}` ? code : word }
    /** A time as people read it: today's by the clock, else its day. */
    const whenOf = at => {
      const day = new Date(at)
      if (Number.isNaN(day.getTime())) return ''
      return day.toDateString() === new Date().toDateString() ? day.toTimeString().slice(0, 5) : day.toISOString().slice(0, 10)
    }

    // ---- a character's page ----
    function Stat ({ label, value, scale = 70, small = false }) {
      return h('div', { className: `lr-stat${small ? ' lr-stat-small' : ''}` },
        h('span', { className: 'lr-stat-label' }, label),
        h('span', { className: 'lr-stat-bar' }, value === null || value === undefined ? null
          : h('span', { style: { width: `${Math.max(2, Math.min(100, value / scale * 100))}%` } })),
        h('span', { className: 'lr-stat-value' }, value ?? '–'))
    }

    function CharacterPage ({ remote, directory, available, card: initial, onBack, onPicked, t }) {
      const { snapshot, state, providers, catalog, cards } = useCards(directory, remote)
      const listed = (initial.lineupId && cards.find(item => item.lineupId === initial.lineupId)) ??
        cards.find(item => (item.routes ?? [item]).some(route => route.provider === initial.provider && route.id === initial.id)) ??
        (initial.lineupId ? cards.find(item => sameModel(item.id, initial.lineupId)) : undefined)
      const [routeChoice, setRouteChoice] = useState(null)
      const routes = listed?.routes ?? null
      const chosen = routes?.find(route => route.provider === routeChoice) ?? null
      const card = chosen ? { ...listed, provider: chosen.provider, providerName: chosen.providerName, id: chosen.id, name: chosen.name }
        : listed ?? initial
      const lookup = useResolved([card])
      const found = lookup(card)
      const [preview, setPreview] = useState(null)
      const [picker, setPicker] = useState(null)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const info = providerInfo(providers, card.provider)
      const current = snapshot.pending ?? snapshot.current
      const inSession = current?.provider === card.provider && current?.model === card.id
      const rarity = rarityOf(found, state)
      const aa = found?.aa
      const name = card.source === 'catalog' ? card.name : (found?.name ?? card.name ?? card.id)
      const shownArt = preview ?? found?.art
      useEffect(() => setPreview(null), [found?.art])

      const run = async work => {
        setBusy(true); setFailure(null)
        try { await work() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      const use = () => run(async () => {
        if (card.status === 'unused') {
          await addModel(remote, card.provider, { id: card.id }, { catalog: catalog.filter(model => model.provider === card.provider),
            keyName: shared.checks[card.provider]?.key })
        }
        if (!available) throw new Error(t('roster.unavailable'))
        const result = await directory.select({ provider: card.provider, model: card.id })
        if (result && result.ok === false) throw new Error(result.error?.message ?? 'refused')
        onPicked()
      })
      const ignore = () => run(async () => {
        const current = info.used ?? catalog.filter(model => model.provider === card.provider).map(model => ({ id: model.id }))
        await writeSettings(remote, info.entry.settingsNs, [{ op: 'set', path: [...info.entry.settingsPath, 'models'],
          value: current.filter(model => modelId(model) !== card.id) }])
        onBack()
      })
      const equip = art => run(async () => { await post(API.pick, { model: `${card.provider}/${card.id}`, art }); forgetResolved() })
      const gallery = found?.character ? [...(state?.characters?.[found.character]?.pictures ?? [])] : []
      if (found?.art && !gallery.includes(found.art)) gallery.push(found.art)
      const canUse = card.status === 'ready' || card.status === 'unused'

      return h('div', { className: 'lr-page-character', 'data-rarity': rarity },
        h('div', { className: 'lr-page-top' },
          h('button', { type: 'button', className: 'lr-button lr-small', onClick: onBack }, `‹ ${t('back')}`)),
        h('div', { className: 'lr-character' },
          h('div', { className: 'lr-character-art' },
            h('div', { className: 'lr-showcase lr-tilt', 'data-rarity': rarity, 'data-status': card.status },
              h(Art, { key: shownArt ?? '', art: shownArt, label: name, className: 'lr-showcase-art' }),
              rarity === 'UR' || rarity === 'SSR' ? h('span', { className: 'lr-holo', 'aria-hidden': 'true' }) : null,
              h('span', { className: 'lr-rarity lr-rarity-big' }, rarity),
              h('span', { className: 'lr-gloss', 'aria-hidden': 'true' })),
            gallery.length ? h('div', { className: 'lr-gallery' },
              h('span', { className: 'lr-label' }, t('page.gallery')),
              h('div', { className: 'lr-gallery-row' }, gallery.map(picture =>
                h('button', { key: picture, type: 'button', className: `lr-thumb${shownArt === picture ? ' lr-on' : ''}`,
                  title: pictureLabel(state, picture, t),
                  onClick: () => setPreview(picture === found?.art ? null : picture) }, h('img', { src: pictureUrl(picture, null, true), alt: '' })))),
              preview && preview !== found?.art ? h('button', { type: 'button', className: 'lr-button lr-primary', disabled: busy,
                onClick: () => equip(preview) }, t('page.equip')) : null) : null),
          h('div', { className: 'lr-character-info' },
            h('div', { className: 'lr-character-head' },
              h(Face, { face: found?.face, label: name, size: 56, className: 'lr-face-big' }),
              h('div', null,
                h('div', { className: 'lr-card-who lr-who-dark' }, whoOf(found, state, t) ?? card.providerName),
                h('h2', { className: 'lr-character-name' }, name),
                h('div', { className: 'lr-dim' }, `${card.providerName} · `, h('code', null, card.id)),
                found?.released ? h('div', { className: 'lr-dim lr-date' }, found.releasedSeen ? t('released.seen', { date: found.released })
                  : t('page.released', { date: found.released })) : null)),
            h('div', { className: 'lr-status-line', 'data-status': card.status },
              inSession ? t('page.inUse') : t(`status.${card.status}`)),
            routes?.length > 1 ? h('div', { className: 'lr-field' },
              h('span', { className: 'lr-label' }, t('page.route')),
              h('div', { className: 'lr-chips' }, routes.map(route => h('button', { key: route.provider, type: 'button',
                className: `lr-chip${route.provider === card.provider ? ' lr-on' : ''}`, onClick: () => setRouteChoice(route.provider) },
              route.provider === ACCOUNT ? t('page.routeAccount') : t('page.routeKey'))))) : null,
            h('div', { className: 'lr-row' },
              h('button', { type: 'button', className: 'lr-button lr-primary lr-big', disabled: busy || !canUse || inSession, onClick: use },
                card.status === 'unused' ? t('page.useAdd') : t('page.use')),
              !canUse ? h('span', { className: 'lr-dim' }, card.status === 'absent'
                ? t('status.absentHint', { provider: card.providerName }) : t('page.needKey')) : null),
            failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
            h('section', { className: 'lr-section' },
              h('h3', null, t('page.stats')),
              aa ? h(React.Fragment, null,
                h(Stat, { label: t('page.intelligence'), value: aa.intelligence }),
                // their six capability indexes, as a character's stats
                CAPABILITIES.filter(name => aa.capabilities?.[name] !== undefined).map(name =>
                  h(Stat, { key: name, label: t(`cap.${name}`), value: aa.capabilities[name], small: true })),
                h('dl', { className: 'lr-facts' },
                  h('dt', null, t('page.rank')), h('dd', null, t('roster.rank', { rank: aa.rank, of: aa.of })),
                  fact(t('page.taskCost'), aa.taskCost, value => `$${money(value)}`),
                  fact(t('page.taskTime'), aa.taskTime, duration),
                  fact(t('page.taskTokens'), aa.taskTokens, value => t('page.tokensValue', { tokens: count(value) })),
                  fact(t('page.indexCost'), aa.indexCost, value => `$${Math.round(value).toLocaleString()}`),
                  aa.input !== null ? h(React.Fragment, null, h('dt', null, t('page.price')), h('dd', null, `${money(aa.input)} / ${money(aa.output)}`)) : null,
                  aa.speed ? h(React.Fragment, null, h('dt', null, t('page.speed')), h('dd', null, t('page.speedValue', { speed: aa.speed }))) : null,
                  fact(t('page.latency'), aa.latency, value => t('page.latencyValue', { time: value < 10 ? `${value.toFixed(1)} s` : duration(value) })),
                  aa.efforts?.length ? h(React.Fragment, null, h('dt', null, t('page.efforts')),
                    h('dd', null, h('span', { className: 'lr-pills' }, aa.efforts.map(effort => h('span', { key: effort.effort, className: 'lr-effort' },
                      `${effort.effort} ${effort.intelligence}${effort.taskCost ? ` · $${money(effort.taskCost)}` : ''}`))))) : null),
                h(Credit, { state, t })) : h('div', { className: 'lr-dim' }, t('page.noStats'))),
            h('section', { className: 'lr-section' },
              h('h3', null, t('page.equipment')),
              h('div', { className: 'lr-equip' },
                h('div', { className: 'lr-equip-slot' },
                  h('span', { className: 'lr-label' }, t('page.art')),
                  h('span', { className: 'lr-equip-art' }, h(Art, { art: found?.art, label: name, thumb: true })),
                  h('button', { type: 'button', className: 'lr-button lr-small', onClick: () => setPicker('art') }, t('page.change'))),
                h('div', { className: 'lr-equip-slot' },
                  h('span', { className: 'lr-label' }, t('page.avatar')),
                  h(Face, { face: found?.face, label: name, size: 48 }),
                  h('button', { type: 'button', className: 'lr-button lr-small', onClick: () => setPicker('face') }, t('page.change')))),
              h('div', { className: 'lr-field' },
                h('span', { className: 'lr-label' }, t('page.roster')),
                h('div', { className: 'lr-row' },
                  h('span', null, card.source === 'catalog' ? t('page.rosterUsed') : t('page.rosterIgnored')),
                  card.source === 'catalog' && info.entry && card.provider !== ACCOUNT
                    ? h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy || !info.writable, onClick: ignore }, t('page.ignore')) : null))),
            card.source === 'lineup' && card.character ? h(Through, { remote, state, providers, snapshot, character: card.character, t }) : null,
            h('section', { className: 'lr-section' },
              h('h3', null, `${t('page.provider')}: ${card.providerName}`),
              card.provider.startsWith('deepseek') ? h(AccountNote, { snapshot, t, withBalance: card.provider === ACCOUNT }) : null,
              h(FailureLog, { provider: card.provider, model: card.id, t }),
              card.provider !== ACCOUNT && info.entry ? h(KeySection, { remote, info, t }) : null))),
        picker ? h(PicturePicker, { kind: picker, model: { provider: card.provider, id: card.id, name }, onClose: () => setPicker(null), t }) : null)
    }

    // ---- which provider a character's lineup goes through ----
    /** The providers a character can go through: her own, the native ones DSH can route, OpenRouter, and the
     * OpenAI-compatible endpoints you added. */
    function throughOptions (state, providers, character) {
      const about = state?.characters?.[character]
      if (!about) return []
      const entries = providers?.entries ?? []
      const can = provider => entries.some(entry => entry.provider === provider)
      const compatible = entries.filter(entry => entry.declared && /^openai-/.test(String(providerInfo(providers, entry.provider).profile.api ?? '')))
        .map(entry => entry.provider)
      return [...new Set([about.home, ...(about.providers ?? []).filter(can), ...(can('openrouter') ? ['openrouter'] : []), ...compatible])]
    }

    function Through ({ remote, state, providers, snapshot, character, t }) {
      const [adding, setAdding] = useState(false)
      const [failure, setFailure] = useState(null)
      const about = state?.characters?.[character]
      const via = state?.routes?.[character] ?? about?.home
      const choose = async provider => {
        setFailure(null)
        try {
          await post(API.route, { character, provider })
          await loadState()
          if (provider !== about.home) await loadRouteModels(remote, provider)
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      const proposals = (state?.lineup ?? []).filter(item => item.character === character).map(item => bare(item.id))
      return h('section', { className: 'lr-section' },
        h('h3', null, t('page.through')),
        h('span', { className: 'lr-dim' }, t('page.throughHint', { name: characterName(state, character, t) })),
        h('div', { className: 'lr-chips' },
          throughOptions(state, providers, character).map(provider => h('button', { key: provider, type: 'button',
            className: `lr-chip${provider === via ? ' lr-on' : ''}`, onClick: () => choose(provider) },
          provider === about?.home ? t('page.throughOwn', { provider: providerName(provider, snapshot, providers) }) : providerName(provider, snapshot, providers))),
          h('button', { type: 'button', className: `lr-chip${adding ? ' lr-on' : ''}`, onClick: () => setAdding(!adding) }, t('page.addCompatible'))),
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        adding ? h(CompatibleForm, { remote, t, proposals, onCancel: () => setAdding(false),
          onCreated: async provider => { setAdding(false); await choose(provider) } }) : null)
    }

    /** A new OpenAI-compatible endpoint (a relay, a gateway, a server of yours): a pi-ai route speaking OpenAI Chat
     * Completions, its key stored write-only (or the variable holding it named), and the models you choose of what DSH
     * finds there (`proposals` chosen first), or typed. */
    function CompatibleForm ({ remote, t, proposals = [], onCreated, onCancel }) {
      const providers = useProviders(remote)
      const [name, setName] = useState('')
      const [baseURL, setBaseURL] = useState('')
      const [key, setKey] = useState('')
      const [env, setEnv] = useState('')
      const [found, setFound] = useState(null)
      const [chosen, setChosen] = useState(() => new Set())
      const [typed, setTyped] = useState(proposals.join(', '))
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const dateOf = useReleasedDates((found ?? []).map(model => model.id))
      const shownFound = found ? [...found].sort(newestFirst(dateOf)) : null
      const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63)
      const validURL = /^https?:\/\/\S+$/i.test(baseURL.trim())
      const run = async work => {
        setBusy(true); setFailure(null)
        try { await work() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      const find = () => run(async () => {
        if (!validURL) throw new Error(t('compat.badURL'))
        const models = unwrap(await remote.llm.discoverModels('llm-pi-ai', { baseURL: baseURL.trim(), api: 'openai-completions',
          ...(key.trim() ? { apiKey: key.trim() } : {}) }))
        setFound(models)
        const wanted = new Set(proposals.map(slugOf))
        setChosen(new Set(models.filter(model => formsOf(model.id).some(form => wanted.has(form))).map(model => model.id)))
      })
      const toggle = model => setChosen(previous => {
        const next = new Set(previous)
        if (next.has(model)) next.delete(model); else next.add(model)
        return next
      })
      const save = () => run(async () => {
        if (!id) throw new Error(t('compat.needName'))
        if (!validURL) throw new Error(t('compat.badURL'))
        if (providers?.entries?.some(entry => entry.provider === id)) throw new Error(t('compat.taken'))
        if (env.trim() && !REF.test(env.trim())) throw new Error(t('key.envBad'))
        const ids = found ? [...chosen] : typed.split(/[\s,]+/).map(item => item.trim()).filter(Boolean)
        if (!ids.length) throw new Error(t('compat.pick'))
        const ref = env.trim() || deriveKeyRef(id)
        const models = ids.map(model => {
          const about = found?.find(item => item.id === model) ?? {}
          return Object.fromEntries(Object.entries({ id: model, name: about.name, contextWindow: about.contextWindow, maxTokens: about.maxTokens })
            .filter(([, value]) => value !== undefined && value !== null && value !== ''))
        })
        await writeSettings(remote, 'llm-pi-ai', [{ op: 'set', path: ['providers', id], value: { displayName: name.trim(),
          api: 'openai-completions', baseURL: baseURL.trim(), apiKeyEnv: ref, models } }])
        if (key.trim()) unwrap(await remote.credentials.set(ref, key.trim()))
        await onCreated?.(id)
      })
      return h('div', { className: 'lr-compat' },
        h('strong', null, t('compat.title')),
        h('span', { className: 'lr-dim' }, t('compat.hint')),
        h('label', { className: 'lr-field' }, h('span', { className: 'lr-label' }, t('compat.name')),
          h('input', { className: 'lr-input', value: name, placeholder: 'My gateway', onChange: event => setName(event.target.value) })),
        h('label', { className: 'lr-field' }, h('span', { className: 'lr-label' }, t('compat.baseURL')),
          h('input', { className: 'lr-input lr-mono', value: baseURL, placeholder: 'https://gateway.example/v1', onChange: event => setBaseURL(event.target.value) })),
        h('div', { className: 'lr-row' },
          h('input', { className: 'lr-input', type: 'password', autoComplete: 'new-password', placeholder: t('compat.key'), value: key,
            onChange: event => setKey(event.target.value) }),
          h('input', { className: 'lr-input lr-mono', placeholder: t('compat.env'), value: env, onChange: event => setEnv(event.target.value) })),
        h('div', { className: 'lr-row' },
          h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy || !validURL, onClick: find }, t('compat.find')),
          found ? h('span', { className: 'lr-dim' }, t('compat.found', { count: found.length })) : null),
        shownFound ? h('div', { className: 'lr-pills' }, shownFound.slice(0, 200).map(model => h('button', { key: model.id, type: 'button',
          className: `lr-pill ${chosen.has(model.id) ? 'lr-used lr-static' : 'lr-ignored'}`, onClick: () => toggle(model.id),
          title: dateOf.seen(model.id) ? t('released.seen', { date: dateOf(model.id) }) : undefined }, model.id,
          dateOf(model.id) ? h('span', { className: 'lr-pill-date' }, dateOf.label(model.id)) : null)))
          : h('label', { className: 'lr-field' }, h('span', { className: 'lr-label' }, t('compat.models')),
            h('input', { className: 'lr-input lr-mono', value: typed, onChange: event => setTyped(event.target.value) })),
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
        h('div', { className: 'lr-row' },
          h('button', { type: 'button', className: 'lr-button lr-primary', disabled: busy || !id || !validURL, onClick: save }, t('compat.add')),
          onCancel ? h('button', { type: 'button', className: 'lr-button', onClick: onCancel }, t('cancel')) : null))
    }

    // ---- adding a model the lineup does not have ----
    function AddPage ({ remote, directory, onBack, onDone, t }) {
      const snapshot = useDirectory(directory)
      const providers = useProviders(remote)
      const state = useRosterState()
      const catalog = catalogOf(snapshot)
      const parked = state?.parked ?? {}
      const options = (providers?.entries ?? []).filter(entry => entry.provider !== ACCOUNT && providers.namespaces.has(entry.settingsNs))
      const [provider, setProvider] = useState('')
      const [model, setModel] = useState('')
      const [name, setName] = useState('')
      const [art, setArt] = useState(null)
      const [face, setFace] = useState(null)
      const [found, setFound] = useState([])
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const dateOf = useReleasedDates(found.map(model => model.id))
      const suggestions = [...found].sort(newestFirst(dateOf)) // (the suggestions open on the newest)
      useEffect(() => {
        if (!provider && options.length) setProvider((options.find(entry => providerInfo(providers, entry.provider).configured) ?? options[0]).provider)
      }, [options.length])
      const info = providerInfo(providers, provider)
      const run = async work => {
        setBusy(true); setFailure(null)
        try { await work() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      const fetchModels = live => run(async () => {
        const models = live
          ? (await get(`${API.live}?provider=${encodeURIComponent(provider)}&ref=${encodeURIComponent(info.ref)}`)).models
          : unwrap(await remote.llm.discoverModels(info.entry.settingsNs, { provider }))
        setFound(models)
      })
      const save = () => run(async () => {
        const id = model.trim()
        if (!id) throw new Error(t('add.needModel'))
        const fetched = found.find(item => item.id === id) ?? {}
        await addModel(remote, provider, { ...fetched, id, name: name.trim() || fetched.name },
          { catalog: catalog.filter(item => item.provider === provider), keyName: shared.checks[provider]?.key })
        if (art !== null || face !== null) await post(API.pick, { model: `${provider}/${id}`, ...(art !== null ? { art } : {}), ...(face !== null ? { face } : {}) })
        forgetResolved()
        onDone({ provider, id, name: name.trim() || fetched.name || id, providerName: providerName(provider, snapshot, providers) })
      })
      const configured = entry => providerInfo(providers, entry.provider).configured && !parked[entry.provider]
      return h('div', { className: 'lr-page-add' },
        h('div', { className: 'lr-page-top' },
          h('button', { type: 'button', className: 'lr-button lr-small', onClick: onBack }, `‹ ${t('back')}`),
          h('h2', { className: 'lr-page-title' }, t('add.title'))),
        h('p', { className: 'lr-dim' }, t('add.intro')),
        !providers?.view ? h('div', { className: 'lr-empty' }, t('models.loading')) : h(React.Fragment, null,
          h('label', { className: 'lr-field' },
            h('span', { className: 'lr-label' }, t('add.provider')),
            h('select', { className: 'lr-input lr-select', value: provider, onChange: event => { setProvider(event.target.value); setFound([]) } },
              options.map(entry => h('option', { key: entry.provider, value: entry.provider },
                configured(entry) ? (entry.displayName || entry.provider) : t('add.newProvider', { name: entry.displayName || entry.provider }))),
              h('option', { value: COMPATIBLE }, t('add.compatible')))),
          provider === COMPATIBLE ? h(CompatibleForm, { remote, t, proposals: model.trim() ? [model.trim()] : [],
            onCreated: async id => { setProvider(id); setFound([]) } }) : null,
          provider && provider !== COMPATIBLE ? h('div', { className: 'lr-field' },
            h('span', { className: 'lr-label' }, t('add.model')),
            h('div', { className: 'lr-row' },
              h('input', { className: 'lr-input lr-mono', list: 'lr-add-models', placeholder: t('add.modelHint'), value: model,
                onChange: event => setModel(event.target.value) }),
              h('datalist', { id: 'lr-add-models' }, suggestions.map(item => h('option', { key: item.id, value: item.id },
                [item.name ?? item.id, dateOf.label(item.id)].filter(Boolean).join(' · ')))),
              h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy || !info.entry, onClick: () => fetchModels(false) }, t('fetch.catalog')),
              state?.providers?.[provider]?.models ? h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy,
                title: t('fetch.liveTitle'), onClick: () => fetchModels(true) }, t('fetch.live')) : null),
            found.length ? h('span', { className: 'lr-dim' }, t('fetch.found', { count: found.length })) : null) : null,
          h('label', { className: 'lr-field' },
            h('span', { className: 'lr-label' }, t('add.name')),
            h('input', { className: 'lr-input', value: name, onChange: event => setName(event.target.value) })),
          provider && provider !== COMPATIBLE && !info.configured && info.entry ? h('div', { className: 'lr-section' }, h(KeySection, { remote, info, t })) : null,
          h('div', { className: 'lr-add-pictures' },
            h('div', { className: 'lr-field' }, h('span', { className: 'lr-label' }, t('add.art')),
              h(PictureTiles, { kind: 'art', value: art, onChoose: setArt, t, defaultLabel: t('add.auto') })),
            h('div', { className: 'lr-field' }, h('span', { className: 'lr-label' }, t('add.avatar')),
              h(PictureTiles, { kind: 'face', value: face, onChoose: setFace, t, defaultLabel: t('add.sameAsArt') }))),
          failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
          h('div', { className: 'lr-row lr-sticky' },
            h('button', { type: 'button', className: 'lr-button lr-primary lr-big', disabled: busy || !provider || provider === COMPATIBLE || !model.trim(), onClick: save },
              busy ? t('add.saving') : t('add.save')))))
    }

    // ---- Models & keys ----
    function ProviderCard ({ remote, info, snapshot, catalogNames, t }) {
      const { entry } = info
      const [found, setFound] = useState(null) // discovered models: [{ id, name, ..., live }]
      const [filter, setFilter] = useState('')
      const [busy, setBusy] = useState(false)
      const [note, setNote] = useState(null)
      const [failure, setFailure] = useState(null)
      const [faceFor, setFaceFor] = useState(null)
      const [order, setOrder] = useState('released')
      const dateOf = useReleasedDates((found ?? []).map(model => model.id))
      const [removing, setRemoving] = useState(false)
      const [dropKey, setDropKey] = useState(false)
      const run = async work => {
        setBusy(true); setFailure(null); setNote(null)
        try { await work() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      const merge = (previous, models) => {
        const all = new Map((previous ?? []).map(model => [model.id, model]))
        for (const model of models) all.set(model.id, { ...all.get(model.id), ...model, live: all.get(model.id)?.live === false ? false : model.live })
        return [...all.values()]
      }
      const fetchCatalog = useCallback(async quiet => {
        try {
          const models = unwrap(await remote.llm.discoverModels(entry.settingsNs, { provider: entry.provider }))
          setFound(previous => merge(previous, models.map(model => ({ ...model, live: false }))))
          if (!quiet) setNote(t('fetch.found', { count: models.length }))
        } catch (error) { if (!quiet) setFailure(t('failed', { error: errorText(error) })) }
      }, [entry.provider, entry.settingsNs])
      useEffect(() => { fetchCatalog(true) }, [fetchCatalog])
      const fetchLive = () => run(async () => {
        const answer = await get(`${API.live}?provider=${encodeURIComponent(entry.provider)}&ref=${encodeURIComponent(info.ref)}`)
        setFound(previous => merge(previous, answer.models.map(model => ({ ...model, live: true }))))
        setNote(t('fetch.found', { count: answer.models.length }))
      })

      // Used: the profile's model list; without one, the provider's whole catalog (as DSH's picker shows it).
      const catalog = catalogNames ?? []
      const state = useRosterState()
      const leftOut = info.used ? [] : catalog.filter(model => ignoredByDefault(state, model.id))
      const usedIds = info.used ? info.used.map(modelId) : usedByDefault(state, catalog).map(model => model.id)
      const usedSet = new Set(usedIds)
      // Ignored: newest first (or by name), so a long list (OpenRouter's) opens on the models that just came out
      const ignored = (found ?? []).filter(model => !usedSet.has(model.id))
        .sort(order === 'released' ? newestFirst(dateOf) : (one, other) => one.id.localeCompare(other.id))
      const shownIgnored = ignored.filter(model => !filter || `${model.id} ${model.name ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
      const nameOf = id => catalog.find(model => model.id === id)?.name ?? found?.find(model => model.id === id)?.name ?? id
      const lookup = useResolved(usedIds.map(id => ({ provider: entry.provider, id })))
      const writeModels = value => writeSettings(remote, entry.settingsNs, [value === undefined
        ? { op: 'unset', path: [...entry.settingsPath, 'models'] } : { op: 'set', path: [...entry.settingsPath, 'models'], value }])

      // Every model ignored: DeepSeek's own section takes an empty list; a pi-ai route with no list serves its whole
      // catalog, so it is set aside whole (kept in the roster's file) and put back as it was.
      const parkable = info.removable && entry.settingsNs === 'llm-pi-ai'
      const canIgnoreAll = entry.settingsNs === 'llm-deepseek' || parkable
      async function ignoreAll () {
        if (entry.settingsNs === 'llm-deepseek') return writeModels([])
        const profile = getPath(info.namespace.user ?? info.namespace.value, entry.settingsPath) ?? info.profile
        await post(API.park, { provider: entry.provider, ns: entry.settingsNs, path: entry.settingsPath, profile })
        try {
          await writeSettings(remote, entry.settingsNs, [{ op: 'unset', path: [...entry.settingsPath] }])
        } catch (error) { await post(API.unpark, { provider: entry.provider }); throw error } finally { await loadState() }
      }
      const move = (id, toUsed) => run(async () => {
        const current = info.used ?? usedByDefault(state, catalog).map(model => ({ id: model.id }))
        if (toUsed) {
          const model = found?.find(item => item.id === id) ?? { id }
          const entryOf = model.live
            ? Object.fromEntries(Object.entries({ id: model.id, name: model.name, contextWindow: model.contextWindow,
                maxTokens: model.maxTokens }).filter(([, value]) => value !== undefined && value !== null))
            : { id: model.id }
          await writeModels([...current, entryOf])
        } else {
          const next = current.filter(model => modelId(model) !== id)
          if (!next.length && canIgnoreAll) return ignoreAll()
          if (!next.length) throw new Error(t('models.ignoreAllFixed'))
          await writeModels(next)
        }
      })
      const remove = () => run(async () => {
        if (dropKey) unwrap(await remote.credentials.unset(info.ref))
        await writeSettings(remote, entry.settingsNs, [{ op: 'unset', path: [...entry.settingsPath] }])
        bump({ checks: { ...shared.checks, [entry.provider]: undefined } })
        setRemoving(false)
      })

      return h('section', { className: 'lr-provider', 'data-provider': entry.provider },
        h('header', { className: 'lr-provider-head' },
          h('span', { className: 'lr-provider-name' }, entry.displayName || entry.provider),
          h('code', { className: 'lr-dim' }, entry.provider),
          h('span', { className: 'lr-spacer' }),
          h('button', { type: 'button', className: 'lr-button lr-small lr-danger', disabled: busy || !info.removable || !info.writable,
            title: info.removable ? undefined : t('models.removeFixed'), onClick: () => setRemoving(true) }, t('models.remove'))),
        removing ? h('div', { className: 'lr-confirm', role: 'alertdialog' },
          h('span', null, t('models.removeConfirm', { name: entry.displayName || entry.provider })),
          h('label', { className: 'lr-check-row' }, h('input', { type: 'checkbox', checked: dropKey, onChange: event => setDropKey(event.target.checked) }),
            t('models.removeKey')),
          h('div', { className: 'lr-row' },
            h('button', { type: 'button', className: 'lr-button lr-danger-solid', disabled: busy, onClick: remove }, t('models.removeYes')),
            h('button', { type: 'button', className: 'lr-button', onClick: () => setRemoving(false) }, t('cancel')))) : null,
        entry.provider === 'deepseek-official' ? h(AccountNote, { snapshot, t }) : null,
        h(KeySection, { remote, info, t }),
        h(FailureLog, { provider: entry.provider, t }),
        h('div', { className: 'lr-field' },
          h('div', { className: 'lr-row lr-between' },
            h('span', { className: 'lr-label' }, t('used.title', { count: usedIds.length })),
            h('span', { className: 'lr-row' },
              h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy || !info.writable || !info.used,
                onClick: () => run(() => writeModels(undefined)) }, t('models.useAll')),
              h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy || !info.writable || !canIgnoreAll,
                title: canIgnoreAll ? undefined : t('models.ignoreAllFixed'), onClick: () => run(ignoreAll) }, t('models.ignoreAll')))),
          info.used ? null : h('div', { className: 'lr-dim' }, t('used.all', { count: usedIds.length }),
            leftOut.length ? ` ${t('used.leftOut', { count: leftOut.length })}` : null),
          h('div', { className: 'lr-pills' }, usedIds.map(id => h('span', { key: id, className: 'lr-pill lr-used' },
            h('button', { type: 'button', className: 'lr-pill-face', title: `${t('page.avatar')}: ${t('page.change')}`, 'aria-label': `${t('page.avatar')}: ${id}`,
              onClick: () => setFaceFor({ provider: entry.provider, id, name: nameOf(id) }) },
            h(Face, { face: lookup({ provider: entry.provider, id })?.face, label: id, size: 20 })),
            h('button', { type: 'button', className: 'lr-pill-text', disabled: busy || !info.writable, title: id,
              onClick: () => move(id, false) }, nameOf(id)))))),
        h('div', { className: 'lr-field' },
          h('div', { className: 'lr-row lr-between' },
            h('span', { className: 'lr-label' }, t('ignored.title', { count: ignored.length })),
            h('span', { className: 'lr-row' },
              h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy, onClick: () => fetchCatalog(false) }, t('fetch.catalog')),
              shared.state?.providers?.[entry.provider]?.models ? h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy,
                title: t('fetch.liveTitle'), onClick: fetchLive }, t('fetch.live')) : null)),
          ignored.length ? h('div', { className: 'lr-row' },
            ignored.length > 12 ? h('input', { className: 'lr-input lr-small-input', placeholder: t('ignored.filter'), value: filter,
              onChange: event => setFilter(event.target.value) }) : null,
            h('span', { className: 'lr-chips' }, ['released', 'name'].map(id => h('button', { key: id, type: 'button',
              className: `lr-chip${order === id ? ' lr-on' : ''}`, onClick: () => setOrder(id) }, t(`ignored.sort.${id}`))))) : null,
          ignored.length ? h('div', { className: 'lr-pills' }, shownIgnored.slice(0, 150).map(model => h('button', {
            key: model.id, type: 'button', className: 'lr-pill lr-ignored', disabled: busy || !info.writable,
            title: [model.name ?? model.id, dateOf.seen(model.id) ? t('released.seen', { date: dateOf(model.id) }) : dateOf(model.id)]
              .filter(Boolean).join(' · '), onClick: () => move(model.id, true)
          }, model.id, dateOf(model.id) ? h('span', { className: 'lr-pill-date' }, dateOf.label(model.id)) : null,
          model.live && !(found ?? []).some(item => item.id === model.id && item.live === false)
            ? h('span', { className: 'lr-new' }, t('fetch.newTag')) : null)),
          shownIgnored.length > 150 ? h('span', { className: 'lr-dim' }, t('ignored.more', { count: shownIgnored.length - 150 })) : null)
            : h('div', { className: 'lr-dim' }, t('ignored.none'))),
        note ? h('div', { className: 'lr-note' }, note) : null,
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
        faceFor ? h(PicturePicker, { kind: 'face', model: faceFor, onClose: () => setFaceFor(null), t }) : null)
    }

    function ParkedCard ({ remote, provider, parked, providers, t }) {
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const label = providers?.entries?.find(entry => entry.provider === provider)?.displayName ?? provider
      const restore = async () => {
        setBusy(true); setFailure(null)
        try {
          await writeSettings(remote, parked.ns, [{ op: 'set', path: parked.path, value: parked.profile ?? {} }])
          await post(API.unpark, { provider }); await loadState()
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      return h('section', { className: 'lr-provider lr-parked', 'data-provider': provider },
        h('header', { className: 'lr-provider-head' },
          h('span', { className: 'lr-provider-name' }, label), h('code', { className: 'lr-dim' }, provider), h('span', { className: 'lr-spacer' }),
          h('button', { type: 'button', className: 'lr-button lr-small lr-primary', disabled: busy, onClick: restore }, t('parked.restore'))),
        h('div', null, h('strong', null, t('parked.title')), ' ', h('span', { className: 'lr-dim' }, t('parked.hint'))),
        failure ? h('div', { className: 'lr-error' }, failure) : null)
    }

    function ModelsTab ({ remote, directory, t }) {
      const state = useRosterState()
      const providers = useProviders(remote)
      const snapshot = useDirectory(directory)
      const [adding, setAdding] = useState(false)
      const [compatible, setCompatible] = useState(false)
      const [failure, setFailure] = useState(null)
      useEffect(() => { directory.load().catch(() => {}) }, [directory])
      if (providers?.error && !providers.view) return h('div', { className: 'lr-error' }, t('failed', { error: providers.error }))
      if (!providers?.view) return h('div', { className: 'lr-empty' }, t('models.loading'))
      const parked = state?.parked ?? {}
      const rows = providers.entries.filter(entry => providers.namespaces.has(entry.settingsNs))
      const infos = rows.map(entry => providerInfo(providers, entry.provider))
      const configured = infos.filter(info => info.configured && info.provider !== ACCOUNT)
      const addable = infos.filter(info => !info.configured && !info.whole && !parked[info.provider])
      const account = providers.entries.find(entry => entry.provider === ACCOUNT)
      const writable = providers.view.writable !== false
      const add = async provider => {
        if (provider === COMPATIBLE) return setCompatible(true)
        const info = addable.find(item => item.provider === provider)
        if (!info) return
        setAdding(true); setFailure(null)
        try { await writeSettings(remote, info.entry.settingsNs, [{ op: 'set', path: [...info.entry.settingsPath], value: {} }]) } catch (error) {
          setFailure(t('failed', { error: errorText(error) }))
        } finally { setAdding(false) }
      }
      return h('div', { className: 'lr-models' },
        h('p', { className: 'lr-dim lr-intro' }, t('models.intro')),
        writable ? null : h('div', { className: 'lr-note' }, t('models.readOnly')),
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        account ? h('section', { className: 'lr-provider', 'data-provider': ACCOUNT },
          h('header', { className: 'lr-provider-head' }, h('span', { className: 'lr-provider-name' }, t('account.title')),
            h('code', { className: 'lr-dim' }, ACCOUNT)),
          h(AccountNote, { snapshot, t, withBalance: true }),
          h(FailureLog, { provider: ACCOUNT, t }),
          h('div', { className: 'lr-pills' }, (snapshot.groups.find(group => group.id === ACCOUNT)?.models ?? [])
            .map(model => h('span', { key: model.id, className: 'lr-pill lr-used lr-static' }, model.name ?? model.id)))) : null,
        configured.map(info => h(ProviderCard, { key: `${info.entry.settingsNs}:${info.provider}`, remote, info, snapshot,
          catalogNames: snapshot.groups.find(group => group.id === info.provider)?.models ?? null, t })),
        Object.entries(parked).map(([provider, about]) => h(ParkedCard, { key: `parked:${provider}`, remote, provider, parked: about, providers, t })),
        writable && (addable.length || providers.namespaces.has('llm-pi-ai')) ? h('select', { className: 'lr-input lr-add', value: '', disabled: adding,
          onChange: event => add(event.target.value) },
        h('option', { value: '' }, adding ? t('models.adding') : t('models.add')),
        providers.namespaces.has('llm-pi-ai') ? h('option', { value: COMPATIBLE }, t('add.compatible')) : null,
        addable.map(info => h('option', { key: info.provider, value: info.provider }, info.entry.displayName || info.provider))) : null,
        compatible ? h('section', { className: 'lr-provider' }, h(CompatibleForm, { remote, t, onCancel: () => setCompatible(false),
          onCreated: async () => setCompatible(false) })) : null)
    }

    // ---- Rankings ----
    /** Your Artificial Analysis key: pasted (kept write-only in DSH's credential store, under the first name the server
     * looks up), or the variable that holds it (kept in the roster's settings). */
    function AaKey ({ remote, t }) {
      const state = useRosterState()
      const keys = state?.rankings?.keys ?? ['ARTIFICIAL_ANALYSIS_API_KEY', 'AA_API_TOKEN']
      const keyEnv = state?.rankings?.keyEnv ?? ''
      const [info, setInfo] = useState(null)
      const [keyDraft, setKeyDraft] = useState('')
      const [envDraft, setEnvDraft] = useState(keyEnv)
      const [busy, setBusy] = useState(false)
      const [note, setNote] = useState(null)
      const [failure, setFailure] = useState(null)
      useEffect(() => setEnvDraft(keyEnv), [keyEnv])
      const describe = useCallback(async () => {
        try {
          const answer = unwrap(await remote.credentials.describe(keys.filter(name => REF.test(name))))
          setInfo(keys.map(name => ({ name, ...answer[name] })).find(item => item.configured) ?? { name: keys[0], configured: false })
        } catch { setInfo({ name: keys[0], unknown: true }) }
      }, [keys.join()])
      useEffect(() => { describe() }, [describe])
      const run = async work => {
        setBusy(true); setFailure(null); setNote(null)
        try { await work() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      const saveKey = () => run(async () => {
        const value = keyDraft.trim()
        if (!value) return
        unwrap(await remote.credentials.set(keys[0], value))
        setKeyDraft(''); setNote(t('key.saved')); await describe()
      })
      const saveEnv = () => run(async () => {
        const name = envDraft.trim()
        if (name && !REF.test(name)) throw new Error(t('key.envBad'))
        await post(API.settings, { aaKeyEnv: name || null })
        await loadState()
        setNote(name ? t('key.envSaved', { name }) : null)
      })
      const status = info?.unknown ? 'unknown' : info?.configured ? (info.source === 'env' || info.source === 'environment' ? 'env' : 'stored') : 'missing'
      const usual = keys.filter(name => name !== keyEnv).join(', ')
      return h('section', { className: 'lr-provider lr-aa-key' },
        h('div', { className: 'lr-field' },
          h('span', { className: 'lr-label' }, t('aa.title')),
          h('span', { className: 'lr-dim' }, t('aa.hint')),
          h('span', { className: 'lr-key-status', 'data-status': status },
            h('span', { className: 'lr-dot' }), h('code', null, info?.name ?? keys[0]), ' ', t(`key.${status}`)),
          h('div', { className: 'lr-row' },
            h('input', { className: 'lr-input', type: 'password', autoComplete: 'new-password', placeholder: t('key.paste'),
              value: keyDraft, disabled: busy, onChange: event => setKeyDraft(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') saveKey() } }),
            h('button', { type: 'button', className: 'lr-button', disabled: busy || !keyDraft.trim(), onClick: saveKey }, t('key.save'))),
          h('div', { className: 'lr-row' },
            h('input', { className: 'lr-input lr-mono', placeholder: t('aa.envHint', { names: usual }), value: envDraft,
              disabled: busy, onChange: event => setEnvDraft(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') saveEnv() } }),
            h('button', { type: 'button', className: 'lr-button', disabled: busy || envDraft.trim() === keyEnv, onClick: saveEnv }, t('key.envSave')))),
        note ? h('div', { className: 'lr-note' }, note) : null,
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null)
    }

    // The leaderboard's columns: what each shows, what it sorts by, and which way first (`low`: the least first, as for a
    // price); an `optional` one only when the list has it (the time and tokens of a task are in the Pro list alone).
    const BOARD = [
      { id: 'rank', label: () => '#', value: row => row.rank, low: true },
      { id: 'model', label: t => t('rankings.model'), value: row => row.name.toLowerCase(), low: true },
      { id: 'intelligence', label: t => t('rankings.index'), value: row => row.intelligence },
      { id: 'taskCost', label: t => t('rankings.taskCost'), value: row => row.taskCost, low: true },
      { id: 'taskTime', label: t => t('rankings.taskTime'), value: row => row.taskTime, low: true, optional: true },
      { id: 'taskTokens', label: t => t('rankings.taskTokens'), value: row => row.taskTokens, low: true, optional: true },
      { id: 'speed', label: t => t('rankings.speed'), value: row => row.speed },
      { id: 'price', label: t => t('rankings.price'), value: row => row.input === null || row.input === undefined ? null : (3 * row.input + row.output) / 4, low: true },
      { id: 'released', label: t => t('rankings.released'), value: row => row.released || null }
    ]
    const known = value => value !== null && value !== undefined

    /** Artificial Analysis's leaderboard: every model they measured (each once at its best, or every effort), sorted by
     * any column, found by name, or only the ones in your roster. */
    function RankingsTab ({ remote, directory, t }) {
      const snapshot = useDirectory(directory)
      const [data, setData] = useState(null)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const [efforts, setEfforts] = useState(false)
      const [mineOnly, setMineOnly] = useState(false)
      const [query, setQuery] = useState('')
      const [order, setOrder] = useState({ by: 'rank', low: true })
      const load = async () => {
        try { setData(await get(`${API.rankings}?top=2000${efforts ? '&efforts=1' : ''}`)) } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      useEffect(() => { load() }, [efforts])
      const models = catalogOf(snapshot)
      const lookup = useResolved(models)
      const mine = new Set(models.map(model => lookup(model)?.aa?.slug).filter(Boolean))
      const isMine = row => mine.has(row.base ?? row.slug)
      async function refresh () {
        setBusy(true); setFailure(null)
        try { await post(API.rankings, {}) } catch (error) {
          setFailure(`${t('failed', { error: errorText(error) })} ${t('rankings.needKey')}`)
        } finally {
          // the release dates come again even without a key (and the dates of every list are asked again)
          await Promise.all([load(), loadState()]).catch(() => {}); forgetResolved()
          setBusy(false)
        }
      }
      const rows = data?.rows ?? []
      const columns = BOARD.filter(column => !column.optional || rows.some(row => known(column.value(row))))
      const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
      const shown = rows.filter(row => (!mineOnly || isMine(row)) &&
        words.every(word => `${row.name} ${row.creator} ${row.slug}`.toLowerCase().includes(word)))
      const by = BOARD.find(column => column.id === order.by) ?? BOARD[0]
      // (what is not known goes last, whichever way)
      shown.sort((one, other) => {
        const a = by.value(one), b = by.value(other)
        if (!known(a) || !known(b)) return known(a) ? -1 : known(b) ? 1 : one.rank - other.rank
        return (a < b ? -1 : a > b ? 1 : 0) * (order.low ? 1 : -1) || one.rank - other.rank
      })
      const sortBy = id => setOrder(order.by === id ? { by: id, low: !order.low } : { by: id, low: Boolean(BOARD.find(column => column.id === id).low) })
      const cell = (column, row) => {
        const value = column.value(row)
        if (column.id === 'model') {
          return h(React.Fragment, null, h('div', { className: 'lr-board-name' }, efforts ? row.name : row.name.replace(/\s*\(.*\)$/, '')),
            h('div', { className: 'lr-dim' }, row.creator))
        }
        if (column.id === 'intelligence') return h('span', { className: 'lr-bar', style: { '--lr-bar': `${Math.min(100, row.intelligence)}%` } }, row.intelligence)
        if (!known(value)) return '–'
        if (column.id === 'taskCost') return `$${money(value)}`
        if (column.id === 'taskTime') return duration(value)
        if (column.id === 'taskTokens') return count(value)
        if (column.id === 'price') return `${money(row.input)} / ${money(row.output)}`
        return value
      }
      return h('div', { className: 'lr-rankings' },
        h(AaKey, { remote, t }),
        h('div', { className: 'lr-row lr-between' },
          h('span', { className: 'lr-dim' }, data?.as_of ? t('rankings.intro', { version: data.version ?? '?', date: data.as_of }) : t('credit.none')),
          h('button', { type: 'button', className: 'lr-button', disabled: busy, onClick: refresh }, busy ? t('rankings.refreshing') : t('rankings.refresh'))),
        h('div', { className: 'lr-toolbar' },
          h('input', { className: 'lr-input lr-board-find', type: 'search', placeholder: t('rankings.filter'), 'aria-label': t('rankings.filter'),
            value: query, onChange: event => setQuery(event.target.value) }),
          h('div', { className: 'lr-chips' },
            h('button', { type: 'button', className: `lr-chip${mineOnly ? ' lr-on' : ''}`, 'aria-pressed': mineOnly, onClick: () => setMineOnly(!mineOnly) }, t('rankings.mine')),
            h('button', { type: 'button', className: `lr-chip${efforts ? ' lr-on' : ''}`, 'aria-pressed': efforts, onClick: () => setEfforts(!efforts) }, t('rankings.efforts')))),
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        data ? h('div', { className: 'lr-board' }, h('table', { className: 'lr-table lr-board-table' },
          h('thead', null, h('tr', null, columns.map(column => h('th', { key: column.id, className: `lr-col-${column.id}`,
            'aria-sort': order.by === column.id ? (order.low ? 'ascending' : 'descending') : undefined },
          h('button', { type: 'button', className: `lr-sort${order.by === column.id ? ' lr-on' : ''}`, title: t('rankings.sortBy', { column: column.label(t) }),
            onClick: () => sortBy(column.id) }, column.label(t), order.by === column.id ? (order.low ? ' ↑' : ' ↓') : null))))),
          h('tbody', null, shown.map(row => h('tr', { key: row.slug, className: isMine(row) ? 'lr-mine' : undefined,
            title: isMine(row) ? t('rankings.yours') : undefined },
          columns.map(column => h('td', { key: column.id, className: `lr-col-${column.id}` }, cell(column, row)))))))) : null,
        data && !shown.length ? h('div', { className: 'lr-empty' }, t('rankings.none')) : null,
        h('div', { className: 'lr-credit' },
          data ? `${t(efforts ? 'rankings.countEfforts' : 'rankings.count', { count: rows.length })}. ` : null,
          data && !columns.some(column => column.optional) ? `${t('rankings.taskNote')} ` : null,
          h('a', { href: 'https://artificialanalysis.ai', target: '_blank', rel: 'noreferrer' }, t('rankings.source'))))
    }

    // ---- art packs ----
    /** The art pack in use, switched on the go: every pack you have (the bundled one, the ones that come with the
     * roster, yours). */
    function PackSwitch ({ t }) {
      const list = usePacks()
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const [naming, setNaming] = useState(null) // the new pack's name, while it is being named
      if (!list) return null
      const run = async work => {
        setBusy(true); setFailure(null)
        try { await work(); await packsChanged() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      const choose = id => id === NEW_PACK ? setNaming('') : run(() => post(API.packs, { use: id }))
      const create = () => naming.trim() && run(async () => { await post(API.packs, { create: naming.trim() }); setNaming(null) })
      return h('div', { className: 'lr-pack-switch' },
        h('span', { className: 'lr-label' }, t('packs.switch')),
        naming === null
          ? h('select', { className: 'lr-input lr-select', value: list.active ?? '', disabled: busy, 'aria-label': t('packs.switch'),
            onChange: event => choose(event.target.value) },
          list.active ? null : h('option', { value: '' }, '—'),
          list.packs.map(pack => h('option', { key: pack.id, value: pack.id }, named(pack, t) ?? pack.id)),
          h('option', { value: NEW_PACK }, t('packs.new')))
          : h(React.Fragment, null,
            h('input', { className: 'lr-input lr-pack-name', autoFocus: true, placeholder: t('packs.newName'), 'aria-label': t('packs.newName'),
              value: naming, disabled: busy, onChange: event => setNaming(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') create(); if (event.key === 'Escape') setNaming(null) } }),
            h('button', { type: 'button', className: 'lr-button lr-primary lr-small', disabled: busy || !naming.trim(), onClick: create }, t('packs.create')),
            h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy, onClick: () => setNaming(null) }, t('cancel'))),
        failure ? h('span', { className: 'lr-error', role: 'alert' }, failure) : null)
    }
    const NEW_PACK = '+new'

    /** Your art packs, the one in use, your changes to each (written in only when you export it), and a pack's way in
     * (the ones that come with the roster, a new empty one, a .zip, a lone pack.json, a link to GitHub or to a .zip) and
     * out (a .zip). */
    function PacksTab ({ t }) {
      const state = useRosterState()
      const list = usePacks()
      const [busy, setBusy] = useState(null) // what is being done
      const [note, setNote] = useState(null)
      const [failure, setFailure] = useState(null)
      const [link, setLink] = useState('')
      const [removing, setRemoving] = useState(null)
      const [discarding, setDiscarding] = useState(null)
      const input = useRef(null)
      useEffect(() => { loadPacks().catch(error => setFailure(t('failed', { error: errorText(error) }))) }, [])
      const after = packsChanged
      const run = async (what, work) => {
        setBusy(what); setFailure(null); setNote(null)
        try { await work() } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(null) }
      }
      const added = kept => setNote(`${t('packs.added', { name: kept.id, kept: kept.kept })}${kept.skippedCount
        ? t('packs.skipped', { count: kept.skippedCount, names: kept.skipped.slice(0, 4).join(', ') }) : ''}`)
      const use = id => run(`use:${id}`, async () => { await post(API.packs, { use: id }); await after() })
      const remove = id => run(`remove:${id}`, async () => { await post(API.packs, { remove: id }); setRemoving(null); await after() })
      const discard = id => run(`discard:${id}`, async () => { await post(API.packs, { discard: id }); setDiscarding(null); await after() })
      const importFile = file => file && run('import', async () => {
        added(await post(`${API.packImport}?name=${encodeURIComponent(file.name)}`, file, { raw: true, type: file.type || 'application/zip' }))
        await after()
      })
      const addIncluded = file => run(`add:${file}`, async () => { added(await post(API.packs, { add: file })); await after() })
      const fetchLink = () => link.trim() && run('fetch', async () => {
        added(await post(API.packs, { fetch: link.trim() })); setLink(''); await after()
      })
      const packName = pack => named(pack, t) ?? pack.id
      // (a pack that comes with the roster, in a newer version than the one you have)
      const newer = pack => Boolean(pack.added && pack.version && pack.addedVersion !== pack.version)
      return h('div', { className: 'lr-packs' },
        h('p', { className: 'lr-dim lr-packs-intro' }, t('packs.intro')),
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
        note ? h('div', { className: 'lr-note' }, note) : null,
        list ? h('div', { className: 'lr-pack-list' }, list.packs.map(pack => h('section', { key: pack.id, className: `lr-pack${pack.active ? ' lr-on' : ''}` },
          h('div', { className: 'lr-pack-faces' }, pack.preview.map(face => h('img', { key: face, src: pictureUrl(face, pack), alt: '', loading: 'lazy', draggable: false }))),
          h('div', { className: 'lr-pack-text' },
            h('div', { className: 'lr-pack-title' },
              h('strong', null, packName(pack)),
              pack.version ? h('span', { className: 'lr-dim', title: pack.roster ? t('packs.exportedFrom', { version: pack.roster }) : undefined }, `v${pack.version}`) : null,
              pack.active ? h('span', { className: 'lr-tag lr-tag-on' }, t('packs.inUse')) : null),
            pack.description ? h('span', { className: 'lr-pack-about' }, named(pack.description, t)) : null,
            pack.author || pack.license ? h('span', { className: 'lr-dim' },
              [pack.author ? t('packs.by', { author: pack.author }) : null, pack.license].filter(Boolean).join(' · ')) : null,
            h('span', { className: 'lr-pills' }, TIER_ORDER.map(tier => h('span', { key: tier, className: 'lr-effort' }, named(pack.tiers?.[tier], t) ?? tier))),
            h('span', { className: 'lr-dim' }, !pack.pictures ? t('packs.countsNone') : pack.characters.length <= 3
              ? t('packs.countsOf', { pictures: pack.pictures, names: pack.characters.map(character => characterName(state, character, t)).join(t('lang') === 'zh' ? '、' : ', ') })
              : t('packs.counts', { pictures: pack.pictures, characters: pack.characters.length })),
            pack.unknown?.length ? h('span', { className: 'lr-dim' }, t('packs.unknown', { names: pack.unknown.join(', ') })) : null,
            pack.problems?.length ? h('div', { className: 'lr-error' }, pack.problems.join(' ')) : null,
            pack.changes ? h('div', { className: 'lr-pack-changes' },
              h('span', null, t('packs.changes', { count: pack.changes })),
              discarding === pack.id
                ? h(React.Fragment, null,
                  h('button', { type: 'button', className: 'lr-button lr-small lr-danger', disabled: Boolean(busy), onClick: () => discard(pack.id) }, t('packs.discardSure')),
                  h('button', { type: 'button', className: 'lr-button lr-small', onClick: () => setDiscarding(null) }, t('cancel')))
                : h('button', { type: 'button', className: 'lr-button lr-small', disabled: Boolean(busy), onClick: () => setDiscarding(pack.id) }, t('packs.discard'))) : null,
            h('span', { className: 'lr-dim lr-pack-folder' }, t('packs.folder', { folder: pack.folder })),
            h('div', { className: 'lr-row' },
              !pack.active ? h('button', { type: 'button', className: 'lr-button lr-primary', disabled: Boolean(busy), onClick: () => use(pack.id) }, t('packs.use')) : null,
              h('a', { className: 'lr-button', href: `${API.packExport}?id=${encodeURIComponent(pack.id)}`, download: `${pack.id}.zip` }, t('packs.export')),
              removing === pack.id
                ? h(React.Fragment, null,
                  h('button', { type: 'button', className: 'lr-button lr-danger', disabled: Boolean(busy), onClick: () => remove(pack.id) }, t('packs.removeSure')),
                  h('button', { type: 'button', className: 'lr-button', onClick: () => setRemoving(null) }, t('cancel')))
                : h('button', { type: 'button', className: 'lr-button', disabled: Boolean(busy), onClick: () => setRemoving(pack.id) }, t('packs.remove'))))))
        ) : h('div', { className: 'lr-empty' }, t('roster.loading')),
        h('section', { className: 'lr-section lr-pack-add' },
          h('h3', null, t('packs.add')),
          list?.included?.length ? h('div', { className: 'lr-included' },
            h('span', { className: 'lr-label' }, t('packs.included')),
            list.included.map(pack => h('div', { key: pack.file, className: 'lr-included-pack' },
              h('div', { className: 'lr-pack-text' },
                h('strong', null, named(pack, t)),
                pack.description ? h('span', { className: 'lr-dim' }, named(pack.description, t)) : null,
                pack.license ? h('span', { className: 'lr-dim' }, pack.license) : null),
              h('button', { type: 'button', className: `lr-button${!pack.added || newer(pack) ? ' lr-primary' : ''}`, disabled: Boolean(busy),
                title: pack.added ? t('packs.includedHave') : undefined, onClick: () => addIncluded(pack.file) },
              busy === `add:${pack.file}` ? t('packs.importing') : !pack.added ? t('packs.includedAdd')
                : newer(pack) ? t('packs.includedUpdate', { version: pack.version }) : t('packs.includedAgain'))))) : null,
          h('div', { className: 'lr-row' },
            h('button', { type: 'button', className: 'lr-button lr-primary', disabled: Boolean(busy), onClick: () => input.current?.click() },
              busy === 'import' ? t('packs.importing') : t('packs.import')),
            h('input', { ref: input, type: 'file', accept: '.zip,.json,application/zip,application/json', hidden: true,
              onChange: event => { importFile(event.target.files?.[0]); event.target.value = '' } })),
          h('div', { className: 'lr-row' },
            h('input', { className: 'lr-input', type: 'url', placeholder: t('packs.link'), 'aria-label': t('packs.link'), value: link, disabled: Boolean(busy),
              onChange: event => setLink(event.target.value), onKeyDown: event => { if (event.key === 'Enter') fetchLink() } }),
            h('button', { type: 'button', className: 'lr-button', disabled: Boolean(busy) || !link.trim(), onClick: fetchLink },
              busy === 'fetch' ? t('packs.fetching') : t('packs.fetch'))),
          h('span', { className: 'lr-dim' }, t('packs.linkHint'))),
        h('details', { className: 'lr-rates lr-how' },
          h('summary', null, t('packs.how')),
          h('ol', null, [1, 2, 3, 4, 5].map(step => h('li', { key: step }, t(`packs.how${step}`)))),
          h('pre', { className: 'lr-tree' }, 'knights/\n  pack.json\n  claude/\n    high.png\n    face-high.png\n    opus.png\n  gpt/\n    university.webp')))
    }

    // ---- summon: a gacha of the roster's own cards, just for fun ----
    // Nothing is bought and no model is called; what you summon is kept in this browser only. The numbers are the usual
    // mobile-gacha ones (Fate/Grand Order's published rates): per card, a ★5 character 1%, ★4 3%, ★3 40%, ★5 equipment
    // 4%, ★4 12%, ★3 40%; the pickup ★5 is 0.8% of its 1%, the pickup ★4 1.5% of its 3%; ×10 costs 30 ✦ for 11 cards, at
    // least one ★4 or better and one character; a banner's 330th summon is its pickup ★5 if that has not come (once).
    const SUMMON = { single: 3, multi: 30, multiCount: 11, pity: 330, pickup: { 5: 0.8, 4: 1.5 },
      rates: [['character', 5, 1], ['character', 4, 3], ['character', 3, 40], ['equipment', 5, 4], ['equipment', 4, 12], ['equipment', 3, 40]] }
    const STARS = { university: 5, high: 4, middle: 3, chibi: 3 }
    const STAR_RARITY = { 3: 'R', 4: 'SSR', 5: 'UR' }
    // the equipment, each pictured by one of the characters' cards (mostly ones no lineup model wears)
    const EQUIPMENT = [['context', 5, 'gemini/university'], ['nolimit', 5, 'deepseek/university'], ['freetier', 5, 'grok/university'],
      ['firsttry', 5, 'mistral/university'], ['agi', 5, 'kimi/university'], ['cachehit', 4, 'minimax/university'],
      ['json', 4, 'llama/university'], ['toolcall', 4, 'doubao/university'], ['cot', 4, 'hunyuan/university'],
      ['sysprompt', 4, 'deepseek/middle'], ['temp0', 4, 'gemini/middle'], ['retry', 3, 'grok/chibi'], ['maxtokens', 3, 'grok/middle'],
      ['timeout', 3, 'glm/middle'], ['emdash', 3, 'minimax/middle'], ['apology', 3, 'llama/middle'], ['lgtm', 3, 'claude/chibi'],
      ['hello', 3, 'qwen/chibi'], ['delve', 3, 'gpt/chibi']]
      .map(([id, stars, slot]) => ({ kind: 'equipment', key: `e:${id}`, id, stars, character: slot.split('/')[0], tier: slot.split('/')[1] }))

    /** What a summon can deal: the lineup's models as characters (★ by tier), the equipment, each pictured as the art pack
     * has it (`tierArt`: a character's card at a tier), and the art pack's outfits (`outfits`, see summonOutfits). */
    const summonPool = (lineup = [], tierArt = (character, tier) => `${character}/${tier}.webp`, outfits = []) => {
      const cards = [...lineup.map(item => ({ kind: 'character',
        key: `c:${item.id}`, id: item.id, name: item.name ?? item.id, provider: item.provider, character: item.character, tier: item.tier,
        stars: STARS[item.tier] ?? 3, art: item.art ?? tierArt(item.character, item.tier), face: item.face ?? null })),
      ...EQUIPMENT.map(card => ({ ...card, art: tierArt(card.character, card.tier) }))]
      return [...cards, ...outfits]
    }
    /** The art pack's outfits: every card picture of a character's (`characters`: { name: { pictures } }) that no card in
     * `pool` shows, as equipment, ★4 unless the pack's `pictures` say otherwise (`labels`); kept by pack (`pack`), so each
     * pack has its own. A character's mood faces and avatars are no cards, and are not among them. */
    function summonOutfits (characters = {}, pack = '', labels = {}, pool = []) {
      const shown = new Set(pool.map(card => card.art).filter(Boolean))
      return Object.entries(characters).flatMap(([character, about]) => (about?.pictures ?? [])
        .filter(picture => !shown.has(picture))
        .map(picture => ({ kind: 'equipment', outfit: true, key: `o:${pack}:${picture}`, id: picture, character, art: picture,
          stars: [3, 4, 5].includes(labels[picture]?.stars) ? labels[picture].stars : 4 })))
    }

    /** `count` summons from `pool` on `banner` ({ pickup5, pickup4: card keys; summons: how many so far; got: whether its
     * pickup ★5 came }), `random` in [0, 1): the cards dealt and the banner after. */
    function summonCards (pool, banner, count, random = Math.random) {
      const groups = new Map()
      for (const card of pool) {
        if (!groups.has(`${card.kind}${card.stars}`)) groups.set(`${card.kind}${card.stars}`, [])
        groups.get(`${card.kind}${card.stars}`).push(card)
      }
      const rates = SUMMON.rates.filter(([kind, stars]) => groups.get(`${kind}${stars}`)?.length)
      const pickup = {
        5: pool.find(card => card.key === banner.pickup5 && card.kind === 'character' && card.stars === 5) ?? null,
        4: pool.find(card => card.key === banner.pickup4 && card.kind === 'character' && card.stars === 4) ?? null
      }
      const draw = (allowed = () => true) => {
        const open = rates.filter(allowed)
        let roll = random() * open.reduce((sum, [, , rate]) => sum + rate, 0)
        const [kind, stars, rate] = open.find(([, , share]) => (roll -= share) < 0) ?? open.at(-1)
        const featured = kind === 'character' ? pickup[stars] : null
        if (featured && random() * rate < SUMMON.pickup[stars]) return featured
        const group = groups.get(`${kind}${stars}`)
        const others = featured && group.length > 1 ? group.filter(card => card !== featured) : group
        return others[Math.floor(random() * others.length)]
      }
      let summons = banner.summons ?? 0
      let got = Boolean(banner.got)
      const cards = []
      for (let index = 0; index < count; index++) {
        summons++
        const card = pickup[5] && !got && summons >= SUMMON.pity ? { ...pickup[5], pity: true } : draw()
        if (card.key === pickup[5]?.key) got = true
        cards.push(card)
      }
      if (count >= 10) {
        // the ×10's floor: a card ★4 or better, and a character, each dealt in place of a card the other floor does not need
        const ensure = (has, allowed, keep) => {
          if (cards.some(has) || !rates.some(allowed)) return
          const kept = cards.filter(keep).length
          const spare = cards.flatMap((card, index) => (!keep(card) || kept !== 1 ? [index] : []))
          const card = draw(allowed)
          cards[spare[Math.floor(random() * spare.length)]] = card
          if (card.key === pickup[5]?.key) got = true
        }
        ensure(card => card.stars >= 4, ([, stars]) => stars >= 4, card => card.kind === 'character')
        ensure(card => card.kind === 'character', ([kind]) => kind === 'character', card => card.stars >= 4)
      }
      return { cards, banner: { ...banner, summons, got } }
    }

    const SUMMON_KEY = 'dsh-llm-roster.summon'
    const NO_SUMMONS = { v: 1, spent: 0, summons: 0, banners: {}, owned: {}, pickup5: null, pickup4: null }
    /** What you summoned, kept in this browser (nothing anywhere else knows). */
    function readSummons () {
      try {
        const value = JSON.parse(localStorage.getItem(SUMMON_KEY))
        if (value?.v === 1) return { ...NO_SUMMONS, ...value }
      } catch { /* none yet */ }
      return NO_SUMMONS
    }
    function writeSummons (value) { try { localStorage.setItem(SUMMON_KEY, JSON.stringify(value)) } catch { /* kept for this visit only */ } }
    const reducedMotion = () => { try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) } catch { return false } }
    const CHARGE_MS = 2800
    /** The light the ring gathers before the cards: rainbow for a ★5 character, gold for a ★4 character or ★5 equipment. */
    const glowOf = cards => cards.some(card => card.kind === 'character' && card.stars === 5) ? 'rainbow'
      : cards.some(card => card.kind === 'character' ? card.stars >= 4 : card.stars === 5) ? 'gold' : 'blue'
    const summonName = (card, t) => card.kind === 'character' || card.outfit ? card.name : t(`equip.${card.id}.name`)
    /** What a card is, above its name: a character at her tier, or equipment (an outfit) with its character. */
    const summonWho = (card, state, t) => card.kind === 'character' ? `${characterName(state, card.character, t)} · ${tierName(state, card.tier, t)}`
      : `${t(card.outfit ? 'summon.kind.outfit' : 'summon.kind.equipment')} · ${characterName(state, card.character, t)}`

    // The stage's particles, the same every time (a number's own noise, so a re-render does not move them): tokens that
    // stream into the ring, sparks that rise, the tokens written around the ring, the stars a ★4 or ★5 card throws off,
    // and the banner's twinkles.
    const noise = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x) }
    const GLYPHS = ['{', '}', '<s>', '▁the', 'ing', 'λ', '∑', '01', '#', '→', '✦', '//', '⟩', '▁a', '…', '%', '::', 'π', '</s>', '▁of']
    const FLYING = GLYPHS.map((text, n) => {
      const angle = noise(n + 1) * Math.PI * 2, reach = 170 + noise(n + 40) * 160
      return { text, dx: `${Math.round(Math.cos(angle) * reach)}px`, dy: `${Math.round(Math.sin(angle) * reach * 0.75)}px`, t: `${Math.round(200 + noise(n + 80) * 1300)}ms` }
    })
    const SPARKS = Array.from({ length: 28 }, (_, n) => ({ x: `${(noise(n + 200) * 100).toFixed(1)}%`, s: `${(1.5 + noise(n + 300) * 3).toFixed(1)}px`,
      d: `${(1.8 + noise(n + 400) * 2).toFixed(2)}s`, t: `${(-noise(n + 500) * 3).toFixed(2)}s`, w: `${Math.round((noise(n + 600) - 0.5) * 60)}px` }))
    const ORBIT = '✦ <s> ▁the ing λ ∑ 01 → { } # ✦ ▁a … % :: π ⟩ </s> '.repeat(2)
    const BURST = Array.from({ length: 12 }, (_, n) => ({ a: `${Math.round(n * 30 + noise(n + 700) * 16)}deg`, r: `${Math.round(56 + noise(n + 800) * 54)}px` }))
    const TWINKLES = Array.from({ length: 7 }, (_, n) => ({ x: `${(50 + noise(n + 900) * 48).toFixed(1)}%`, y: `${(8 + noise(n + 950) * 80).toFixed(1)}%`,
      s: `${Math.round(9 + noise(n + 990) * 9)}px`, t: `${(noise(n + 1030) * 3.2).toFixed(2)}s` }))

    /** The summon's first beat: the stars rush past, tokens stream into a ring that draws itself and charges, its light
     * turns (rainbow for a ★5 character, gold for a ★4) with a shockwave, and it bursts into a flash. A click skips it. */
    function ChargeStage ({ round, onSkip, t }) {
      const prompt = t('summon.prompt', { count: round.count })
      const layer = name => h('g', { key: name, className: name },
        h('circle', { className: 'lr-draw', cx: 120, cy: 120, r: 112 }),
        h('circle', { className: 'lr-ticks lr-spin', cx: 120, cy: 120, r: 103 }),
        h('g', { className: 'lr-spin-back' }, h('text', null, h('textPath', { href: '#lr-orbit' }, ORBIT))),
        h('circle', { className: 'lr-thin', cx: 120, cy: 120, r: 72 }),
        h('circle', { className: 'lr-arcs lr-spin-fast', cx: 120, cy: 120, r: 62 }),
        h('g', { className: 'lr-spin-slow' },
          h('rect', { className: 'lr-square', x: 80, y: 80, width: 80, height: 80 }),
          h('rect', { className: 'lr-square', x: 80, y: 80, width: 80, height: 80, transform: 'rotate(45 120 120)' })))
      return h('button', { type: 'button', className: 'lr-stage lr-charge', 'data-glow': glowOf(round.cards), onClick: onSkip, title: t('summon.skip') },
        h('span', { className: 'lr-sky', 'aria-hidden': 'true' }),
        h('span', { className: 'lr-sparks', 'aria-hidden': 'true' }, SPARKS.map((spark, n) => h('span', {
          key: n, style: { '--x': spark.x, '--s': spark.s, '--d': spark.d, '--t': spark.t, '--w': spark.w } }))),
        h('span', { className: 'lr-ring', 'aria-hidden': 'true' },
          h('span', { className: 'lr-rays' }),
          h('svg', { className: 'lr-ring-svg', viewBox: '0 0 240 240' },
            h('defs', null,
              h('linearGradient', { id: 'lr-prism', x1: '0', y1: '0', x2: '1', y2: '1' },
                ['#ff5f9e', '#ffd36e', '#7cf2c1', '#8fe3ff', '#b48cff'].map((color, n) => h('stop', { key: n, offset: `${n * 25}%`, stopColor: color }))),
              h('path', { id: 'lr-orbit', d: 'M120,120 m-87,0 a87,87 0 1,1 174,0 a87,87 0 1,1 -174,0' })),
            layer('lr-ring-base'), layer('lr-ring-lit')),
          h('span', { className: 'lr-core' }),
          h('span', { className: 'lr-shock' }),
          h('span', { className: 'lr-tokens' }, FLYING.map((token, n) => h('span', {
            key: n, style: { '--dx': token.dx, '--dy': token.dy, '--t': token.t } }, token.text)))),
        h('span', { className: 'lr-prompt' }, prompt),
        h('span', { className: 'lr-thinking' }, t('summon.thinking')),
        h('span', { className: 'lr-flash', 'aria-hidden': 'true' }))
    }

    /** A dealt card: it flies out of the ring face down, its back glowing with what it is (gold for ★4, rainbow for
     * ★5), flips in turn, and a ★4 or ★5 throws off stars as a light sweeps it. */
    function PullCard ({ card, index, state, onOpen, t }) {
      const name = summonName(card, t)
      const who = summonWho(card, state, t)
      const open = card.kind === 'character' && onOpen
      return h(open ? 'button' : 'div', { type: open ? 'button' : undefined, className: `lr-pull lr-pull-${card.kind}`,
        'data-rarity': STAR_RARITY[card.stars], style: { '--i': index }, title: open ? t('summon.open', { name }) : name,
        onClick: open ? () => onOpen(card) : undefined },
      h('span', { className: 'lr-pull-tilt lr-tilt' },
        h('span', { className: 'lr-pull-inner' },
          h('span', { className: 'lr-pull-back', 'aria-hidden': 'true' }, h('span', null, '✦')),
          h('span', { className: 'lr-pull-front' },
            h('span', { className: 'lr-pull-art' }, h(Art, { art: card.art, label: name, thumb: true })),
            card.stars >= 4 ? h('span', { className: 'lr-holo', 'aria-hidden': 'true' }) : null,
            h('span', { className: 'lr-stars', 'aria-label': `★${card.stars}` }, '★'.repeat(card.stars)),
            card.pity ? h('span', { className: 'lr-new lr-pity' }, t('summon.pityTag'))
              : card.fresh ? h('span', { className: 'lr-new' }, t('summon.new')) : null,
            h('span', { className: 'lr-pull-text' },
              h('span', { className: 'lr-card-who' }, who),
              h('span', { className: 'lr-card-name' }, name),
              card.kind === 'equipment' ? h('span', { className: 'lr-pull-effect' },
                card.outfit ? t('summon.outfit.text', { pack: named(state?.pack, t) ?? '' }) : t(`equip.${card.id}.text`)) : null),
            h('span', { className: 'lr-sweep', 'aria-hidden': 'true' }))),
        h('span', { className: 'lr-gloss', 'aria-hidden': 'true' })),
      card.stars >= 4 ? h('span', { className: 'lr-pull-fx', 'aria-hidden': 'true' },
        BURST.slice(0, card.stars === 5 ? 12 : 6).map((spark, n) => h('span', { key: n, style: { '--a': spark.a, '--r': spark.r } }, '✦'))) : null)
    }

    /** The view `{ x, y, s }` (the picture's top-left on the stage, and its scale) zoomed by `factor` about `point` (on
     * the stage): the picture's point under it stays under it; the scale kept within `min`..`max`. */
    function zoomAt (view, point, factor, min = 0.05, max = 40) {
      const s = Math.min(max, Math.max(min, view.s * factor))
      const k = s / view.s
      return { x: point.x - (point.x - view.x) * k, y: point.y - (point.y - view.y) * k, s }
    }
    /** The whole picture (`image`: { w, h }), centred on a stage (`stage`: { w, h }) with a margin. */
    const fitView = (stage, image, margin = 0.92) => {
      const s = Math.min(stage.w * margin / image.w, stage.h * margin / image.h)
      return { x: (stage.w - image.w * s) / 2, y: (stage.h - image.h * s) / 2, s }
    }

    /** How quickly the viewer eases to where it is going (ms): after a zoom, and after a drag (close behind the pointer);
     * and how long a fling's speed takes to fade (ms). */
    const EASE = { zoom: 90, drag: 28 }
    const FLING = 260

    /** An album picture, over everything: the wheel zooms where it points, a drag moves it (two fingers pinch), a quick
     * drag flings it on, a double-click zooms in or fits it again, each move eased there (at once when motion is
     * reduced). The arrows go through the album; Esc, ×, or a click beside the picture closes it. */
    function ArtViewer ({ cards, index, onIndex, onClose, state, t }) {
      const card = cards[index]
      const stage = useRef(null)
      const fit = useRef(null)
      const pointers = useRef(new Map())
      const [size, setSize] = useState(null) // the picture's own size
      const [view, setView] = useState(null) // as shown: { x, y, s }
      const shown = useRef(null) // the same, for the frames
      const goal = useRef(null) // where it is going
      const motion = useRef({ frame: 0, last: 0, ease: EASE.zoom, fling: null })
      const press = useRef(null) // a press: where it began, how far it went, and how fast it was going
      const url = pictureUrl(card.art)
      const show = next => { shown.current = next; setView(next) }
      const stop = () => {
        if (motion.current.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(motion.current.frame)
        motion.current.frame = 0
        motion.current.fling = null
      }
      useEffect(() => { stop(); setSize(null); show(null); goal.current = null; fit.current = null }, [url])
      useEffect(() => stop, [])
      // a frame: a fling carries the goal on, slowing; the view eases toward the goal (a blend of two views that keep the
      // same point under the pointer keeps it there too, so a zoom stays where it points all the way)
      const tick = now => {
        const m = motion.current
        const dt = Math.min(64, Math.max(1, now - m.last))
        m.last = now
        if (m.fling && goal.current) {
          goal.current = { ...goal.current, x: goal.current.x + m.fling.x * dt, y: goal.current.y + m.fling.y * dt }
          const fade = Math.exp(-dt / FLING)
          m.fling = Math.hypot(m.fling.x * fade, m.fling.y * fade) < 0.01 ? null : { x: m.fling.x * fade, y: m.fling.y * fade }
        }
        const from = shown.current
        const to = goal.current
        if (!from || !to) { m.frame = 0; return }
        const k = 1 - Math.exp(-dt / m.ease)
        const next = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, s: from.s + (to.s - from.s) * k }
        const settled = !m.fling && Math.abs(to.s - next.s) <= to.s * 1e-4 && Math.abs(to.x - next.x) < 0.25 && Math.abs(to.y - next.y) < 0.25
        show(settled ? to : next)
        m.frame = settled ? 0 : requestAnimationFrame(tick)
      }
      /** Where the view goes: eased there (`ease`, ms), or at once (`now`, reduced motion, nothing shown yet). */
      const go = (next, { ease = EASE.zoom, now = false } = {}) => {
        if (!next) return
        goal.current = next
        motion.current.ease = ease
        if (now || reducedMotion() || !shown.current || typeof requestAnimationFrame !== 'function') { stop(); show(next); return }
        if (!motion.current.frame) {
          motion.current.last = typeof performance !== 'undefined' ? performance.now() : Date.now()
          motion.current.frame = requestAnimationFrame(tick)
        }
      }
      const bounds = () => stage.current.getBoundingClientRect()
      const refit = useCallback((now = false) => {
        if (!size || !stage.current) return
        const box = bounds()
        fit.current = fitView({ w: box.width, h: box.height }, size)
        motion.current.fling = null
        go(fit.current, { now })
      }, [size])
      useLayoutEffect(() => { refit(true) }, [refit])
      useEffect(() => {
        const resize = () => refit(true)
        window.addEventListener('resize', resize)
        return () => window.removeEventListener('resize', resize)
      }, [refit])
      const limits = () => [(fit.current?.s ?? 1) / 2, (fit.current?.s ?? 1) * 16]
      const zoom = (factor, point = null) => {
        if (!goal.current) return
        const box = bounds()
        motion.current.fling = null
        go(zoomAt(goal.current, point ?? { x: box.width / 2, y: box.height / 2 }, factor, ...limits()))
      }
      const step = by => onIndex((index + by + cards.length) % cards.length)
      // the wheel, not passive: the page under it must not scroll
      useEffect(() => {
        const node = stage.current
        if (!node) return
        const wheel = event => {
          event.preventDefault()
          if (!goal.current) return
          const box = node.getBoundingClientRect()
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1
          motion.current.fling = null
          go(zoomAt(goal.current, { x: event.clientX - box.left, y: event.clientY - box.top }, Math.exp(-event.deltaY * unit * 0.0015), ...limits()))
        }
        node.addEventListener('wheel', wheel, { passive: false })
        return () => node.removeEventListener('wheel', wheel)
      }, [size])
      useEffect(() => {
        const key = event => {
          if (event.key === 'Escape') onClose()
          else if (event.key === 'ArrowLeft' && cards.length > 1) step(-1)
          else if (event.key === 'ArrowRight' && cards.length > 1) step(1)
          else if (event.key === '+' || event.key === '=') zoom(1.25)
          else if (event.key === '-' || event.key === '_') zoom(0.8)
          else if (event.key === '0') refit()
          else return
          event.preventDefault(); event.stopPropagation()
        }
        window.addEventListener('keydown', key, true)
        return () => window.removeEventListener('keydown', key, true)
      }, [index, cards.length, refit, onClose])
      const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const down = event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        stage.current.setPointerCapture?.(event.pointerId)
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        motion.current.fling = null
        // (one finger or the mouse: maybe a click, maybe a fling; a second finger makes it a pinch)
        press.current = pointers.current.size === 1 ? { far: 0, speed: { x: 0, y: 0 }, at: clock() } : null
      }
      const move = event => {
        const known = pointers.current
        const before = known.get(event.pointerId)
        if (!before || !goal.current) return
        const now = { x: event.clientX, y: event.clientY }
        if (known.size === 1) {
          const dx = now.x - before.x
          const dy = now.y - before.y
          go({ ...goal.current, x: goal.current.x + dx, y: goal.current.y + dy }, { ease: EASE.drag })
          const found = press.current
          if (found) {
            const at = clock()
            const dt = Math.max(1, at - found.at)
            found.far += Math.hypot(dx, dy)
            found.speed = { x: 0.6 * dx / dt + 0.4 * found.speed.x, y: 0.6 * dy / dt + 0.4 * found.speed.y }
            found.at = at
          }
        } else {
          // two fingers: zoom about the point between them by how far apart they moved, and pan as it moves
          const other = [...known].find(([id]) => id !== event.pointerId)[1]
          const box = bounds()
          const apart = Math.hypot(before.x - other.x, before.y - other.y)
          const from = { x: (before.x + other.x) / 2 - box.left, y: (before.y + other.y) / 2 - box.top }
          const to = { x: (now.x + other.x) / 2 - box.left, y: (now.y + other.y) / 2 - box.top }
          if (apart) {
            const zoomed = zoomAt(goal.current, from, Math.hypot(now.x - other.x, now.y - other.y) / apart, ...limits())
            go({ ...zoomed, x: zoomed.x + to.x - from.x, y: zoomed.y + to.y - from.y }, { ease: EASE.drag })
          }
        }
        known.set(event.pointerId, now)
      }
      const up = event => {
        if (!pointers.current.delete(event.pointerId)) return
        const found = press.current
        if (!found || pointers.current.size) return
        press.current = null
        if (found.far < 4) {
          // a click beside the picture closes it
          const at = shown.current
          const box = bounds()
          const x = event.clientX - box.left
          const y = event.clientY - box.top
          if (at && size && (x < at.x || y < at.y || x > at.x + size.w * at.s || y > at.y + size.h * at.s)) onClose()
          return
        }
        // let go while still moving: it flings on, slowing
        const speed = Math.hypot(found.speed.x, found.speed.y)
        if (clock() - found.at < 90 && speed > 0.25 && !reducedMotion()) {
          const most = Math.min(1, 3 / speed) // (at most 3 px a millisecond: a jerk of the mouse is no throw)
          motion.current.fling = { x: found.speed.x * most, y: found.speed.y * most }
          go(goal.current, { ease: EASE.drag })
        }
      }
      const cancel = event => { pointers.current.delete(event.pointerId); press.current = null }
      const twice = event => {
        if (!goal.current || !fit.current) return
        const box = bounds()
        const point = { x: event.clientX - box.left, y: event.clientY - box.top }
        motion.current.fling = null
        go(goal.current.s > fit.current.s * 1.5 ? fit.current : zoomAt(goal.current, point, fit.current.s * 2.5 / goal.current.s, ...limits()))
      }
      const name = summonName(card, t)
      const who = summonWho(card, state, t)
      const button = (label, onClick, text, disabled = false) => h('button', { type: 'button', className: 'lr-viewer-button', title: label,
        'aria-label': label, disabled, onClick }, text)
      const body = h('div', { className: 'lr-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': name },
        h('div', { className: 'lr-viewer-bar' },
          h('span', { className: 'lr-viewer-title' }, h('strong', null, name), h('span', { className: 'lr-stars' }, '★'.repeat(card.stars)),
            h('span', { className: 'lr-viewer-who' }, who)),
          h('span', { className: 'lr-spacer' }),
          cards.length > 1 ? h('span', { className: 'lr-viewer-group' },
            button(t('viewer.prev'), () => step(-1), '‹'), h('span', { className: 'lr-viewer-count' }, `${index + 1} / ${cards.length}`),
            button(t('viewer.next'), () => step(1), '›')) : null,
          h('span', { className: 'lr-viewer-group' },
            button(t('viewer.zoomOut'), () => zoom(0.8), '−', !view),
            h('span', { className: 'lr-viewer-count lr-viewer-zoom' }, view ? `${Math.round(view.s * 100)}%` : '…'),
            button(t('viewer.zoomIn'), () => zoom(1.25), '+', !view),
            button(t('viewer.fit'), () => refit(), t('viewer.fit'), !view)),
          h('button', { type: 'button', className: 'lr-viewer-close', title: t('close'), 'aria-label': t('close'), onClick: onClose }, '×')),
        h('div', { className: 'lr-viewer-stage', ref: stage,
          onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: cancel, onDoubleClick: twice },
        url ? h('img', { key: url, src: url, alt: name, draggable: false,
          onLoad: event => setSize({ w: event.currentTarget.naturalWidth || 512, h: event.currentTarget.naturalHeight || 768 }),
          style: view ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` } : { visibility: 'hidden' } }) : null),
        h('div', { className: 'lr-viewer-hint' }, t('viewer.hint')))
      return createPortal ? createPortal(body, document.body) : body
    }

    function SummonTab ({ onOpen, t }) {
      const state = useRosterState()
      const lineup = state?.lineup ?? []
      const pool = useMemo(() => {
        const base = summonPool(lineup, (character, tier) => tierArt(state, character, tier))
        const outfits = summonOutfits(state?.characters, state?.pack?.id ?? '', state?.pack?.labels ?? {}, base)
          .map(card => ({ ...card, name: pictureLabel(state, card.art, t) }))
        return [...base, ...outfits]
      }, [lineup, state?.pack?.stamp, state?.characters, t])
      const dateOf = useReleasedDates(lineup.map(item => item.id))
      const [saved, setSaved] = useState(readSummons)
      const [round, setRound] = useState(null) // on stage: { id, count, cards, phase: 'charge' | 'reveal', instant }
      const [confirming, setConfirming] = useState(false)
      // the Earned mode's ✦: kept by the server (they come as DSH's model calls work), read now and then; a rise shown
      const earned = saved.mode === 'earned'
      const [wallet, setWallet] = useState(null)
      const [gain, setGain] = useState(null)
      const [short, setShort] = useState(false)
      const lastEarned = useRef(null)
      const took = found => {
        if (lastEarned.current !== null && found.earned > lastEarned.current) setGain({ amount: found.earned - lastEarned.current, id: Date.now() })
        lastEarned.current = found.earned
        setWallet(found)
      }
      const loadWallet = useCallback(() => get(API.stars).then(took).catch(() => {}), [])
      useEffect(() => { loadWallet(); const timer = setInterval(loadWallet, 8000); return () => clearInterval(timer) }, [loadWallet])
      useEffect(() => { if (!gain) return; const timer = setTimeout(() => setGain(null), 2600); return () => clearTimeout(timer) }, [gain?.id])
      const [code, setCode] = useState('')
      const [codeNote, setCodeNote] = useState(null)
      const [viewing, setViewing] = useState(null) // the album picture open, by its card's key
      const newest = (one, other) => String(dateOf(other.id) ?? '').localeCompare(String(dateOf(one.id) ?? '')) || one.id.localeCompare(other.id)
      const fives = pool.filter(card => card.kind === 'character' && card.stars === 5).sort(newest)
      const fours = pool.filter(card => card.kind === 'character' && card.stars === 4).sort(newest)
      const pickup5 = fives.find(card => card.key === saved.pickup5) ?? fives[0] ?? null
      const pickup4 = saved.pickup4 === 'none' ? null : fours.find(card => card.key === saved.pickup4) ?? fours[0] ?? null
      const banner = (pickup5 && saved.banners[pickup5.key]) || { summons: 0, got: false }
      useEffect(() => {
        if (round?.phase !== 'charge') return
        const timer = setTimeout(() => setRound(now => (now?.id === round.id ? { ...now, phase: 'reveal' } : now)), reducedMotion() ? 0 : CHARGE_MS)
        return () => clearTimeout(timer)
      }, [round?.id, round?.phase])
      // once every card has turned, there is nothing left to skip
      useEffect(() => {
        if (round?.phase !== 'reveal' || round.instant || round.settled) return
        const timer = setTimeout(() => setRound(now => (now?.id === round.id ? { ...now, settled: true } : now)),
          reducedMotion() ? 0 : round.count * 170 + 2300)
        return () => clearTimeout(timer)
      }, [round?.id, round?.phase, round?.instant])
      // the dealt cards fly out of the ring: each starts at the stage's centre, so each is told how far that is
      const pulls = useRef(null)
      useLayoutEffect(() => {
        const grid = pulls.current
        const stage = grid?.closest('.lr-stage')?.getBoundingClientRect()
        if (!grid || !stage?.width || round?.phase !== 'reveal') return
        for (const card of grid.children) {
          const box = card.getBoundingClientRect()
          card.style.setProperty('--dx', `${Math.round(stage.left + stage.width / 2 - box.left - box.width / 2)}px`)
          card.style.setProperty('--dy', `${Math.round(stage.top + stage.height * 0.45 - box.top - box.height / 2)}px`)
        }
      }, [round?.id, round?.phase])

      const save = next => { setSaved(next); writeSummons(next) }
      const costOf = count => (count === 1 ? SUMMON.single : SUMMON.multi)
      const cannot = count => earned && (wallet?.balance ?? 0) < costOf(count)
      async function summon (count) {
        if (!pickup5) return
        setShort(false)
        if (earned) {
          // the server spends them (they are its to keep): not enough, and nothing is summoned
          try { took(await post(API.stars, { spend: costOf(count) })) } catch { setShort(true); loadWallet(); return }
        }
        const result = summonCards(pool, { ...banner, pickup5: pickup5.key, pickup4: pickup4?.key }, count)
        const owned = { ...saved.owned }
        const cards = result.cards.map(card => {
          const fresh = !owned[card.key]
          owned[card.key] = (owned[card.key] ?? 0) + 1
          return { ...card, fresh }
        })
        save({ ...saved, owned, spent: saved.spent + costOf(count), summons: saved.summons + count,
          pickup5: pickup5.key, pickup4: pickup4?.key ?? 'none',
          banners: { ...saved.banners, [pickup5.key]: { summons: result.banner.summons, got: result.banner.got } } })
        setRound({ id: `${Date.now()}-${Math.random()}`, count, cards, phase: 'charge', instant: false })
      }
      const wallet_ = h('span', { className: 'lr-wallet' }, t('summon.balance', { count: (wallet?.balance ?? 0).toLocaleString() }),
        gain ? h('span', { key: gain.id, className: 'lr-gain' }, t('summon.gain', { count: gain.amount })) : null)
      const buttons = h('div', { className: 'lr-row lr-summon-buttons' },
        earned ? wallet_ : null,
        h('button', { type: 'button', className: 'lr-button lr-summon-button', disabled: !pickup5 || cannot(1),
          title: cannot(1) ? t('summon.short') : undefined, onClick: () => summon(1) },
          h('strong', null, t('summon.one')), h('span', null, t('summon.cost', { cost: SUMMON.single }))),
        h('button', { type: 'button', className: 'lr-button lr-primary lr-summon-button', disabled: !pickup5 || cannot(SUMMON.multiCount),
          title: cannot(SUMMON.multiCount) ? t('summon.short') : undefined, onClick: () => summon(SUMMON.multiCount) },
          h('strong', null, t('summon.ten')), h('span', null, t('summon.cost', { cost: SUMMON.multi }))),
        short ? h('span', { className: 'lr-error lr-short', role: 'alert' }, t('summon.short')) : null)
      const spent = t('summon.spent', { spent: saved.spent.toLocaleString() })
      async function enterCode () {
        const text = code.trim()
        if (!text) return
        try {
          const found = await post(API.stars, { code: text })
          took(found)
          if (found.reveal) save({ ...saved, revealed: true })
          setCodeNote(found.unknown ? t('summon.code.unknown') : found.reveal ? t('summon.code.reveal') : t('summon.code.added', { count: found.added }))
        } catch (error) { setCodeNote(t('failed', { error: errorText(error) })) }
        setCode('')
      }

      if (round) {
        const skip = () => setRound(now => ({ ...now, phase: 'reveal', instant: true }))
        if (round.phase === 'charge') return h('div', { className: 'lr-summon' }, h(ChargeStage, { round, onSkip: skip, t }))
        const tally = stars => round.cards.filter(card => card.stars === stars).length
        return h('div', { className: 'lr-summon' },
          h('div', { className: 'lr-stage lr-reveal', 'data-glow': glowOf(round.cards) },
            h('span', { className: 'lr-sky', 'aria-hidden': 'true' }),
            h('div', { key: round.id, ref: pulls, className: `lr-pulls${round.count === 1 ? ' lr-pulls-one' : ''}${round.instant ? ' lr-instant' : ''}` },
              round.cards.map((card, index) => h(PullCard, { key: index, card, index, state, onOpen, t })))),
          h('div', { className: 'lr-row lr-stage-actions' },
            h('button', { type: 'button', className: 'lr-button', onClick: () => setRound(null) }, `‹ ${t('summon.back')}`),
            !round.instant && !round.settled ? h('button', { type: 'button', className: 'lr-button', onClick: skip }, t('summon.skip')) : null,
            h('span', { className: 'lr-spacer' }),
            h('span', { className: 'lr-tally' }, t('summon.tally', { five: tally(5), four: tally(4) })),
            h('span', { className: 'lr-dim' }, spent),
            buttons))
      }

      if (!state) return h('div', { className: 'lr-empty' }, t('summon.loading'))
      const owned = saved.owned
      const nameOf = card => characterName(state, card.character, t)
      const fivesOwned = fives.reduce((sum, card) => sum + (owned[card.key] ?? 0), 0)
      const sections = ['character', 'equipment'].map(kind => [kind, pool.filter(card => card.kind === kind).sort((one, other) => other.stars - one.stars)])
      const album = sections.flatMap(([, cards]) => cards)
      const collected = pool.filter(card => owned[card.key]).length
      const viewable = album.filter(card => owned[card.key] || saved.revealed)
      const rate = (kind, stars) => `${SUMMON.rates.find(([k, s]) => k === kind && s === stars)[2]}%`
      return h('div', { className: 'lr-summon' },
        pickup5 ? h('div', { className: 'lr-banner lr-tilt', 'data-rarity': 'UR' },
          pickup4 ? h('span', { className: 'lr-banner-art lr-banner-second' }, h(Art, { art: pickup4.art, label: pickup4.name })) : null,
          h('span', { className: 'lr-banner-art' }, h(Art, { art: pickup5.art, label: pickup5.name })),
          TWINKLES.map((twinkle, n) => h('span', { key: n, className: 'lr-twinkle', 'aria-hidden': 'true',
            style: { '--x': twinkle.x, '--y': twinkle.y, '--s': twinkle.s, '--t': twinkle.t } }, '✦')),
          h('span', { className: 'lr-banner-shine', 'aria-hidden': 'true' }),
          h('span', { className: 'lr-gloss', 'aria-hidden': 'true' }),
          h('div', { className: 'lr-banner-text' },
            h('span', { className: 'lr-banner-label' }, t('summon.banner')),
            h('strong', { className: 'lr-banner-name' }, pickup5.name),
            h('span', { className: 'lr-stars' }, '★★★★★'),
            h('span', { className: 'lr-banner-small' }, `${nameOf(pickup5)} · ${tierName(state, pickup5.tier, t)}`),
            dateOf(pickup5.id) ? h('span', { className: 'lr-banner-small' }, t('page.released', { date: dateOf.label(pickup5.id) })) : null,
            pickup4 ? h('span', { className: 'lr-banner-small' }, `${t('summon.pickup4')}: ${pickup4.name}`) : null,
            h('span', { className: 'lr-pity-line' }, banner.got ? t('summon.pityDone', { name: pickup5.name })
              : t('summon.pity', { count: banner.summons, name: pickup5.name })),
            h('span', { className: 'lr-pity-bar' }, h('span', { style: { width: `${banner.got ? 100 : Math.min(100, banner.summons / SUMMON.pity * 100)}%` } })))) : null,
        h('div', { className: 'lr-field' },
          h('span', { className: 'lr-label' }, t('summon.pickup5')),
          h('div', { className: 'lr-chips' }, fives.map(card => h('button', {
            key: card.key, type: 'button', className: `lr-chip lr-face-chip${card === pickup5 ? ' lr-on' : ''}`,
            onClick: () => save({ ...saved, pickup5: card.key })
          }, h(Face, { face: card.face ?? tierFace(state, card.character, card.tier), label: card.name, size: 20 }), card.name)))),
        h('label', { className: 'lr-field' },
          h('span', { className: 'lr-label' }, t('summon.pickup4')),
          h('select', { className: 'lr-input lr-select', value: pickup4?.key ?? 'none', onChange: event => save({ ...saved, pickup4: event.target.value }) },
            h('option', { value: 'none' }, t('summon.none')),
            fours.map(card => h('option', { key: card.key, value: card.key }, `${card.name} · ${nameOf(card)}`)))),
        h('div', { className: 'lr-field' },
          h('span', { className: 'lr-label' }, t('summon.mode')),
          h('div', { className: 'lr-chips', role: 'group', 'aria-label': t('summon.mode') }, ['free', 'earned'].map(mode => h('button', {
            key: mode, type: 'button', className: `lr-chip${(saved.mode ?? 'free') === mode ? ' lr-on' : ''}`,
            onClick: () => { setShort(false); save({ ...saved, mode }) } }, t(`summon.mode.${mode}`)))),
          h('span', { className: 'lr-dim' }, t(`summon.mode.${earned ? 'earned' : 'free'}Hint`))),
        buttons,
        h('div', { className: 'lr-summon-stats' },
          earned ? h('span', null, t('summon.earnedTotal', { count: (wallet?.earned ?? 0).toLocaleString() })) : h('span', null, spent),
          h('span', null, t('summon.count', { count: saved.summons.toLocaleString() })),
          h('span', null, t('summon.fives', { count: fivesOwned }))),
        h('form', { className: 'lr-cheat', onSubmit: event => { event.preventDefault(); enterCode() } },
          h('label', { className: 'lr-label', htmlFor: 'lr-cheat-code' }, t('summon.code')),
          h('input', { id: 'lr-cheat-code', className: 'lr-input lr-mono', value: code, autoComplete: 'off', spellCheck: false,
            onChange: event => { setCode(event.target.value); setCodeNote(null) } }),
          h('button', { type: 'submit', className: 'lr-button lr-small', disabled: !code.trim() }, t('summon.codeEnter')),
          codeNote ? h('span', { className: 'lr-note lr-cheat-note', role: 'status' }, codeNote) : null),
        h('details', { className: 'lr-rates' },
          h('summary', null, t('summon.rates')),
          h('table', { className: 'lr-table' },
            h('thead', null, h('tr', null, h('th', null, ''), h('th', null, t('summon.kind.character')), h('th', null, t('summon.kind.equipment')))),
            h('tbody', null, [5, 4, 3].map(stars => h('tr', { key: stars },
              h('td', null, h('span', { className: 'lr-stars' }, '★'.repeat(stars))), h('td', null, rate('character', stars)), h('td', null, rate('equipment', stars)))))),
          h('ul', null, ['pickup5', 'pickup4', 'ten', 'pity', 'pool', 'outfits', 'earn'].map(rule => h('li', { key: rule },
            t(`summon.rule.${rule}`, { five: tierName(state, 'university', t), four: tierName(state, 'high', t) }))))),
        h('section', { className: 'lr-section' },
          h('div', { className: 'lr-row lr-between' },
            h('h3', null, t('summon.album', { owned: collected, total: pool.length })),
            confirming ? h('span', { className: 'lr-row' },
              h('button', { type: 'button', className: 'lr-button lr-small lr-danger', onClick: () => {
                save({ ...NO_SUMMONS, pickup5: saved.pickup5, pickup4: saved.pickup4, mode: saved.mode }); setConfirming(false)
              } }, t('summon.resetSure')),
              h('button', { type: 'button', className: 'lr-button lr-small', onClick: () => setConfirming(false) }, t('cancel')))
              : h('button', { type: 'button', className: 'lr-button lr-small', disabled: !saved.summons, onClick: () => setConfirming(true) }, t('summon.reset'))),
          h('div', { className: 'lr-album' }, sections.flatMap(([kind, cards]) => [
            h('div', { key: `section:${kind}`, className: 'lr-group lr-album-group', role: 'separator', 'data-kind': kind },
              h('span', { className: 'lr-group-arrow', 'aria-hidden': 'true' }, '▸'),
              h('span', null, t(`summon.album.${kind}`, { owned: cards.filter(card => owned[card.key]).length, total: cards.length })),
              h('span', { className: 'lr-group-line', 'aria-hidden': 'true' })),
            ...cards.map(card => {
            const count = owned[card.key] ?? 0
            const seen = count || saved.revealed
            const name = summonName(card, t)
            return h(seen ? 'button' : 'span', { key: card.key, type: seen ? 'button' : undefined,
              className: `lr-album-tile${seen ? ' lr-tilt' : ' lr-locked'}`, 'data-rarity': STAR_RARITY[card.stars],
              title: seen ? `${name} · ★${card.stars}` : `${t('summon.unknown')} · ★${card.stars}`,
              'aria-label': seen ? t('summon.view', { name }) : undefined, onClick: seen ? () => setViewing(card.key) : undefined },
            h(Art, { art: card.art, label: seen ? name : '?', thumb: true }),
            seen && card.stars >= 4 ? h('span', { className: 'lr-holo', 'aria-hidden': 'true' }) : null,
            count ? h('span', { className: 'lr-album-count' }, t('summon.owned', { count })) : null,
            seen ? h('span', { className: 'lr-gloss', 'aria-hidden': 'true' }) : null)
          })]))),
        viewing && viewable.some(card => card.key === viewing) ? h(ArtViewer, { cards: viewable, index: viewable.findIndex(card => card.key === viewing),
          onIndex: index => setViewing(viewable[index].key), onClose: () => setViewing(null), state, t }) : null,
        h('div', { className: 'lr-foot' }, h('span', null, t('summon.free'))))
    }

    // ---- the dialog ----
    function Modal ({ title, onClose, small = false, children, t, tabs = null }) {
      const box = useRef(null)
      useEffect(() => {
        // (Esc while a picture is open, or a pill dragged, is theirs)
        const key = event => { if (event.key === 'Escape' && !document.querySelector('.lr-viewer, .lr-ghost')) { event.stopPropagation(); onClose() } }
        window.addEventListener('keydown', key, true)
        box.current?.focus()
        return () => window.removeEventListener('keydown', key, true)
      }, [onClose])
      const body = h('div', { className: 'lr-overlay', onMouseDown: event => { if (event.target === event.currentTarget) onClose() } },
        h('div', { className: `lr-dialog${small ? ' lr-dialog-small' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
          tabIndex: -1, ref: box },
        h('header', { className: 'lr-dialog-head' },
          h('span', { className: 'lr-dialog-title' }, title),
          tabs,
          h('button', { type: 'button', className: 'lr-close', 'aria-label': t('close'), title: t('close'), onClick: onClose }, '×')),
        h('div', { className: 'lr-dialog-body' }, children)))
      return createPortal ? createPortal(body, document.body) : body
    }

    function RosterDialog ({ remote, directory, available, onClose, t }) {
      const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('dsh-llm-roster.tab') || 'roster' } catch { return 'roster' } })
      const [page, setPage] = useState(null) // within Roster: { kind: 'character', card } or { kind: 'add' }
      useEffect(() => { try { sessionStorage.setItem('dsh-llm-roster.tab', tab) } catch { /* fine */ } }, [tab])
      useEffect(() => { directory.load().catch(() => {}); loadProviders(remote).catch(() => {}) }, [directory])
      // the state again as the roster opens: an art pack changed in place shows (its cards are asked again only then)
      useEffect(() => {
        const before = shared.state?.pack?.stamp
        loadState().then(state => { if (before && state?.pack?.stamp !== before) forgetResolved() }).catch(() => {})
      }, [])
      const close = useCallback(() => (page ? setPage(null) : onClose()), [page, onClose])
      const tabs = h('nav', { className: 'lr-tabs' }, ['roster', 'summon', 'models', 'rankings', 'packs'].map(id => h('button', {
        key: id, type: 'button', className: `lr-tab${tab === id ? ' lr-on' : ''}`, onClick: () => { setTab(id); setPage(null) }
      }, t(`tab.${id}`))))
      // a summoned character's page, in Roster
      const openSummoned = card => {
        setTab('roster')
        setPage({ kind: 'character', card: { provider: card.provider, providerName: card.provider, id: card.id, name: card.name, source: 'lineup',
          lineupId: card.id, character: card.character, status: 'checking' } })
      }
      const body = tab === 'models' ? h(ModelsTab, { remote, directory, t })
        : tab === 'rankings' ? h(RankingsTab, { remote, directory, t })
          : tab === 'packs' ? h(PacksTab, { t })
          : tab === 'summon' ? h(SummonTab, { onOpen: openSummoned, t })
          : page?.kind === 'character' ? h(CharacterPage, { remote, directory, available, card: page.card, onBack: () => setPage(null), onPicked: onClose, t })
            : page?.kind === 'add' ? h(AddPage, { remote, directory, onBack: () => setPage(null), t,
              onDone: card => setPage({ kind: 'character', card: { ...card, source: 'catalog', status: 'ready' } }) })
              : h(RosterTab, { remote, directory, available, onPicked: onClose, onPage: setPage, onTab: setTab, t })
      return h(Modal, { title: t('dialog.title'), onClose: close, t, tabs }, body)
    }

    /** The avatar beside DSH's model picker. */
    function makeAvatar (remote) {
      return function RosterAvatar ({ directory, available, t: words }) {
        const t = wordsOf(words)
        const snapshot = useDirectory(directory)
        const [open, setOpen] = useState(false)
        useEffect(() => { if (available) directory.load().catch(() => {}) }, [directory, available])
        const current = snapshot.pending ?? snapshot.current
        const models = current ? [{ provider: current.provider, id: current.model }] : []
        const lookup = useResolved(models)
        const state = useRosterState()
        if (!available) return null
        const found = current ? lookup(models[0]) : null
        const name = current ? (catalogOf(snapshot).find(model => model.provider === current.provider && model.id === current.model)?.name ?? current.model) : null
        const rarity = found ? rarityOf(found, state) : null
        const label = name ? `${t('avatar.title', { model: name })}${found?.tier ? ` · ${tierName(state, found.tier, t)}` : ''}` : t('avatar.none')
        return h(React.Fragment, null,
          h('button', { type: 'button', className: 'lr-avatar', 'data-rarity': rarity ?? undefined, title: label, 'aria-label': label,
            'data-pending': snapshot.status === 'selecting' ? '' : undefined, onClick: () => setOpen(true) },
          h(Face, { key: found?.face ?? name ?? '', face: found?.face, label: name ?? '?', size: 24 })),
          open ? h(RosterDialog, { remote, directory, available, onClose: () => setOpen(false), t }) : null)
      }
    }

    /** A stand-in for a session's model directory on the Plugins page (no session there): DSH's catalog, read once. */
    function catalogDirectory (remote) {
      let value = { current: null, pending: null, groups: [], status: 'idle' }
      const watchers = new Set()
      const set = next => { value = next; for (const watcher of watchers) watcher() }
      return {
        store: { getSnapshot: () => value, subscribe: watcher => { watchers.add(watcher); return () => watchers.delete(watcher) } },
        load: async () => {
          const catalog = unwrap(await remote.session.modelCatalog())
          set({ ...value, groups: catalog.groups ?? [], status: 'ready' })
          return value
        },
        select: async () => ({ ok: false, error: { message: 'no session' } })
      }
    }

    /** The plugin's page under Plugins: Models & keys and Rankings, without a session. */
    function makeSettings (remote) {
      const directory = catalogDirectory(remote)
      return function RosterSettings ({ t: words }) {
        const t = wordsOf(words)
        const [tab, setTab] = useState('models')
        useEffect(() => { directory.load().catch(() => {}); loadProviders(remote).catch(() => {}) }, [])
        return h('div', { className: 'lr-page' },
          h('nav', { className: 'lr-tabs' }, ['models', 'rankings', 'packs'].map(id => h('button', {
            key: id, type: 'button', className: `lr-tab${tab === id ? ' lr-on' : ''}`, onClick: () => setTab(id)
          }, t(`tab.${id}`)))),
          tab === 'models' ? h(ModelsTab, { remote, directory, t }) : tab === 'packs' ? h(PacksTab, { t }) : h(RankingsTab, { remote, directory, t }))
      }
    }

    /** The cards' feel: a card under the pointer lifts and leans toward it, and a gloss band and a highlight follow the
     * pointer across it, like a boxed game on a shelf. One listener for the page; an element opts in with `.lr-tilt`
     * (`--lr-tilt` is how far it leans, in degrees). It writes the pointer's place as `--lr-px`/`--lr-py` (0 to 1) and
     * the lean as `--lr-rx`/`--lr-ry`, once a frame; the CSS does the rest. Not for touch, nor when the system asks for
     * less motion. */
    function installTilt () {
      let active = null, last = null, frame = 0, most = 10
      const VARS = ['--lr-px', '--lr-py', '--lr-rx', '--lr-ry']
      const release = element => { element.removeAttribute('data-lr-tilting'); for (const name of VARS) element.style.removeProperty(name) }
      const paint = () => {
        frame = 0
        if (!active?.isConnected || !last) return
        const box = active.getBoundingClientRect()
        if (!box.width || !box.height) return
        const x = Math.min(1, Math.max(0, (last.clientX - box.left) / box.width))
        const y = Math.min(1, Math.max(0, (last.clientY - box.top) / box.height))
        active.style.setProperty('--lr-px', x.toFixed(3))
        active.style.setProperty('--lr-py', y.toFixed(3))
        active.style.setProperty('--lr-rx', `${((0.5 - y) * most).toFixed(2)}deg`)
        active.style.setProperty('--lr-ry', `${((x - 0.5) * most).toFixed(2)}deg`)
      }
      const move = event => {
        if (event.pointerType === 'touch') return
        const found = event.target?.closest?.('.lr-tilt') ?? null
        if (found !== active) {
          if (active) release(active)
          active = found && !reducedMotion() ? found : null
          if (active) {
            most = parseFloat(getComputedStyle(active).getPropertyValue('--lr-tilt')) || 10
            active.setAttribute('data-lr-tilting', '')
          }
        }
        last = event
        if (active && !frame) frame = requestAnimationFrame(paint)
      }
      const leave = event => { if (!event.relatedTarget && active) { release(active); active = null } }
      document.addEventListener('pointermove', move, { passive: true })
      document.addEventListener('pointerout', leave, { passive: true })
      return () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerout', leave)
        if (frame) cancelAnimationFrame(frame)
        if (active) release(active)
      }
    }

    const CSS = `
.lr-avatar { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; flex: none; position: relative }
.lr-avatar:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)) }
.lr-avatar .lr-face { box-shadow: 0 0 0 1.5px var(--lr-ring, var(--dsw-alias-border-l3, rgba(128,128,128,.4))) }
.lr-avatar[data-rarity=R] { --lr-ring: #4a90e2 } .lr-avatar[data-rarity=SR] { --lr-ring: #a463f2 }
.lr-avatar[data-rarity=SSR] { --lr-ring: #f2b233 }
.lr-avatar[data-rarity=UR]::after { content: ''; position: absolute; width: 27px; height: 27px; border-radius: 50%; pointer-events: none;
  padding: 1.5px; box-sizing: border-box; background: conic-gradient(#ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude }
.lr-avatar[data-rarity=UR] .lr-face { box-shadow: none }
.lr-avatar[data-pending] .lr-face { opacity: .55 }
.lr-face { border-radius: 50%; object-fit: cover; object-position: 50% 30%; flex: none; display: inline-block; box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.15)) }
.lr-face-none { display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;
  color: var(--dsw-alias-label-secondary, #666) }
.lr-face-big { box-shadow: 0 0 0 2px var(--lr-c, #4a90e2) }
.lr-overlay { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(10, 12, 24, .55); backdrop-filter: blur(3px) }
.lr-dialog { width: min(1080px, 100%); height: min(820px, 100%); display: flex; flex-direction: column; outline: none;
  border-radius: 16px; overflow: hidden; color: var(--dsw-alias-label-primary, #1a1a1a);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)); box-shadow: 0 24px 80px rgba(0,0,0,.35);
  font-size: 13px; line-height: 1.45 }
.lr-dialog-small { width: min(760px, 100%); height: min(680px, 100%) }
.lr-dialog-head { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 18px;
  border-bottom: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.22)) }
.lr-dialog-title { font-weight: 700; font-size: 15px; white-space: nowrap }
.lr-dialog-head .lr-tabs { flex: 1; min-width: 0 }
.lr-close { margin-left: auto; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: inherit;
  font-size: 20px; line-height: 1; cursor: pointer; flex: none }
.lr-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)) }
.lr-dialog-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px 18px }
.lr-tabs { display: flex; gap: 4px; overflow-x: auto }
.lr-tab { height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #555);
  font: inherit; cursor: pointer; white-space: nowrap }
.lr-tab:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)) }
.lr-tab.lr-on { color: var(--dsw-alias-label-primary, inherit); font-weight: 600;
  background: var(--dsw-alias-state-business-secondary, rgba(77,107,254,.12)) }
.lr-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 12px }
.lr-chips, .lr-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
.lr-between { justify-content: space-between }
.lr-spacer { flex: 1 }
.lr-chip { height: 26px; padding: 0 11px; border-radius: 13px; font: inherit; font-size: 12px; color: inherit; cursor: pointer;
  background: transparent; border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.45)) }
.lr-chip.lr-on { border-color: var(--dsw-alias-state-business-primary, #4d6bfe); color: var(--dsw-alias-state-business-primary, #4d6bfe);
  background: var(--dsw-alias-state-business-secondary, rgba(77,107,254,.1)) }
.lr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 12px }
.lr-group { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 13px; font-weight: 600;
  color: var(--dsw-alias-label-secondary, #555) }
.lr-group:first-child { margin-top: 0 }
.lr-group-arrow { font-size: 11px; color: var(--dsw-alias-label-tertiary, #888) }
.lr-group-line { flex: 1; border-top: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,.35)) }
.lr-card { position: relative; aspect-ratio: 2 / 3; border-radius: 12px; overflow: hidden; isolation: isolate; color: #fff;
  --lr-c: #4a90e2; --lr-c2: #9cc7ff; box-shadow: 0 0 0 2px var(--lr-c), 0 6px 18px rgba(0,0,0,.25); transition: transform .12s, box-shadow .12s;
  background: linear-gradient(160deg, color-mix(in srgb, var(--lr-c) 35%, #1b1d2e), #10121d 70%) }
.lr-dialog [data-rarity=SR], .lr-page [data-rarity=SR] { --lr-c: #a463f2; --lr-c2: #d6b4ff }
.lr-dialog [data-rarity=SSR], .lr-page [data-rarity=SSR] { --lr-c: #f2b233; --lr-c2: #ffe39a }
.lr-dialog [data-rarity=UR], .lr-page [data-rarity=UR] { --lr-c: #ff5f9e; --lr-c2: #8fe3ff }
.lr-card[data-rarity=UR]::before, .lr-showcase[data-rarity=UR]::before { content: ''; position: absolute; inset: 0; z-index: 4; pointer-events: none;
  border-radius: inherit; padding: 2px; background: linear-gradient(135deg, #ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude }
.lr-card:hover { box-shadow: 0 0 0 2px var(--lr-c2), 0 10px 26px rgba(0,0,0,.35) }
.lr-card[data-current] { box-shadow: 0 0 0 3px var(--lr-c2), 0 0 22px 2px color-mix(in srgb, var(--lr-c2) 70%, transparent) }
.lr-card-main { position: absolute; inset: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left;
  cursor: pointer; display: block }
.lr-card-main:disabled { cursor: progress }
.lr-card-art { position: absolute; inset: 0; z-index: 0 }
.lr-card-art img, .lr-showcase img, .lr-equip-art img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12% }
.lr-card[data-status=nokey] .lr-card-art, .lr-card[data-status=rejected] .lr-card-art, .lr-card[data-status=error] .lr-card-art,
.lr-showcase[data-status=nokey] img, .lr-showcase[data-status=rejected] img { filter: grayscale(.85) brightness(.6) }
.lr-card[data-status=unused] .lr-card-art, .lr-card[data-status=checking] .lr-card-art { filter: saturate(.55) brightness(.8) }
.lr-card-blank { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 40px;
  font-weight: 800; color: color-mix(in srgb, var(--lr-c2, #9cc7ff) 60%, transparent) }
.lr-card-text { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: flex; flex-direction: column; gap: 1px;
  padding: 26px 9px 8px; background: linear-gradient(transparent, rgba(8,9,16,.82) 38%, rgba(8,9,16,.94)) }
.lr-card-who { font-size: 10.5px; font-weight: 600; color: var(--lr-c2); letter-spacing: .02em; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis }
.lr-who-dark { color: color-mix(in srgb, var(--lr-c, #4a90e2) 80%, var(--dsw-alias-label-primary, #222)) }
.lr-card-name { font-size: 13.5px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere }
.lr-card-meta { display: flex; justify-content: space-between; gap: 6px; font-size: 10.5px; color: rgba(255,255,255,.72) }
.lr-date { font-variant-numeric: tabular-nums }
.lr-rarity { position: absolute; top: 7px; left: 7px; z-index: 2; padding: 1px 7px; border-radius: 6px; font-size: 11px; font-weight: 800;
  font-style: italic; letter-spacing: .04em; color: #1b1300; background: linear-gradient(135deg, var(--lr-c2), var(--lr-c));
  box-shadow: 0 1px 4px rgba(0,0,0,.35) }
.lr-rarity-big { top: 10px; left: 10px; font-size: 16px; padding: 2px 10px }
.lr-more { position: absolute; top: 5px; right: 5px; z-index: 3; width: 30px; height: 24px; border: 0; border-radius: 8px; cursor: pointer;
  background: rgba(8,9,16,.62); color: #fff; font: inherit; font-weight: 800; line-height: 1; letter-spacing: 1px }
.lr-more:hover { background: rgba(8,9,16,.85); box-shadow: 0 0 0 1.5px var(--lr-c2) }
.lr-ribbon { position: absolute; top: 34px; left: 0; z-index: 2; padding: 2px 9px 2px 7px; font-size: 10.5px; font-weight: 700;
  color: #10121d; background: var(--lr-c2); border-radius: 0 8px 8px 0 }
.lr-veil { position: absolute; left: 8px; right: 8px; top: 36%; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 8px; border-radius: 10px; text-align: center; background: rgba(8,9,16,.74); font-size: 11px; color: rgba(255,255,255,.85) }
.lr-veil strong { font-size: 13px; color: #fff }
.lr-card[data-status=rejected] .lr-veil strong, .lr-card[data-status=nokey] .lr-veil strong { color: #ffb4a8 }
.lr-card[data-status=unused] .lr-veil strong { color: #b8f5cf }
.lr-add-card { cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 12px;
  font: inherit; color: var(--dsw-alias-label-secondary, #666); background: transparent; box-shadow: none; text-align: center;
  border: 2px dashed var(--dsw-alias-border-l4, rgba(128,128,128,.55)) }
.lr-add-card:hover { color: var(--dsw-alias-state-business-primary, #4d6bfe); border-color: currentColor; box-shadow: none }
.lr-add-card span:last-child { font-size: 11.5px; opacity: .8 }
.lr-plus { font-size: 44px; font-weight: 300; line-height: 1 }
.lr-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; margin-top: 14px;
  color: var(--dsw-alias-label-tertiary, #888); font-size: 12px }
.lr-credit { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px }
.lr-credit a { color: inherit }
.lr-empty { padding: 48px 12px; text-align: center; color: var(--dsw-alias-label-tertiary, #888); display: flex; flex-direction: column;
  gap: 14px; align-items: center }
.lr-error { margin: 0 0 10px; padding: 7px 10px; border-radius: 8px; font-size: 12px;
  color: var(--dsw-alias-state-error-primary, #d93025); background: var(--dsw-alias-interactive-bg-hover-danger, rgba(217,48,37,.08)) }
.lr-note { margin: 6px 0; padding: 7px 10px; border-radius: 8px; font-size: 12px; background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,.08)) }
.lr-dim { color: var(--dsw-alias-label-tertiary, #888); font-weight: 400 }
.lr-intro { margin: 0 0 12px }
.lr-page-top { display: flex; align-items: center; gap: 12px; margin-bottom: 12px }
.lr-page-title { margin: 0; font-size: 16px }
.lr-character { display: grid; grid-template-columns: minmax(220px, 340px) minmax(0, 1fr); gap: 20px; align-items: start }
.lr-character-art { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 0 }
.lr-showcase { position: relative; aspect-ratio: 2 / 3; border-radius: 16px; overflow: hidden; isolation: isolate;
  box-shadow: 0 0 0 3px var(--lr-c, #4a90e2), 0 12px 32px rgba(0,0,0,.3); background: #10121d }
.lr-gallery { display: flex; flex-direction: column; gap: 6px }
.lr-gallery-row { display: flex; gap: 6px; flex-wrap: wrap }
.lr-thumb { width: 54px; aspect-ratio: 2 / 3; padding: 0; border-radius: 8px; overflow: hidden; cursor: pointer; background: #10121d;
  border: 2px solid transparent }
.lr-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12% }
.lr-thumb.lr-on, .lr-thumb:hover { border-color: var(--lr-c, #4d6bfe) }
.lr-character-info { display: flex; flex-direction: column; gap: 12px; min-width: 0 }
.lr-character-head { display: flex; gap: 12px; align-items: center }
.lr-character-name { margin: 0; font-size: 22px; line-height: 1.2; overflow-wrap: anywhere }
.lr-status-line { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, #555) }
.lr-status-line[data-status=nokey], .lr-status-line[data-status=rejected] { color: var(--dsw-alias-state-error-primary, #d93025) }
.lr-section { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px;
  border: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)) }
.lr-section h3 { margin: 0; font-size: 13px; letter-spacing: .02em }
.lr-stat { display: grid; grid-template-columns: 8.5em 1fr 3em; gap: 8px; align-items: center; font-size: 12px }
.lr-stat-bar { height: 8px; border-radius: 4px; overflow: hidden; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.15)) }
.lr-stat-bar span { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--lr-c, #4a90e2), var(--lr-c2, #9cc7ff)) }
.lr-stat-value { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums }
.lr-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 4px 0 0; font-size: 12px }
.lr-facts dt { color: var(--dsw-alias-label-tertiary, #888) }
.lr-facts dd { margin: 0 }
.lr-effort { padding: 0 7px; border-radius: 10px; font-size: 11px; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.12)) }
.lr-equip { display: flex; flex-wrap: wrap; gap: 14px }
.lr-equip-slot { display: flex; flex-direction: column; align-items: flex-start; gap: 6px }
.lr-equip-art { width: 64px; aspect-ratio: 2 / 3; border-radius: 8px; overflow: hidden; background: #10121d; position: relative }
.lr-page-add { display: flex; flex-direction: column; gap: 12px; max-width: 860px }
.lr-add-pictures { display: flex; flex-direction: column; gap: 14px }
.lr-sticky { position: sticky; bottom: -18px; padding: 10px 0; background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)) }
.lr-models { display: flex; flex-direction: column; gap: 12px }
.lr-provider { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; border-radius: 12px;
  border: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)) }
.lr-parked { opacity: .85; border-style: dashed }
.lr-provider-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap }
.lr-provider-name { font-weight: 700; font-size: 14px }
.lr-compat { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,.06)) }
.lr-confirm { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover-danger, rgba(217,48,37,.08)) }
.lr-check-row { display: flex; gap: 6px; align-items: center; font-size: 12px }
.lr-lines { cursor: pointer; color: var(--dsw-alias-label-secondary, #555) }
.lr-lines:not([data-shown]) { visibility: hidden }
.lr-roster-tools { flex-direction: column; flex-wrap: nowrap; justify-content: flex-start; align-items: stretch }
.lr-tools-row { display: flex; align-items: flex-start; gap: 10px }
.lr-tools-label { flex: 0 0 auto; min-width: 4.5em; line-height: 26px; white-space: nowrap }
.lr-tools-row > .lr-chips { flex: 1 1 auto; min-width: 0 }
.lr-chip.lr-movable { display: inline-flex; align-items: center; gap: 5px; padding-left: 5px }
.lr-grip { display: inline-flex; align-items: center; align-self: stretch; padding: 0 2px; cursor: grab; touch-action: none;
  color: var(--dsw-alias-label-tertiary, #9aa0aa) }
.lr-chip:hover .lr-grip { color: inherit }
.lr-chip.lr-dragging { opacity: .35; border-style: dashed }
.lr-chip.lr-dragging .lr-grip { cursor: grabbing }
.lr-roster-tools .lr-chips { position: relative }
.lr-chip.lr-ghost { position: fixed; left: 0; top: 0; z-index: 50; margin: 0; box-sizing: border-box; pointer-events: none;
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)); border: 1px solid var(--dsw-alias-state-business-primary, #4d6bfe);
  box-shadow: 0 10px 24px -8px rgba(0, 0, 0, .45); transition: opacity .15s; will-change: transform }
.lr-chip.lr-ghost.lr-astray { opacity: .55 }
.lr-insert { position: absolute; z-index: 4; width: 2px; margin-left: -1px; border-radius: 1px; pointer-events: none;
  background: var(--dsw-alias-state-business-primary, #4d6bfe); transition: left .1s ease-out, top .1s ease-out }
.lr-insert::before, .lr-insert::after { content: ''; position: absolute; left: -2px; width: 6px; height: 6px; border-radius: 50%;
  background: inherit }
.lr-insert::before { top: -3px }
.lr-insert::after { bottom: -3px }
.lr-sorting, .lr-sorting * { cursor: grabbing !important; user-select: none !important; -webkit-user-select: none !important }
.lr-roster-options { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; min-height: 30px }
.lr-field { display: flex; flex-direction: column; gap: 6px }
.lr-label { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, #555) }
.lr-key-status { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12px }
.lr-check[data-check=ok] { color: #22a559 } .lr-check[data-check=rejected], .lr-check[data-check=missing] { color: #d93025 }
.lr-dot { width: 8px; height: 8px; border-radius: 50%; background: #999 }
.lr-key-status[data-status=stored] .lr-dot, .lr-key-status[data-status=env] .lr-dot { background: #22a559 }
.lr-key-status[data-status=missing] .lr-dot { background: #d93025 }
.lr-input { height: 30px; min-width: 0; flex: 1 1 200px; box-sizing: border-box; padding: 0 9px; border-radius: 8px; font: inherit; color: inherit;
  background: var(--dsw-alias-bg-layer-3, transparent); border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.lr-select { flex: none; width: min(360px, 100%); cursor: pointer }
.lr-field > .lr-input { flex: none } /* (in a column, a flex basis would be a height) */
.lr-mono, .lr-dialog code, .lr-page code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px }
.lr-small-input { flex: none; width: min(260px, 100%); height: 26px; font-size: 12px }
.lr-add { flex: none; width: min(320px, 100%); cursor: pointer }
.lr-button { height: 30px; padding: 0 13px; border-radius: 8px; font: inherit; cursor: pointer; color: inherit; white-space: nowrap;
  background: transparent; border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.lr-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)) }
.lr-button:disabled { opacity: .5; cursor: default }
.lr-on-button { border-color: var(--dsw-alias-state-business-primary, #4d6bfe); box-shadow: inset 0 0 0 1px var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-small { height: 26px; padding: 0 10px; font-size: 12px }
.lr-big { height: 36px; padding: 0 18px; font-weight: 600 }
.lr-primary { color: var(--dsw-alias-label-primary-foreground, #fff); border-color: transparent;
  background: var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-danger { color: var(--dsw-alias-state-error-primary, #d93025) }
.lr-danger-solid { color: #fff; border-color: transparent; background: var(--dsw-alias-state-error-primary, #d93025) }
.lr-balance { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px }
.lr-usage { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding-top: 8px;
  border-top: .5px dashed var(--dsw-alias-border-l4, rgba(128,128,128,.4)) }
.lr-usage .lr-key-status[data-status=missing] .lr-dot { background: var(--dsw-alias-border-l4, rgba(128,128,128,.6)) }
.lr-usage-toggle { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; padding: 0; border: none;
  background: none; font: inherit; color: inherit; cursor: pointer }
.lr-usage-arrow { width: 10px; font-size: 11px; color: var(--dsw-alias-label-tertiary, #888) }
.lr-pills { display: flex; flex-wrap: wrap; gap: 6px }
.lr-pill { display: inline-flex; align-items: center; gap: 4px; height: 28px; border-radius: 14px; font: inherit; font-size: 12px;
  color: inherit; background: transparent; border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.lr-used { padding: 0 3px; border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  background: var(--dsw-alias-state-business-secondary, rgba(77,107,254,.08)) }
.lr-static { padding: 0 11px }
.lr-pill-face { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; display: inline-flex }
.lr-pill-face:hover { outline: 2px solid var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-pill-text { height: 100%; padding: 0 8px 0 2px; border: 0; background: transparent; font: inherit; color: inherit; cursor: pointer }
.lr-pill-text:hover:not(:disabled) { text-decoration: line-through }
.lr-ignored { padding: 0 11px; cursor: pointer; color: var(--dsw-alias-label-secondary, #555) }
.lr-ignored:hover:not(:disabled) { border-color: var(--dsw-alias-state-business-primary, #4d6bfe); color: var(--dsw-alias-label-primary, inherit) }
.lr-pill:disabled, .lr-pill-text:disabled { opacity: .6; cursor: default }
.lr-pill-date { font-size: 10px; color: var(--dsw-alias-label-tertiary, #888); font-variant-numeric: tabular-nums }
.lr-new { font-size: 9.5px; font-weight: 700; padding: 0 5px; border-radius: 6px; color: #fff; background: #22a559 }
.lr-pictures { display: flex; flex-direction: column; gap: 4px }
.lr-tiles { display: grid; gap: 8px }
.lr-tiles-art { grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)) }
.lr-tiles-face { grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)) }
.lr-tile-holder { position: relative }
.lr-tile { width: 100%; padding: 0; overflow: hidden; cursor: pointer; background: #10121d; border: 2px solid transparent; display: block }
.lr-tile-art { aspect-ratio: 2 / 3; border-radius: 8px }
.lr-tile-face { aspect-ratio: 1; border-radius: 50% }
.lr-tile img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12% }
.lr-tile-face img { object-position: 50% 30% }
.lr-tile.lr-on, .lr-tile:hover { border-color: var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-tile-forget { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; border: 0; cursor: pointer;
  background: rgba(0,0,0,.6); color: #fff; line-height: 1 }
.lr-art-group { display: flex; flex-direction: column; gap: 6px; margin-top: 10px }
.lr-rankings { display: flex; flex-direction: column; gap: 10px }
.lr-table { width: 100%; border-collapse: collapse; font-size: 12.5px }
.lr-table th { text-align: left; font-weight: 600; font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #888); padding: 6px 8px;
  border-bottom: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)) }
.lr-table td { padding: 6px 8px; border-bottom: .5px solid var(--dsw-alias-border-l1, rgba(128,128,128,.12)); vertical-align: top;
  font-variant-numeric: tabular-nums }
.lr-table tr.lr-mine td { background: var(--dsw-alias-state-business-secondary, rgba(77,107,254,.08)) }
.lr-table tr.lr-mine td:first-child { box-shadow: inset 3px 0 var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-bar { display: inline-block; min-width: 64px; padding: 0 6px; border-radius: 4px; font-weight: 600;
  background: linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-state-business-primary, #4d6bfe) 28%, transparent) var(--lr-bar), transparent var(--lr-bar)) }
.lr-page { display: flex; flex-direction: column; gap: 12px }
/* the leaderboard: it scrolls sideways within itself, never the page */
.lr-board { overflow-x: auto; margin: 0 -4px; padding: 0 4px; -webkit-overflow-scrolling: touch }
.lr-board-table { min-width: 720px }
.lr-board-table th { padding: 2px 4px; white-space: nowrap }
.lr-board-table td { white-space: nowrap }
.lr-board-table td.lr-col-model { white-space: normal; min-width: 150px }
.lr-board-name { font-weight: 600 }
.lr-board-find { flex: 1 1 220px; max-width: 320px }
.lr-sort { height: 26px; padding: 0 4px; border: 0; border-radius: 6px; background: transparent; font: inherit; color: inherit; cursor: pointer;
  white-space: nowrap }
.lr-sort:hover { background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.12)) }
.lr-sort.lr-on { color: var(--dsw-alias-label-primary, #111) }
.lr-board-table .lr-col-rank { width: 2.5em; color: var(--dsw-alias-label-tertiary, #888) }
.lr-stat-small { color: var(--dsw-alias-label-secondary, #555) }
.lr-stat-small .lr-stat-bar { height: 5px }
/* the art packs */
.lr-packs { display: flex; flex-direction: column; gap: 12px }
.lr-packs-intro { margin: 0; font-size: 12.5px; line-height: 1.5 }
.lr-pack-list { display: flex; flex-direction: column; gap: 10px }
.lr-pack { display: grid; grid-template-columns: 148px 1fr; gap: 14px; padding: 12px 14px; border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)); background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.04)) }
.lr-pack.lr-on { border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary, #4d6bfe) inset }
.lr-pack-faces { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; align-content: start }
.lr-pack-faces img { width: 100%; aspect-ratio: 1; border-radius: 50%; object-fit: cover; object-position: 50% 30%;
  background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.12)) }
.lr-pack-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 12.5px }
.lr-pack-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 14px }
.lr-pack-folder { overflow-wrap: anywhere; font-size: 11.5px }
.lr-pack-about { line-height: 1.45 }
.lr-included { display: flex; flex-direction: column; gap: 6px; padding-bottom: 6px;
  border-bottom: .5px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)) }
.lr-included-pack { display: flex; align-items: center; justify-content: space-between; gap: 12px }
.lr-account-balance { margin-top: 4px; font-weight: 600 }
.lr-failures { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 8px; font-size: 12px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d93025) 7%, transparent);
  border: .5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d93025) 30%, transparent) }
.lr-failures ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px }
.lr-failures li[data-mine] { padding-left: 6px; box-shadow: inset 2px 0 var(--dsw-alias-state-error-primary, #d93025) }
.lr-failure-code { font-weight: 600; color: var(--dsw-alias-state-error-primary, #d93025) }
.lr-failure-message { color: var(--dsw-alias-label-secondary, #555); overflow-wrap: anywhere }
.lr-failed { position: absolute; top: 6px; right: 40px; z-index: 3; width: 22px; height: 22px; border-radius: 50%; display: grid;
  place-items: center; font-size: 12px; background: rgba(217,48,37,.9); color: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4) }
.lr-pack-switch { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap }
.lr-pack-switch .lr-select { flex: 0 1 auto; width: auto; min-width: 9em; max-width: 16em; height: 28px }
.lr-pack-switch .lr-pack-name { flex: 0 1 14em; height: 28px }
.lr-pack-changes { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 8px; font-size: 12px;
  background: var(--dsw-alias-state-business-secondary, rgba(77,107,254,.08)) }
.lr-tag { padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.14)) }
.lr-tag-on { color: #fff; background: var(--dsw-alias-state-business-primary, #4d6bfe) }
a.lr-button { display: inline-flex; align-items: center; text-decoration: none; box-sizing: border-box }
.lr-how ol { margin: 8px 0 0; padding-left: 20px; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #555) }
.lr-how li + li { margin-top: 4px }
.lr-tree { margin: 8px 0 0; padding: 8px 12px; border-radius: 8px; font-size: 11.5px; line-height: 1.45;
  background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.1)); overflow-x: auto }
/* summon */
.lr-summon { display: flex; flex-direction: column; gap: 14px }
.lr-banner { position: relative; min-height: 230px; border-radius: 14px; overflow: hidden; isolation: isolate; color: #fff;
  background: radial-gradient(120% 140% at 85% 10%, #33307a, #141a3c 55%, #0a0d20); box-shadow: 0 10px 30px rgba(0,0,0,.28) }
.lr-banner::before { content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none; border-radius: inherit; padding: 2px;
  background: linear-gradient(135deg, #ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude }
.lr-banner-art { position: absolute; top: 0; bottom: 0; right: 0; width: 44%; z-index: 0;
  -webkit-mask: linear-gradient(90deg, transparent, #000 32%); mask: linear-gradient(90deg, transparent, #000 32%) }
.lr-banner-art img, .lr-banner-art .lr-card-blank { width: 100%; height: 100%; object-fit: cover; object-position: 50% 14% }
.lr-banner-second { right: 30%; width: 30%; opacity: .5; filter: saturate(.8);
  -webkit-mask: linear-gradient(90deg, transparent, #000 35%, #000 60%, transparent); mask: linear-gradient(90deg, transparent, #000 35%, #000 60%, transparent) }
.lr-banner-text { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 18px 20px;
  max-width: 58%; text-shadow: 0 1px 8px rgba(0,0,0,.6) }
.lr-banner-label { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #8fe3ff }
.lr-banner-name { font-size: 24px; line-height: 1.15; font-weight: 800; overflow-wrap: anywhere }
.lr-banner-small { font-size: 12px; color: rgba(255,255,255,.8) }
.lr-stars { color: #ffd36e; letter-spacing: 1px; text-shadow: 0 0 6px rgba(255,190,60,.65); font-size: 13px; white-space: nowrap }
.lr-pity-line { margin-top: 8px; font-size: 11.5px; color: rgba(255,255,255,.88) }
.lr-pity-bar { display: block; height: 5px; width: min(260px, 100%); border-radius: 3px; background: rgba(255,255,255,.16); overflow: hidden }
.lr-pity-bar span { display: block; height: 100%; background: linear-gradient(90deg, #ff5f9e, #ffd36e, #7cf2c1, #8fe3ff) }
.lr-face-chip { display: inline-flex; align-items: center; gap: 6px; padding-left: 3px }
.lr-summon-buttons { gap: 10px }
.lr-summon-button { height: auto; min-height: 44px; padding: 5px 20px; display: inline-flex; flex-direction: column; align-items: center;
  justify-content: center; line-height: 1.25 }
.lr-summon-button span { font-size: 11px; opacity: .8 }
.lr-summon-stats { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--dsw-alias-label-secondary, #666) }
.lr-rates summary { cursor: pointer; font-weight: 600; width: max-content }
.lr-rates .lr-table { max-width: 360px; margin-top: 8px }
.lr-rates ul { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: var(--dsw-alias-label-secondary, #555) }
.lr-album { display: grid; grid-template-columns: repeat(auto-fill, minmax(54px, 1fr)); gap: 7px }
button.lr-album-tile { display: block; width: 100%; padding: 0; border: none; font: inherit; color: inherit; cursor: zoom-in }
.lr-wallet { position: relative; display: inline-flex; align-items: center; margin-right: 6px; font-weight: 700; font-size: 13px }
.lr-gain { position: absolute; right: 0; bottom: 100%; margin-bottom: 1px; font-size: 12px; color: #f2b233; white-space: nowrap;
  pointer-events: none; animation: lr-gain 2.6s ease-out both }
@keyframes lr-gain { 0% { opacity: 0; transform: translateY(6px) } 15% { opacity: 1; transform: none } 80% { opacity: 1 }
  100% { opacity: 0; transform: translateY(-10px) } }
.lr-cheat { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 2px 0 10px }
.lr-cheat .lr-input { flex: 0 1 14em; width: 14em; height: 28px; text-transform: uppercase }
.lr-cheat-note { margin: 0; padding: 4px 9px }
.lr-viewer { position: fixed; inset: 0; z-index: 2100; display: flex; flex-direction: column; color: #eef1fb;
  background: rgba(8, 10, 18, .97); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px) }
.lr-viewer-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 10px 14px;
  background: rgba(255, 255, 255, .04); border-bottom: 1px solid rgba(255, 255, 255, .08) }
.lr-viewer-title { display: inline-flex; align-items: baseline; gap: 8px; min-width: 0 }
.lr-viewer-title strong { font-size: 14px }
.lr-viewer-who { font-size: 12px; opacity: .7 }
.lr-viewer-group { display: inline-flex; align-items: center; gap: 4px }
.lr-viewer-count { min-width: 3.6em; text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; opacity: .85 }
.lr-viewer-button { min-width: 30px; height: 30px; padding: 0 10px; border-radius: 15px; border: 1px solid rgba(255, 255, 255, .18);
  background: rgba(255, 255, 255, .06); color: inherit; font: inherit; font-size: 13px; cursor: pointer }
.lr-viewer-button:hover:not(:disabled) { background: rgba(255, 255, 255, .14) }
.lr-viewer-button:disabled { opacity: .4; cursor: default }
.lr-viewer-close { width: 36px; height: 36px; margin-left: 2px; padding: 0; border-radius: 18px; border: 1px solid rgba(255, 255, 255, .32);
  background: rgba(255, 255, 255, .14); color: #fff; font: inherit; font-size: 22px; line-height: 1; cursor: pointer }
.lr-viewer-close:hover { background: #e5484d; border-color: #e5484d }
.lr-viewer-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none }
.lr-viewer-stage:active { cursor: grabbing }
.lr-viewer-stage img { position: absolute; left: 0; top: 0; max-width: none; transform-origin: 0 0; will-change: transform;
  border-radius: 4px; box-shadow: 0 20px 60px rgba(0, 0, 0, .6); pointer-events: none }
.lr-viewer-hint { padding: 6px 14px 10px; font-size: 11.5px; text-align: center; opacity: .6 }
.lr-album-group { margin: 4px 0 0; font-size: 12.5px }
.lr-album-group:first-child { margin-top: 0 }
.lr-album-tile { position: relative; aspect-ratio: 3 / 4; border-radius: 6px; overflow: hidden; background: #10121d;
  --lr-c: #4a90e2; box-shadow: 0 0 0 1.5px var(--lr-c) }
.lr-album-tile img, .lr-album-tile .lr-card-blank { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12%; font-size: 16px }
.lr-album-tile.lr-locked { box-shadow: 0 0 0 1px var(--dsw-alias-border-l3, rgba(128,128,128,.35)); background: #1a1d2e }
.lr-album-tile.lr-locked img { filter: grayscale(1) brightness(.3) blur(1.5px) }
.lr-album-tile.lr-locked::after { content: '?'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 800; color: rgba(255,255,255,.4) }
.lr-album-count { position: absolute; right: 2px; bottom: 2px; padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: 700;
  color: #fff; background: rgba(0,0,0,.66) }
/* the cards' feel: lift and lean toward the pointer, a gloss band and a highlight following it (installTilt) */
.lr-tilt { transform: perspective(900px) rotateX(var(--lr-rx, 0deg)) rotateY(var(--lr-ry, 0deg)) translateY(var(--lr-lift, 0px)) scale(var(--lr-zoom, 1));
  transition: transform .7s cubic-bezier(.2,.9,.25,1), box-shadow .5s ease }
.lr-tilt[data-lr-tilting] { --lr-lift: -7px; --lr-zoom: 1.035; z-index: 2; will-change: transform;
  transition: transform .16s ease-out, box-shadow .3s ease }
.lr-card.lr-tilt[data-lr-tilting] { box-shadow: 0 0 0 2px var(--lr-c2),
  calc((var(--lr-px, .5) - .5) * -26px) calc(20px + (var(--lr-py, .5) - .5) * -14px) 34px -10px rgba(0,0,0,.6),
  0 0 28px -6px color-mix(in srgb, var(--lr-c2) 65%, transparent) }
.lr-add-card.lr-tilt[data-lr-tilting] { box-shadow: 0 16px 30px -14px rgba(0,0,0,.35) }
.lr-gloss { position: absolute; inset: 0; z-index: 3; pointer-events: none; border-radius: inherit; overflow: hidden; opacity: 0;
  transition: opacity .45s ease }
.lr-tilt[data-lr-tilting] > .lr-gloss { opacity: 1 }
.lr-gloss::before { content: ''; position: absolute; inset: 0;
  background: radial-gradient(farthest-corner circle at calc(var(--lr-px, .5) * 100%) calc(var(--lr-py, 0) * 100%),
    rgba(255,255,255,.26), rgba(255,255,255,.07) 30%, transparent 62%) }
.lr-gloss::after { content: ''; position: absolute; top: -40%; bottom: -40%; left: 0; width: 34%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.06) 28%, rgba(255,255,255,.34) 50%, rgba(255,255,255,.06) 72%, transparent);
  transform: translateX(calc(var(--lr-px, -.6) * 294% - 100%)) skewX(-18deg); transition: transform .6s cubic-bezier(.2,.9,.25,1) }
.lr-holo { position: absolute; inset: 0; z-index: 1; pointer-events: none; border-radius: inherit; mix-blend-mode: color-dodge; opacity: .16;
  background-image: linear-gradient(115deg, transparent 18%, rgba(255,95,158,.6) 30%, rgba(255,211,110,.6) 38%, rgba(124,242,193,.6) 46%,
    rgba(143,227,255,.6) 54%, rgba(180,140,255,.6) 62%, transparent 74%);
  background-size: 260% 260%; background-position: calc(var(--lr-px, .5) * 100%) calc(var(--lr-py, .5) * 100%);
  transition: opacity .45s ease; animation: lr-holo-drift 7s ease-in-out infinite alternate }
[data-rarity=SSR] .lr-holo { opacity: .12; background-image: linear-gradient(115deg, transparent 26%, rgba(255,226,140,.75) 42%,
  rgba(255,255,255,.55) 50%, rgba(255,190,80,.75) 58%, transparent 74%) }
.lr-tilt[data-lr-tilting] .lr-holo { opacity: .46; animation: none }
.lr-more { z-index: 6 }
.lr-showcase.lr-tilt { --lr-tilt: 7 }
.lr-showcase.lr-tilt[data-lr-tilting] { --lr-lift: -4px; --lr-zoom: 1.015;
  box-shadow: 0 0 0 3px var(--lr-c, #4a90e2), calc((var(--lr-px, .5) - .5) * -30px) calc(24px + (var(--lr-py, .5) - .5) * -16px) 40px -12px rgba(0,0,0,.55) }
.lr-showcase-art { animation: lr-fade .45s ease both }
.lr-album-tile.lr-tilt { --lr-tilt: 16 }
.lr-album-tile.lr-tilt[data-lr-tilting] { --lr-lift: -3px; --lr-zoom: 1.1; box-shadow: 0 0 0 1.5px var(--lr-c), 0 10px 18px -6px rgba(0,0,0,.55) }
.lr-banner.lr-tilt { --lr-tilt: 3 }
.lr-banner.lr-tilt[data-lr-tilting] { --lr-lift: -2px; --lr-zoom: 1.006 }
.lr-banner-art { translate: calc((var(--lr-px, .5) - .5) * -18px) calc((var(--lr-py, .5) - .5) * -8px); transition: translate .7s cubic-bezier(.2,.9,.25,1) }
.lr-banner-second { translate: calc((var(--lr-px, .5) - .5) * -7px) calc((var(--lr-py, .5) - .5) * -3px) }
.lr-banner-shine { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; border-radius: inherit }
.lr-banner-shine::after { content: ''; position: absolute; top: -30%; bottom: -30%; left: 0; width: 20%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent); transform: translateX(-120%) skewX(-18deg);
  animation: lr-shine 7s 1.2s ease-in-out infinite }
.lr-twinkle { position: absolute; z-index: 1; left: var(--x); top: var(--y); font-size: var(--s); line-height: 1; color: #fff; pointer-events: none;
  opacity: 0; text-shadow: 0 0 8px #8fe3ff, 0 0 14px #ff8fd0; animation: lr-twinkle 3.4s var(--t) ease-in-out infinite }

/* the dialog's entrances */
.lr-overlay { animation: lr-fade .28s ease both }
.lr-dialog { animation: lr-dialog-in .45s cubic-bezier(.2,.9,.25,1) both }
.lr-dialog-body > * { animation: lr-fade-up .4s cubic-bezier(.2,.9,.25,1) both }
.lr-grid > .lr-card { animation: lr-rise .55s calc(min(var(--n, 0), 24) * 24ms) cubic-bezier(.2,.9,.25,1) both }
.lr-page-character .lr-character-art { animation: lr-from-side .5s cubic-bezier(.2,.9,.25,1) both }
.lr-page-character .lr-character-info { animation: lr-fade-up .5s .08s cubic-bezier(.2,.9,.25,1) both }
.lr-avatar { transition: transform .3s cubic-bezier(.3,1.5,.5,1) }
.lr-avatar:hover { transform: scale(1.12) }
.lr-avatar:active { transform: scale(.95) }
.lr-avatar .lr-face { animation: lr-pop-in .5s cubic-bezier(.3,1.6,.5,1) both }
.lr-thumb, .lr-tile { transition: transform .3s cubic-bezier(.2,.9,.25,1), border-color .2s, box-shadow .3s }
.lr-thumb:hover, .lr-tile:hover { transform: translateY(-3px); box-shadow: 0 8px 16px -6px rgba(0,0,0,.45) }
.lr-chip, .lr-tab, .lr-button { transition: background-color .2s, border-color .2s, color .2s, transform .15s, box-shadow .2s, filter .2s }
.lr-button:active:not(:disabled), .lr-chip:active { transform: scale(.97) }
.lr-summon-button { position: relative; overflow: hidden }
.lr-summon-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 18px -6px rgba(77,107,254,.55) }
.lr-summon-button:active:not(:disabled) { transform: translateY(0) scale(.97) }
.lr-summon-button.lr-primary::after { content: ''; position: absolute; top: -20%; bottom: -20%; left: 0; width: 30%; pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent); transform: translateX(-150%) skewX(-20deg);
  animation: lr-shine-button 3.6s 1s ease-in-out infinite }

/* the summon's stage */
.lr-stage { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  width: 100%; min-height: 460px; padding: 18px; box-sizing: border-box; border: 0; border-radius: 14px; overflow: hidden; color: #fff;
  font: inherit; isolation: isolate; --lr-o: #8fb8ff; --lr-lit: #dbe7ff; --lr-lit-glow: rgba(190,215,255,.85);
  background: radial-gradient(90% 80% at 50% 45%, #1c2b66, #0b1029 68%, #060818) }
.lr-stage[data-glow=gold] { --lr-lit: #ffd36e; --lr-lit-glow: rgba(255,200,90,.9) }
.lr-stage[data-glow=rainbow] { --lr-lit: #ffffff; --lr-lit-glow: rgba(255,150,220,.9) }
.lr-sky { position: absolute; inset: -30%; z-index: -1; pointer-events: none;
  background: radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,.9), transparent), radial-gradient(1px 1px at 27% 72%, rgba(255,255,255,.75), transparent),
    radial-gradient(1.5px 1.5px at 44% 12%, rgba(255,255,255,.65), transparent), radial-gradient(1px 1px at 63% 84%, rgba(255,255,255,.8), transparent),
    radial-gradient(2px 2px at 78% 22%, rgba(255,255,255,.85), transparent), radial-gradient(1px 1px at 90% 58%, rgba(255,255,255,.6), transparent),
    radial-gradient(1px 1px at 6% 60%, rgba(255,255,255,.65), transparent), radial-gradient(1.5px 1.5px at 54% 46%, rgba(255,255,255,.4), transparent),
    radial-gradient(1px 1px at 35% 38%, rgba(200,220,255,.7), transparent), radial-gradient(1.5px 1.5px at 70% 66%, rgba(200,220,255,.6), transparent),
    radial-gradient(1px 1px at 18% 88%, rgba(255,255,255,.6), transparent), radial-gradient(1px 1px at 86% 8%, rgba(255,255,255,.7), transparent);
  animation: lr-drift 60s linear infinite }
.lr-charge .lr-sky { animation: lr-warp 2.8s cubic-bezier(.6,0,.9,.4) both, lr-drift 60s linear infinite }
.lr-charge { cursor: pointer }
.lr-charge[data-glow=rainbow] { animation: lr-shake 2.8s linear both }
.lr-sparks { position: absolute; inset: 0; z-index: -1; pointer-events: none }
.lr-sparks span { position: absolute; bottom: -8px; left: var(--x); width: var(--s); height: var(--s); border-radius: 50%; opacity: 0;
  background: #e2ecff; box-shadow: 0 0 6px 1px rgba(150,190,255,.85); animation: lr-spark-rise var(--d) var(--t) linear infinite }
.lr-ring { position: relative; width: 240px; height: 240px; flex: none }
.lr-ring-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible }
.lr-ring-svg circle, .lr-ring-svg rect { fill: none; stroke: var(--lr-o); stroke-width: 1.5 }
.lr-ring-svg text { fill: var(--lr-o); font: 600 8.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: 1.4px }
.lr-ring-lit circle, .lr-ring-lit rect { stroke: var(--lr-lit) }
.lr-ring-lit text { fill: var(--lr-lit) }
.lr-charge[data-glow=rainbow] .lr-ring-lit circle, .lr-charge[data-glow=rainbow] .lr-ring-lit rect { stroke: url(#lr-prism) }
.lr-charge[data-glow=rainbow] .lr-ring-lit text { fill: url(#lr-prism) }
.lr-ring-svg > g { transform-origin: 120px 120px }
.lr-ring-base { filter: drop-shadow(0 0 4px rgba(120,160,255,.85)); animation: lr-ring-in .9s cubic-bezier(.2,.9,.25,1) both }
.lr-ring-lit { filter: drop-shadow(0 0 6px var(--lr-lit-glow)); animation: lr-ring-in .9s cubic-bezier(.2,.9,.25,1) both, lr-lit 2.8s ease-in both }
.lr-draw { stroke-width: 2.2 !important; stroke-dasharray: 704; stroke-dashoffset: 704; animation: lr-draw 1s .1s cubic-bezier(.6,0,.2,1) forwards }
.lr-ticks { stroke-width: 5 !important; stroke-dasharray: 1.2 9.6; opacity: .75 }
.lr-thin { stroke-width: 1 !important; opacity: .6 }
.lr-arcs { stroke-width: 3 !important; stroke-dasharray: 60 37.4 }
.lr-square { stroke-width: 1 !important; opacity: .55 }
.lr-spin, .lr-spin-back, .lr-spin-fast, .lr-spin-slow { transform-origin: 120px 120px }
.lr-spin { animation: lr-spin 12s linear infinite }
.lr-spin-back { animation: lr-spin-back 18s linear infinite }
.lr-spin-fast { animation: lr-spin-back 2.4s linear infinite }
.lr-spin-slow { animation: lr-spin 26s linear infinite }
.lr-rays { position: absolute; left: 50%; top: 50%; width: 1100px; height: 1100px; margin: -550px 0 0 -550px; z-index: -1; border-radius: 50%;
  pointer-events: none; opacity: 0;
  background: repeating-conic-gradient(from 0deg, rgba(190,215,255,.14) 0deg 3deg, transparent 3deg 15deg);
  -webkit-mask: radial-gradient(circle, #000 6%, transparent 60%); mask: radial-gradient(circle, #000 6%, transparent 60%);
  animation: lr-rays-in 2.8s ease-in both, lr-spin 22s linear infinite }
.lr-charge[data-glow=gold] .lr-rays { background: repeating-conic-gradient(from 0deg, rgba(255,210,110,.26) 0deg 3deg, transparent 3deg 14deg);
  animation: lr-rays-in 2.8s ease-in both, lr-spin 16s linear infinite }
.lr-charge[data-glow=rainbow] .lr-rays { background: repeating-conic-gradient(from 0deg, rgba(255,255,255,.26) 0deg 3deg, transparent 3deg 12deg),
  conic-gradient(rgba(255,95,158,.4), rgba(255,211,110,.4), rgba(124,242,193,.4), rgba(143,227,255,.4), rgba(180,140,255,.4), rgba(255,95,158,.4));
  animation: lr-rays-in 2.8s ease-in both, lr-spin 10s linear infinite }
.lr-core { position: absolute; left: 50%; top: 50%; width: 92px; height: 92px; margin: -46px 0 0 -46px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, #fff 0 14%, var(--lr-o) 38%, transparent 70%); animation: lr-core 2.8s ease-in both }
.lr-core::after { content: ''; position: absolute; inset: 0; border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, #fff 0 14%, var(--lr-lit) 40%, transparent 70%); animation: lr-lit 2.8s ease-in both }
.lr-charge[data-glow=rainbow] .lr-core::after {
  background: radial-gradient(circle, #fff 0 16%, transparent 58%), conic-gradient(#ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e);
  -webkit-mask: radial-gradient(circle, #000 34%, transparent 70%); mask: radial-gradient(circle, #000 34%, transparent 70%);
  animation: lr-lit 2.8s ease-in both, lr-spin 1.2s linear infinite }
.lr-shock { position: absolute; left: 50%; top: 50%; width: 240px; height: 240px; margin: -120px 0 0 -120px; border-radius: 50%; pointer-events: none;
  opacity: 0; box-shadow: 0 0 0 3px var(--lr-lit), 0 0 26px 6px var(--lr-lit-glow), inset 0 0 18px 2px var(--lr-lit-glow);
  animation: lr-shock 2.8s ease-out both }
.lr-charge[data-glow=rainbow] .lr-shock { box-shadow: 0 0 0 3px #fff, 0 0 30px 8px #ff8fd0, inset 0 0 24px 4px #8fe3ff }
.lr-tokens span { position: absolute; left: 50%; top: 50%; white-space: nowrap; pointer-events: none; opacity: 0;
  font: 600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #d5e3ff; text-shadow: 0 0 8px rgba(140,180,255,.95);
  animation: lr-token 1.2s var(--t) cubic-bezier(.55,0,.8,.4) both }
.lr-prompt { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; color: #d5e3ff; white-space: nowrap;
  clip-path: inset(0 100% 0 0); animation: lr-type .8s steps(12) .25s forwards }
.lr-thinking { font-size: 12px; letter-spacing: .08em; color: rgba(210,225,255,.65); animation: lr-breathe 1.2s ease-in-out infinite }
.lr-flash { position: absolute; inset: 0; z-index: 5; background: #fff; opacity: 0; pointer-events: none; animation: lr-flash 2.8s ease-in both }

/* the cards dealt */
.lr-reveal { justify-content: center }
.lr-reveal::before { content: ''; position: absolute; inset: 0; z-index: 5; background: #fff; opacity: 0; pointer-events: none;
  animation: lr-unflash .55s ease-out both }
.lr-pulls { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; width: 100%; max-width: 900px }
.lr-pulls-one { grid-template-columns: minmax(0, 220px); justify-content: center }
.lr-pull { position: relative; display: block; aspect-ratio: 2 / 3; padding: 0; border: 0; background: transparent; color: #fff; font: inherit;
  text-align: left; isolation: isolate; --lr-c: #4a90e2; --lr-c2: #9cc7ff; --flip: calc(var(--i) * 170ms + 900ms);
  animation: lr-deal .75s calc(var(--i) * 45ms + 80ms) cubic-bezier(.2,.9,.3,1.04) both }
button.lr-pull { cursor: pointer }
.lr-pull-tilt { position: absolute; inset: 0; border-radius: 10px; perspective: 900px; --lr-tilt: 12 }
.lr-pull-tilt[data-lr-tilting] { box-shadow: calc((var(--lr-px, .5) - .5) * -22px) calc(16px + (var(--lr-py, .5) - .5) * -12px) 28px -10px rgba(0,0,0,.75) }
.lr-pull-inner { position: absolute; inset: 0; transform-style: preserve-3d;
  animation: lr-flip .62s var(--flip) cubic-bezier(.3,.7,.3,1.1) both }
.lr-pull[data-rarity=SSR] .lr-pull-inner { animation: lr-flip .62s var(--flip) cubic-bezier(.3,.7,.3,1.1) both,
  lr-pop-small .55s calc(var(--flip) + 420ms) cubic-bezier(.3,1.5,.5,1) both }
.lr-pull[data-rarity=UR] .lr-pull-inner { animation: lr-flip .62s var(--flip) cubic-bezier(.3,.7,.3,1.1) both,
  lr-pop .65s calc(var(--flip) + 420ms) cubic-bezier(.3,1.5,.5,1) both }
.lr-pull-back, .lr-pull-front { position: absolute; inset: 0; border-radius: 10px; overflow: hidden; backface-visibility: hidden;
  -webkit-backface-visibility: hidden }
.lr-pull-back { transform: rotateY(180deg); display: flex; align-items: center; justify-content: center;
  background: repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 6px, transparent 6px 12px), linear-gradient(160deg, #26337e, #0e1331);
  box-shadow: inset 0 0 0 2px rgba(160,190,255,.5), inset 0 0 0 6px rgba(10,14,40,.9), inset 0 0 0 7px rgba(160,190,255,.3) }
.lr-pull-back span { font-size: 30px; color: rgba(195,215,255,.85); text-shadow: 0 0 14px rgba(140,180,255,.9); animation: lr-breathe 1.6s ease-in-out infinite }
.lr-pull[data-rarity=SSR] .lr-pull-back { animation: lr-hint-gold 1.1s ease-in-out infinite;
  box-shadow: inset 0 0 0 2px #ffd36e, inset 0 0 0 6px rgba(10,14,40,.9), inset 0 0 0 7px rgba(255,211,110,.45), inset 0 0 26px rgba(255,200,90,.45) }
.lr-pull[data-rarity=SSR] .lr-pull-back span { color: #ffe39a; text-shadow: 0 0 16px rgba(255,200,90,.95) }
.lr-pull[data-rarity=UR] .lr-pull-back::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 2.5px;
  background: conic-gradient(#ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e); animation: lr-hue 1.6s linear infinite;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude }
.lr-pull[data-rarity=UR] .lr-pull-back { box-shadow: inset 0 0 0 6px rgba(10,14,40,.9), inset 0 0 34px rgba(255,150,220,.5) }
.lr-pull[data-rarity=UR] .lr-pull-back span { color: #fff; text-shadow: 0 0 12px #ff8fd0, 0 0 24px #8fe3ff }
.lr-pull-front { isolation: isolate; background: linear-gradient(160deg, color-mix(in srgb, var(--lr-c) 35%, #1b1d2e), #10121d 70%) }
.lr-pull-front::before { content: ''; position: absolute; inset: 0; z-index: 2; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--lr-c) }
button.lr-pull:hover .lr-pull-front::before { box-shadow: inset 0 0 0 2px var(--lr-c2), inset 0 0 16px color-mix(in srgb, var(--lr-c2) 60%, transparent) }
.lr-pull-art { position: absolute; inset: 0; z-index: 0 }
.lr-pull-art img, .lr-pull-art .lr-card-blank { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12% }
.lr-pull-equipment .lr-pull-front { background: repeating-linear-gradient(-45deg, rgba(255,255,255,.04) 0 5px, transparent 5px 10px),
  linear-gradient(160deg, color-mix(in srgb, var(--lr-c) 45%, #20223a), #12142a) }
.lr-pull-equipment .lr-pull-art { inset: 7px 7px 36% 7px; z-index: 0; border-radius: 6px; overflow: hidden; box-shadow: 0 0 0 1.5px var(--lr-c2) }
.lr-pull-text { position: absolute; left: 0; right: 0; bottom: 0; z-index: 1; display: flex; flex-direction: column; gap: 1px; padding: 22px 7px 6px;
  background: linear-gradient(transparent, rgba(8,9,16,.85) 40%, rgba(8,9,16,.95)) }
.lr-pull-equipment .lr-pull-text { top: 64%; padding-top: 5px; background: none }
.lr-pull .lr-card-who { font-size: 9.5px }
.lr-pull .lr-card-name { font-size: 12px; line-height: 1.2 }
.lr-pull-effect { font-size: 10px; line-height: 1.25; color: rgba(255,255,255,.72) }
.lr-pull .lr-stars { position: absolute; top: 5px; left: 5px; z-index: 2; font-size: 11px; padding: 0 5px; border-radius: 6px;
  background: rgba(8,9,16,.6) }
.lr-pull-equipment .lr-stars { top: 10px; left: 10px }
.lr-new { position: absolute; top: 5px; right: 6px; z-index: 2; padding: 0 5px; border-radius: 4px; font-size: 10px; font-weight: 800;
  color: #1b1300; background: #ffe39a; animation: lr-badge .5s calc(var(--flip) + 560ms) cubic-bezier(.3,1.7,.5,1) both }
.lr-new.lr-pity { color: #fff; background: linear-gradient(90deg, #ff5f9e, #6aa8ff) }
.lr-sweep { position: absolute; inset: 0; z-index: 4; pointer-events: none; overflow: hidden; border-radius: inherit }
.lr-sweep::after { content: ''; position: absolute; top: -30%; bottom: -30%; left: 0; width: 40%; transform: translateX(-130%) skewX(-18deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent); animation: lr-sweep .85s calc(var(--flip) + 380ms) ease-out both }
.lr-pull[data-rarity=R] .lr-sweep::after { background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent) }
.lr-pull-fx { position: absolute; left: 50%; top: 45%; width: 0; height: 0; z-index: 3; pointer-events: none }
.lr-pull-fx span { position: absolute; left: 0; top: 0; font-size: 15px; line-height: 1; color: #ffe39a; opacity: 0;
  text-shadow: 0 0 2px rgba(40,24,0,.8), 0 0 8px rgba(255,200,90,.95); animation: lr-spark-out .95s calc(var(--flip) + 420ms) cubic-bezier(.2,.8,.3,1) both }
.lr-pull[data-rarity=UR] .lr-pull-fx span { font-size: 18px; color: #fff; text-shadow: 0 0 2px rgba(60,0,40,.8), 0 0 8px #ff8fd0, 0 0 16px #8fe3ff }
.lr-pull::after { content: ''; position: absolute; inset: -16%; z-index: -1; border-radius: 50%; pointer-events: none; opacity: 0 }
.lr-pull[data-rarity=SSR]::after { background: radial-gradient(circle, rgba(255,210,100,.75), transparent 65%);
  animation: lr-burst 1s calc(var(--flip) + 420ms) ease-out both }
.lr-pull[data-rarity=UR]::after { background: conic-gradient(#ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e); filter: blur(12px);
  animation: lr-burst-stay 1.3s calc(var(--flip) + 420ms) ease-out both }
.lr-pull[data-rarity=UR] .lr-pull-front::after { content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none; border-radius: inherit;
  padding: 2px; background: linear-gradient(135deg, #ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude }
.lr-instant .lr-pull { animation: none; --flip: 0ms }
.lr-instant .lr-pull-inner, .lr-instant .lr-new { animation: none }
.lr-stage-actions { gap: 8px }
.lr-tally { font-size: 12px; font-weight: 700; color: #c99a1e; letter-spacing: .02em }

@keyframes lr-fade { from { opacity: 0 } }
@keyframes lr-fade-up { from { opacity: 0; translate: 0 10px } }
@keyframes lr-dialog-in { from { opacity: 0; translate: 0 16px; scale: .97 } }
@keyframes lr-rise { from { opacity: 0; translate: 0 18px; scale: .96 } }
@keyframes lr-from-side { from { opacity: 0; translate: -18px 0 } }
@keyframes lr-pop-in { from { opacity: 0; scale: .6 } }
@keyframes lr-holo-drift { from { background-position: 0% 20% } to { background-position: 100% 80% } }
@keyframes lr-shine { 0%, 60% { transform: translateX(-120%) skewX(-18deg) } 85%, 100% { transform: translateX(620%) skewX(-18deg) } }
@keyframes lr-shine-button { 0%, 70% { transform: translateX(-150%) skewX(-20deg) } 100% { transform: translateX(420%) skewX(-20deg) } }
@keyframes lr-twinkle { 0%, 100% { opacity: 0; scale: .4 } 50% { opacity: .95; scale: 1 } }
@keyframes lr-drift { to { rotate: 25deg } }
@keyframes lr-warp { from { scale: 1 } to { scale: 1.9; filter: brightness(1.7) } }
@keyframes lr-shake { 0%, 84%, 100% { translate: 0 0 } 86% { translate: -3px 1px } 88% { translate: 3px -2px } 90% { translate: -2px 2px }
  92% { translate: 2px -1px } 94% { translate: -1px 0 } }
@keyframes lr-spark-rise { 0% { opacity: 0; translate: 0 0 } 15% { opacity: .9 } 100% { opacity: 0; translate: var(--w) -540px } }
@keyframes lr-ring-in { from { scale: .55; opacity: 0 } }
@keyframes lr-lit { 0%, 55% { opacity: 0 } 66%, 100% { opacity: 1 } }
@keyframes lr-draw { to { stroke-dashoffset: 0 } }
@keyframes lr-spin { to { rotate: 360deg } }
@keyframes lr-spin-back { to { rotate: -360deg } }
@keyframes lr-rays-in { 0%, 56% { opacity: 0; scale: .6 } 72% { opacity: .9 } 100% { opacity: 1; scale: 1.12 } }
@keyframes lr-core { 0% { scale: .1; opacity: 0 } 22% { scale: .5; opacity: 1 } 38% { scale: .62 } 42% { scale: .54 } 50% { scale: .76 }
  54% { scale: .66 } 82% { scale: 1.05 } 90% { scale: .6 } 100% { scale: 3.4; opacity: 1 } }
@keyframes lr-shock { 0%, 56% { opacity: 0; scale: .25 } 58% { opacity: 1; scale: .3 } 78% { opacity: 0; scale: 2.4 } 100% { opacity: 0; scale: 2.4 } }
@keyframes lr-token { 0% { opacity: 0; transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(1.15) } 25% { opacity: 1 }
  85% { opacity: .8 } 100% { opacity: 0; transform: translate(-50%, -50%) scale(.2) } }
@keyframes lr-type { to { clip-path: inset(0 0 0 0) } }
@keyframes lr-breathe { 50% { opacity: .35 } }
@keyframes lr-flash { 0%, 86% { opacity: 0 } 100% { opacity: .95 } }
@keyframes lr-unflash { from { opacity: .95 } to { opacity: 0 } }
@keyframes lr-deal { from { opacity: 0; transform: translate(var(--dx, 0px), var(--dy, 40px)) scale(.3) rotate(calc((var(--i) - 5) * 6deg)) }
  35% { opacity: 1 } }
@keyframes lr-flip { 0% { transform: rotateY(180deg) } 50% { transform: rotateY(90deg) scale(1.08) } 100% { transform: rotateY(0deg) } }
@keyframes lr-pop { 0% { scale: 1 } 35% { scale: 1.14 } 100% { scale: 1 } }
@keyframes lr-pop-small { 0% { scale: 1 } 35% { scale: 1.06 } 100% { scale: 1 } }
@keyframes lr-hint-gold { 50% { box-shadow: inset 0 0 0 2px #ffe39a, inset 0 0 0 6px rgba(10,14,40,.9), inset 0 0 0 7px rgba(255,211,110,.7),
  inset 0 0 44px rgba(255,200,90,.75) } }
@keyframes lr-hue { to { filter: hue-rotate(360deg) } }
@keyframes lr-sweep { from { transform: translateX(-130%) skewX(-18deg) } to { transform: translateX(330%) skewX(-18deg) } }
@keyframes lr-spark-out { 0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--a)) translateY(0) scale(.4) } 20% { opacity: 1 }
  100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--a)) translateY(calc(var(--r) * -1)) scale(1) } }
@keyframes lr-badge { from { opacity: 0; scale: 0 } }
@keyframes lr-burst { 0% { opacity: 0; transform: scale(.5) } 35% { opacity: 1 } 100% { opacity: 0; transform: scale(1.25) } }
@keyframes lr-burst-stay { 0% { opacity: 0; transform: scale(.5) } 35% { opacity: 1 } 100% { opacity: .5; transform: scale(1.02) } }
@media (prefers-reduced-motion: reduce) {
  .lr-overlay, .lr-overlay *, .lr-overlay *::before, .lr-overlay *::after, .lr-avatar, .lr-avatar * {
    animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important }
  .lr-prompt { clip-path: none }
  .lr-sparks, .lr-tokens, .lr-rays, .lr-twinkle, .lr-banner-shine { display: none }
  .lr-pull[data-rarity=UR]::after { opacity: .5 }
}
@media (max-width: 720px) {
  .lr-pulls { grid-template-columns: repeat(4, minmax(0, 1fr)) }
}
@media (max-width: 560px) {
  .lr-pulls { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px }
  .lr-banner-text { max-width: none; padding-right: 34%; background: linear-gradient(90deg, rgba(10,13,32,.92) 50%, transparent) }
  .lr-banner-art { width: 56% }
  .lr-banner-name { font-size: 20px }
  .lr-stage { min-height: 380px; padding: 12px }
}
@media (max-width: 720px) {
  .lr-character { grid-template-columns: 1fr }
  .lr-character-art { position: static; max-width: 360px; margin: 0 auto; width: 100% }
}
@media (max-width: 560px) {
  .lr-overlay { padding: 0 }
  .lr-dialog { height: 100%; border-radius: 0 }
  .lr-dialog-head { flex-wrap: wrap; padding: 8px 8px 8px 14px }
  .lr-dialog-head .lr-tabs { order: 3; flex-basis: 100% }
  .lr-dialog-body { padding: 12px }
  .lr-grid { grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 9px }
  .lr-pack { grid-template-columns: 1fr; gap: 10px }
  .lr-pack-faces { grid-template-columns: repeat(8, 1fr); max-width: 320px }
  .lr-board-find { max-width: none }
}`

    const inject = ['slots', 'locale']

    function apply (ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = PACKAGE
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'llm-roster: style')
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'llm-roster: words')
      ctx.effect(() => installTilt(), 'llm-roster: the cards\' feel')
      const remoteFaces = ['remote', 'remote.settings', 'remote.credentials', 'remote.llm', 'remote.session']
      // the DeepSeek account's balance, as DSH reads it (an injection of its own: a DSH without it keeps the rest)
      ctx.inject(['remote', 'remote.account'], scope => {
        bump({ account: scope.remote.account })
        scope.effect(() => () => bump({ account: null }), 'llm-roster: the DeepSeek account')
      })
      // the avatar, just left of the composer's model picker
      ctx.inject(['modelDirectories', 'sessions', ...remoteFaces], scope => {
        const models = scope.modelDirectories, sessions = scope.sessions
        const Avatar = makeAvatar(scope.remote)
        scope.slots.inject('conversation.input.right', () => scope.slots.register({
          name: 'conversation.input.right', id: 'llm-roster-avatar', order: 100, locale: NS,
          inject: sessionId => ({ directory: models.directoryFor(sessionId), available: sessions.subagentAddress(sessionId) === undefined })
        }, Avatar))
        // a change to DSH's settings or keys made elsewhere (its Models page) is read again here too
        for (const event of ['settings/document-updated', 'credentials/record-updated', 'credentials/reference-updated']) {
          scope.effect(() => scope.remote.$on?.(event, () => {
            if (shared.providers) loadProviders(scope.remote).catch(() => {})
            if (event.startsWith('credentials/')) bump({ checks: {}, usage: {} })
          }), `llm-roster: ${event}`)
        }
      })
      // Models & keys and Rankings, on the plugin's page under Plugins
      ctx.inject(remoteFaces, scope => {
        scope.slots.inject('plugins.bundle.config', () => scope.slots.register({ name: 'plugins.bundle.config', key: PACKAGE,
          locale: NS }, makeSettings(scope.remote)))
      })
    }

    module.exports = { inject, apply, EN, ZH, format, deriveKeyRef, catalogOf, english, SUMMON, EQUIPMENT, summonPool, summonOutfits, summonCards, glowOf, zoomAt, fitView, insertion }
    return module.exports
  }
})
