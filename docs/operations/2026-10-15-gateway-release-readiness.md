# 2026-10-15 登录、充值与创作任务发布检查

后续修复：本报告发现的两个 P1 已处理，图片任务已恢复，149 个旧账户已完成生产迁移。详见 [修复与迁移验收](2026-10-15-gateway-release-blockers-fixed.md)。真实支付及其他正式发布门禁仍按原报告执行。

以下保留修复前的检查快照。初次检查结论：当时不能判定为可正式发布，图片任务存在“已扣积分但客户端任务失败”的缺陷，存量用户迁移也尚未完成。

检查范围为当前本地工作区、线上网关及一个已登录测试账户。工作区含大量未提交改动；本次未修改产品代码、迁移生产用户、部署服务或发布版本。真实模型调用仅生成一张图片及一段短视频字幕，合计消耗 100.9947 积分。没有执行真实 Stripe 付款。

## 发布阻塞

### P1：图片异步请求编号协议不一致，已扣积分却没有客户端产物

- 客户端 `apps/daemon/src/image-generation/provider.ts:267` 只接受 `ocdir_` 加 48 位十六进制的异步回执。
- 正式网关 `open-creator-gateway/internal/modelproxy/service.go:217` 使用 `ocreq_` 加 48 位十六进制。
- 当前官方图片请求主动携带 `Prefer: respond-async`，因此会进入这个校验分支。
- 实测任务 `creator_job_IMgYeZNH7IWn4EMFF-gT7`，模型 `gpt-image-2.5-flare`，一张 1024×1024 图片：客户端约三秒后报 `Invalid image generation receipt`，任务失败，产物为空，并留下 `creator_provider_resolution_required`。
- 对应网关请求 `ocreq_eddce76e924a388b6d87891e0c0fbac78f2533008fb27135` 最终为 `succeeded / settled`，实际扣除 100 积分；客户端回执仍为 `waiting_remote`。
- 已通过同一请求的只读结果接口取回 PNG，734366 字节，1024×1024，像素非空且内容符合测试提示词。文件位于 `/tmp/opencreator-release-image-20261015.png`。没有重新生成或重复扣费。

发布前应统一异步回执协议，并覆盖完整的 Creator 图片任务：提交、轮询、下载、产物保存、账本终态、异常恢复。验证时优先取回这次已付费结果，避免重新提交。

### P1：149 个存量账户未迁入网关钱包，包含 4 个付费账户

生产只读查询结果：用户 169 个，网关钱包 20 个，已有旧绑定或旧额度记录但没有新钱包的用户 149 个；其中 4 个账户有历史已付款订单。

`open-creator-gateway/internal/credits/service.go:37` 的 `EnsureTx` 对上述用户返回 `409 credits_migration_required`。此门禁会阻断模型初始化、余额获取和新充值下单：

- `internal/server/device.go:21`：登录后 bootstrap 初始化。
- `internal/credits/service.go:115`、`:131`：查询余额和请求冻结。
- `internal/billing/service.go:152`：充值下单。

这是保护旧余额的迁移门禁，不能通过删掉检查或重发历史赠送积分绕过。发布前需使用现有迁移流程核对旧供应商剩余额度、撤销旧密钥并迁入新钱包。生产当前没有 `admin` 用户，需同时落实迁移的管理入口。迁移实现位于 `internal/direct/gateway_migration.go`。

## 已核实行为

| 流程 | 检查结果 | 证据与边界 |
| --- | --- | --- |
| 已有账号登录态 | 可用 | 当前真实账户可以获取生产 bootstrap、模型列表、余额和订单；桌面授权回调测试通过。首次注册邮件投递未实测。 |
| 新用户初始积分 | 当前配置为 0 | `gateway_proxy.trial_credits = 0`。钱包创建和赠送幂等由网关测试覆盖；本轮没有新建生产用户。不能对外承诺登录即送积分。 |
| 充值套餐 | 配置与公开接口一致 | $5/2500、$10/5000、$20/10000 积分；微信对应 HKD39/78/156。Stripe live 已启用。 |
| 支付入账与防重复 | 数据库测试通过 | 真实隔离 PostgreSQL 测试覆盖 webhook、主动补查和只入账一次；新网关启用后没有实际充值入账记录，尚不能认定真实支付闭环已验收。 |
| 积分消费 | 核心核算通过 | 请求冻结、按用量结算、失败释放、并发防透支测试通过；线上钱包账实校验无异常。 |
| 国内与海外配置 | 网关入口一致 | 两个地区 bootstrap 均返回 `https://www.open-creator.ai/v1`，供应商为 ChatAnywhere，客户端没有收到上游密钥。未在实际海外网络出口测试连通性。 |
| 视频转录与翻译 | 真实调用成功 | `whisper-1` 转录和 `gpt-6.1-sol` 翻译均成功，客户端回执全部终结，无遗留 issue。 |
| 字幕合成视频 | 本地短片成功 | 输出 H.264/AAC、640×360、2.554 秒 MP4；已解码抽帧检查双语字幕。此项不代表长视频、平台下载或所有字幕对齐场景已覆盖。 |
| 图片生成 | 上游成功，Creator 流程失败 | 详见 P1，不能认定图片功能通过。 |

### 当前推荐模型与目录

生产 bootstrap 返回就绪模型数量：文本 39、图片 6、语音合成 5、转录 1。

默认模型为：文本 `gpt-6.1-sol`，图片 `gpt-image-2.5-flare`，语音合成 `gpt-4o-mini-tts`，转录 `whisper-1`。

### 真实视频消费核对

测试任务：`creator_job_nE95I1RGSJDqiLSzEnj30`。

使用本机合成语音制作约 2.6 秒视频，上传后执行字幕阶段，再使用同一结果版本执行横版合成。测试脚本最初未传自动串联所需的 `workflow: true`，因此合成阶段单独启动；没有重新转录或翻译。当前 UI 的正常提交会携带该字段，本轮未用真实 UI 完成自动串联验收。

| 请求 | 冻结积分 | 实际消耗 | 最终状态 |
| --- | ---: | ---: | --- |
| `whisper-1` | 0.2587 | 0.2587 | succeeded / settled |
| `gpt-6.1-sol` | 129.92 | 0.736 | succeeded / settled |
| 合计 | | 0.9947 | 冻结归零 |

字幕及 MP4 产物均存在且非空，最终任务完成，没有未解决 issue。账户余额从 2396.43161 变为 2395.43691 积分，差额与网关账本一致。积分内部保留精度，界面整数显示相关 Web 测试通过。

注意：短片的 Whisper 结果末尾时间超过媒体时长，不能据此宣称字幕时间对齐质量全部通过；本轮确认的是转录、翻译、产物合成和扣积分链路。

## 自动化及包验证

| 验证 | 实际结果 |
| --- | --- |
| 网关 `go test ./... -count=1` | 通过，使用本机隔离 PostgreSQL、真实 ffprobe 和本轮编译的网关二进制，包含 acceptance 测试；上游和支付提供方为测试替身。 |
| Daemon 16 个相关测试文件 | 327 通过、2 失败、1 跳过。 |
| Web 11 个相关测试文件 | 310 通过。 |
| Daemon、Web 类型检查 | 通过。 |
| 官网授权和支付相关 4 个测试文件 | 14 通过。 |
| KrillinAI 翻译及 OpenAI 相关定向 Go 测试 | 通过。 |
| Web 账户与 Web/Desktop parity E2E | 2 失败、2 跳过；旧导航文案和小数积分断言未更新，不能算门禁通过。 |
| macOS arm64 本地 Desktop 打包 | 成功，版本仍为 3.2.6，未签名；内嵌 Web 资源、构建清单、fuses 和隐私声明校验通过。 |
| 真实打包 App 定向 E2E | 3 通过、1 失败；通过任务重启恢复、充值回跳、授权回调。启动 Probe 测试在旧计数断言处失败，后续代理断言未执行。 |

### 剩余失败的具体位置

- `apps/daemon/test/integration/creator-image-generation.test.ts:42`：本地 Codex 参考图错误断言期待中文“参考图”，当前结果为英文。不是本次官方图像调用的成功证据。
- `apps/daemon/test/integration/direct-services.test.ts:455`：错误信息隐藏测试失败，响应包含 `OpenRouter private error`；`apps/daemon/src/gateway/direct-runtime.ts:73` 直接使用 `facts.upstreamMessage`。需要明确并落实公开错误信息约束，不能将此项视为已通过。
- `apps/web/e2e/gateway-account.spec.ts:39`：仍查找旧的“账户”导航及订阅流程。
- `apps/web/e2e/gateway-web-desktop-parity.spec.ts:36`：仍期待 `413.937`，与整数积分展示要求冲突。
- `apps/desktop/e2e/desktop.spec.ts:468`：期待启动 Probe 计数 1，实际为 0；当前 `requiresPaidStartupProbe` 需要显式开启双开关才会执行付费探测。需要更新测试以验证当前启动契约，并补跑被前置断言阻断的检查。

## 生产运行快照

- 网关 systemd 服务运行正常，启动时间为 2026-10-15 17:48:29 CST。
- 本轮检查时的网关二进制 SHA-256：`5e36bdd16883b307a35efe00a04708b99d1458e3dccf44b2aa6a7076c89ce9de`。
- 上游地址配置为 `https://api.chatanywhere.org/v1`，启用 gateway proxy。
- 真实冒烟结束后钱包不变量违规数为 0，测试账户冻结余额为 0。
- 检查前线上已有图片、转录、语音、对话及 Responses 请求成功记录，但这些单接口记录不能替代完整 Creator 任务验收。
- 线上已有 5 笔历史已付款订单，付款时间为 10 月 11 至 14 日，早于网关积分钱包切换。不能将它们误判为本次新钱包“漏发充值积分”；也不能用它们证明新方案支付入账已验收。

## 发布前剩余事项

1. 修复官方图片异步回执协议和已付费结果恢复，补完整 Creator 图片集成回归。
2. 完成并核对存量用户迁移，优先覆盖 4 个付费账户。
3. 补新网关支付到账闭环验收，确认订单、唯一入账流水、余额及客户端回跳一致。真实 live 付款尚未执行。
4. 处理上述失败的回归检查，重新执行受影响的发布门禁。
5. 使用目标正式版本完成签名、公证及全部目标平台的发布候选验证。本轮仅验证了本机未签名 macOS arm64 包，未验证 Windows、macOS x64、正式升级包或真实海外网络。

本报告是本轮检查快照，不是发布批准，也不替代 `opencreator-desktop-release-runbook.md` 中的正式候选门禁。
