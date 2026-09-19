---
name: oc-pr
description: 评估和处理 OpenCreator GitHub PR，先审查实际功能与风险，对不能合入的 PR 用英文反馈，并将满足门禁的 PR 合并到 develop。用于查看、评审或处理 https://github.com/krillinai/OpenCreator/pulls；不用于合并 master 或发布。
---

# OpenCreator PR

处理 `https://github.com/krillinai/OpenCreator/pulls` 的实时开放 PR。遵守根目录 `AGENTS.md`，所有产品 PR 的目标分支必须是 `develop`。

## 先确定授权模式

- 用户说“查看、评估、review”时只读：不得提交 GitHub review、修改 PR、合并或推送。
- 用户说“处理 PR、反馈并合并、合并可用 PR”时可提交英文 review，并把满足门禁的 PR 合并到 `develop`。
- 不把处理 PR 的授权扩展为合并 `master`、强制管理员合并、创建 tag 或发布。

## 获取事实

1. 使用 GitHub API/`gh pr list` 获取当前开放 PR；不得用本地陈旧 `refs/pr/*` 代替页面状态。
2. 对每个 PR 读取 base/head、提交、文件、描述、checks、reviews、mergeability 和已有讨论。
3. 网络慢时可设置 `HTTP_PROXY`、`HTTPS_PROXY` 为 `http://127.0.0.1:7897`；先确认 `gh auth status`。
4. base 不是 `develop` 时不得原样合并。用英文要求 retarget，或在用户明确授权后调整 base。

## 评审顺序

先解释 PR 为用户增加或改变什么功能，再检查实现。不要只根据 CI 颜色或文件数量判断。

执行评审前读取 [references/review-checklist.md](references/review-checklist.md)。重点确认业务正确性、失败/取消/重试、数据与历史版本、凭据隐私、协议边界、Web/Desktop 一致性和 Creator Panel 架构。

测试证据按风险选择：先运行最接近的定向测试和受影响包 typecheck；只有共享层或真实交互无法局部覆盖时扩大。不要为评审普通 PR 自动运行 Desktop 打包。

## 决策

- `APPROVE`：功能正确、边界合理、必要验证通过、无阻断问题。
- `COMMENT`：有非阻断建议，不影响合入。
- `REQUEST_CHANGES`：存在可复现功能错误、安全/数据风险、架构违规或必要验证缺口。
- `BLOCKED_BY_CONFLICTS`：与最新 `develop` 冲突，必须更新分支并重新验证。

不能合入时，按 reference 中的格式用英文提交具体 review：说明当前行为、用户影响、证据和期望修复。不要只写 “tests missing” 或泛泛的风险。

## 合并到 develop

处理模式下，先验证合并结果，再修改远端 `develop`。只有以下条件全部满足才合并：

1. base 是 `develop`，PR 非 draft。
2. GitHub 报告 mergeable，且没有未解决的阻断 review。
3. required checks 通过；无 checks 的高风险改动不得直接合并。
4. 功能评审没有阻断问题，必要的定向验证通过。
5. 合并前重新获取 `origin/develop`，避免基于过期状态判断。
6. PR 与最新 `origin/develop` 形成的独立 merge commit 已通过 `$oc-verify` L1；多个重叠 PR 或共享层改动使用 L2。

### 本地合并和验证

1. 要求当前 Git 已跟踪文件没有未提交修改；不得把用户已有修改带入 PR merge commit。获取最新 `origin/develop`，记录 base SHA 和 PR head SHA。
2. 从精确的 `origin/develop` 创建仅供本次 PR 使用的本地集成分支，例如 `review/pr-<number>-merge`。不创建 worktree，也不并行处理其他 PR。
3. 使用 `git merge --no-ff <pr-head>` 创建一个只包含该 PR 的独立 merge commit，提交信息标明 PR 编号和来源分支。发生冲突时执行 `git merge --abort`，切回 `develop`，将 PR 标记为 `BLOCKED_BY_CONFLICTS`，并用英文要求提交者更新分支。除非用户明确授权代为解决，否则不得在维护者分支解决冲突。
4. 创建 merge commit 后完成本轮 `$oc-pr`，不得自动调用 `$oc-verify`。向用户报告 PR 功能、评审结论、base SHA、PR head SHA、merge commit，以及建议的验证级别和预计范围，然后暂停等待确认。

### 显式验证交接

交接提示必须明确说明下一步会做什么，例如：

```text
PR #<number> 已完成评审并生成本地 merge commit <sha>，尚未更新 develop。
建议继续执行 $oc-verify L1（或 L2），预计验证：<测试范围>。
验证通过后将 fast-forward 并 push develop；失败则保持远端不变。是否继续？
```

只有用户明确确认后，才读取并执行 `$oc-verify`。确认同时授权完成提示中已明确写出的后续动作：验证通过后继续 fast-forward 和 push `develop`；如果提示没有说明 push，则验证后必须再次询问，不得自行推送。

验证失败或仅得到 `PARTIALLY_VERIFIED` 时切回 `develop`，不得 fast-forward、push 或改写远端；保留失败集成分支供诊断，是否删除由后续明确操作决定。只有 `VERIFIED` 或适用于该精确 merge commit 的 `VERIFIED_BY_CI` 才能继续合并；L3 的 `MASTER_SOURCE_READY` 不属于普通 PR 必需条件。

验证通过后再次 fetch，并确认 `origin/develop` 仍是记录的 base SHA。若已前进，当前 merge commit 失效：切回 `develop`，从新的 `origin/develop` 重新创建独立集成分支、merge commit 并验证，不得直接 rebase 后复用旧结果。

base 未变化时，切回本地 `develop`，确保它可以 `--ff-only` 到已验证 merge commit，然后 push `develop`。不得调用会重新生成另一个 merge/squash commit 的 GitHub 合并方式；远端必须收到本机已经验证的精确 commit。push 后确认 `origin/develop`、本地 `develop` 和已验证 commit 完全一致，并确认 GitHub PR 已关闭或标记 merged。

多个 PR 必须逐个处理：每个 PR 一个 `--no-ff` merge commit，每次验证通过并 push 后刷新 `origin/develop`，再处理下一个。不要在一个提交里混合多个 PR；后续 PR 出现回归时通过 revert 对应 merge commit 恢复，不对共享 `develop` reset 或 force push。

## 交付

逐个列出功能、关键发现、GitHub 决策、merge commit 和合并后验证。未执行的真实 Provider、跨平台或 Packaged App 验证必须明确说明。
