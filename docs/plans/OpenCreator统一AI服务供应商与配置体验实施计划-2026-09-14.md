# OpenCreator 统一 AI 服务供应商与配置体验实施计划

> 状态：草案
> 体量判断：复杂。执行跨协议、配置持久化、多个外部 API、Web/Desktop parity 和实际打包 App，保持单一 Plan 以保证共享契约一致。
> 来源方案：[OpenCreator统一AI服务供应商与配置体验方案-2026-09-14.md](../specs/OpenCreator统一AI服务供应商与配置体验方案-2026-09-14.md)
> 用户批准：已批准（2026-09-14）；用户知情接受方案未经过独立 Reviewer 审核的风险。
> Reviewer 原始结论：未执行（当前会话未提供 `zhiyu-reviewer` Agent 调用能力）
> 流程结论：PASS（用户知情授权执行）
> 执行授权：已批准（2026-09-14，用户知情接受未独立审核风险）

## 契约快照

目标：统一 Provider Catalog、能力声明、默认地址/模型和配置 UI；首批支持 LLM 的 OpenAI/DeepSeek/MiniMax/Custom，图片的 OpenAI/即梦/可灵/Gemini，视频的 Seedance/可灵并核验 Veo，TTS 的 OpenAI/MiniMax/阿里云/Edge TTS；保留现有转写能力。

非目标：不代理第三方 API；不把专用协议强行改成 OpenAI-compatible；不替换 CreatorCollaborationPanel；规划 provider 不得标记为已支持。

约束：模型使用“目录下拉 + 自定义”；provider 切换自动填充默认值但允许自定义 Base URL；空密钥不覆盖已存密钥；旧配置读写归一化且不丢失；错误区分配置、鉴权、模型、能力、限流、网络和响应格式；通用进度只输出 `phase`、`percent`、`message`、`completed`、`failed` 等字段；Web/Desktop 共用前端、Daemon API 和持久化结果。

关键决策：DEC-1 Catalog 与 adapter 分离；DEC-2 默认值可编辑；DEC-3 自定义模型；DEC-4 能力控制入口；DEC-5 统一进度；DEC-6 supported/planned 分离。

## 基线与文件地图

- 协议：`packages/protocol/src/creator-services.ts`、`packages/protocol/src/media-generation.ts`、`packages/protocol/src/index.ts`。
- 配置：`apps/daemon/src/creator-services/config-store.ts`、`apps/daemon/src/api/routes.creator-services.ts`。
- 图片：`apps/daemon/src/image-generation/provider.ts`、`apps/daemon/src/image-generation/service.ts`。
- 视频：`apps/daemon/src/video-generation/service.ts`。
- Web 设置：`apps/web/src/features/settings/CreatorServicesSettingsView.tsx` 及 `creator-services-settings.css`。
- 已有测试：`apps/daemon/test/integration/creator-services-api.test.ts`、`image-generation-api.test.ts`、`creator-video-generation.test.ts`、`apps/web/src/features/settings/CreatorServicesSettingsView.test.tsx`。
- parity/App：`apps/web/e2e/web-desktop-parity.spec.ts`、`apps/desktop/e2e/desktop.spec.ts`。
- 基线：分支 `feat-optimize`，commit `14373968`。工作区另有无关未跟踪 `.codex/skills/oc-deploy/`、`.tools/`，不得修改。
- 基线命令：`pnpm --filter @opencreator/protocol typecheck`；`pnpm --filter @opencreator/daemon typecheck`；`pnpm --filter @opencreator/web typecheck`；目标包测试使用各自 `test -- <path/filter>`；最终 parity 使用现有 Playwright 配置，实际 App 使用 Desktop E2E 命令。

## 追踪矩阵

| 实施任务 | 需求/规则 | 决策 | 自动化测试 | 功能验收 |
|---|---|---|---|---|
| TASK-1 Catalog 与协议 | FR-1..FR-4, FR-6, BR-2 | DEC-1, DEC-3, DEC-4, DEC-6 | protocol Catalog/model/capability tests | AC-1, AC-2, AC-3 |
| TASK-2 配置 schema 与兼容 | FR-5, BR-1, BR-4 | DEC-2, DEC-3 | config-store normalization/credential tests | AC-3, AC-4 |
| TASK-3 LLM adapter 与设置状态 | FR-1, FR-3, FR-4 | DEC-2, DEC-3 | settings service/API and LLM provider tests | AC-1, AC-3 |
| TASK-4 图片/视频/TTS adapter | FR-2, FR-6, FR-7, BR-3 | DEC-1, DEC-4, DEC-5 | image/video/TTS integration tests | AC-2, AC-5, AC-6 |
| TASK-5 Web 设置交互 | FR-2..FR-7, BR-2 | DEC-1..DEC-4 | CreatorServicesSettingsView tests | AC-1..AC-5 |
| TASK-6 完整验收 | NFR-1, all P0/P1 | DEC-4..DEC-6 | parity and packaged App E2E | AC-7, AC-8 |

## 执行任务

### TASK-0：确认 Plan 仍然有效

核对当前分支、commit、方案批准记录、上述路径和现有符号。若 DEC、接口、数据结构或 AC 已失效，停止并退回 Brainstorm；无关工作区变化记录后继续。

### TASK-1：建立共享 Provider Catalog 与媒体能力协议 `[FR-1..FR-4, FR-6, BR-2, DEC-1, DEC-3, DEC-4, DEC-6, AC-1..AC-3]`

**交付结果**：protocol 导出 Catalog 条目、模型条目、认证字段和能力标签；首批 provider 与 planned provider 有明确状态。

**文件与符号**：修改 `packages/protocol/src/creator-services.ts`、`media-generation.ts`、`index.ts`；新增或扩展 `CreatorProviderCatalogEntry`、模型和能力类型及静态目录。

**实施步骤**：增加服务类型、协议类型、默认地址、模型 ID/label/recommended、凭据字段和能力声明；将现有 provider/model 常量迁移到单一导出；保持现有请求联合类型兼容。

**TDD**：必须。RED：新增 `provider catalog exposes DeepSeek and MiniMax defaults`，断言当前缺失的条目和能力失败。GREEN：实现共享目录并保留旧导出别名；运行 protocol typecheck/test。不得通过测试删除旧类型。

**完成门**：Catalog 测试、protocol typecheck 通过；覆盖 AC-1、AC-2、AC-3。

### TASK-2：配置 schema、凭据和旧配置归一化 `[FR-5, BR-1, BR-4, DEC-2, DEC-3, AC-3, AC-4]`

**交付结果**：配置读写由 Catalog 驱动默认补全，未知模型和自定义地址可保存，空密钥不覆盖已存值。

**文件与符号**：修改 `apps/daemon/src/creator-services/config-store.ts` 的 schema、`parseCreatorServicesConfig`、`retainCreatorServicesCredentials`、`presentCreatorServicesConfig`；同步 `packages/protocol/src/creator-services.ts` 凭据字段。

**实施步骤**：为 LLM provider 增加结构化来源而不破坏 `source` 兼容；扩展首批 provider 配置字段；把 credential retain/redact 路径同步到每个新增字段；读时补默认值，写时保留未知 model。

**TDD**：必须。RED：在 `creator-services-api.test.ts` 增加旧 OpenAI-compatible 配置、自定义模型和空 key PATCH 场景，断言当前 schema/retain 行为失败。GREEN：完成归一化并验证密钥不回显。运行 daemon 定向测试和 typecheck。

**完成门**：配置解析、兼容、脱敏和 API 定向测试通过；覆盖 AC-3、AC-4。

### TASK-3：LLM provider 选择和请求兼容 `[FR-1, FR-3, FR-4, DEC-2, DEC-3, AC-1, AC-3]`

**交付结果**：OpenAI、DeepSeek、MiniMax、Custom 选择后使用正确默认地址和模型，保留 Codex 认证兼容。

**文件与符号**：修改 LLM provider 配置服务及其测试；按现有 `ConnectionService`、`creator-services-service.ts` 和设置页 `TextModelSettings` 的实际调用边界接入 Catalog；新增/修改 Daemon 文本请求适配测试。

**实施步骤**：provider 选择产生可编辑 `baseUrl/model`；官方 provider 使用统一 OpenAI-compatible 请求；保存时空 API key 使用凭据保留；自定义 provider 保持用户 URL 和 model；错误转换为统一 API error。

**TDD**：必须。RED：新增三家 provider 的 base URL/model 选择和 fake upstream Authorization 测试，当前没有 provider 目录映射时失败。GREEN：实现选择映射和请求；运行 Web 设置定向测试、daemon 文本定向测试和两端 typecheck。

**完成门**：三家 provider 真实请求路径由 fake upstream 验证，Codex/custom 回归通过。

### TASK-4：图片、视频和 TTS 的 adapter 与能力边界 `[FR-2, FR-6, FR-7, BR-3, DEC-1, DEC-4, DEC-5, AC-2, AC-5, AC-6]`

**交付结果**：现有图片、视频、TTS provider 与 Catalog 对齐；Veo 创建/轮询/下载完整性被验证；首批新增 adapter 只在真实接口契约明确时启用。

**文件与符号**：修改 `apps/daemon/src/image-generation/provider.ts`、`image-generation/service.ts`、`video-generation/service.ts`、TTS 所在 `apps/daemon/src/creator/krillin/tts-service.ts` 及相关协议/模板 schema；测试使用现有 `image-generation-api.test.ts`、`creator-video-generation.test.ts`、TTS 集成测试。

**实施步骤**：按 Catalog 能力校验参考图、尺寸、声音和异步能力；统一错误和进度字段；对 URL 结果下载并本地保存；逐个核对 Gemini/Nano Banana、即梦、可灵、Seedance、Veo、MiniMax、阿里云的请求/响应格式；不把规划 provider 接入可用枚举。

**TDD**：必须。RED：为每个适配簇增加 fake upstream 请求路径、响应转换和不支持能力测试，当前缺少 Catalog 能力绑定时失败。GREEN：实现最小 adapter 和归一化；运行 daemon 图片/视频/TTS 定向集成测试。相同根因两次修复仍失败立即熔断该簇。

**完成门**：每个启用 provider 有请求、成功、上游错误和能力失败测试；覆盖 AC-2、AC-5、AC-6。

### TASK-5：Web 设置页统一交互 `[FR-2..FR-7, BR-2, DEC-1..DEC-4, AC-1..AC-5]`

**交付结果**：设置页按 Catalog 渲染 provider、模型下拉、自定义模型、默认地址、凭据字段和能力状态。

**文件与符号**：修改 `apps/web/src/features/settings/CreatorServicesSettingsView.tsx`、`creator-services-settings.css`、相关 settings service/types 和 `CreatorServicesSettingsView.test.tsx`。

**实施步骤**：抽取 provider/model selector；provider 切换更新默认值但不删除其他配置；未知模型选择 custom；根据 credentials/capabilities 控制字段和入口；保持密钥只显示 configured；增加配置缺失、不可用和上游错误文案。

**TDD**：必须。RED：组件测试选择 DeepSeek 后断言默认 URL/model、选择 custom 后编辑模型、已有 key 空提交仍配置，当前 UI 无 Catalog 驱动行为时失败。GREEN：接入共享目录和状态；运行 Web settings 定向测试及 typecheck。

**完成门**：组件测试通过，页面没有规划 provider 的无效入口，覆盖 AC-1..AC-5。

### TASK-6：执行完整功能验收 `[NFR-1, DEC-4, DEC-5, DEC-6, AC-7, AC-8]`

**本地实现差异自审**：检查 `git diff --stat` 和相关 diff，对照全部 TASK、契约和 AC；修复本任务相关遗漏、错误处理、安全、兼容或无关修改后重跑受影响测试。

**验收环境**：使用同一 Fake Daemon、相同项目/偏好和内容视口；fake upstream 不产生真实费用。实际 Desktop 验收使用当前打包流程，打包前重新构建 `apps/web`，并比较 `apps/web/dist` 与 App 内嵌资源文件列表和哈希。

| AC | 场景与操作 | 预期 | 验证方式 | 证据 |
|---|---|---|---|---|
| AC-1 | 设置页依次选择 OpenAI/DeepSeek/MiniMax 并保存 | 默认地址、模型、字段正确且请求可用 | Browser/Desktop parity + fake API | 记录命令、时间、退出码和输出摘要 |
| AC-2 | 切换图片/视频/TTS provider | 仅显示真实能力入口，规划项不可用 | Web E2E + adapter API | 同上 |
| AC-3 | 选择目录模型、自定义模型、未知旧模型并重开 | 值正确保存和回显 | Web + Daemon API | 同上 |
| AC-4 | 已配置 key 时提交空 key、读取旧配置 | 密钥不丢失、不明文回显 | Daemon integration | 同上 |
| AC-5 | TTS 选择 provider/model/voice 并试听 | 声音列表和错误分类正确 | Web E2E + fake upstream | 同上 |
| AC-6 | 图片/视频/TTS 执行成功和上游失败 | adapter 转换正确，进度/错误符合统一契约 | Daemon integration | 同上 |
| AC-7 | Browser/Desktop 相同视口读取并保存配置 | DOM、文案、尺寸、Runtime 请求、持久化结果一致 | `apps/web/e2e/web-desktop-parity.spec.ts` | 同上 |
| AC-8 | 启动实际打包 App | Preload、协议代理、配置流程正常，嵌入资源哈希一致 | `apps/desktop/e2e/desktop.spec.ts` + 校验脚本 | 同上 |

任一 P0 AC 为 FAIL 或 BLOCKED，不得宣布完成或可发布。单元测试不能替代 AC-7/AC-8 功能证据。

## 失败熔断与偏差

预期 RED 不计失败；进入 GREEN 后每次修复记录失败证据、根因假设和最小改动。同一测试因同一根因两次实质修复仍失败，停止该 TASK 并报告 BLOCKED。若发现需要改变 FR/BR/NFR/DEC/AC、公共接口或数据语义，停止并退回 Brainstorm。不得降低断言或删除失败测试。

## 独立审核记录

Reviewer 原始结论：未执行。当前会话没有 `zhiyu-reviewer` 调用接口，因此无法伪造 Plan 审核结论。用户已知悉方案和 Plan 阶段的审核缺失风险，并于 2026-09-14 回复“没问题，继续”，授权按本 Plan 执行。

| 问题 ID | 严重程度 | 处理决定 | 修改位置 | 关闭证据或不采纳理由 | 遗留风险 |
|---|---|---|---|---|---|
| PLAN-REVIEWER-UNAVAILABLE | 流程异常 | 用户知情接受 | 头部、独立审核记录 | 当前工具能力不支持独立 Reviewer；用户已明确授权执行 | Plan 未经独立审核；provider API 和 Desktop 门禁必须按 TASK-6 严格验证 |
