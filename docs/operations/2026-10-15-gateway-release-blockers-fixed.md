# 2026-10-15 图片回执修复与旧账户迁移验收

结论：[发布检查](2026-10-15-gateway-release-readiness.md) 中的两个 P1 阻塞已解决。本记录不代表真实支付、全部平台签名和全部发布候选门禁已通过。

## 图片生成

`apps/daemon/src/image-generation/provider.ts` 现在兼容 `ocreq_` 网关编号及原有 `ocdir_` 编号，仍要求编号格式正确且响应体与 `X-Request-ID` 一致。

新增 `creator-gateway-image.test.ts` 集成回归覆盖：

- 两种编号的异步提交、状态轮询、结果下载、Stage、Artifact 和 ResultSnapshot 完整流程。
- 拒绝编号不一致的回执。
- 查询确认付费结果后重试，沿用原逻辑编号和幂等键取回结果。

真实恢复任务 `creator_job_IMgYeZNH7IWn4EMFF-gT7` 已完成，图片产物 734366 字节，旧错误均关闭，相关回执全部成功。恢复前后可用余额同为 2395.43691 积分、冻结余额均为 0。正式网关中原图片请求仍只有一条、消费仍为 100 积分，没有新建供应商调用。

## 生产旧账户迁移

新增运维命令位于 `open-creator-gateway/cmd/credits-migrate`，默认仅列出待迁移账户。执行必须显式提供 `-execute`、`-actor` 和 `-reason`，可限制账户和批次。默认账户间隔两秒，只记录不含密钥的 HTTP 状态诊断。

命令复用原有 `MigrateGateway`：锁定账户、持久化迁移标记、撤销并核验旧 Key、读取权威剩余额度、加上尚未同步的已授额度、一次性写入钱包和迁移流水。没有绕过迁移门禁，也没有重新发放历史累计赠送或充值。

本轮先迁移并核对 4 个付费账户，再处理其余账户。首轮 63 个账户在上游核验时失败，未被强行按零余额迁移；之后分批、低频续跑全部成功。重复预览的候选列表为空。

| 核对项目 | 结果 |
| --- | ---: |
| 用户总数 | 169 |
| 新钱包总数 | 169 |
| 本轮成功迁移旧账户 | 149 |
| 本轮迁入积分（内部精度） | 9267.8 |
| 累计完成迁移记录（含原测试账户） | 150 |
| 旧账户缺钱包 | 0 |
| 付费账户缺钱包 | 0 |
| 未完成迁移标记 | 0 |
| 钱包守恒或负数异常 | 0 |
| 迁移流水与期初金额不一致 | 0 |
| 已迁移但旧 Key 未标记停用 | 0 |

操作人记录为 `operator:release-20261015`，原因为 `release-gateway-wallet-migration`。管理流程已在每个账户入账前核验上游停用状态；没有新增或提升普通用户的管理员权限。

生产备份与日志目录为 `/var/backups/open-creator-gateway`，目录权限 0700，文件权限 0600：

- `before-credit-migration-20261015.dump`：迁移前数据库备份，已通过 `pg_restore --list` 验证。
- `after-credit-migration-20261015.dump`：迁移后数据库备份。
- `credit-migration-rest-20261015.jsonl`、`credit-migration-retry-20261015.jsonl`：批次日志，逐账户余额仍以数据库只追加账本为准。

## 验证与包

- 图片、网关服务、媒体传输、命令派发和图片执行器定向测试：79 项通过。
- Daemon 源码及测试 TypeScript 检查通过。
- 隔离 PostgreSQL 下的迁移测试通过：默认预览无副作用、缺失供应商提前阻断、分批续跑、已完成账户不重复入账、只迁入核实剩余额度、撤销响应丢失后恢复，以及诊断不泄露凭据。
- 当前修复已重新构建进本机 macOS arm64 Desktop 包。包校验通过；包内图片 provider 与本次 Daemon 构建文件 SHA-256 一致，为 `02955ae2acdedb4d0bfbdcbfad24e9073775f1514a414ad1473eaa76df8144f5`。
- 新包实际 App 的任务重启恢复、充值回跳、授权回调三项测试全部通过。
- 本地 Runtime 与正式网关健康检查正常。

本机包仍为版本 3.2.6、未签名，路径为 `apps/desktop/release/mac-arm64/OpenCreator.app`。本轮没有发布版本或创建 Git 提交。
