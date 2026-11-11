# dsh-llm-roster

[English](README.md) · 简体中文

一个用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的抽卡式角色名册。你的模型会变成角色：一个头像位于输入框模型选择器的左侧，点击它会打开名册，选择一张卡即可把会话切换到该模型。

DSH 每次只在一个模型上运行一个智能体，所以这里没有编队。选择卡牌的效果与 DSH 自带的模型选择器完全一样。两者共用同一个模型目录，因此始终保持一致；思考强度也仍留在 DSH 的选择器中设置。

## 安装

```sh
dsh plugin --profile web add github:RustColeone/dsh-llm-roster
```

安装包的 bundle patch 会把插件加入配置文件（`- id: llm-roster`）。重新启动 DSH（`dsh web`）并打开一个对话：头像会出现在消息框下方模型名称的旁边。

## 它展示的内容

**头像。** 会话所用模型在其层级的脸：每个角色的每个层级都有自己的脸，因此你一眼就能看出当前是哪个模型。头像外圈是该层级稀有度的颜色，点击它会打开名册。

**名册。** DSH 选择器提供的每个模型，加上名册收录的主流模型阵容，每张卡都带有：

- 该模型所在层级的角色立绘，以及该层级的稀有度；
- 该模型的 Artificial Analysis 智能指数，以及它在他们测评模型中的排名；
- 一个 **…** 按钮，用于打开角色页面；
- 当最近调用该模型（或其服务商的密钥）失败时，会出现红色 **⚠**，悬停可查看原因（见下文**最近调用失败原因**）。

点击一张可用卡即可把会话切换到该模型。还不能使用的卡会说明原因：

| 卡面 | 含义 |
| --- | --- |
| **不可用**：请添加 API 密钥 | 没有找到该服务商的密钥。点击会打开可以添加密钥的页面。 |
| **API 密钥被拒绝** | 名册向该服务商查询使用情况时，它拒绝了这个密钥。 |
| **未启用** | 密钥可用，但该模型还不是该服务商“使用中”的模型之一。它的页面可以添加。 |

每个密钥都会通过向服务商查询使用情况来测试：如果它报告余额就查余额，否则查询该密钥可调用的模型。结果会保留十分钟，**测试密钥**按钮会重新查询。在 DSH 中登录 DeepSeek 账号后，DeepSeek 模型无需密钥。它们会通过账号使用，DeepSeek 卡片的页面也可以让你选择使用账号还是 API 密钥。

名册默认打开**可用**：你现在能用的模型。**全部**显示所有角色，以及每个角色需要什么；某个服务商的筛选标签则只显示它的模型。

你可以按服务商、排名或发布日期排序。按服务商排序时，每个服务商名字一行（▸ DeepSeek ───）排在它的卡片前。**按服务商分组**会把这些分组行关掉或重新打开，名册会在当前浏览器中记住你的选择。DeepSeek 账号和她的 API 密钥在那里算作同一个服务商：每个 DeepSeek 模型只有一张卡，通过其中一个使用，卡上会标明是哪一个。按发布日期排序时，最新的排在前面，每张卡都会显示日期。模型的发布日期按以下顺序确定：

1. 如果 Artificial Analysis 测评了该模型，用他们的日期。
2. OpenRouter 上架该模型的那天，无论你通过哪个服务商使用它（Volcengine 的 `doubao-seed-2-1-turbo-260628` 会使用 OpenRouter 上 Seed 2.1 Turbo 的日期）。
3. 对于他们都没有列出的阵容模型，用名册在 [`plugin/models.json`](plugin/models.json) 中给出的日期：其厂商宣布该模型的那天（Seed 2.1 Pro，2026-06-23）。
4. 模型 ID 中的日期（如果有，例如 `claude-3-5-haiku-20241022`，或 Volcengine 的 `doubao-seed-2-1-pro-260628` 这类版本标记）。
5. 否则，使用**名册首次见到它的那天**，并用 `~` 表示（`~2026-11-12`）。一个不在我们任何列表中的模型只可能比这些列表更新，所以明天才出现的“Claude Fable 5.5”就会被算作明天发布。这个日期保存在你的 DSH 主目录中，不会变动，直到 Artificial Analysis 或 OpenRouter 公布该模型的日期。届时他们的日期会取代它。

插件自带这两个列表的快照，在**排行**标签页使用**重新拉取**即可更新。OpenRouter 的列表是公开的，所以这部分不需要密钥。角色页面会在角色名字下方显示她的发布日期。一个限制：OpenRouter 已不再列出、且 ID 中没有日期的模型，也会使用它首次出现的日期。

角色页面（**…** 按钮）包含：

- **展示与图鉴：** 大卡面，以及立绘包中该角色的所有图片（四个层级，以及更多）。点击一张即可预览，然后**装备这张立绘**。
- **属性**，来自 Artificial Analysis：
  - 智能指数和六项能力指数的条形图（工程、财务、经济、法律、医疗、战略运营）；
  - 她的排名；
  - 一个智能指数任务的成本，以及整个指数的成本；
  - 使用 Pro 密钥时，还有任务耗时和 token 数；
  - 价格、速度，以及首个回答 token 前的等待时间（含思考）；
  - 他们测评的每个思考强度，及其指数和每任务成本。
- **装备：** 卡面和头像，两者可分别更换。可以选择立绘包中的任意图片，自己的排在最前（她各层级的，以及她文件夹中的其他图片），也可以选择其他角色的，或上传图片（PNG、JPEG、WebP 或 GIF，最大 4 MB）。你的选择是对当前使用的立绘包所做的改动，导出该立绘包时会写入其中（见**立绘包**）。
- **名册状态：** 模型是使用中还是已忽略，可点击**移到忽略**。
- **通过**（对于阵容模型）：角色由哪个服务商和密钥提供服务。可选她自己的服务商、OpenRouter 或你自己的 OpenAI 兼容接口；**+ OpenAI 兼容接口**可以添加一个。
  - 她的模型会在该服务商提供的模型中按名称匹配，因此 OpenRouter 的 `anthropic/claude-opus-5.5` 就是 Anthropic 的 `claude-opus-5-5`。前面的家族名和结尾的版本标记不算，所以 Volcengine 的 `doubao-seed-2-1-turbo-260628` 就是 Seed 2.1 Turbo（如果有多个版本，取最新）。
  - 如果服务商不提供某个模型，会显示**这里没有**。对于默认通过 OpenRouter 使用的角色，如果某阵容模型 OpenRouter 没有列出，也会这样显示。
  - 因此，只有 OpenRouter 密钥也能使用所有角色：GPT、Claude、Kimi、GLM 等等。
- **服务商：** 服务商的密钥，可测试并查看余额，以及最近它的调用失败原因（会标出这个模型的那条）。
- **使用这个模型**；如果该模型尚未启用，则显示**加入并使用这个模型**。

**+ 卡片**用于添加阵容中没有的模型。选择一个服务商，或新建一个 OpenAI 兼容接口（尚未配置的服务商也会被添加，并带有密钥字段）。输入模型 ID，或从目录或该服务商的实时列表中挑选；再命名，并选择它的立绘和头像。它会加入该服务商的“使用中”模型，因此 DSH 的选择器也会提供它。

OpenAI 兼容接口指任何使用 OpenAI Chat Completions API 的服务：中继、网关，或你自己的服务器。给它起名，填写 Base URL 和密钥（或保存密钥的环境变量），让 DSH 查找它的模型，再选择要用的模型。它会像其他服务商一样成为 DSH 设置中的一条服务商路由，密钥仅写入、不可读。名册不会自己支持每个服务商的专有 API：DSH 已经原生支持它们（Claude 的 Anthropic Messages、Gemini 的 Google API、Mistral API、OpenAI Responses，以及 Kimi、GLM 和 DeepSeek 的 Chat Completions），其他服务都可以作为 OpenAI 兼容密钥接入。

| 层级 | 立绘 | 稀有度 |
| --- | --- | --- |
| Q版 | Q版形象 | R |
| 初中生 | 初中制服 | SR |
| 高中生 | 高中西装外套 | SSR |
| 大学生 | 成年，在校园 | UR |

这些是内置立绘包的名称和图片。另一个立绘包可以把层级叫成任何名字（Squire、Page、Knight、Paladin），并按任意方式绘制角色：见下文**立绘包**。

内置十四个角色，每个角色都有每个层级的卡面和头像：

- GPT、Claude、Gemini、DeepSeek 和 Grok，来自各自的服务商；
- Kimi、GLM、Qwen、Mistral、MiniMax、Llama、Doubao、Perplexity 和 Hunyuan，默认通过 OpenRouter 使用。

Doubao 是字节跳动的 Seed 系列。OpenRouter 列出了 Seed 2.1 Turbo、2.0 Code、2.0 Lite 和 2.0 Mini。字节跳动的旗舰模型 Seed 2.1 Pro 只在其自有云 Volcengine Ark 上提供，所以它的卡片会显示**这里没有**。要使用它，可在 Doubao 的页面把 Ark 添加为 OpenAI 兼容接口（Base URL 为 `https://ark.cn-beijing.volces.com/api/v3`，填你的 Ark 密钥），并让她通过这个接口使用。Ark 自己的 ID（例如 `doubao-seed-2-1-pro-260628`）会匹配到阵容并保留其层级。Artificial Analysis 没有测评 Seed 系列模型，所以这些卡片没有排行。

[`plugin/models.json`](plugin/models.json) 说明了哪个主流模型对应哪个角色和层级（GPT-6 Luna 是 Q版，GPT-6.1 Sol 是高中生，Claude Fable 是大学生，Kimi K3 是高中生、K3.1 Pro 是大学生……），这些模型就是名册的阵容。还有少量模型在那里按模式命名（Kimi K3 256K，`kimi-k3*256k*`，是 Q版）。其他模型按 ID（`gpt…`、`claude…`、`kimi…`、`glm…`、`qwen…`、`sonar…` 等，也包含 OpenRouter 的 `vendor/` 前缀后面的部分）或服务商匹配。层级根据 ID 中的词判断：flash、mini 和 haiku 是 Q版；pro 和 opus 是高中生；prime、fable 和 deep research 是大学生，等等。

上一代模型会先被排除，直到你选择它们：Kimi for Coding（`kimi-for-coding*`）。提供整个目录的服务商会把它们放在**模型与密钥**的**忽略**下，并在卡片下方计数；把一个移到**使用中**，它的卡就会回来。

提供整个目录的服务商（例如没有模型列表的 OpenRouter，有数百个模型）只显示名册认识的角色模型。一条提示会统计其余模型，这些模型仍会出现在 DSH 的选择器中，并链接到**模型与密钥**供你选择要用的。

**模型与密钥。** 你在 DSH 中配置的每个服务商都有一张卡片：

- **API 密钥。** 你可以粘贴密钥，它会只写存储到 DSH 的凭据存储中，和 DSH 模型页保存密钥的方式完全一样。也可以指定保存密钥的环境变量，即设置该服务商的 `apiKeyEnv`。一个圆点会显示密钥是否已设置以及来源。**测试密钥**会向服务商询问密钥是否可用。
- **余额**，用于 API 会报告余额的服务商：DeepSeek、OpenRouter 和 Moonshot。
- **支出或剩余额度**，用于 OpenAI、Anthropic 和 xAI，卡片一打开就显示在 API 密钥下方。这些服务商只告诉有权读取它的密钥；这类密钥通常不能调用模型（一个 Anthropic 组织密钥需要 DSH 不指定的工作区），所以它有专属字段，因为很少用到而折叠在 API 密钥下方：**▸ 管理员密钥（消费）** 或 **▸ 管理密钥（余额）**，并会标明是否已设置。它是可选的；可以粘贴它（像 API 密钥一样，只写存储在 DSH 的凭据存储中），也可以设置它的变量。名册只用它读取；没有它时，才用 API 密钥询问。无权读取的密钥不会显示任何内容，也不计为失败；它的 **测试密钥** 会说明原因，以及是用哪个密钥询问的。

  | 服务商 | 显示 | 消费密钥 | 变量 |
  | --- | --- | --- | --- |
  | OpenAI | 本月支出（其 Costs API） | 管理员密钥，或具有 `api.usage.read` 权限的密钥 | `OPENAI_ADMIN_KEY` |
  | Anthropic | 本月支出（其 cost report） | 管理员密钥，或获准读取成本的组织范围密钥 | `ANTHROPIC_ADMIN_KEY` |
  | xAI | 剩余预付额度 | 团队的管理密钥 | `XAI_MANAGEMENT_KEY`（或 `XAI_MANAGEMENT_API_KEY`） |

  Google 对任何密钥都不告知这些数字：Gemini 的支出只能在 AI Studio 和 Google Cloud 的账单页看到。消费密钥能做的事不只是读取成本；名册只用它读取，而且在服务商允许限制密钥的地方（xAI 的管理密钥可以），请把它限制为只能查看账单。
- **最近调用失败原因**，见下文。
- **使用中和已忽略的模型，以胶囊标签显示。** 点击即可把模型从一个状态移到另一个状态。
  - “使用中”就是 DSH 设置中该服务商的模型列表（pi-ai 服务商是 `providers.<route>.models`，DeepSeek 是 `models`），所以“使用中”的模型正是 DSH 模型选择器和名册提供的模型。没有列表的服务商会使用其整个目录，直到你第一次把某个模型移出。
  - “忽略”中显示**拉取目录**找到的内容：DSH 安装的目录，不发起网络请求。
  - “忽略”默认最新在前，每个模型都带发布日期（日期未知的模型排在最后）。因此像 OpenRouter 这样的长列表，一打开就能看到刚发布的模型。**A–Z** 可改为按名称排序。为新建 OpenAI 兼容接口找到的模型，以及 + 卡片的建议，也同样最新在前。
  - **拉取实时列表**会直接询问服务商，你的密钥可以调用哪些模型。这样能找到比 DSH 目录更新的模型，比如发布当天的 Claude Fable 5.2。图像、语音和嵌入模型会被排除。
  - 每个“使用中”胶囊上的小头像可以更改该模型的头像。
- **全部使用和全部忽略。**
  - **对 DeepSeek 来说**，全部忽略会让它的模型列表为空，全部使用则会恢复 DSH 自带的列表。
  - **对 pi-ai 服务商来说**，没有模型列表的服务商会提供其整个目录。因此全部忽略会把该服务商暂时搁置：它从 DSH 设置中移除，但其密钥引用和模型列表保留在名册文件中。**重新使用**会原样放回。
- **移除服务商**确认后会把你添加的服务商从 DSH 设置中移除。它还可以删除 DSH 中为该服务商存储的密钥。DSH 自带配置中的服务商不能在这里移除或搁置。

**DeepSeek 账号**显示你是否已登录。登录后，DeepSeek 模型不需要 API 密钥，卡片还会显示 DSH 自己读取到的账号余额（充值和赠送），与**设置 → 账号**一致。

**最近调用失败原因。** 名册会监视 DSH 发出的每次模型调用（原样转发 DSH 的 `llm/stream`），并保留失败的那些及其原因：DSH 给出的错误码（密钥不被接受、配额或余额用尽、被限流、超时……）、HTTP 状态码和服务商返回的消息，按服务商和模型保存。密钥检查失败也会保留。它们会显示在**模型与密钥**的服务商卡片上、角色页面上（会标出她的模型），以及卡片上的红色 **⚠**。当之后再有一次调用成功，这些记录就会消失：该模型的失败记录，以及属于整个服务商的记录（其密钥、余额、速率、服务）。**清除**可以手动让它们消失。你主动停止的调用不算失败。它们保存在 DSH 主目录中（`failures.json`，每个服务商最新 12 条），服务商消息里任何看起来像密钥的内容都会被隐藏。

**添加服务商……**可以添加 DSH 能路由但尚未配置的服务商，或新建 OpenAI 兼容接口。接口的密钥由 DSH 自己测试，并用它保存的密钥列出其模型。

名册跟随 DSH 的语言，支持英文和中文。

**排行。** Artificial Analysis 的排行榜：他们测评的每个模型，默认每个模型只列其最佳思考强度；**所有思考强度**则把每个思考强度都作为单独条目。列包括：

- 智能指数；
- 一个指数任务的成本；
- 使用 Pro 密钥时，任务耗时和 token 数；
- 速度、价格和发布日期。

点击列标题按该列排序，再次点击反向排序。输入文字可查找模型或其厂商；**在你的名册中**会把列表缩小到你的模型，这些模型本来也会高亮显示。插件自带快照（会显示日期）。

Artificial Analysis 不再发布 Coding 或 Agentic 指数（他们的 API 返回的这两项都为空），所以名册改为显示六项能力指数。他们的免费列表只有任务成本，没有耗时和 token 数，这些在 Pro 列表中。使用 Pro 密钥时，**重新拉取**会读取 Pro 列表，并显示这两列。任务 token 数指模型写出的 token，包括思考 token：用任务成本的输出部分除以每个输出 token 的价格。

**重新拉取**会下载当前列表，需要你在 [artificialanalysis.ai](https://artificialanalysis.ai) 自己申请的免费密钥。在**排行**标签页粘贴密钥，它会像服务商密钥一样只写存储在 DSH 的凭据存储中。也可以指定保存它的环境变量。否则名册会读取 `ARTIFICIAL_ANALYSIS_API_KEY`，然后读取 `AA_API_TOKEN`。他们的条款要求在出现其数据的地方注明来源，名册已这样做。

**召唤。** 抽卡游戏就得有抽卡。召唤会从名册自己的卡池抽卡，纯粹为了好玩。✦ 是免费的：不会购买任何东西，也不会调用任何模型。召唤到角色不会让你拥有她的模型：使用模型仍需要对应密钥。卡池是阵容模型所对应的角色（大学生为 ★5，高中生为 ★4，其余为 ★3），外加 19 件 LLM 主题装备（Infinite Context、No Rate Limit、Valid JSON、Em Dash……）。概率采用 Fate/Grand Order 公布的召唤概率：

| | 角色 | 装备 |
| --- | --- | --- |
| ★5 | 1% | 4% |
| ★4 | 3% | 12% |
| ★3 | 40% | 40% |

- 单次召唤花费 3 ✦。×10 花费 30 ✦，发出 11 张卡，其中至少一张 ★4 或以上，至少一张为角色。
- 每个卡池都有一个概率 UP 的 ★5，占 1% 中的 0.8%。它默认是最新的大学生，除非你另外选择。你还可以添加概率 UP 的 ★4，占 3% 中的 1.5%。
- 如果概率 UP 的 ★5 在该卡池 329 次召唤后仍未出现，第 330 次必定是它，每个卡池仅一次。

一次召唤分两段进行：

1. **蓄力。** 星星飞掠而过，token 汇入一个正在绘成的圆环。在圆心处，光环伴随冲击波变色：★5 角色为带光线的彩虹色；★4 角色或 ★5 装备为金色。随后爆发出闪光。
2. **发牌。** 卡牌背面朝上从圆环中飞出，牌背已经透出它们是什么。它们逐张翻开，一道光扫过每张卡。★4 或 ★5 会弹起并迸出星星，★5 还会保留彩虹光晕。

点击可跳过动画。你得到的每张卡都会进入图鉴，召唤到角色会打开她的页面。

**手感。** 卡片的手感像货架上的盒装游戏。指针移到卡片上时，卡片会抬起并向指针倾斜，一道光泽条和高光会跟随指针扫过卡面；★4 和 ★5 卡还有会随倾斜变化的闪膜。角色的大图、图鉴和召唤横幅也是如此，立绘会随指针轻微移动。当系统要求减弱动态效果时，所有这些效果和所有动画都会关闭。

**立绘包。** 角色的样子，以及角色和层级的名称，都来自立绘包。立绘包不会改变模型是谁（她的角色、层级和稀有度、阵容），只会改变她的装扮和命名。名册自带两个立绘包，从它第一次启动起就是你的：

- **学园（Academy）**，学生立绘包，在你另选其他之前一直使用：全部十四个角色，从 Q版到初中生、高中生、大学生，按 ZipZipPipe 的设计绘制。它也是内置图片（`art/`）：任何立绘包缺少的内容都来自这里。
- **原版（Original）**，额外的一个：全部十四个角色都以各自的立绘阶段作为层级（二阶段、三阶段，以及觉醒的第四阶段），各自的 Q版就是 Q版。她们的羁绊图片（咖啡厅、居家、夏日祭）是她页面中的更多卡面选择，她们的表情头像（开心、平静、担心、悲伤）也可作为更多头像。最初的五个（GPT、Claude、Gemini、DeepSeek 和 Grok）与 ChimeraArchiveHarness 最初画的一样；另外九个角色是用同样的提示词为这个立绘包绘制的。它以 .zip 形式提供（[`packs/original.zip`](packs)）。（0.5.3 之前的名册会把它添加为**原版学生**，只有最初五个；那个会保留在你的立绘包里，直到你移除。）

在**名册**标签页的**立绘包**菜单中可以随时切换，也可以在那里**+ 新建空白立绘包……**。所有卡面、头像、图鉴和召唤会一起更换。**立绘包**标签页会列出你拥有的立绘包：

- **使用**其中一个。
- **导出 .zip** 会保存一个立绘包，并包含你对它的改动（见下文）。
- **移除**会删除一个立绘包。名册自带的立绘包被移除后，可以在**名册自带**下重新添加。当名册更新带来更新版本时，那里的按钮会显示**更新**。
- **导入 .zip 或 pack.json**可以添加一个。
- **拉取**可从链接添加：GitHub 仓库（`https://github.com/you/your-pack`）、仓库中的文件夹（`…/tree/main/packs/knights`）、GitHub 上的 .zip（`…/blob/main/packs/knights.zip`），或任何指向 .zip 的链接。

再次导入同名立绘包会替换它，这就是更新立绘包的方式。

**你的改动。** 在角色页面上，你为模型选择卡面和头像：可以是这个立绘包中的任意图片，也可以是你上传的图片。立绘包一到你手中就不会再被写入，因此不会把它弄坏。你选择和上传的内容保存在它旁边，作为你对那个立绘包的改动，并覆盖在它上面。它在**立绘包**标签页的卡片会显示一共有多少项改动。**导出 .zip** 会把这些改动写入导出的文件：

- 它的 `pack.json` 会列出你为每个模型选择的图片；
- 并且 .zip 中包含每张图片：立绘包自己的、你上传的，以及你选择的任何内置图片。

所以，如果一个立绘包有十张 DeepSeek 的图片，而你为 DeepSeek V4 Pro 选择了第二张，导出的 `pack.json` 会包含
`"deepseek-v4-pro": { "art": "deepseek/image2.webp" }`，而 .zip 里会有全部十张。**放弃改动**会把这些改动丢掉，立绘包恢复为刚得到的样子。

立绘包是一个文件夹：一个按文件名命名每张图片的 `pack.json`，以及每个角色一个图片文件夹。

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

- **每张图片都按文件名命名**，位于一层文件夹内（`claude/knight.png`）：`.webp`、`.png`、`.jpg` 或 `.gif`。
  也可以按模式给出，规则与 `ls` 相同：`*` 匹配任意长度的字符，`?` 匹配一个字符，二者都不跨 `/`；`[abc]`
  匹配其中任意一个字符，`[!abc]` 匹配除此之外的任意一个字符。取第一个匹配的文件，顺序与 `ls` 相同
  （`b10.png` 在 `b2.png` 之前）：先在立绘包自己的（以及你的）图片中找，其次在内置图片中找。因此
  `deepseek/image*.webp` 就是 `deepseek/image1.webp`，`*/opus.png` 就是第一个文件夹里的 `opus.png`。
- **`characters`**：每个角色的名字，以及她在每个层级（`chibi`、`middle`、`high`、`university`）的卡面（`art`）和头像（`face`）。
- **`models`**：某个模型自己的卡面和头像，可以只写其中一个，也可以都写，按 ID（`deepseek-v4-pro`）或模式指定（`claude-opus-*` 代表所有 Opus，包括未来发布的版本；`*-flash` 代表所有 Flash；`gpt-6.[01]-*`）。按书写顺序，第一个匹配该模型的条目就是它的；你自己选择的图片优先于所有这些。没有匹配项的模型使用它角色的对应层级图片。ID 可以按服务商书写的格式匹配，也可以按名册匹配模型的格式（`gpt-6.1-*` 和 `gpt-6-1-*` 相同）。
- **角色文件夹里的图片**可以在她页面上选择：出现在她的图鉴中，也会排在她卡面和头像的**更换**列表最前面。文件名以 `face` 开头的是头像，其他都是卡面。文件夹以角色命名：`gpt`、`claude`、`gemini`、`deepseek`、`grok`、`kimi`、`glm`、`qwen`、`mistral`、`minimax`、`llama`、`doubao`、`perplexity` 和 `hunyuan`。
- **`pictures`** 按文件名给图片命名；如果没有，就用文件名作为名称（`image2.webp` 就叫 Image2）。
- **名称**可以是一个普通字符串，也可以是一个 `name` 加其他语言的语言代码：`zh-CN`、`zh-TW`、`ja` 等，大小写不限。中文页面会优先取 `zh-CN`，其次取普通的 `zh`，再次取其他中文，最后取 `name`。立绘包自身的名称和 `description` 也按同样方式提供。
- **`version`** 是立绘包自己的版本号，显示在名称旁边；对于名册自带的立绘包，名册通过它判断更新是否带来了新版本。`roster` 是导出时的名册版本，导出时写入。
- **不需要逐项列出。** 立绘包缺少的层级名称、角色名称或图片，都来自内置图片（学园）。新建的空白立绘包会一直使用这些内置内容，直到你另行选择。
- **有错误会标明，不会隐藏。** 不存在的文件、没有文件匹配的模式，或某个根本不是图片文件的内容，都会列在**立绘包**标签页该立绘包的卡片上（例如 `models.gpt-6-astra.art: "claude/zzz*.png"` 没有匹配的图片）；这一行会视同未书写。

**图片尺寸。** 任意尺寸都能用：图片会被缩放并裁剪以填满显示位置。以下尺寸能让裁剪符合你的预期：

| 图片 | 比例 | 建议尺寸 | 显示效果 |
| --- | --- | --- | --- |
| 卡面 | 2:3，竖版 | 768 × 1152（在高 DPI 屏幕上清晰），或像内置卡面那样 512 × 768 | 在她页面上显示整张卡。在名册卡片上，稀有度位于左上角，她的名字横跨下方四分之一，所以请把她的脸放在上方三分之一处。其他比例会被裁剪为 2:3，保留顶部。 |
| Q版卡面 | 2:3，透明背景 | 512 × 768 | 角色站在下半部分，就像内置 Q版那样。 |
| 头像 | 1:1，正方形 | 256 × 256（至少 192 × 192） | 一个圆形。请让脸居中，周围留一点空间；其他比例会围绕距顶部 30% 的点进行裁剪。 |

`.webp` 能让立绘包最小（内置卡面每张约 40–80 KB）；`.png`、`.jpg` 和 `.gif` 也可以。.zip 中的一张图片最大 16 MB，你上传的图片最大 4 MB。

要手工制作立绘包，可以先导出一个（或新建一个空白立绘包，选择图片后导出），改成你喜欢的样子，重新压缩并导入。要分享立绘包，把它的文件夹放到 GitHub 上；任何人都可以通过链接拉取。你拥有的立绘包保存在 `~/.dsh/llm-roster/packs/<name>/`，你的改动保存在 `~/.dsh/llm-roster/changes/<name>/`；立绘包的文件也可以在那里直接编辑，名册下次打开时会显示这些改动。

**新角色。** 立绘包只能为名册认识的角色换装，不能新增角色。角色是谁、哪些模型属于哪个角色、在哪个层级，都在名册自己的列表 [`plugin/models.json`](plugin/models.json) 中，你可以自行添加。在 `characters` 下添加她，写上默认服务商、她的模型 ID 模式和她的服务商，并按层级把她的模型放进 `lineup`（不想单独成为卡片的模型按其 ID 或模式写进 `models`；想先排除、选中后才出现的写进 `ignored`）：

```json
"characters": {
  "phi": { "home": "openrouter", "vendor": "microsoft", "match": ["^phi"], "providers": ["azure"] }
},
"lineup": {
  "phi-5": "phi/high"
}
```

然后在立绘包中给她图片和名字（`"characters": { "phi": { "name": "Phi", "art": { "high": "phi/high.webp" } } }`）。在有立绘包绘制她之前，她的卡片会显示她的姓名首字母。该文件是已安装插件里的（`~/.dsh/profiles/web/node_modules/dsh-llm-roster/plugin/models.json`），名册更新会替换它，所以请保留你的修改副本，或以 Pull Request 提交。

**模型与密钥**、**排行**和**立绘包**也会出现在 DSH 的“插件”页面中，位于 **dsh-llm-roster** 下。

## 设置

在配置文件的 patch 中，`~/.dsh/profiles/web/cordis.patch.yml`：

```yaml
- id: llm-roster
  config:
    aliases:                       # Artificial Analysis 以另一个名字列出的模型
      my-gateway/fast-one: gpt-6-luna
    aaKeyEnv: MY_AA_KEY            # 你的 Artificial Analysis 密钥在哪里（在“排行”标签页填写的变量优先；
                                   # 否则依次读取 ARTIFICIAL_ANALYSIS_API_KEY、AA_API_TOKEN）
```

## 文件保存位置

关于服务商的一切都在 DSH 自己的设置和凭据存储中；名册不保存这些内容。名册自己的文件保存在 `$DSH_HOME/llm-roster/`（`~/.dsh/llm-roster/`）：

| 文件 | 保存内容 |
| --- | --- |
| `roster.json` | 当前使用的立绘包、每个角色经哪个服务商使用、你通过“全部忽略”搁置的服务商（按它们在 DSH 设置中的原样）、已添加过一次的名册自带立绘包，以及你指定的 Artificial Analysis 密钥变量（如果有） |
| `packs/<name>/` | 你的立绘包，每个立绘包都是一个文件夹（`pack.json` 和图片文件夹），按你得到它们时的样子保存：名册自带的、新建空白立绘包，以及你导入或拉取的 |
| `changes/<name>/` | 你对某个立绘包的改动：你为模型选择的图片（一个只含 `models` 的 `pack.json`）以及你上传的图片 |
| `aa.json` | 排行数据（重新拉取后） |
| `openrouter.json` | 来自 OpenRouter 的发布日期（重新拉取后） |
| `seen.json` | 每个没有公开发布日期的模型首次出现的日期（公开日期发布后即不再保留） |
| `failures.json` | 最近调用失败的原因，按服务商和模型保存，直到之后有调用成功 |

召唤记录保存在你的浏览器中（`localStorage` 的 `dsh-llm-roster.summon` 下），所以每个浏览器有自己的图鉴。

## 工作原理

| 文件 | 作用 |
| --- | --- |
| [`plugin/client.js`](plugin/client.js) | 网页端部分（使用 DSH 的 React）。它把头像放进 `conversation.input.right` 插槽，并渲染名册对话框和“插件”页面。它通过 `modelDirectories.directoryFor(session).select()` 切换模型，通过 `remote.settings.mutate` 写入模型列表和 `apiKeyEnv`，通过 `remote.credentials.set` 保存密钥，并通过 `remote.llm.discoverModels` 读取目录。 |
| [`plugin/index.js`](plugin/index.js) | DSH 插件（`llm-roster`）。它把路由挂载到 DSH 的 API 上，先通过 DSH 的凭据存储解析密钥，再尝试环境变量，并监视 DSH 的模型调用（`llm/stream`，原样转发）以了解失败原因。 |
| [`plugin/failures.js`](plugin/failures.js) | 最近调用失败原因：按服务商和模型保存、计数，调用成功后放掉。 |
| [`plugin/server.js`](plugin/server.js) | 下面的路由。 |
| [`plugin/roster.js`](plugin/roster.js) | 每个模型对应哪个角色和层级、阵容、每个模型所用的立绘和头像、当前使用的立绘包、搁置的服务商，以及每个角色经哪个服务商使用。 |
| [`plugin/models.json`](plugin/models.json) | 每个模型对应哪个角色：各角色的 ID、服务商和默认服务商，按层级排的阵容，按模式指定的更多模型，先排除直到被选择才出现的模型，用于判断层级的词，以及没有任何列表收录的阵容模型发布日期。 |
| [`plugin/packs.js`](plugin/packs.js) | 立绘包：读取（按文件名读取名称和图片，你的改动叠加其上，再叠加在内置图片之上）、从 .zip 或 GitHub 链接保存、添加名册自带的立绘包、新建空白立绘包、保存你的改动，以及在导出时把这些改动写入立绘包。 |
| [`plugin/zip.js`](plugin/zip.js) | .zip 文件，使用 Node 自带的 zlib 读写：不写出归档之外的文件，不接受加密或 ZIP64 条目，并限制大小。 |
| [`plugin/rankings.js`](plugin/rankings.js) | Artificial Analysis 列表：把模型匹配到对应 slug、排名、排行榜，以及重新拉取列表（有 Pro 密钥时拉取 Pro 列表）。 |
| [`plugin/providers.js`](plugin/providers.js) | 每个服务商的余额、支出（使用有权读取的密钥）和实时列表接口，固定使用官方地址，以及基于这些接口的密钥检查。 |
| [`art/`](art) | 内置立绘包 *学园*：[`pack.json`](art/pack.json) 和每个角色的图片文件夹。鸣谢见 [`art/CREDITS.md`](art/CREDITS.md)。 |
| [`packs/`](packs) | 名册自带的立绘包，以 .zip 文件形式存在：[`original.zip`](packs/original.zip)，由 [`original-pack.py`](tools/original-pack.py) 制作。其鸣谢在 .zip 内（`CREDITS.md`）。 |
| [`tools/`](tools) | [`import-art.py`](tools/import-art.py) 导入五个 ChimeraArchiveHarness 角色。[`draw-art.py`](tools/draw-art.py) 根据 [`characters.yml`](tools/characters.yml) 使用 OpenAI 图像模型绘制其他角色（学园的层级；使用 `--original` 时是原版立绘包的阶段、羁绊图片和表情头像）。[`original-pack.py`](tools/original-pack.py) 制作原版立绘包。[`aa-snapshot.mjs`](tools/aa-snapshot.mjs) 刷新排行和发布日期快照。 |
| [`data/`](data) | 随插件发布的快照：Artificial Analysis 的排行，以及 OpenRouter 的发布日期。 |

密钥永远不会传到页面。密钥检查、余额查询或实时列表由服务端完成，使用 DSH 为该服务商的凭据引用解析出的密钥。它只会被发送到该服务商的官方地址，绝不会发送到页面指定的地址。你自己的 OpenAI 兼容接口由 DSH 自己在设置中的地址上访问。

这些路由挂在 DSH 的 API 上，位于登录之后，且仅限所有者使用：

| 路由 | 说明 |
| --- | --- |
| `GET /api/llm-roster.state` | 当前使用的立绘包所命名和描绘的层级与角色、立绘包、阵容、你上传的图片、搁置的服务商、排行数据的日期和密钥名称，以及各服务商提供的模型 |
| `POST /api/llm-roster.resolve` | `{models: [{provider, id}]}` → 每个模型对应的立绘、头像、角色、层级、名称和排行 |
| `POST /api/llm-roster.pick` | `{model: 'provider/model', art?: 'deepseek/image2.webp' \| null, face?: 'deepseek/face-2.webp' \| null}`：对当前使用的立绘包的一项改动 |
| `POST /api/llm-roster.upload?name=&character=` | 请求体为图片 → `{file}`，作为一项改动添加到当前使用的立绘包 |
| `POST /api/llm-roster.forget` | `{file}`：撤回你添加的一张图片 |
| `POST /api/llm-roster.settings` | `{aaKeyEnv: '<variable>' \| null}`：你的 Artificial Analysis 密钥在哪里 |
| `POST /api/llm-roster.park` / `unpark` | `{provider, ns, path, profile}` / `{provider}`：通过“全部忽略”搁置的服务商，以及放回 |
| `POST /api/llm-roster.route` | `{character, provider \| null}`：角色阵容使用的服务商 |
| `GET /api/llm-roster.image` | `?art=<folder>/<file>`（当前使用的立绘包中的图片，如 `deepseek/high.webp`；`&pack=<id>` 用于另一个立绘包） |
| `GET /api/llm-roster.packs` | 你拥有的立绘包、正在使用的立绘包，以及名册自带的立绘包 |
| `POST /api/llm-roster.packs` | `{use: id}`、`{create: name}`、`{remove: id}`、`{discard: id}`（放弃你对它的改动）、`{fetch: '<GitHub or .zip link>'}`, 或 `{add: 'academy' \| '<file>'}`，用于名册自带的立绘包 |
| `POST /api/llm-roster.pack-import?name=` | 请求体为立绘包 .zip，或单独的 `pack.json` |
| `GET /api/llm-roster.pack-export?id=` | 导出为 .zip 的立绘包，包含你对它的改动 |
| `GET /api/llm-roster.released` | 所有已知的发布日期（按模型 slug，Artificial Analysis 的优先于 OpenRouter），以及模型首次出现的日期 |
| `POST /api/llm-roster.released` | `{ids}` → `{dates: {id: {date, seen}}}`：一组模型的发布日期；没有公开日期的模型会以今天作为首次出现日期 |
| `GET/POST /api/llm-roster.rankings` | 排行榜（`?top=`、`&sort=released` 按最新、`&efforts=1` 查看所有思考强度），或重新拉取发布日期和排行 |
| `GET/POST /api/llm-roster.failures` | 最近调用失败原因，最新的在前；`{clear: provider \| null}` 清除它们 |
| `GET /api/llm-roster.check` | `?provider=<route>&ref=<credential reference>&fresh=1`：密钥是否可用（`ok`、`missing`、`rejected`、`error`、`untested`） |
| `GET /api/llm-roster.balance` | `?provider=<route>&ref=<credential reference>` |
| `GET /api/llm-roster.usage` | `?provider=<route>&ref=<credential reference>&fresh=1`：账户本月支出或剩余额度，用消费/管理密钥读取；没有时用 API 密钥（`ok` 并带有 `spent` 和/或 `credit` 以及所用的 `key`、`missing`、`rejected`、`error`、`untested`） |
| `GET /api/llm-roster.live` | `?provider=<route>&ref=<credential reference>` |

## 开发

```sh
npm test                                              # node --test：测试服务端部分、立绘包和召唤概率，不需要 DSH 或网络
python3 tools/import-art.py ~/Projects/DiscordStudyBot  # 从 ChimeraArchiveHarness 检出重新生成 art/
python3 tools/draw-art.py --dry-run                   # 其他角色的层级：预览将绘制的内容
python3 tools/draw-art.py --env-file .env             # 绘制缺失的内容（OPENAI_API_KEY；需要 openai、pillow、pyyaml）
python3 tools/draw-art.py --faces-only                # 在 characters.yml 中调整 `faces` 后重新裁剪头像
python3 tools/draw-art.py --original --env-file .env  # 其他角色的原版立绘包图片
python3 tools/original-pack.py ~/Projects/DiscordStudyBot  # 重新生成 packs/original.zip（需要 pillow）
AA_API_TOKEN=... node tools/aa-snapshot.mjs           # 在 data/ 中生成新快照（即使没有密钥也会生成发布日期）
```

要添加角色，先在 [`tools/characters.yml`](tools/characters.yml) 中为她添加条目（立绘、外观、主题和定位）。然后把她加进 [`plugin/models.json`](plugin/models.json)（默认服务商、属于她的 ID、按层级排的阵容），并把她的名字加进 [`art/pack.json`](art/pack.json)。用 `draw-art.py` 绘制她，再检查她的头像。

本地检出时，`dsh plugin --profile web add link:/path/to/dsh-llm-roster` 会直接使用该目录。

## 许可证

- **代码：** [MIT](LICENSE)。
- **立绘（`art/` 和 `packs/` 中的立绘包）：** CC BY-NC-SA 4.0，仅限非商业使用。这些是对 [ZipZipPipe](https://space.bilibili.com/4168597/) 角色设计的 AI 生成改编。原始角色 DeepSeek-chan 由 [上善无形](https://space.bilibili.com/4456176) 创作。见 [`art/CREDITS.md`](art/CREDITS.md)。
- **数据（`data/`）：** 排行属于 Artificial Analysis，依据其条款使用并注明来源；发布日期来自 OpenRouter 的公开模型列表。