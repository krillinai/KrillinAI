# 贡献一个 Skill（简体中文）

> [English](../../contributing/skills-contributing.md) | **简体中文** | [日本語](../../ja/contributing/skills-contributing.md) | [한국어](../../ko/contributing/skills-contributing.md) | [Bahasa Indonesia](../../id/contributing/skills-contributing.md) | [Español](../../es/contributing/skills-contributing.md) | [Français](../../fr/contributing/skills-contributing.md) | [Deutsch](../../de/contributing/skills-contributing.md) | [Português](../../pt/contributing/skills-contributing.md) | [Русский](../../ru/contributing/skills-contributing.md) | [العربية](../../ar/contributing/skills-contributing.md)

Skill 是 [`skills/`](../../../skills/) 下的一个文件夹，根目录包含一个 `SKILL.md`，遵循 [`SKILL.md` 约定](https://agentskills.io)。它封装一个可复用的 Agent 工作流：何时使用、调用什么命令或工具、如何解读输出。本指南说明如何新增一个 Skill。

---

## Skill 是什么 / 不是什么

**Skill 是：**
- Agent 可以遵循的可重复工作流，用自然语言加命令描述。
- 不属于核心代码的领域知识：如何调用某个 CLI 阶段、如何为媒体服务组织 prompt、如何校验计划。
- 小。一个文件夹、一个 `SKILL.md`，可选的 `references/` 存放 Agent 按需阅读的长文档。

**Skill 不是：**
- 产品功能。UI 改动、新的 Runtime 接口、新的工作区行为都属于代码贡献（`apps/web/`、`apps/daemon/`）。
- 某个现有 Skill 的措辞改写版。如果你的改动能改进现有工作流，直接修改那个 Skill。
- 对凭证或特定用户本地路径的封装。Skill 必须能在干净检出上运行。

## 快速开始

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<your-skill>   # 从最接近的现有 Skill 开始
# 编辑 skills/<your-skill>/SKILL.md
pnpm web:dev                                     # 在会话中验证 Agent 能识别它
```

最快的路径是复制与你想法最接近的 Skill 然后改写——现有的 `krillinai-*` Skills 展示了期望的结构和语气。

## Skill 结构

```
skills/<your-skill>/
├── SKILL.md            # 必需：frontmatter + 说明
└── references/         # 可选：SKILL.md 引用的长文档
    └── cli-contract.md
```

`SKILL.md` 以 YAML frontmatter 开头：

```yaml
---
name: your-skill
description: Use when <触发条件>, including <主要能力>。
---
```

Reviewer 会强制执行两条规则：

- **`name` 必须与文件夹名一致。** 小写，连字符分隔。
- **`description` 是发现入口。** Agent 靠它判断这个 Skill 是否适用。用 "Use when …" 的写法，点明触发条件和结果，控制在一两句话。含糊的描述（"帮助处理视频"）会被退回。

正文按以下顺序组织：

1. **何时使用** —— 一段话。
2. **命令** —— 代码块给出完整调用，包括必需的环境变量和工作目录。
3. **输入与参数** —— 不直观的参数用表格说明，标注必填/可选。
4. **输出** —— 结果落在哪里、如何读取（例如"从 manifest 读取路径"）。
5. **失败模式** —— 已知错误及应对方式。

保持 `SKILL.md` 可扫读。长契约、完整参数列表或背景材料放进 `references/`，用相对路径链接——Agent 只在需要时才读取 references。

## 本地验证

`pnpm web:dev` 后，发起一个会话，描述一个应该触发该 Skill 的任务。验证：

- Agent 对正确的请求选择该 Skill——并且不会对无关请求误选。
- Skill 中的命令在干净检出上无需手工修补即可运行。
- 输出路径和错误处理与文档一致。

## 合并门槛

Reviewer 会逐项检查以下内容——把它贴进你的 PR 并逐项勾选：

- [ ] 文件夹名与 `name` frontmatter 一致；小写连字符。
- [ ] `description` 点明触发条件和结果（"Use when …"）。
- [ ] 命令在干净检出上可运行；无绝对本地路径或凭证。
- [ ] 输入、输出和失败模式均有文档。
- [ ] 长参考材料放在 `references/`，而不是内联。
- [ ] 已在真实会话中验证：该触发时触发，不该触发时不触发。
- [ ] 如果与现有 Skill 有重叠，PR 说明了为什么需要独立 Skill。

## 常见被拒原因

- **与现有 Skill 重复**，只做措辞上的表面改动——请改为改进现有 Skill。
- **伪装成 Skill 的功能** —— 必须配合 Runtime 或 UI 代码改动才能工作；代码改动应单独提 PR。
- **未测试的命令** —— 参数不存在，或输出与文档描述的路径不符。
- **未文档化的前置条件** —— 默默假设了某个服务配置、二进制或网络服务。

---

有问题？[提一个 Issue](https://github.com/krillinai/OpenCreator/issues/new) 并标注 skill 主题，我们会帮你明确范围。
