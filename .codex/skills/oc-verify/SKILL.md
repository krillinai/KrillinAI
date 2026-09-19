---
name: oc-verify
description: 验证 OpenCreator develop 分支的增量功能、共享集成和进入 master 前的源码门禁。用于“验证 develop”“检查合并后功能”“确认能否进 master”等请求；普通局部开发修改和实际 Desktop 打包发布不使用。
---

# OpenCreator Verify

遵守仓库根目录 `AGENTS.md`。目标是用与风险匹配的最小证据证明 `develop` 正常，不把每次验证升级为全仓测试或 Desktop 打包。

## 选择验证级别

- **L1 增量验证（默认，目标 5–10 分钟）**：验证上一个可信基线到当前 `develop` 的改动。执行相关定向测试、受影响 TypeScript 包 typecheck、`git diff --check`，仅在真实交互或平台能力受影响时运行对应 Playwright 用例。
- **L2 集成验证（目标 10–20 分钟）**：仅用于多个重叠 PR、共享协议/状态/持久化/Creator Service/Host Bridge 改动，或 L1 暴露跨模块影响。验证直接受影响的所有包和用户流程，但不默认全仓测试或 Desktop 打包。
- **L3 master 源码门禁（用户明确要求）**：用于“验证整个 develop”“准备合并 master”“发布前源码检查”。优先复用同一 commit 已成功的 GitHub CI；缺少可信 CI 时运行与 `.github/workflows/ci.yml` 等价的源码门禁。

执行前读取 [references/verification-matrix.md](references/verification-matrix.md)，按改动路径和行为选择验证，不机械执行所有命令。

## 基线和范围

1. 确认当前分支、HEAD、dirty 状态、`origin/develop`、CI workflow 触发条件和已有 runs。保留用户已有改动，不提交 `.tools/` 或无关文件。当前 workflow 不监听 `develop` push 时，不等待或假定会出现 develop push CI。
2. 可信基线依次为：同一 HEAD 的成功 CI、最近成功且确实覆盖该基线 commit 的 CI、同一会话内对精确 HEAD 有完整命令和结果记录的本地验证。计算该基线到当前 HEAD 的 diff。
3. PR head 的成功 CI 只是支持证据，不等同于 merge commit 的 CI。无冲突合并且 merge 后代码树等价时可减少重复；发生冲突或手工改动时必须验证冲突涉及的行为。
4. 已有同一 commit 的成功 CI 或同一会话精确 HEAD 的完整结果时不要重复相同套件；只补未覆盖且与请求相关的真实交互或平台验证。不得凭模糊的历史描述复用本地结果。
5. 任何失败先判断是否与本次增量相关。无关历史失败只记录；相关失败才允许扩大一层，且扩大前说明原因。

## 时间和停止条件

- L1 默认预算 10 分钟，L2 默认预算 20 分钟。单项合理测试可完成后再停止，但不得无界追加验证。
- 同一失败最多进行一次有证据的针对性复验。不得靠重复运行掩盖不稳定测试。
- 不自动安装大型 Runtime、浏览器、模型或打包依赖；确有必要时先说明成本和原因。
- 不自动运行 `desktop:package`、Packaged App E2E、远端 candidate 或 release。实际应用包验证交给 `$oc-deploy`。

## Web/Desktop 门禁

修改 Web 页面、共享状态、Service、Host Bridge、Daemon 通用业务、Desktop Preload 或协议代理时，必须判断一致性影响。只有相关功能涉及这些边界时运行对应 parity 用例；不要因此默认跑完整 Desktop 包。

## 结果格式

只使用以下结论，并列出实际运行的命令、通过数、跳过项和失败原因：

- `VERIFIED`：本次增量的最小充分验证通过。
- `VERIFIED_BY_CI`：相同 commit 的适用 CI 已通过，本地未重复。
- `PARTIALLY_VERIFIED`：环境或预算限制导致必要验证未完成。
- `FAILED`：相关验证失败，报告首个决定性错误。
- `MASTER_SOURCE_READY`：仅 L3 完整源码门禁通过。

未执行 `$oc-deploy` preflight 时同时写明 `PACKAGE_NOT_VERIFIED`，不得声称 master 打包应用或发布候选已经正常。
