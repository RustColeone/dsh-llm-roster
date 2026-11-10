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
//     stores it) or the variable holding it, a test of it, its balance, and its models as pills, Used or Ignored (Used
//     is the provider's model list in DSH's settings, so they are exactly what DSH's picker offers); every model
//     ignored at once, the provider removed, and DeepSeek's account sign-in, which needs no key.
//   - Rankings: Artificial Analysis's, as of the date shown, fetched again with your own free key.
//
// Pictures, rankings, key checks, balances and live model lists come from the plugin's routes (plugin/server.js);
// keys never reach the page.
window.__ModuleLoader__.load({
  id: 'dsh-llm-roster',
  factory: require => {
    const module = { exports: {} }
    const imported = require('react')
    const React = typeof imported.createElement === 'function' ? imported : imported.default
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React
    const h = React.createElement
    const dom = require('react-dom')
    const createPortal = dom?.createPortal ?? dom?.default?.createPortal

    const PACKAGE = 'dsh-llm-roster'
    const NS = 'llm-roster'
    const API = {
      state: 'api/llm-roster.state', resolve: 'api/llm-roster.resolve', pick: 'api/llm-roster.pick',
      upload: 'api/llm-roster.upload', forget: 'api/llm-roster.forget', settings: 'api/llm-roster.settings',
      park: 'api/llm-roster.park', unpark: 'api/llm-roster.unpark', route: 'api/llm-roster.route', image: 'api/llm-roster.image',
      rankings: 'api/llm-roster.rankings', check: 'api/llm-roster.check', balance: 'api/llm-roster.balance',
      live: 'api/llm-roster.live'
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
      'tab.rankings': 'Rankings',
      close: 'Close',
      back: 'Roster',
      'tier.chibi': 'Chibi',
      'tier.middle': 'Middle-schooler',
      'tier.high': 'High-schooler',
      'tier.university': 'University student',
      'tier.custom': 'Your own',
      'roster.all': 'All',
      'roster.available': 'Available',
      'roster.sort.provider': 'By provider',
      'roster.sort.rank': 'By rank',
      'roster.inUse': 'In use',
      'roster.loading': 'Reading the models…',
      'roster.switching': 'Switching…',
      'roster.unavailable': 'This session cannot change its model.',
      'roster.rank': '#{rank} of {of}',
      'roster.hint': 'A card switches this session to its model; … opens its page. Effort is in DSH\'s model picker.',
      'roster.more': 'Details',
      'roster.add': 'Add a model',
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
      'page.coding': 'Coding',
      'page.agentic': 'Agentic',
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
      'used.title': 'Used ({count})',
      'used.all': 'The provider\'s whole catalog is in use ({count}). Click a model to narrow it down.',
      'ignored.title': 'Ignored ({count})',
      'ignored.none': 'Nothing else found yet: fetch the catalog or the provider\'s live list.',
      'ignored.filter': 'Filter',
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
      'art.forget': 'Delete this upload',
      'art.yours': 'Your pictures',
      'art.portrait': 'Portrait',
      'aa.title': 'Your Artificial Analysis key',
      'aa.hint': 'Free from artificialanalysis.ai (sign in, then API keys). Only needed to fetch the rankings again.',
      'aa.envHint': 'Variable to read (else {names})',
      'rankings.intro': 'Artificial Analysis Intelligence Index v{version}, as of {date}: each model once, at its best effort.',
      'rankings.refresh': 'Fetch again',
      'rankings.refreshing': 'Fetching…',
      'rankings.needKey': 'Fetching needs a free key from artificialanalysis.ai: paste it above, or name the variable that holds it.',
      'rankings.model': 'Model',
      'rankings.index': 'Intelligence',
      'rankings.coding': 'Coding',
      'rankings.agentic': 'Agentic',
      'rankings.price': 'In / out $ per M',
      'rankings.yours': 'in your roster',
      'rankings.source': 'Data: Artificial Analysis',
      failed: 'Failed: {error}'
    }
    const ZH = {
      ...EN,
      'avatar.title': '角色：{model}',
      'avatar.none': '角色：选择模型',
      'dialog.title': '角色名册',
      'tab.roster': '名册',
      'tab.models': '模型与密钥',
      'tab.rankings': '排行',
      close: '关闭',
      back: '名册',
      'tier.chibi': 'Q版',
      'tier.middle': '初中生',
      'tier.high': '高中生',
      'tier.university': '大学生',
      'tier.custom': '自定义',
      'roster.all': '全部',
      'roster.available': '可用',
      'roster.sort.provider': '按服务商',
      'roster.sort.rank': '按排名',
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
      'page.coding': '编程',
      'page.agentic': '智能体',
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
      'art.forget': '删除这张上传的图片',
      'art.yours': '你的图片',
      'art.portrait': '肖像',
      'aa.title': '你的 Artificial Analysis 密钥',
      'aa.hint': '在 artificialanalysis.ai 免费获取（登录后进入 API keys）。只有重新拉取排行时才需要。',
      'aa.envHint': '读取的变量（否则依次读取 {names}）',
      'rankings.intro': 'Artificial Analysis 智能指数 v{version}，截至 {date}：每个模型只列一次，取其最佳思考强度。',
      'rankings.refresh': '重新拉取',
      'rankings.refreshing': '拉取中……',
      'rankings.needKey': '拉取需要 artificialanalysis.ai 的免费密钥：在上方粘贴，或填写保存它的环境变量名。',
      'rankings.model': '模型',
      'rankings.index': '智能',
      'rankings.coding': '编程',
      'rankings.agentic': '智能体',
      'rankings.price': '输入 / 输出（每百万 $）',
      'rankings.yours': '在你的名册中',
      'rankings.source': '数据：Artificial Analysis',
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
    const pictureUrl = picture => !picture ? null : picture.startsWith('custom:')
      ? `${API.image}?upload=${encodeURIComponent(picture.slice(7))}` : `${API.image}?art=${encodeURIComponent(picture)}`
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
    let shared = { version: 0, generation: 0, state: null, providers: null, checks: {}, routeModels: {} }
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
    function forgetResolved () { resolved.clear(); bump({ generation: shared.generation + 1 }) }

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
      return found
    }

    /** A model id as it is matched across providers: no vendor, lowercase, words joined by dashes (OpenRouter's
     * `anthropic/claude-opus-5.5` is Anthropic's `claude-opus-5-5`). */
    const slugOf = id => bare(id).replace(/[^a-z0-9]+/g, '-')
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
      const current = info.used ?? catalog.map(found => ({ id: found.id }))
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
          if (big.has(model.provider) && !known.has(slugOf(model.id))) { hidden[model.provider] = (hidden[model.provider] ?? 0) + 1; continue }
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
        const have = new Set(catalog.map(model => slugOf(model.id)))
        const lineup = []
        for (const item of state?.lineup ?? []) {
          const via = routes[item.character] ?? item.provider
          const card = { provider: via, id: item.id, name: item.name, source: 'lineup', lineupId: item.id, character: item.character }
          if (via !== item.provider) {
            const offered = routeModels[via]
            if (!offered || offered.status === 'loading') card.pendingRoute = true
            else {
              const match = offered.ids.find(id => slugOf(id) === slugOf(item.id))
              if (match) card.id = match; else card.absent = true
            }
          }
          if (have.has(slugOf(card.id))) continue
          lineup.push({ ...card, providerName: providerName(via, snapshot, providers) })
        }
        return { cards: [...merged, ...lineup], hidden }
      }, [catalog, state?.lineup, providers, current?.provider, current?.model, JSON.stringify(routes), routeModels])
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
    function Art ({ art, label, className = '' }) {
      const [broken, setBroken] = useState(false)
      const url = pictureUrl(art)
      useEffect(() => setBroken(false), [url])
      return url && !broken
        ? h('img', { className, src: url, alt: '', loading: 'lazy', draggable: false, onError: () => setBroken(true) })
        : h('span', { className: `lr-card-blank ${className}` }, initials(label))
    }
    const rarityOf = (found, state) => found?.tier ? state?.tiers?.[found.tier]?.rarity ?? 'R' : (found?.own && found.art?.startsWith('custom:') ? 'SSR' : 'R')
    const whoOf = (found, state, t) => found?.character
      ? `${state?.characters?.[found.character]?.name ?? found.character} · ${t(`tier.${found.tier}`)}`
      : found?.art?.startsWith('custom:') ? t('tier.custom') : null

    function Card ({ card, found, state, current, busy, onPick, onMore, t }) {
      const rarity = rarityOf(found, state)
      const aa = found?.aa
      const name = card.source === 'catalog' ? card.name : (found?.name ?? card.name ?? card.id)
      const blocked = card.status !== 'ready'
      const hint = { unused: t('status.unusedHint'), nokey: card.provider.startsWith('deepseek') ? t('status.nokeyDeepseek') : t('status.nokeyHint'),
        rejected: t('status.rejectedHint'), absent: t('status.absentHint', { provider: card.providerName }) }[card.status]
      return h('div', { className: 'lr-card', 'data-rarity': rarity, 'data-current': current ? '' : undefined,
        'data-status': card.status },
      h('button', { type: 'button', className: 'lr-card-main', disabled: busy, title: `${card.providerName} · ${card.id}`,
        onClick: () => (blocked ? onMore(card) : onPick(card)) },
      h('span', { className: 'lr-card-art' }, h(Art, { art: found?.art, label: name })),
      h('span', { className: 'lr-rarity' }, rarity),
      current ? h('span', { className: 'lr-ribbon' }, t('roster.inUse')) : null,
      blocked ? h('span', { className: 'lr-veil' },
        h('strong', null, t(`status.${card.status}`)), hint ? h('span', null, hint) : null) : null,
      h('span', { className: 'lr-card-text' },
        h('span', { className: 'lr-card-who' }, whoOf(found, state, t) ?? card.providerName),
        h('span', { className: 'lr-card-name' }, name),
        h('span', { className: 'lr-card-meta' },
          h('span', null, card.providerName),
          aa ? h('span', { title: t('roster.rank', { rank: aa.rank, of: aa.of }) }, `AA ${aa.intelligence} · #${aa.rank}`) : null))),
      h('button', { type: 'button', className: 'lr-more', title: t('roster.more'), 'aria-label': `${t('roster.more')}: ${name}`,
        onClick: () => onMore(card) }, '…'))
    }

    function Credit ({ state, t }) {
      const about = state?.rankings
      return h('div', { className: 'lr-credit' },
        about?.as_of ? t('credit', { version: about.version ?? '?', date: about.as_of }) : t('credit.none'), ' ',
        h('a', { href: 'https://artificialanalysis.ai', target: '_blank', rel: 'noreferrer' }, 'artificialanalysis.ai'))
    }

    function RosterTab ({ remote, directory, available, onPicked, onPage, onTab, t }) {
      const { snapshot, state, cards, hidden } = useCards(directory, remote)
      const lookup = useResolved(cards)
      const [filter, setFilter] = useState('all')
      const [sort, setSort] = useState('provider')
      const [busy, setBusy] = useState(null)
      const [failure, setFailure] = useState(null)
      const current = snapshot.pending ?? snapshot.current
      const providers = [...new Map(cards.map(card => [card.provider, card.providerName])).entries()]

      const shown = cards.filter(card => filter === 'all' || (filter === 'available' ? card.status === 'ready' : card.provider === filter))
      const strength = card => [RARITY[rarityOf(lookup(card), state)] ?? 0, lookup(card)?.aa?.intelligence ?? -1]
      if (sort === 'rank') {
        shown.sort((one, other) => (STATUS_ORDER[one.status] > 0) - (STATUS_ORDER[other.status] > 0) ||
          (lookup(other)?.aa?.intelligence ?? -1) - (lookup(one)?.aa?.intelligence ?? -1))
      } else {
        const order = new Map(providers.map(([id], index) => [id, index]))
        shown.sort((one, other) => order.get(one.provider) - order.get(other.provider) ||
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
        h('div', { className: 'lr-toolbar' },
          h('div', { className: 'lr-chips' },
            [['all', t('roster.all')], ['available', t('roster.available')], ...providers].map(([id, label]) => h('button', {
              key: id, type: 'button', className: `lr-chip${filter === id ? ' lr-on' : ''}`, onClick: () => setFilter(id)
            }, label))),
          h('div', { className: 'lr-chips' },
            ['provider', 'rank'].map(id => h('button', {
              key: id, type: 'button', className: `lr-chip${sort === id ? ' lr-on' : ''}`, onClick: () => setSort(id)
            }, t(`roster.sort.${id}`))))),
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
        h('div', { className: 'lr-grid' },
          shown.map(card => h(Card, {
            key: `${card.provider}/${card.id}`, card, found: lookup(card), state, t, busy: busy !== null,
            current: current?.provider === card.provider && current?.model === card.id,
            onPick: pick, onMore: chosen => onPage({ kind: 'character', card: chosen })
          })),
          h('button', { type: 'button', className: 'lr-card lr-add-card', onClick: () => onPage({ kind: 'add' }) },
            h('span', { className: 'lr-plus' }, '+'), h('strong', null, t('roster.add')), h('span', null, t('roster.addHint')))),
        Object.entries(hidden).map(([provider, count]) => h('div', { key: provider, className: 'lr-note lr-row lr-between' },
          h('span', null, t('roster.hidden', { count, provider: providerName(provider, snapshot, null) })),
          onTab ? h('button', { type: 'button', className: 'lr-button lr-small', onClick: () => onTab('models') }, t('tab.models')) : null)),
        h('div', { className: 'lr-foot' }, h('span', null, busy ? t('roster.switching') : t('roster.hint')), h(Credit, { state, t })))
    }

    // ---- pictures: choosing a card picture or an avatar ----
    /** Tiles of every picture of a kind (`art`: each character's tiers; `face`: each one's portrait and tier faces) and
     * your uploads; `value` is the chosen one (null: the default). */
    function PictureTiles ({ kind, value, onChoose, t, defaultLabel, defaultValue = null }) {
      const state = useRosterState()
      const [failure, setFailure] = useState(null)
      const input = useRef(null)
      const upload = async file => {
        if (!file) return
        try {
          const { id } = await post(`${API.upload}?name=${encodeURIComponent(file.name)}`, file, { raw: true, type: file.type })
          await loadState(); onChoose(`custom:${id}`)
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      const forget = async id => {
        try { await post(API.forget, { upload: id }); await loadState(); forgetResolved() } catch (error) {
          setFailure(t('failed', { error: errorText(error) }))
        }
      }
      const characters = state ? Object.keys(state.characters) : []
      const kinds = kind === 'art' ? TIER_ORDER : ['face', ...TIER_ORDER.map(tier => `face-${tier}`)]
      const labelOf = (name, part) => `${state.characters[name].name} · ${part === 'face' ? t('art.portrait') : t(`tier.${part.replace(/^face-/, '')}`)}`
      const tile = (picture, label, extra = null) => h('div', { key: picture, className: 'lr-tile-holder' },
        h('button', { type: 'button', className: `lr-tile lr-tile-${kind}${value === picture ? ' lr-on' : ''}`, title: label,
          'aria-label': label, onClick: () => onChoose(picture) }, h('img', { src: pictureUrl(picture), alt: '', loading: 'lazy' })), extra)
      return h('div', { className: 'lr-pictures' },
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        h('div', { className: 'lr-row' },
          h('button', { type: 'button', className: `lr-button${value === defaultValue ? ' lr-on-button' : ''}`, onClick: () => onChoose(defaultValue) },
            defaultLabel ?? t('art.default')),
          h('button', { type: 'button', className: 'lr-button lr-primary', onClick: () => input.current?.click() }, t('art.upload')),
          h('input', { ref: input, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true,
            onChange: event => upload(event.target.files?.[0]) })),
        state?.uploads?.length ? h('div', { className: 'lr-art-group' }, h('div', { className: 'lr-label' }, t('art.yours')),
          h('div', { className: `lr-tiles lr-tiles-${kind}` }, state.uploads.map(found => tile(`custom:${found.id}`, found.name || found.id,
            h('button', { type: 'button', className: 'lr-tile-forget', title: t('art.forget'), 'aria-label': t('art.forget'),
              onClick: () => forget(found.id) }, '×'))))) : null,
        characters.map(name => h('div', { key: name, className: 'lr-art-group' },
          h('div', { className: 'lr-label' }, state.characters[name].name),
          h('div', { className: `lr-tiles lr-tiles-${kind}` }, kinds.map(part => tile(`${name}/${part}`, labelOf(name, part)))))))
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
        h(PictureTiles, { kind, value: found?.own || kind === 'face' ? found?.[kind] : null, onChoose: choose, t }))
    }

    // ---- a provider's key: status, paste, variable, test, balance ----
    function KeySection ({ remote, info, t }) {
      const { checks } = useShared()
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
        await describe(); await checkKey(info.provider, info.ref, true, remote)
      })
      const saveEnv = () => run(async () => {
        const name = envDraft.trim()
        if (name && !REF.test(name)) throw new Error(t('key.envBad'))
        const path = info.configured ? [...info.entry.settingsPath, 'apiKeyEnv'] : [...info.entry.settingsPath]
        const ops = info.configured ? [name ? { op: 'set', path, value: name } : { op: 'unset', path }] : [{ op: 'set', path, value: { apiKeyEnv: name } }]
        await writeSettings(remote, info.entry.settingsNs, ops)
        setNote(name ? t('key.envSaved', { name }) : null)
        await checkKey(info.provider, name || info.ref, true, remote)
      })
      const test = () => run(async () => { await checkKey(info.provider, info.ref, true, remote) })
      const askBalance = () => run(async () => {
        setBalance(await get(`${API.balance}?provider=${encodeURIComponent(info.provider)}&ref=${encodeURIComponent(info.ref)}`))
      })
      const status = described?.unknown ? 'unknown' : described?.configured ? (described.source === 'env' || described.source === 'environment' ? 'env' : 'stored') : 'missing'
      const offered = state?.providers?.[info.provider]
      const checkText = found?.status ? (found.status === 'ok' && found.models ? t('check.okModels', { count: found.models })
        : t(`check.${found.status}`, { detail: found.detail ?? '' })) : null
      const editable = info.writable && Boolean(info.entry)
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
        note ? h('div', { className: 'lr-note' }, note) : null,
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null)
    }

    function AccountNote ({ snapshot, t }) {
      const signedIn = (snapshot?.groups ?? []).some(group => group.id === ACCOUNT && group.models?.length)
      return h('div', { className: 'lr-note', 'data-account': signedIn ? 'in' : 'out' }, signedIn ? t('account.signedIn') : t('account.signedOut'))
    }

    // ---- a character's page ----
    function Stat ({ label, value, scale = 70 }) {
      return h('div', { className: 'lr-stat' },
        h('span', { className: 'lr-stat-label' }, label),
        h('span', { className: 'lr-stat-bar' }, value === null || value === undefined ? null
          : h('span', { style: { width: `${Math.max(2, Math.min(100, value / scale * 100))}%` } })),
        h('span', { className: 'lr-stat-value' }, value ?? '–'))
    }

    function CharacterPage ({ remote, directory, available, card: initial, onBack, onPicked, t }) {
      const { snapshot, state, providers, catalog, cards } = useCards(directory, remote)
      const listed = (initial.lineupId && cards.find(item => item.lineupId === initial.lineupId)) ??
        cards.find(item => (item.routes ?? [item]).some(route => route.provider === initial.provider && route.id === initial.id))
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
      const gallery = found?.character ? TIER_ORDER.map(tier => `${found.character}/${tier}`) : []
      if (found?.art?.startsWith('custom:')) gallery.push(found.art)
      const canUse = card.status === 'ready' || card.status === 'unused'

      return h('div', { className: 'lr-page-character', 'data-rarity': rarity },
        h('div', { className: 'lr-page-top' },
          h('button', { type: 'button', className: 'lr-button lr-small', onClick: onBack }, `‹ ${t('back')}`)),
        h('div', { className: 'lr-character' },
          h('div', { className: 'lr-character-art' },
            h('div', { className: 'lr-showcase', 'data-rarity': rarity, 'data-status': card.status },
              h(Art, { art: shownArt, label: name }),
              h('span', { className: 'lr-rarity lr-rarity-big' }, rarity)),
            gallery.length ? h('div', { className: 'lr-gallery' },
              h('span', { className: 'lr-label' }, t('page.gallery')),
              h('div', { className: 'lr-gallery-row' }, gallery.map(picture =>
                h('button', { key: picture, type: 'button', className: `lr-thumb${shownArt === picture ? ' lr-on' : ''}`,
                  title: picture.startsWith('custom:') ? t('tier.custom') : t(`tier.${picture.split('/')[1]}`),
                  onClick: () => setPreview(picture === found?.art ? null : picture) }, h('img', { src: pictureUrl(picture), alt: '' })))),
              preview && preview !== found?.art ? h('button', { type: 'button', className: 'lr-button lr-primary', disabled: busy,
                onClick: () => equip(preview) }, t('page.equip')) : null) : null),
          h('div', { className: 'lr-character-info' },
            h('div', { className: 'lr-character-head' },
              h(Face, { face: found?.face, label: name, size: 56, className: 'lr-face-big' }),
              h('div', null,
                h('div', { className: 'lr-card-who lr-who-dark' }, whoOf(found, state, t) ?? card.providerName),
                h('h2', { className: 'lr-character-name' }, name),
                h('div', { className: 'lr-dim' }, `${card.providerName} · `, h('code', null, card.id)))),
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
              !canUse ? h('span', { className: 'lr-dim' }, t('page.needKey')) : null),
            failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
            h('section', { className: 'lr-section' },
              h('h3', null, t('page.stats')),
              aa ? h(React.Fragment, null,
                h(Stat, { label: t('page.intelligence'), value: aa.intelligence }),
                h(Stat, { label: t('page.coding'), value: aa.coding }),
                h(Stat, { label: t('page.agentic'), value: aa.agentic }),
                h('dl', { className: 'lr-facts' },
                  h('dt', null, t('page.rank')), h('dd', null, t('roster.rank', { rank: aa.rank, of: aa.of })),
                  aa.input !== null ? h(React.Fragment, null, h('dt', null, t('page.price')), h('dd', null, `${money(aa.input)} / ${money(aa.output)}`)) : null,
                  aa.speed ? h(React.Fragment, null, h('dt', null, t('page.speed')), h('dd', null, t('page.speedValue', { speed: aa.speed }))) : null,
                  aa.efforts?.length ? h(React.Fragment, null, h('dt', null, t('page.efforts')),
                    h('dd', null, h('span', { className: 'lr-pills' }, aa.efforts.map(effort => h('span', { key: effort.effort, className: 'lr-effort' },
                      `${effort.effort} ${effort.intelligence}`))))) : null),
                h(Credit, { state, t })) : h('div', { className: 'lr-dim' }, t('page.noStats'))),
            h('section', { className: 'lr-section' },
              h('h3', null, t('page.equipment')),
              h('div', { className: 'lr-equip' },
                h('div', { className: 'lr-equip-slot' },
                  h('span', { className: 'lr-label' }, t('page.art')),
                  h('span', { className: 'lr-equip-art' }, h(Art, { art: found?.art, label: name })),
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
              card.provider.startsWith('deepseek') ? h(AccountNote, { snapshot, t }) : null,
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
        h('span', { className: 'lr-dim' }, t('page.throughHint', { name: about?.name ?? character })),
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
        setChosen(new Set(models.filter(model => wanted.has(slugOf(model.id))).map(model => model.id)))
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
        found ? h('div', { className: 'lr-pills' }, found.slice(0, 200).map(model => h('button', { key: model.id, type: 'button',
          className: `lr-pill ${chosen.has(model.id) ? 'lr-used lr-static' : 'lr-ignored'}`, onClick: () => toggle(model.id) }, model.id)))
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
              h('datalist', { id: 'lr-add-models' }, found.map(item => h('option', { key: item.id, value: item.id }, item.name ?? item.id))),
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
      const usedIds = info.used ? info.used.map(modelId) : catalog.map(model => model.id)
      const usedSet = new Set(usedIds)
      const ignored = (found ?? []).filter(model => !usedSet.has(model.id))
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
        const current = info.used ?? catalog.map(model => ({ id: model.id }))
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
        h('div', { className: 'lr-field' },
          h('div', { className: 'lr-row lr-between' },
            h('span', { className: 'lr-label' }, t('used.title', { count: usedIds.length })),
            h('span', { className: 'lr-row' },
              h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy || !info.writable || !info.used,
                onClick: () => run(() => writeModels(undefined)) }, t('models.useAll')),
              h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy || !info.writable || !canIgnoreAll,
                title: canIgnoreAll ? undefined : t('models.ignoreAllFixed'), onClick: () => run(ignoreAll) }, t('models.ignoreAll')))),
          info.used ? null : h('div', { className: 'lr-dim' }, t('used.all', { count: usedIds.length })),
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
          ignored.length > 12 ? h('input', { className: 'lr-input lr-small-input', placeholder: t('ignored.filter'), value: filter,
            onChange: event => setFilter(event.target.value) }) : null,
          ignored.length ? h('div', { className: 'lr-pills' }, shownIgnored.slice(0, 150).map(model => h('button', {
            key: model.id, type: 'button', className: 'lr-pill lr-ignored', disabled: busy || !info.writable, title: model.name ?? model.id,
            onClick: () => move(model.id, true)
          }, model.id, model.live && !(found ?? []).some(item => item.id === model.id && item.live === false)
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
          h(AccountNote, { snapshot, t }),
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

    function RankingsTab ({ remote, directory, t }) {
      const snapshot = useDirectory(directory)
      const [data, setData] = useState(null)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const load = async () => {
        try { setData(await get(`${API.rankings}?top=30`)) } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      useEffect(() => { load() }, [])
      const models = catalogOf(snapshot)
      const lookup = useResolved(models)
      const mine = new Set(models.map(model => lookup(model)?.aa?.slug).filter(Boolean))
      async function refresh () {
        setBusy(true); setFailure(null)
        try { await post(API.rankings, {}); await Promise.all([load(), loadState()]); forgetResolved() } catch (error) {
          setFailure(`${t('failed', { error: errorText(error) })} ${t('rankings.needKey')}`)
        } finally { setBusy(false) }
      }
      return h('div', { className: 'lr-rankings' },
        h(AaKey, { remote, t }),
        h('div', { className: 'lr-row lr-between' },
          h('span', { className: 'lr-dim' }, data?.as_of ? t('rankings.intro', { version: data.version ?? '?', date: data.as_of }) : t('credit.none')),
          h('button', { type: 'button', className: 'lr-button', disabled: busy, onClick: refresh }, busy ? t('rankings.refreshing') : t('rankings.refresh'))),
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        data ? h('table', { className: 'lr-table' },
          h('thead', null, h('tr', null, ['#', t('rankings.model'), t('rankings.index'), t('rankings.coding'), t('rankings.agentic'), t('rankings.price')]
            .map(label => h('th', { key: label }, label)))),
          h('tbody', null, data.rows.map(row => h('tr', { key: row.slug, className: mine.has(row.slug) ? 'lr-mine' : undefined,
            title: mine.has(row.slug) ? t('rankings.yours') : undefined },
          h('td', null, row.rank),
          h('td', null, h('div', null, row.name.replace(/\s*\(.*\)$/, '')), h('div', { className: 'lr-dim' }, `${row.creator} · ${row.released}`)),
          h('td', null, h('span', { className: 'lr-bar', style: { '--lr-bar': `${Math.min(100, row.intelligence)}%` } }, row.intelligence)),
          h('td', null, row.coding ?? '–'),
          h('td', null, row.agentic ?? '–'),
          h('td', null, row.input === null ? '–' : `${money(row.input)} / ${money(row.output)}`))))) : null,
        h('div', { className: 'lr-credit' }, h('a', { href: 'https://artificialanalysis.ai', target: '_blank', rel: 'noreferrer' }, t('rankings.source'))))
    }

    // ---- the dialog ----
    function Modal ({ title, onClose, small = false, children, t, tabs = null }) {
      const box = useRef(null)
      useEffect(() => {
        const key = event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
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
      const close = useCallback(() => (page ? setPage(null) : onClose()), [page, onClose])
      const tabs = h('nav', { className: 'lr-tabs' }, ['roster', 'models', 'rankings'].map(id => h('button', {
        key: id, type: 'button', className: `lr-tab${tab === id ? ' lr-on' : ''}`, onClick: () => { setTab(id); setPage(null) }
      }, t(`tab.${id}`))))
      const body = tab === 'models' ? h(ModelsTab, { remote, directory, t })
        : tab === 'rankings' ? h(RankingsTab, { remote, directory, t })
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
        const label = name ? `${t('avatar.title', { model: name })}${found?.tier ? ` · ${t(`tier.${found.tier}`)}` : ''}` : t('avatar.none')
        return h(React.Fragment, null,
          h('button', { type: 'button', className: 'lr-avatar', 'data-rarity': rarity ?? undefined, title: label, 'aria-label': label,
            'data-pending': snapshot.status === 'selecting' ? '' : undefined, onClick: () => setOpen(true) },
          h(Face, { face: found?.face, label: name ?? '?', size: 24 })),
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
          h('nav', { className: 'lr-tabs' }, ['models', 'rankings'].map(id => h('button', {
            key: id, type: 'button', className: `lr-tab${tab === id ? ' lr-on' : ''}`, onClick: () => setTab(id)
          }, t(`tab.${id}`)))),
          tab === 'models' ? h(ModelsTab, { remote, directory, t }) : h(RankingsTab, { remote, directory, t }))
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
.lr-card { position: relative; aspect-ratio: 2 / 3; border-radius: 12px; overflow: hidden; isolation: isolate; color: #fff;
  --lr-c: #4a90e2; --lr-c2: #9cc7ff; box-shadow: 0 0 0 2px var(--lr-c), 0 6px 18px rgba(0,0,0,.25); transition: transform .12s, box-shadow .12s;
  background: linear-gradient(160deg, color-mix(in srgb, var(--lr-c) 35%, #1b1d2e), #10121d 70%) }
.lr-dialog [data-rarity=SR], .lr-page [data-rarity=SR] { --lr-c: #a463f2; --lr-c2: #d6b4ff }
.lr-dialog [data-rarity=SSR], .lr-page [data-rarity=SSR] { --lr-c: #f2b233; --lr-c2: #ffe39a }
.lr-dialog [data-rarity=UR], .lr-page [data-rarity=UR] { --lr-c: #ff5f9e; --lr-c2: #8fe3ff }
.lr-card[data-rarity=UR]::before, .lr-showcase[data-rarity=UR]::before { content: ''; position: absolute; inset: 0; z-index: 4; pointer-events: none;
  border-radius: inherit; padding: 2px; background: linear-gradient(135deg, #ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude }
.lr-card:hover { transform: translateY(-3px); box-shadow: 0 0 0 2px var(--lr-c2), 0 10px 26px rgba(0,0,0,.35) }
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
.lr-stat { display: grid; grid-template-columns: 6.5em 1fr 3em; gap: 8px; align-items: center; font-size: 12px }
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
  .lr-table th:nth-child(4), .lr-table td:nth-child(4), .lr-table th:nth-child(5), .lr-table td:nth-child(5) { display: none }
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
      const remoteFaces = ['remote', 'remote.settings', 'remote.credentials', 'remote.llm', 'remote.session']
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
            if (event.startsWith('credentials/')) bump({ checks: {} })
          }), `llm-roster: ${event}`)
        }
      })
      // Models & keys and Rankings, on the plugin's page under Plugins
      ctx.inject(remoteFaces, scope => {
        scope.slots.inject('plugins.bundle.config', () => scope.slots.register({ name: 'plugins.bundle.config', key: PACKAGE,
          locale: NS }, makeSettings(scope.remote)))
      })
    }

    module.exports = { inject, apply, EN, ZH, format, deriveKeyRef, catalogOf, english }
    return module.exports
  }
})
