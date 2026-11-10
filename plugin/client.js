// The roster's client half, for DSH's web page, which loads it as a plugin bundle (React is all it needs).
//
//   - An avatar beside the composer's model picker (the `conversation.input.right` slot, just left of it): the face of
//     the model the session uses. A click opens the roster.
//   - The roster: every model DSH's picker offers, as a character card (art by tier, rarity, Artificial Analysis
//     rankings, price). A click switches the session to it, through the same model directory DSH's picker uses, so the
//     two always agree; effort stays in DSH's picker.
//   - Models & keys (also under Plugins → dsh-llm-roster): for each provider, its API key (stored write-only, as DSH's
//     Models page stores it) or the environment variable holding it, the account's balance, and its models as pills,
//     Used or Ignored: a click moves one, and the Used ones are the provider's model list in DSH's settings, so they
//     are exactly what DSH's picker offers. Each Used model's art can be picked or uploaded.
//   - Rankings: Artificial Analysis's, as of the date shown, fetched again on request with your own free key (pasted,
//     or the variable holding it).
//
// Pictures, rankings, balances and live model lists come from the plugin's routes (plugin/server.js); keys never reach
// the page.
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
      upload: 'api/llm-roster.upload', forget: 'api/llm-roster.forget', image: 'api/llm-roster.image',
      rankings: 'api/llm-roster.rankings', balance: 'api/llm-roster.balance', live: 'api/llm-roster.live',
      settings: 'api/llm-roster.settings'
    }
    const RARITY = { R: 1, SR: 2, SSR: 3, UR: 4 }
    const TIER_ORDER = ['chibi', 'middle', 'high', 'university']
    const CHARACTER_ORDER = ['gpt', 'claude', 'gemini', 'deepseek', 'grok']

    const EN = {
      'avatar.title': 'Roster: {model}',
      'avatar.none': 'Roster: pick a model',
      'dialog.title': 'Roster',
      'tab.roster': 'Roster',
      'tab.models': 'Models & keys',
      'tab.rankings': 'Rankings',
      close: 'Close',
      'roster.all': 'All',
      'roster.sort.provider': 'By provider',
      'roster.sort.rank': 'By rank',
      'roster.inUse': 'In use',
      'roster.empty': 'No models yet. Add a provider and pick its models under Models & keys.',
      'roster.loading': 'Reading the models…',
      'roster.switching': 'Switching…',
      'roster.unavailable': 'This session cannot change its model.',
      'roster.rank': '#{rank} of {of}',
      'roster.price': '${input} / ${output} per M',
      'roster.hint': 'A card switches this session to its model; effort is in DSH\'s model picker.',
      'roster.unknown': 'Not in DSH\'s catalog',
      'credit': 'Rankings: Artificial Analysis Intelligence Index v{version}, as of {date}.',
      'credit.none': 'No rankings yet.',
      'models.intro': 'Each provider\'s key, balance and models. Used models are the ones DSH\'s model picker offers; a click moves a model between Used and Ignored.',
      'models.loading': 'Reading the providers…',
      'models.readOnly': 'This DSH\'s settings cannot be changed from the page.',
      'models.add': 'Add a provider…',
      'models.adding': 'Adding…',
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
      'balance.button': 'Balance',
      'balance.none': 'This provider reports no balance through its API.',
      'balance.missing': 'No key to ask with.',
      'balance.granted': 'granted {amount}',
      'balance.topped': 'topped up {amount}',
      'balance.used': 'used {amount}',
      'used.title': 'Used ({count})',
      'used.all': 'The provider\'s whole catalog is in use ({count}). Click a model to narrow it down.',
      'used.last': 'Keep at least one model.',
      'ignored.title': 'Ignored ({count})',
      'ignored.none': 'Nothing else found yet: fetch the catalog or the provider\'s live list.',
      'ignored.filter': 'Filter',
      'ignored.more': '{count} more: filter to find them',
      'fetch.catalog': 'Fetch catalog',
      'fetch.live': 'Fetch live list',
      'fetch.liveTitle': 'Ask the provider itself which models your key can call, for models newer than DSH\'s catalog.',
      'fetch.found': '{count} models found.',
      'art.title': 'Art for {model}',
      'art.default': 'Default',
      'art.upload': 'Upload a picture…',
      'art.forget': 'Delete this upload',
      'art.change': 'Change art',
      'rankings.intro': 'Artificial Analysis Intelligence Index v{version}, as of {date}: each model once, at its best effort.',
      'rankings.refresh': 'Fetch again',
      'rankings.refreshing': 'Fetching…',
      'rankings.needKey': 'Fetching needs a free key from artificialanalysis.ai: paste it above, or name the variable that holds it.',
      'aa.title': 'Your Artificial Analysis key',
      'aa.hint': 'Free from artificialanalysis.ai (sign in, then API keys). Only needed to fetch the rankings again.',
      'aa.envHint': 'Variable to read (else {names})',
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
      'roster.all': '全部',
      'roster.sort.provider': '按服务商',
      'roster.sort.rank': '按排名',
      'roster.inUse': '使用中',
      'roster.empty': '还没有模型。请在「模型与密钥」里添加服务商并选择模型。',
      'roster.loading': '正在读取模型……',
      'roster.switching': '切换中……',
      'roster.unavailable': '这个会话不能更换模型。',
      'roster.rank': '第 {rank} / {of} 名',
      'roster.price': '每百万 ${input} / ${output}',
      'roster.hint': '点击卡片即可把这个会话切换到该模型；思考强度在 DSH 的模型选择器里调。',
      'roster.unknown': '不在 DSH 的模型目录中',
      'credit': '排行：Artificial Analysis 智能指数 v{version}，截至 {date}。',
      'credit.none': '还没有排行数据。',
      'models.intro': '每个服务商的密钥、余额和模型。「使用中」的模型就是 DSH 模型选择器里列出的模型；点击即可在「使用中」和「忽略」之间移动。',
      'models.loading': '正在读取服务商……',
      'models.readOnly': '这个 DSH 的设置不能在网页上修改。',
      'models.add': '添加服务商……',
      'models.adding': '添加中……',
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
      'balance.button': '余额',
      'balance.none': '这个服务商的 API 不提供余额查询。',
      'balance.missing': '没有可用的密钥。',
      'balance.granted': '赠送 {amount}',
      'balance.topped': '充值 {amount}',
      'balance.used': '已用 {amount}',
      'used.title': '使用中（{count}）',
      'used.all': '正在使用该服务商的完整目录（{count} 个）。点击某个模型即可开始筛选。',
      'used.last': '至少保留一个模型。',
      'ignored.title': '忽略（{count}）',
      'ignored.none': '暂时没有其他模型：可以拉取目录或服务商的实时列表。',
      'ignored.filter': '筛选',
      'ignored.more': '还有 {count} 个：请筛选查找',
      'fetch.catalog': '拉取目录',
      'fetch.live': '拉取实时列表',
      'fetch.liveTitle': '直接询问服务商你的密钥能调用哪些模型，可以找到比 DSH 目录更新的模型。',
      'fetch.found': '找到 {count} 个模型。',
      'art.title': '{model} 的立绘',
      'art.default': '默认',
      'art.upload': '上传图片……',
      'art.forget': '删除这张上传的图片',
      'art.change': '更换立绘',
      'rankings.intro': 'Artificial Analysis 智能指数 v{version}，截至 {date}：每个模型只列一次，取其最佳思考强度。',
      'rankings.refresh': '重新拉取',
      'rankings.refreshing': '拉取中……',
      'rankings.needKey': '拉取需要 artificialanalysis.ai 的免费密钥：在上方粘贴，或填写保存它的环境变量名。',
      'aa.title': '你的 Artificial Analysis 密钥',
      'aa.hint': '在 artificialanalysis.ai 免费获取（登录后进入 API keys）。只有重新拉取排行时才需要。',
      'aa.envHint': '读取的变量（否则依次读取 {names}）',
      'rankings.model': '模型',
      'rankings.index': '智能',
      'rankings.coding': '编程',
      'rankings.agentic': '智能体',
      'rankings.price': '输入 / 输出（每百万 $）',
      'rankings.yours': '在你的名册中',
      'rankings.source': '数据：Artificial Analysis',
      failed: '失败：{error}'
    }

    /** `{name}` in a sentence filled in. */
    const format = (text, values = {}) => String(text).replace(/\{(\w+)\}/g, (all, key) =>
      Object.hasOwn(values, key) ? String(values[key]) : all)
    const english = (key, values) => format(EN[key] ?? key, values)
    /** DSH's words for the plugin (`words`, from a slot's `t`), filled in by us. */
    const wordsOf = words => (key, values) => format(typeof words === 'function' ? (words(key) ?? EN[key] ?? key) : (EN[key] ?? key), values)

    const getPath = (value, path) => path.reduce((at, key) => (at === null || at === undefined ? undefined : at[key]), value)
    // The reference a provider's key is under when its profile names none: DSH's Models page derives `<ROUTE>_API_KEY`;
    // DeepSeek's adapter reads DEEPSEEK_API_KEY by default.
    const deriveKeyRef = provider => `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
    const DEFAULT_REFS = { 'deepseek-official': 'DEEPSEEK_API_KEY' }
    const REF = /^[A-Za-z_][A-Za-z0-9_]*$/
    const money = value => (Number(value) >= 1 ? Number(value).toFixed(2) : Number(value).toFixed(3)).replace(/\.?0+$/, '') || '0'
    const imageOf = art => !art ? null : art.startsWith('custom:')
      ? `${API.image}?upload=${encodeURIComponent(art.slice(7))}` : `${API.image}?art=${encodeURIComponent(art)}`
    const faceOf = found => !found?.art ? null : found.art.startsWith('custom:') ? imageOf(found.art)
      : imageOf(`${found.art.split('/')[0]}/face`)
    const initials = text => String(text || '?').replace(/^.*\//, '').split(/[-_.\s]+/).filter(Boolean).slice(0, 2)
      .map(word => word[0].toUpperCase()).join('')
    const errorText = error => String(error?.message ?? error)

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

    // ---- what the plugin's server says about each model, kept for the page's life ----
    // `provider/model` → { art, own, character, tier, aa }; a pick of art clears it.
    const resolved = new Map()
    let shared = { version: 0, generation: 0, state: null }
    const listeners = new Set()
    const bump = () => { shared = { ...shared, version: shared.version + 1 }; for (const listener of listeners) listener() }
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
    async function loadState () {
      shared = { ...shared, state: await get(API.state) }
      bump()
      return shared.state
    }
    function forgetResolved () { resolved.clear(); shared = { ...shared, generation: shared.generation + 1 }; bump() }

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

    /** A model directory's snapshot (the one DSH's picker renders from). */
    const useDirectory = directory => useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot)

    /** The models DSH's picker offers, in its order, each with its provider. */
    const catalogOf = snapshot => (snapshot.groups ?? []).flatMap(group => (group.models ?? [])
      .map(model => ({ provider: group.id, providerName: group.name ?? group.id, id: model.id, name: model.name ?? model.id })))

    // ---- pieces ----
    function Face ({ found, label, size = 26, className = '' }) {
      const [broken, setBroken] = useState(false)
      const url = faceOf(found)
      useEffect(() => setBroken(false), [url])
      const style = { width: size, height: size }
      if (!url || broken) return h('span', { className: `lr-face lr-face-none ${className}`, style }, initials(label))
      return h('img', { className: `lr-face ${className}`, style, src: url, alt: '', draggable: false,
        onError: () => setBroken(true) })
    }

    function Card ({ model, found, tiers, characters, current, busy, onPick, t }) {
      const tier = found?.tier ? tiers?.[found.tier] : null
      const rarity = found?.own && found.art?.startsWith('custom:') ? 'SSR' : (tier?.rarity ?? 'R')
      const character = found?.character ? characters?.[found.character]?.name : null
      const [broken, setBroken] = useState(false)
      const art = imageOf(found?.art)
      const aa = found?.aa
      return h('button', {
        type: 'button', className: 'lr-card', 'data-rarity': rarity, 'data-current': current ? '' : undefined,
        disabled: busy, title: `${model.providerName} · ${model.id}`, onClick: () => onPick(model)
      },
      h('span', { className: 'lr-card-art' },
        art && !broken
          ? h('img', { src: art, alt: '', loading: 'lazy', draggable: false, onError: () => setBroken(true) })
          : h('span', { className: 'lr-card-blank' }, initials(model.name))),
      h('span', { className: 'lr-rarity' }, rarity),
      aa ? h('span', { className: 'lr-aa', title: t('roster.rank', { rank: aa.rank, of: aa.of }) }, `AA ${aa.intelligence}`) : null,
      current ? h('span', { className: 'lr-ribbon' }, t('roster.inUse')) : null,
      h('span', { className: 'lr-card-text' },
        h('span', { className: 'lr-card-who' }, [character, tier?.name].filter(Boolean).join(' · ') || model.providerName),
        h('span', { className: 'lr-card-name' }, model.name),
        h('span', { className: 'lr-card-meta' },
          h('span', null, model.providerName),
          aa ? h('span', null, t('roster.rank', { rank: aa.rank, of: aa.of })) : null),
        aa && aa.input !== null && aa.output !== null
          ? h('span', { className: 'lr-card-meta' }, t('roster.price', { input: money(aa.input), output: money(aa.output) }))
          : null))
    }

    function Credit ({ state, t }) {
      const about = state?.rankings
      return h('div', { className: 'lr-credit' },
        about?.as_of ? t('credit', { version: about.version ?? '?', date: about.as_of }) : t('credit.none'), ' ',
        h('a', { href: 'https://artificialanalysis.ai', target: '_blank', rel: 'noreferrer' }, 'artificialanalysis.ai'))
    }

    function RosterTab ({ directory, available, onPicked, onSettings, t }) {
      const snapshot = useDirectory(directory)
      const state = useRosterState()
      const models = useMemo(() => catalogOf(snapshot), [snapshot.groups])
      const lookup = useResolved(models)
      const [filter, setFilter] = useState('all')
      const [sort, setSort] = useState('provider')
      const [busy, setBusy] = useState(null)
      const [failure, setFailure] = useState(null)
      const current = snapshot.pending ?? snapshot.current
      const providers = useMemo(() => [...new Map(models.map(model => [model.provider, model.providerName])).entries()], [models])

      const strength = model => {
        const found = lookup(model)
        return [RARITY[found?.tier ? state?.tiers?.[found.tier]?.rarity : 'R'] ?? 0, found?.aa?.intelligence ?? -1]
      }
      const shown = models.filter(model => filter === 'all' || model.provider === filter)
      if (sort === 'rank') {
        shown.sort((one, other) => (lookup(other)?.aa?.intelligence ?? -1) - (lookup(one)?.aa?.intelligence ?? -1))
      } else {
        const order = new Map(providers.map(([id], index) => [id, index]))
        shown.sort((one, other) => order.get(one.provider) - order.get(other.provider) ||
          strength(other)[0] - strength(one)[0] || strength(other)[1] - strength(one)[1])
      }

      async function pick (model) {
        if (!available) return setFailure(t('roster.unavailable'))
        setBusy(`${model.provider}/${model.id}`)
        setFailure(null)
        try {
          const result = await directory.select({ provider: model.provider, model: model.id })
          if (result && result.ok === false) throw new Error(result.error?.message ?? 'refused')
          onPicked()
        } catch (error) {
          setFailure(t('failed', { error: errorText(error) }))
        } finally {
          setBusy(null)
        }
      }

      if (!models.length) {
        return h('div', { className: 'lr-empty' },
          snapshot.status === 'loading' || snapshot.status === 'idle' ? t('roster.loading') : t('roster.empty'),
          snapshot.status === 'loading' ? null
            : h('div', null, h('button', { type: 'button', className: 'lr-button lr-primary', onClick: onSettings }, t('tab.models'))))
      }
      return h('div', { className: 'lr-roster' },
        h('div', { className: 'lr-toolbar' },
          h('div', { className: 'lr-chips' },
            [['all', t('roster.all')], ...providers].map(([id, label]) => h('button', {
              key: id, type: 'button', className: `lr-chip${filter === id ? ' lr-on' : ''}`, onClick: () => setFilter(id)
            }, label))),
          h('div', { className: 'lr-chips' },
            ['provider', 'rank'].map(id => h('button', {
              key: id, type: 'button', className: `lr-chip${sort === id ? ' lr-on' : ''}`, onClick: () => setSort(id)
            }, t(`roster.sort.${id}`))))),
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
        h('div', { className: 'lr-grid' }, shown.map(model => h(Card, {
          key: `${model.provider}/${model.id}`, model, found: lookup(model), tiers: state?.tiers,
          characters: state?.characters, t, busy: busy !== null,
          current: current?.provider === model.provider && current?.model === model.id, onPick: pick
        }))),
        h('div', { className: 'lr-foot' }, h('span', null, busy ? t('roster.switching') : t('roster.hint')), h(Credit, { state, t })))
    }

    // ---- art for one model ----
    function ArtPicker ({ model, onClose, t }) {
      const state = useRosterState()
      const lookup = useResolved([model])
      const found = lookup(model)
      const [failure, setFailure] = useState(null)
      const input = useRef(null)
      const choose = async art => {
        try {
          await post(API.pick, { model: `${model.provider}/${model.id}`, art })
          forgetResolved()
          onClose()
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      const upload = async file => {
        if (!file) return
        try {
          const { id } = await post(`${API.upload}?name=${encodeURIComponent(file.name)}`, file, { raw: true, type: file.type })
          await loadState()
          await choose(`custom:${id}`)
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      const forget = async id => {
        try { await post(API.forget, { upload: id }); await loadState(); forgetResolved() } catch (error) {
          setFailure(t('failed', { error: errorText(error) }))
        }
      }
      const characters = state ? CHARACTER_ORDER.filter(name => state.characters[name]) : []
      const tile = (art, label, extra = null) => h('div', { key: art, className: 'lr-tile-holder' },
        h('button', { type: 'button', className: `lr-tile${found?.art === art ? ' lr-on' : ''}`, title: label,
          onClick: () => choose(art) }, h('img', { src: imageOf(art), alt: label, loading: 'lazy' })), extra)
      return h(Modal, { title: t('art.title', { model: model.name ?? model.id }), onClose, t, small: true },
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        h('div', { className: 'lr-row' },
          h('button', { type: 'button', className: 'lr-button', onClick: () => choose(null) }, t('art.default')),
          h('button', { type: 'button', className: 'lr-button lr-primary', onClick: () => input.current?.click() }, t('art.upload')),
          h('input', { ref: input, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true,
            onChange: event => upload(event.target.files?.[0]) })),
        state?.uploads?.length ? h('div', { className: 'lr-tiles' }, state.uploads.map(upload => tile(`custom:${upload.id}`,
          upload.name || upload.id, h('button', { type: 'button', className: 'lr-tile-forget', title: t('art.forget'),
            'aria-label': t('art.forget'), onClick: () => forget(upload.id) }, '×')))) : null,
        characters.map(name => h('div', { key: name, className: 'lr-art-group' },
          h('div', { className: 'lr-label' }, state.characters[name].name),
          h('div', { className: 'lr-tiles' }, TIER_ORDER.map(tier => tile(`${name}/${tier}`,
            `${state.characters[name].name} · ${state.tiers[tier]?.name ?? tier}`))))))
    }

    // ---- one provider: key, balance, models ----
    function ProviderCard ({ remote, entry, namespace, writable, offered, catalogNames, reload, t }) {
      const profile = getPath(namespace.value, entry.settingsPath) ?? {}
      const named = typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv ? profile.apiKeyEnv : undefined
      const ref = named ?? DEFAULT_REFS[entry.provider] ?? deriveKeyRef(entry.provider)
      const used = Array.isArray(profile.models) ? profile.models : null
      const [info, setInfo] = useState(null)
      const [keyDraft, setKeyDraft] = useState('')
      const [envDraft, setEnvDraft] = useState(named ?? '')
      const [note, setNote] = useState(null)
      const [failure, setFailure] = useState(null)
      const [found, setFound] = useState(null) // discovered models: [{ id, name, ..., live }]
      const [filter, setFilter] = useState('')
      const [balance, setBalance] = useState(null)
      const [busy, setBusy] = useState(false)
      const [artFor, setArtFor] = useState(null)
      useEffect(() => setEnvDraft(named ?? ''), [named])

      const describe = useCallback(async () => {
        try {
          const refs = [...new Set([ref, ...(named ? [] : entry.nativeAuth?.env ?? [])])].filter(name => REF.test(name)).slice(0, 64)
          const answer = unwrap(await remote.credentials.describe(refs))
          setInfo(refs.map(name => ({ name, ...answer[name] })).find(item => item.configured) ?? { name: ref, ...answer[ref] })
        } catch { setInfo({ name: ref, unknown: true }) }
      }, [ref, named])
      useEffect(() => { describe() }, [describe])

      const fetchCatalog = useCallback(async quiet => {
        try {
          const models = unwrap(await remote.llm.discoverModels(entry.settingsNs, { provider: entry.provider }))
          setFound(previous => merge(previous, models.map(model => ({ ...model, live: false }))))
          if (!quiet) setNote(t('fetch.found', { count: models.length }))
        } catch (error) { if (!quiet) setFailure(t('failed', { error: errorText(error) })) }
      }, [entry.provider, entry.settingsNs])
      useEffect(() => { fetchCatalog(true) }, [fetchCatalog])

      const merge = (previous, models) => {
        const all = new Map((previous ?? []).map(model => [model.id, model]))
        for (const model of models) all.set(model.id, { ...all.get(model.id), ...model, live: all.get(model.id)?.live === false ? false : model.live })
        return [...all.values()]
      }
      async function fetchLive () {
        setBusy(true); setFailure(null)
        try {
          const answer = await get(`${API.live}?provider=${encodeURIComponent(entry.provider)}&ref=${encodeURIComponent(ref)}`)
          setFound(previous => merge(previous, answer.models.map(model => ({ ...model, live: true }))))
          setNote(t('fetch.found', { count: answer.models.length }))
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }

      async function write (path, value) {
        const ops = value === undefined ? [{ op: 'unset', path }] : [{ op: 'set', path, value }]
        let attempt = namespace.revision
        for (let tries = 0; tries < 2; tries++) {
          const response = await remote.settings.mutate(entry.settingsNs, ops, attempt)
          if (response?.ok !== false) { await reload(); return }
          if (response.error?.code !== 'settings/conflict' || tries) throw new Error(response.error?.message ?? 'refused')
          const view = unwrap(await remote.settings.describe())
          attempt = view.namespaces.find(item => item.ns === entry.settingsNs)?.revision
        }
      }

      async function saveKey () {
        const value = keyDraft.trim()
        if (!value) return
        setBusy(true); setFailure(null); setNote(null)
        try {
          if (!named && entry.settingsNs === 'llm-pi-ai') await write([...entry.settingsPath, 'apiKeyEnv'], ref)
          unwrap(await remote.credentials.set(ref, value))
          setKeyDraft('')
          setNote(t('key.saved'))
          await describe()
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      async function saveEnv () {
        const name = envDraft.trim()
        if (name && !REF.test(name)) return setFailure(t('key.envBad'))
        setBusy(true); setFailure(null); setNote(null)
        try {
          await write([...entry.settingsPath, 'apiKeyEnv'], name || undefined)
          setNote(name ? t('key.envSaved', { name }) : null)
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      async function askBalance () {
        setBusy(true); setFailure(null)
        try {
          setBalance(await get(`${API.balance}?provider=${encodeURIComponent(entry.provider)}&ref=${encodeURIComponent(ref)}`))
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }

      // Used: the profile's model list; without one, the provider's whole catalog (as DSH's picker shows it).
      const catalog = catalogNames ?? []
      const usedIds = used ? used.map(model => (typeof model === 'string' ? model : model.id)) : catalog.map(model => model.id)
      const usedSet = new Set(usedIds)
      const ignored = (found ?? []).filter(model => !usedSet.has(model.id))
      const shownIgnored = ignored.filter(model => !filter || `${model.id} ${model.name ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
      const nameOf = id => catalog.find(model => model.id === id)?.name ?? found?.find(model => model.id === id)?.name ?? id
      const lookup = useResolved(usedIds.map(id => ({ provider: entry.provider, id })))

      async function move (id, toUsed) {
        if (!writable) return
        const current = used ?? catalog.map(model => ({ id: model.id }))
        let next
        if (toUsed) {
          const model = found?.find(item => item.id === id) ?? { id }
          const entryOf = model.live
            ? Object.fromEntries(Object.entries({ id: model.id, name: model.name, contextWindow: model.contextWindow,
                maxTokens: model.maxTokens }).filter(([, value]) => value !== undefined && value !== null))
            : { id: model.id }
          next = [...current, entryOf]
        } else {
          next = current.filter(model => (typeof model === 'string' ? model : model.id) !== id)
          if (!next.length) return setFailure(t('used.last'))
        }
        setBusy(true); setFailure(null); setNote(null)
        try { await write([...entry.settingsPath, 'models'], next) } catch (error) {
          setFailure(t('failed', { error: errorText(error) }))
        } finally { setBusy(false) }
      }

      const status = info?.unknown ? 'unknown' : info?.configured ? (info.source === 'environment' || info.source === 'env' ? 'env' : 'stored') : 'missing'
      return h('section', { className: 'lr-provider' },
        h('header', { className: 'lr-provider-head' },
          h('span', { className: 'lr-provider-name' }, entry.displayName || entry.provider),
          h('code', { className: 'lr-dim' }, entry.provider)),
        h('div', { className: 'lr-field' },
          h('span', { className: 'lr-label' }, t('key.title')),
          h('span', { className: 'lr-key-status', 'data-status': status },
            h('span', { className: 'lr-dot' }), h('code', null, info?.name ?? ref), ' ', t(`key.${status}`)),
          h('div', { className: 'lr-row' },
            h('input', { className: 'lr-input', type: 'password', autoComplete: 'new-password', placeholder: t('key.paste'),
              value: keyDraft, disabled: busy || !writable, onChange: event => setKeyDraft(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') saveKey() } }),
            h('button', { type: 'button', className: 'lr-button', disabled: busy || !keyDraft.trim() || !writable, onClick: saveKey }, t('key.save'))),
          h('div', { className: 'lr-row' },
            h('input', { className: 'lr-input lr-mono', placeholder: `${t('key.envName')} (${ref})`, value: envDraft,
              disabled: busy || !writable, onChange: event => setEnvDraft(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') saveEnv() } }),
            h('button', { type: 'button', className: 'lr-button', disabled: busy || !writable || envDraft.trim() === (named ?? ''), onClick: saveEnv }, t('key.envSave')),
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
            balance.note ? h('div', { className: 'lr-dim' }, balance.note) : null) : null),
        h('div', { className: 'lr-field' },
          h('span', { className: 'lr-label' }, t('used.title', { count: usedIds.length })),
          used ? null : h('div', { className: 'lr-dim' }, t('used.all', { count: usedIds.length })),
          h('div', { className: 'lr-pills' }, usedIds.map(id => h('span', { key: id, className: 'lr-pill lr-used' },
            h('button', { type: 'button', className: 'lr-pill-face', title: t('art.change'), 'aria-label': t('art.change'),
              onClick: () => setArtFor({ provider: entry.provider, id, name: nameOf(id) }) },
            h(Face, { found: lookup({ provider: entry.provider, id }), label: id, size: 20 })),
            h('button', { type: 'button', className: 'lr-pill-text', disabled: busy || !writable, title: id,
              onClick: () => move(id, false) }, nameOf(id)))))),
        h('div', { className: 'lr-field' },
          h('div', { className: 'lr-row lr-between' },
            h('span', { className: 'lr-label' }, t('ignored.title', { count: ignored.length })),
            h('span', { className: 'lr-row' },
              h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy, onClick: () => fetchCatalog(false) }, t('fetch.catalog')),
              offered?.models ? h('button', { type: 'button', className: 'lr-button lr-small', disabled: busy, title: t('fetch.liveTitle'), onClick: fetchLive }, t('fetch.live')) : null)),
          ignored.length > 12 ? h('input', { className: 'lr-input lr-small-input', placeholder: t('ignored.filter'), value: filter,
            onChange: event => setFilter(event.target.value) }) : null,
          ignored.length ? h('div', { className: 'lr-pills' }, shownIgnored.slice(0, 150).map(model => h('button', {
            key: model.id, type: 'button', className: 'lr-pill lr-ignored', disabled: busy || !writable, title: model.name ?? model.id,
            onClick: () => move(model.id, true)
          }, model.id, model.live && !catalog.some(item => item.id === model.id) && !(found ?? []).some(item => item.id === model.id && item.live === false)
            ? h('span', { className: 'lr-new' }, 'live') : null)),
          shownIgnored.length > 150 ? h('span', { className: 'lr-dim' }, t('ignored.more', { count: shownIgnored.length - 150 })) : null)
            : h('div', { className: 'lr-dim' }, t('ignored.none'))),
        note ? h('div', { className: 'lr-note' }, note) : null,
        failure ? h('div', { className: 'lr-error', role: 'alert' }, failure) : null,
        artFor ? h(ArtPicker, { model: artFor, onClose: () => setArtFor(null), t }) : null)
    }

    function ModelsTab ({ remote, directory, t }) {
      const state = useRosterState()
      const [view, setView] = useState(null)
      const [entries, setEntries] = useState(null)
      const [failure, setFailure] = useState(null)
      const [adding, setAdding] = useState(false)
      const snapshot = directory ? useDirectory(directory) : null
      const [catalog, setCatalog] = useState(null)

      const reload = useCallback(async () => {
        try {
          const [described, configurable, models] = await Promise.all([remote.settings.describe(),
            remote.llm.listConfigurableProviders(), directory ? Promise.resolve(null) : remote.session.modelCatalog()])
          setView(unwrap(described))
          setEntries(unwrap(configurable))
          if (models) setCatalog(unwrap(models))
          setFailure(null)
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }, [])
      useEffect(() => { reload() }, [reload])
      useEffect(() => { directory?.load().catch(() => {}) }, [directory])

      if (failure && !view) return h('div', { className: 'lr-error' }, failure)
      if (!view || !entries) return h('div', { className: 'lr-empty' }, t('models.loading'))
      const namespaces = new Map(view.namespaces.map(item => [item.ns, item]))
      const groups = snapshot?.groups ?? catalog?.groups ?? []
      const rows = entries.filter(entry => entry.provider !== 'deepseek-account' && namespaces.has(entry.settingsNs))
      const configured = rows.filter(entry => entry.settingsPath.length === 0 ||
        getPath(namespaces.get(entry.settingsNs).value, entry.settingsPath) !== undefined)
      const addable = rows.filter(entry => !configured.includes(entry) && entry.settingsPath.length > 0)
      const writable = view.writable !== false

      async function add (provider) {
        const entry = addable.find(item => item.provider === provider)
        if (!entry) return
        setAdding(true)
        try {
          const response = await remote.settings.mutate(entry.settingsNs, [{ op: 'set', path: [...entry.settingsPath], value: {} }],
            namespaces.get(entry.settingsNs).revision)
          unwrap(response)
          await reload()
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setAdding(false) }
      }

      return h('div', { className: 'lr-models' },
        h('p', { className: 'lr-dim lr-intro' }, t('models.intro')),
        writable ? null : h('div', { className: 'lr-note' }, t('models.readOnly')),
        failure ? h('div', { className: 'lr-error' }, failure) : null,
        configured.map(entry => h(ProviderCard, {
          key: `${entry.settingsNs}:${entry.provider}`, remote, entry, namespace: namespaces.get(entry.settingsNs), writable,
          offered: state?.providers?.[entry.provider], reload,
          catalogNames: groups.find(group => group.id === entry.provider)?.models ?? null, t
        })),
        writable && addable.length ? h('select', { className: 'lr-input lr-add', value: '', disabled: adding,
          onChange: event => add(event.target.value) },
        h('option', { value: '' }, adding ? t('models.adding') : t('models.add')),
        addable.map(entry => h('option', { key: entry.provider, value: entry.provider }, entry.displayName || entry.provider))) : null)
    }

    /** Your Artificial Analysis key: pasted (kept write-only in DSH's credential store, under the first name the server
     * looks up), or the variable that holds it (kept in the roster's settings). */
    function AaKey ({ remote, t, onChange }) {
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
      async function saveKey () {
        const value = keyDraft.trim()
        if (!value) return
        setBusy(true); setFailure(null); setNote(null)
        try {
          unwrap(await remote.credentials.set(keys[0], value))
          setKeyDraft(''); setNote(t('key.saved')); await describe(); onChange?.()
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
      async function saveEnv () {
        const name = envDraft.trim()
        if (name && !REF.test(name)) return setFailure(t('key.envBad'))
        setBusy(true); setFailure(null); setNote(null)
        try {
          await post(API.settings, { aaKeyEnv: name || null })
          await loadState()
          setNote(name ? t('key.envSaved', { name }) : null)
        } catch (error) { setFailure(t('failed', { error: errorText(error) })) } finally { setBusy(false) }
      }
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
      const snapshot = directory ? useDirectory(directory) : null
      const [data, setData] = useState(null)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)
      const load = async () => {
        try { setData(await get(`${API.rankings}?top=30`)) } catch (error) { setFailure(t('failed', { error: errorText(error) })) }
      }
      useEffect(() => { load() }, [])
      const models = snapshot ? catalogOf(snapshot) : []
      const lookup = useResolved(models)
      const mine = new Set(models.map(model => lookup(model)?.aa?.slug).filter(Boolean))
      async function refresh () {
        setBusy(true); setFailure(null)
        try { await post(API.rankings, {}); await Promise.all([load(), loadState()]); forgetResolved() } catch (error) {
          setFailure(`${t('failed', { error: errorText(error) })} ${t('rankings.needKey')}`)
        } finally { setBusy(false) }
      }
      return h('div', { className: 'lr-rankings' },
        remote ? h(AaKey, { remote, t }) : null,
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
      useEffect(() => { try { sessionStorage.setItem('dsh-llm-roster.tab', tab) } catch { /* fine */ } }, [tab])
      useEffect(() => { directory.load().catch(() => {}) }, [directory])
      const tabs = h('nav', { className: 'lr-tabs' }, ['roster', 'models', 'rankings'].map(id => h('button', {
        key: id, type: 'button', className: `lr-tab${tab === id ? ' lr-on' : ''}`, onClick: () => setTab(id)
      }, t(`tab.${id}`))))
      return h(Modal, { title: t('dialog.title'), onClose, t, tabs },
        tab === 'roster' ? h(RosterTab, { directory, available, onPicked: onClose, onSettings: () => setTab('models'), t })
          : tab === 'models' ? h(ModelsTab, { remote, directory, t })
            : h(RankingsTab, { remote, directory, t }))
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
        const rarity = found?.tier ? state?.tiers?.[found.tier]?.rarity : null
        const label = name ? t('avatar.title', { model: name }) : t('avatar.none')
        return h(React.Fragment, null,
          h('button', { type: 'button', className: 'lr-avatar', 'data-rarity': rarity ?? undefined, title: label, 'aria-label': label,
            'data-pending': snapshot.status === 'selecting' ? '' : undefined, onClick: () => setOpen(true) },
          h(Face, { found, label: name ?? '?', size: 24 })),
          open ? h(RosterDialog, { remote, directory, available, onClose: () => setOpen(false), t }) : null)
      }
    }

    /** The plugin's page under Plugins: Models & keys and Rankings, without a session. */
    function makeSettings (remote) {
      return function RosterSettings ({ t: words }) {
        const t = wordsOf(words)
        const [tab, setTab] = useState('models')
        return h('div', { className: 'lr-page' },
          h('nav', { className: 'lr-tabs' }, ['models', 'rankings'].map(id => h('button', {
            key: id, type: 'button', className: `lr-tab${tab === id ? ' lr-on' : ''}`, onClick: () => setTab(id)
          }, t(`tab.${id}`)))),
          tab === 'models' ? h(ModelsTab, { remote, directory: null, t }) : h(RankingsTab, { remote, directory: null, t }))
      }
    }

    const CSS = `
.lr-avatar { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; flex: none; position: relative }
.lr-avatar:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)) }
.lr-avatar .lr-face { box-shadow: 0 0 0 1.5px var(--lr-ring, var(--dsw-alias-border-l3, rgba(128,128,128,.4))) }
.lr-avatar[data-rarity=R] { --lr-ring: #4a90e2 } .lr-avatar[data-rarity=SR] { --lr-ring: #a463f2 }
.lr-avatar[data-rarity=SSR] { --lr-ring: #f2b233 } .lr-avatar[data-rarity=UR] { --lr-ring: #ff5f9e }
.lr-avatar[data-pending] .lr-face { opacity: .55 }
.lr-face { border-radius: 50%; object-fit: cover; object-position: 50% 15%; flex: none; display: inline-block;
  background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.15)) }
.lr-face-none { display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;
  color: var(--dsw-alias-label-secondary, #666) }
.lr-overlay { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(10, 12, 24, .55); backdrop-filter: blur(3px) }
.lr-dialog { width: min(1040px, 100%); height: min(780px, 100%); display: flex; flex-direction: column; outline: none;
  border-radius: 16px; overflow: hidden; color: var(--dsw-alias-label-primary, #1a1a1a);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #fff)); box-shadow: 0 24px 80px rgba(0,0,0,.35);
  font-size: 13px; line-height: 1.45 }
.lr-dialog-small { width: min(720px, 100%); height: min(640px, 100%) }
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
.lr-chip { height: 26px; padding: 0 11px; border-radius: 13px; font: inherit; font-size: 12px; color: inherit; cursor: pointer;
  background: transparent; border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.45)) }
.lr-chip.lr-on { border-color: var(--dsw-alias-state-business-primary, #4d6bfe); color: var(--dsw-alias-state-business-primary, #4d6bfe);
  background: var(--dsw-alias-state-business-secondary, rgba(77,107,254,.1)) }
.lr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 12px }
.lr-card { position: relative; aspect-ratio: 2 / 3; padding: 0; border: 0; border-radius: 12px; overflow: hidden; cursor: pointer;
  font: inherit; color: #fff; text-align: left; isolation: isolate; --lr-c: #4a90e2; --lr-c2: #9cc7ff;
  background: linear-gradient(160deg, color-mix(in srgb, var(--lr-c) 35%, #1b1d2e), #10121d 70%);
  box-shadow: 0 0 0 2px var(--lr-c), 0 6px 18px rgba(0,0,0,.25); transition: transform .12s, box-shadow .12s }
.lr-card[data-rarity=SR] { --lr-c: #a463f2; --lr-c2: #d6b4ff }
.lr-card[data-rarity=SSR] { --lr-c: #f2b233; --lr-c2: #ffe39a }
.lr-card[data-rarity=UR] { --lr-c: #ff5f9e; --lr-c2: #8fe3ff }
.lr-card[data-rarity=UR]::before { content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none; border-radius: 12px;
  padding: 2px; background: linear-gradient(135deg, #ff5f9e, #ffd36e, #7cf2c1, #8fe3ff, #b48cff, #ff5f9e);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude }
.lr-card:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 0 0 2px var(--lr-c2), 0 10px 26px rgba(0,0,0,.35) }
.lr-card:disabled { cursor: progress; opacity: .7 }
.lr-card[data-current] { box-shadow: 0 0 0 3px var(--lr-c2), 0 0 22px 2px color-mix(in srgb, var(--lr-c2) 70%, transparent) }
.lr-card-art { position: absolute; inset: 0; z-index: 0 }
.lr-card-art img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12% }
.lr-card-blank { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 40px;
  font-weight: 800; color: color-mix(in srgb, var(--lr-c2) 60%, transparent) }
.lr-card-text { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: flex; flex-direction: column; gap: 1px;
  padding: 26px 9px 8px; background: linear-gradient(transparent, rgba(8,9,16,.82) 38%, rgba(8,9,16,.94)) }
.lr-card-who { font-size: 10.5px; font-weight: 600; color: var(--lr-c2); letter-spacing: .02em; text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.lr-card-name { font-size: 13.5px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere }
.lr-card-meta { display: flex; justify-content: space-between; gap: 6px; font-size: 10.5px; color: rgba(255,255,255,.72) }
.lr-rarity { position: absolute; top: 7px; left: 7px; z-index: 2; padding: 1px 7px; border-radius: 6px; font-size: 11px; font-weight: 800;
  font-style: italic; letter-spacing: .04em; color: #1b1300; background: linear-gradient(135deg, var(--lr-c2), var(--lr-c));
  box-shadow: 0 1px 4px rgba(0,0,0,.35) }
.lr-aa { position: absolute; top: 7px; right: 7px; z-index: 2; padding: 1px 6px; border-radius: 6px; font-size: 10.5px; font-weight: 700;
  background: rgba(8,9,16,.72); color: #fff; font-variant-numeric: tabular-nums }
.lr-ribbon { position: absolute; top: 34px; left: 0; z-index: 2; padding: 2px 9px 2px 7px; font-size: 10.5px; font-weight: 700;
  color: #10121d; background: var(--lr-c2); border-radius: 0 8px 8px 0 }
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
.lr-models { display: flex; flex-direction: column; gap: 12px }
.lr-provider { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; border-radius: 12px;
  border: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)) }
.lr-provider-head { display: flex; align-items: baseline; gap: 8px }
.lr-provider-name { font-weight: 700; font-size: 14px }
.lr-field { display: flex; flex-direction: column; gap: 6px }
.lr-label { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, #555) }
.lr-key-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px }
.lr-dot { width: 8px; height: 8px; border-radius: 50%; background: #999 }
.lr-key-status[data-status=stored] .lr-dot, .lr-key-status[data-status=env] .lr-dot { background: #22a559 }
.lr-key-status[data-status=missing] .lr-dot { background: #d93025 }
.lr-input { height: 30px; min-width: 0; flex: 1 1 200px; box-sizing: border-box; padding: 0 9px; border-radius: 8px; font: inherit; color: inherit;
  background: var(--dsw-alias-bg-layer-3, transparent); border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.lr-mono, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px }
.lr-small-input { flex: none; width: min(260px, 100%); height: 26px; font-size: 12px }
.lr-add { flex: none; width: min(320px, 100%); cursor: pointer }
.lr-button { height: 30px; padding: 0 13px; border-radius: 8px; font: inherit; cursor: pointer; color: inherit; white-space: nowrap;
  background: transparent; border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.lr-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)) }
.lr-button:disabled { opacity: .5; cursor: default }
.lr-small { height: 26px; padding: 0 10px; font-size: 12px }
.lr-primary { color: var(--dsw-alias-label-primary-foreground, #fff); border-color: transparent;
  background: var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-balance { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px }
.lr-pills { display: flex; flex-wrap: wrap; gap: 6px }
.lr-pill { display: inline-flex; align-items: center; gap: 4px; height: 28px; border-radius: 14px; font: inherit; font-size: 12px;
  color: inherit; background: transparent; border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.lr-used { padding: 0 3px 0 3px; border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  background: var(--dsw-alias-state-business-secondary, rgba(77,107,254,.08)) }
.lr-pill-face { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; display: inline-flex }
.lr-pill-face:hover { outline: 2px solid var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-pill-text { height: 100%; padding: 0 8px 0 2px; border: 0; background: transparent; font: inherit; color: inherit; cursor: pointer }
.lr-pill-text:hover:not(:disabled) { text-decoration: line-through }
.lr-ignored { padding: 0 11px; cursor: pointer; color: var(--dsw-alias-label-secondary, #555) }
.lr-ignored:hover:not(:disabled) { border-color: var(--dsw-alias-state-business-primary, #4d6bfe); color: var(--dsw-alias-label-primary, inherit) }
.lr-pill:disabled, .lr-pill-text:disabled { opacity: .6; cursor: default }
.lr-new { font-size: 9.5px; font-weight: 700; padding: 0 5px; border-radius: 6px; color: #fff; background: #22a559 }
.lr-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px }
.lr-tile-holder { position: relative }
.lr-tile { width: 100%; aspect-ratio: 2 / 3; padding: 0; border-radius: 8px; overflow: hidden; cursor: pointer; background: #10121d;
  border: 2px solid transparent }
.lr-tile img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12% }
.lr-tile.lr-on, .lr-tile:hover { border-color: var(--dsw-alias-state-business-primary, #4d6bfe) }
.lr-tile-forget { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; border: 0; cursor: pointer;
  background: rgba(0,0,0,.6); color: #fff; line-height: 1 }
.lr-art-group { display: flex; flex-direction: column; gap: 6px; margin-top: 12px }
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
