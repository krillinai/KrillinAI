# 贡献指南（简体中文）

> [English](../../CONTRIBUTING.md) | **简体中文** | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Bahasa Indonesia](../id/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Deutsch](../de/CONTRIBUTING.md) | [Português](../pt/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [العربية](../ar/CONTRIBUTING.md)

感谢你愿意为 OpenCreator 做贡献。OpenCreator 是一个基于 Codex Agent 循环的本地优先创作工作区，项目的大部分价值来自小而聚焦的补充：一个 Skill 文件夹、一个创作模板、一个边界清晰的修复。本指南说明每类贡献应该放在哪里，以及 PR 需要达到什么标准才能合并。

---

## 贡献地图

| 如果你想…… | 你实际在添加的是 | 位置 | 交付规模 |
|---|---|---|---|
| 修复 Bug 或改进工作流 | 代码 | `apps/web/`、`apps/daemon/` | 一个聚焦的 PR，附测试 |
| 添加可复用的 Agent 工作流 | **Skill** | [`skills/<your-skill>/`](../../skills/) | 一个文件夹，含 `SKILL.md` 和可选的 references → [指南](./contributing/skills-contributing.md) |
| 添加可复用的图像、视频或封面预设 | **创作模板** | [`template/<module>/<id>/<version>/`](../../template/) | 一个文件夹，含 `template.json` 和素材 → [指南](./contributing/templates-contributing.md) |
| 贡献插画、图标或 UI 设计 | 设计资产 | 约定的资产位置 | 一个 PR，附预览、源文件和授权说明 |
| 接入 AI 或媒体服务 | **服务集成** | 相关 Web 或 Daemon 模块 | 一个 PR，含错误处理、凭证安全和测试 |
| 改进文档或翻译 | 文档 | `README.md`、`docs/`、`docs/<locale>/README.md` | 一个 PR |

## 在哪里提问、由谁审核

请通过 [Issue](https://github.com/krillinai/OpenCreator/issues/new) 讨论想法或询问所属领域，我们会指引合适的方向。提交 PR 时，请联系[核心团队](../../README.md#the-crew)中负责代码与问题修复、创作模板、设计与素材或 Skills 与文档的成员。团队负责贡献规范、审核和社区答疑；合并须遵守仓库权限及必要检查。

---

## 本地开发环境

完整的环境准备见 [README 快速开始](../../README.md#quick-start)。贡献者只需要记住：

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # 使用 packageManager 字段锁定的 pnpm
pnpm install
pnpm web:dev             # Web + 按需启动本地 daemon
pnpm typecheck           # 全仓库 TypeScript 检查
pnpm test                # 工作区单元与集成测试
```

需要 Node.js 22+ 和可用的 Codex CLI。`pnpm web:dev` 后打开 `http://127.0.0.1:19861/`；首次启动时 Runtime 会自动准备默认项目，连接完成后即可直接输入。

---

## 贡献流程

1. 在 [Issue](https://github.com/krillinai/OpenCreator/issues) 中描述问题、使用场景和预期行为。
2. 从最新的开发分支切出一个聚焦的功能或修复分支。
3. 遵循现有架构：通用产品能力在 Web 和 Daemon 中**只实现一次**，Desktop 原生差异必须通过显式 capability（例如 `canSelectDirectory`）隔离。
4. 为行为变化添加合适的单元、集成或 E2E 测试，并在 PR 中同时列出已执行和已跳过的验证。
5. 绝不提交 `.runtime/`、本地凭证、Codex 会话、构建缓存或其他用户数据。

## Reviewer 会检查什么

- **共享行为只有一份实现。** 同一功能不得在 Browser Bridge 和 Desktop Bridge 各写一套。
- **能力判断，而不是静默空实现。** 平台能力不可用时必须隐藏入口，绝不允许显示一个点击后静默无反应的按钮。
- **测试与改动风险匹配。** 文案、样式微调只需定向检查；共享状态、持久化或 Runtime 契约变更至少需要模块测试和 typecheck。
- **文档随行为更新。** 如果改动影响用户可见的工作流，在同一个 PR 中更新 README 或 `docs/` 下的相关文档。

## PR 常见被退回原因

- 同一逻辑在 Web 和 Desktop 路径各写了一份，而不是放在共享服务层。
- 平台不支持的按钮仍然可见，但处理函数静默 return。
- 行为发生变化，但没有任何测试或验证说明。
- PR 混入了与本次目标无关的重构或修复。
- 提交了生成产物、`.runtime/` 数据或凭证。

---

OpenCreator · Create locally, work continuously.
