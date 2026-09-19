# Develop 验证矩阵

先根据 `git diff --name-only <trusted-base>...HEAD` 识别行为影响，再选择最小集合。路径只是入口；实际依赖关系优先于机械匹配。

## 路径到验证

| 改动范围 | L1 默认验证 | 升级条件 |
| --- | --- | --- |
| `apps/web/src/**` | 最近的 Vitest；Web typecheck | 共享交互、Bridge 或无法由组件测试覆盖时增加对应 parity |
| `apps/daemon/src/**` | 最近的 unit/integration；Daemon typecheck | API、持久化、Stage 或跨模块调用变化时扩大相关集成测试 |
| `packages/protocol/**` | Protocol build；直接消费者 typecheck | 公共协议行为变化时验证 Daemon、Web、Desktop 相关消费者 |
| `runtime/krillinai/**` | 先确认 PATH 中 Go 满足 `go.mod` 且兼容当前系统，再运行仓库的 `pnpm krillinai:test` 或可限定的 `go test` | 跨 pipeline/CLI/service 边界时扩大相关包；缺少兼容工具链时停止并标记部分验证，不自动下载 Go |
| `apps/desktop/src/preload/**`、Host Bridge | Desktop test/typecheck；对应 parity | 原生能力或窗口生命周期变化时进入 `$oc-deploy` preflight |
| Creator 模板/Adapter/Panel | Adapter、Activity 过滤去重、Stage、进度和 Workspace 定向测试 | 共享 Panel 或 Runtime 契约变化时升 L2 |
| CSS、文案、展示条件 | 最近组件测试；必要时截图检查 | 不因纯展示改动运行全仓测试 |
| 构建、打包、资源清单 | 相关构建脚本测试 | 真实交付包验证使用 `$oc-deploy` |

## L2 典型集合

- 受影响包 typecheck。
- 共享层对应的 unit/integration tests。
- 每个被改变用户流程的一条主要成功路径和关键失败路径。
- 相关 `apps/web/e2e/web-desktop-parity.spec.ts` 用例，使用测试标题 `--grep` 限定范围。
- 仅在编译边界、懒加载、资源产物或构建配置变化时运行对应 build。

## L3 CI 等价门禁

先读取当前 `.github/workflows/ci.yml` 的触发条件，再检查当前 HEAD 的 GitHub CI。workflow 未监听 `develop` push 时，空 run 列表是预期状态，不得把等待一个不会触发的 run 当作验证。没有可复用的成功 run 时，以 workflow 当前内容为准执行，不把此清单当成永久固定副本。当前关注项包括：

- frozen lockfile、writing templates 和高危依赖审计；
- KrillinAI tests；
- 全仓 tests、typecheck 和 build；
- scheduled-task upgrade、smoke；
- Chromium Desktop Web/Desktop parity；
- 性能测量和基线检查。

L3 证明源码候选状态，不证明实际 Electron 包。Desktop 包、嵌入 Web 哈希和 Packaged App E2E 必须由 `$oc-deploy` 完成。

## 环境失败

命令缺失、动态加载器错误、浏览器未安装或平台不支持不等于测试断言失败。仓库的 `pnpm krillinai:test` 当前调用 PATH 中的 `go`，不负责安装或选择 Go；运行前先检查 `command -v go`、`go version` 和 `runtime/krillinai/go.mod`。不要因为发现 `.tools/go-*` 就假定它与当前系统动态加载器兼容，也不要为普通 L1/L2 自动下载新工具链。记录原始错误；没有兼容工具链时标记 `PARTIALLY_VERIFIED`，不得改写成通过。
