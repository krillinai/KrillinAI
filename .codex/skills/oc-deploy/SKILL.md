---
name: oc-deploy
description: 验证、诊断和发布 OpenCreator Desktop，包括本地实际 App 打包与 E2E、master 候选构建、GitHub Actions 故障定位及明确授权后的 tag Release。用于“打包 Desktop”“验证候选包”“排查发布失败”“发布 OpenCreator”等请求；普通开发构建不使用。
---

# OpenCreator Deploy

以“同一提交先在本机证明，再消耗远端构建资源”为发布原则。遵守仓库根目录 `AGENTS.md`，尤其是 Desktop 打包和 Web/Desktop 一致性门禁。

## 先选择模式

- **diagnose**：用户问为什么失败时，只读取现有本地输出和已存在的 GitHub 日志。先给出失败阶段、原始错误和根因；未经要求不得触发新构建。
- **preflight**：在当前提交上执行本地候选包验证，不产生 GitHub 外部变更。
- **candidate**：用户明确要求远端验证时，从 `master` 对精确提交手动触发一次 `desktop-release.yml`。不得创建、移动或复用 tag，不得发布 Release。
- **release**：仅当用户明确要求正式发布或创建 tag 时使用。preflight 和精确提交的 master CI 未通过前不得创建或推送 tag。

执行任何模式前先读取 [references/runbook.md](references/runbook.md) 中对应章节。涉及失败时同时读取“故障分类”。

## 强制门禁

1. 先记录分支、HEAD、dirty 状态、远端同步状态和目标平台。不得把用户已有改动带入提交或发布。
2. 类型检查、单元测试和源码构建不能替代实际 App 验证。远端 candidate 或 release 前，当前精确提交必须完成本机原生 `desktop:package`，并让 `e2e:package` 全部通过。
3. Desktop 打包必须重建当前 `apps/web`，并通过包校验器确认 App 内 Web 资源与本次构建一致。不得手工替换 App 内资源或复用来源不明的 `dist`。
4. 任何 GitHub 构建前，确认精确提交已有成功的 `master` push CI；确认 workflow 的 `publish` 仍只允许 tag ref。
5. GitHub 下载和 `gh` 命令设置 `HTTP_PROXY` 与 `HTTPS_PROXY` 为 `http://127.0.0.1:7897`，并先用 `gh auth status` 确认认证身份。GitHub 保存的签名 secrets 会跨 workflow 运行持续存在，不要要求重复上传。
6. 不用付费 Release 构建逐次发现问题。一次远端运行首次出现 package、E2E、签名、公证或上传失败时，立即取消仍在运行的付费 sibling jobs，读取该 run 的已生成日志和 artifacts；不得为了拿日志直接 rerun。
7. candidate 只能通过 `workflow_dispatch` 从 `master` 运行。正式发布候选必须选择 `target=all`；结束后确认候选身份凭据和全部 artifacts 已生成、`publish` skipped，并确认 tag 和 Release 均未变化。单平台 candidate 只用于诊断，不能提升为 Release。
8. release 通常只对已经通过上述门禁和完整 candidate 的精确 commit 创建 tag。候选之后若只有 workflow、Release 附件整理、对应测试或发布文档变化，可由 tag workflow 通过祖先关系和应用构建输入 SHA-256 复用不可变 artifacts；任何 App、Runtime、依赖或打包输入变化都必须重新通过完整 candidate。tag workflow 不得重新执行付费打包。

## 完成标准

报告精确 commit、本地打包平台、本地 App 路径、包校验与 E2E 结果、master CI、candidate run URL、各 job 结果、候选身份凭据及 artifacts。candidate 明确说明未创建 tag/Release；release 同时列出被提升的 candidate run、tag 和发布附件。任何未执行门禁都必须说明原因和残余风险，不得声称可发布。
