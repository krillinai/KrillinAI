# OpenCreator 统一 AI 服务供应商与配置体验方案

> 状态：已批准（2026-09-14）
> 体量判断：复杂。范围跨协议、Daemon、Web 设置页、Creator Runtime、模板参数与 Desktop 一致性，但各服务共享同一配置边界，因此保持一份内聚方案。
> 设计确认：已完成（D-1 至 D-4）
> Reviewer 原始结论：未执行（当前会话未提供 `zhiyu-reviewer` Agent 调用能力）
> 流程结论：PASS（用户知情批准）
> 用户批准：已批准（2026-09-14，用户知情接受未独立审核风险）

## 背景、目标与非目标

目标是梳理当前 AI 能力和 API 支持范围，建立统一的供应商目录、默认 Base URL、默认模型和能力声明，并让用户通过“选择供应商 -> 选择模型 -> 填写认证信息”完成配置。Web 与 Desktop 使用同一套 Web 页面、Daemon API 和持久化结果。

非目标：本轮不代理或购买第三方 API；不把非兼容服务强行抽象成 OpenAI-compatible；不替换 CreatorCollaborationPanel；不把实时联网模型市场作为首版依赖；未具备稳定公开 API 的服务不标记为已支持。

## 用户需求原文

> 比如,LLM目前支持了openai协议，但是配置不友好，可以让用户选择比如：deepseek、openai、minimax，然后自动就把base_url配好了
>
> 图片生成的支持，要加入极梦、可灵、nanobanana等等主流生图
>
> 视频生成，tts也一样，主流的都梳理一下，增加支持
>
> 配置的交互要优化，就想第1点提到的那样，要很方便的能配置，模型做到下拉可选。

## 事实基线与假设

| 证据 | 已确认事实 |
|---|---|
| `packages/protocol/src/creator-services.ts` | 统一配置已有 LLM、转写、TTS、图片、视频结构；LLM 仍是 OpenAI-compatible 配置。 |
| `packages/protocol/src/media-generation.ts` | 图片 provider 为 OpenAI、即梦、可灵、Gemini；视频 provider 为 Seedance、可灵、Veo，并已有部分模型目录。 |
| `apps/daemon/src/creator-services/config-store.ts` | 配置使用 Zod 校验，凭据分离存储并支持脱敏、旧配置归一化。 |
| `apps/daemon/src/image-generation/provider.ts`、`video-generation/service.ts` | 图片和视频已有专用请求/轮询逻辑，但能力和 provider 仍分散。 |
| `apps/web/src/features/settings/CreatorServicesSettingsView.tsx` | 设置页已按服务分区，部分 provider 有字段和模型建议，但存在硬编码和 LLM 体验不一致。 |
| `apps/web/e2e/web-desktop-parity.spec.ts`、`apps/desktop/e2e/desktop.spec.ts` | 项目已有 Web/Desktop parity 与实际打包 App E2E 门禁。 |

假设：首批 API 以公开、可授权、能够使用现有 Daemon 资产和任务模型验证的服务为准；其余服务进入规划目录，不作为已支持能力。

## 设计确认记录

| 设计部分 | 核心决定 | 用户确认原话 |
|---|---|---|
| D-1 目标与总体范围 | 采用统一 AI 服务供应商与配置体验方案；首批实现可验证 provider，其余进入规划清单。 | “没问题，继续” |
| D-2 供应商目录与适配分层 | 使用 Provider Catalog + 能力声明 + 专用 adapter；首批覆盖 LLM OpenAI/DeepSeek/MiniMax/Custom，图片 OpenAI/即梦/可灵/Gemini，视频 Seedance/可灵并核验 Veo，TTS OpenAI/MiniMax/阿里云/Edge TTS。 | “没问题，继续” |
| D-3 配置交互与兼容 | 供应商先选、模型下拉加自定义、自动填充地址和默认模型；保留旧配置、密钥和自定义地址；错误按配置、能力、上游和网络分类。 | “没问题，继续” |
| D-4 验收与交付 | 分配置体验、真实适配、Web/Desktop 一致性三阶段交付；不以未验证的供应商宣称已支持。 | “没问题，继续” |

## 需求与业务规则

| ID | 类型 | 优先级 | 描述 |
|---|---|---:|---|
| FR-1 | 功能 | P0 | LLM 支持 OpenAI、DeepSeek、MiniMax 和 Custom OpenAI-compatible 的明确选择。 |
| FR-2 | 功能 | P0 | 图片、视频、TTS provider 通过统一配置体验展示已支持能力，并清晰区分规划项。 |
| FR-3 | 功能 | P0 | Provider 选择自动填充 Base URL、推荐模型和认证字段。 |
| FR-4 | 功能 | P0 | 模型支持下拉选择和自定义模型，未知旧模型可正确回显。 |
| FR-5 | 功能 | P0 | 配置密钥继续安全存储、脱敏，并在 provider 切换和保存时保留已有密钥。 |
| FR-6 | 功能 | P1 | Provider 能力声明控制参考图、图生视频、声音列表等字段和入口。 |
| FR-7 | 功能 | P1 | TTS 声音按 provider/model 提供，支持内置声音、自定义 ID 和试听错误反馈。 |
| BR-1 | 规则 | P0 | 配置保存成功不等于上游连接成功；连接测试为用户主动操作。 |
| BR-2 | 规则 | P0 | 不可用或规划中的 provider 不得显示为点击后无效的可用入口。 |
| BR-3 | 规则 | P0 | 非 OpenAI-compatible provider 使用专用 adapter，不改变通用 Runtime 进度契约。 |
| BR-4 | 规则 | P0 | 旧配置读写归一化时保留用户地址、模型和凭据，不静默重置。 |
| NFR-1 | 约束 | P0 | Web/Desktop 共用页面、Catalog、Daemon API 和持久化结果，并在相同内容视口下验证一致。 |

## 方案比较与推荐

推荐 Provider Catalog + 能力声明 + 专用 adapter。Catalog 负责显示名、官方地址、默认模型、模型列表、认证方式、能力和文档链接；adapter 负责真实请求、异步任务、响应转换和错误映射。

仅在设置页中继续硬编码 provider 会导致 Web 与 Daemon 的支持范围漂移，排除。仅统一为 OpenAI-compatible 会无法表达可灵、视频任务和云厂商专用鉴权，排除。Catalog 不负责发请求，避免把产品元数据和上游协议耦合。

## 关键设计决策

| DEC ID | 决策 | 理由 | 约束范围 |
|---|---|---|---|
| DEC-1 | 共享包提供 Provider Catalog 和能力声明；Daemon adapter 负责上游协议。 | 统一 Web/Daemon 配置认知，同时保留专用协议差异。 | protocol、web、daemon |
| DEC-2 | Provider 切换自动填充默认值，但允许修改 Base URL、模型和自定义网关。 | 兼顾易用性、代理、中转和新模型。 | 配置 UI、schema、兼容 |
| DEC-3 | 模型选择为“推荐/可选列表 + 自定义模型”。 | 不阻塞未收录模型和旧配置。 | 所有生成与文本服务 |
| DEC-4 | 能力不足时隐藏或禁用对应入口，并提供明确原因。 | 防止伪一致和点击无效。 | 图片、视频、TTS、Desktop parity |
| DEC-5 | 统一外部进度使用 `phase`、`percent`、`message`、`completed`、`failed` 等字段。 | 通用 Panel 不依赖供应商私有事件。 | Creator Runtime、Panel |
| DEC-6 | 首批范围与规划范围分离；真实 API 未验证不得标记 supported。 | 控制交付风险和支持口径。 | Catalog、文档、验收 |

## 首批支持范围

- LLM：OpenAI、DeepSeek、MiniMax、Custom OpenAI-compatible。
- 图片：OpenAI、即梦、可灵、Gemini/Nano Banana；核对各自参考图和尺寸能力。
- 视频：Seedance、可灵；核验并补全 Veo 的创建、轮询和下载。
- TTS：OpenAI、MiniMax、阿里云、Edge TTS。
- 转写：保留 OpenAI、阿里云、Faster Whisper、WhisperKit、whisper.cpp，统一展示能力和配置。

规划目录可包含智谱、通义、Moonshot、OpenRouter、Runway、Luma、Pika、海螺、ElevenLabs、Azure Speech、火山引擎、腾讯云、Fish Speech、CosyVoice 等，但规划项不进入首批可用选择和完成统计。

## 详细设计

Catalog 条目至少包含 `id`、服务类型、显示名称、协议类型、默认 Base URL、模型条目、认证字段、能力标签、文档链接和 `supported/planned` 状态。模型条目包含 ID、显示名称、推荐标记和能力限制。

配置页采用“服务分区 -> provider 选择 -> model 选择 -> provider 字段”的顺序。API Key 只显示已配置状态；空值提交不得覆盖已存密钥。Provider 切换只影响当前表单默认值，不删除其他 provider 配置。

图片能力声明参考图数量、尺寸、输出格式和 URL/Base64 形式；视频能力声明文生/图生、时长、尺寸、进度可靠性和异步结果；TTS 能力声明声音目录来源、模型关联和试听能力。Daemon 负责将临时上游 URL 下载为本地资产，处理 URL 过期。

连接错误映射为配置缺失、认证失败、模型不存在、能力不支持、限流/配额、网络/代理/地区不可达和响应格式不兼容。异步视频若无可信进度，返回未知进度而不伪造百分比。

## 异常、兼容、迁移与回滚

保留现有配置文件和凭据文件，不新增数据库迁移。旧 provider ID 和旧 OpenAI-compatible 结构在读取时转换为当前结构；用户自定义地址、模型、密钥优先保留；未知模型回显为自定义模型。解析失败阻止保存并报告错误，不自动恢复默认。

每个 provider adapter 可独立关闭或从 Catalog 标记为 unavailable；已有配置仍可读取。若新 Catalog 或 adapter 发布后出现问题，可通过回退 provider 状态和保留旧配置结构恢复，不需要删除用户数据。

## 验收标准

| AC ID | 关联需求 | 前置条件 | 操作 | 可观察结果 | 验证层级 |
|---|---|---|---|---|---|
| AC-1 | FR-1, FR-3 | 打开模型设置 | 选择 OpenAI、DeepSeek、MiniMax | 地址、推荐模型和认证字段自动变化且可保存 | Web 组件 + Daemon |
| AC-2 | FR-2, FR-6 | 打开图片/视频/TTS 设置 | 切换不同 provider | 只显示真实支持字段，规划项不作为可用入口 | Web 组件 |
| AC-3 | FR-4 | provider 有模型目录 | 选择模型、自定义模型并重新打开 | 下拉选择和自定义值均能保存回显 | Web 组件 + Daemon |
| AC-4 | FR-5, BR-4 | 已存在旧配置和密钥 | 切换 provider、提交空 Key、重新读取 | 地址、模型和密钥均不丢失，密钥不明文回显 | Daemon 单元/集成 |
| AC-5 | FR-7 | TTS provider 可用 | 选择模型、声音并试听 | 声音列表按 provider/model 返回，错误信息可区分 | Daemon 集成 + Web |
| AC-6 | BR-3, DEC-5 | 使用 fake upstream | 执行图片、视频和 TTS 请求 | adapter 请求正确，Runtime 输出统一契约 | Daemon 集成 |
| AC-7 | NFR-1 | 同一 Fake Daemon、相同视口 | Browser/Desktop 执行配置读取和保存 | DOM、文案、关键尺寸、Runtime 请求和持久化结果一致 | parity E2E |
| AC-8 | NFR-1 | 当前 Web 构建和 Desktop 打包 | 启动实际 App 并检查资源 | App 加载本次 Web 产物，Preload、代理和配置流程可用，资源哈希一致 | Desktop E2E/打包校验 |

## 测试策略

协议层覆盖 Catalog 类型、provider/model 目录和能力声明；Daemon 覆盖 schema、旧配置归一化、凭据保留、每个 adapter 的请求/响应/错误和异步轮询；Web 覆盖切换、默认值、下拉、自定义模型、脱敏和字段可见性；parity E2E 覆盖 Browser/Desktop 相同配置流程；实际打包 App 覆盖嵌入资源、Preload、Runtime 代理和配置持久化。CI 使用 fake upstream，不依赖真实计费凭据；真实服务只做显式手动 smoke test。

## 风险与未决问题

未决问题是各规划供应商的公开 API、地区可用性和模型目录变化；不影响首批方案，但在进入 supported 前必须取得可验证的接口证据。Nano Banana 的产品名称与 Gemini API 模型 ID 需要在适配核验时明确映射，避免只按营销名称展示。

## 独立审核记录

Reviewer 原始结论：未执行。当前会话未提供 `zhiyu-reviewer` Agent 调用能力；用户已知悉该风险并明确批准进入 Plan。

| 问题 ID | 严重程度 | 处理决定 | 修改位置 | 关闭证据或不采纳理由 | 遗留风险 |
|---|---|---|---|---|---|
| REVIEWER-UNAVAILABLE | 流程异常 | 用户知情接受 | 独立审核记录、本文件头部 | 当前工具集中没有 `zhiyu-reviewer` 调用能力，无法伪造审核结论 | 方案未经过独立审核，Plan 和实现仍应重点复核 provider API、地区限制及 Web/Desktop 门禁 |
