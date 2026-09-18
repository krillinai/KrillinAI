# Creator 模板提示词语言适配

## 适配规则

- 模板详情及新任务默认提示词随当前界面语言选择 `defaultsByLocale`。跟随系统语言时，沿用现有语言解析与目录请求链路。
- 原提示词为英文时，英文版使用来源英文原文，不从中文版回译，也不润色原文。
- 来源网站的参数标记只展开为其展示值，不当成正文指令。
- 原提示词为中文或日文时，英文版保留完整约束；不得用删减后的来源摘要替代正文。
- 已有通用变量、去品牌处理、武汉主题等项目适配继续保留，不因恢复来源而撤销。
- 画面中明确指定的中文标题、中文地标、日文对白等属于生成内容约束，不随界面语言改写。
- 中文版提示词保持不变；已创建任务的提示词属于任务内容，不在切换界面语言时自动覆盖。

## 本次范围

修正 61 个图片／视频模板中英文版复制中文或日文正文的问题。

核对并恢复 30 条原英文来源，其中 28 条直接保留展示原文，2 条只保留已有项目变量替换：

- `premium-food-commercial-storyboard`：产品品牌改为 `{productName}`。
- `tech-product-review-thumbnail`：固定标题、问题及产品名改为对应变量。

以下两个模板本身就是英文结构化 JSON，内部含指定的中文／日文画面文案，中英文版相同是正确行为，不做回译或改写：

- `vr-headset-exploded-interface-diagram`
- `weekly-outfit-infographic`

来源核对使用 `agent-reach`：优先读取 YouMind 提示词正文与原始语言字段；来源页失效时读取原作者帖子。来源地址及中英正文 SHA-256（内容校验值）记录在：

`apps/daemon/test/fixtures/creator-prompt-localization.json`

该记录用于固定经核对的英文原文及修改前的中文正文，测试时不依赖外网。

## 长度与回归

完整英文原文最长已超过旧的 4,000 字符限制，不能为通过校验而截断。共享上限 `creatorPromptMaxLength = 16_000` 由协议包导出，模板默认值校验、图片／视频 Runtime 输入校验及图片／视频／封面输入框共用。

定向测试：

- `apps/daemon/test/unit/creator-prompt-localization.test.ts`：真实模板目录校验、中文保持不变、来源英文校验值、语言选择、任务状态与 Runtime 输入完整性、长度边界。
- `apps/web/src/features/conversation/CreatorPromptLocalization.test.tsx`：跟随系统语言切换、保留打开的模板、变量标记、指定画面中文及使用模板回调、长输入限制。
- `apps/web/e2e/creator-prompt-localization.spec.ts`：同一服务、同一视口下，Browser/Desktop Bridge 的中英正文、输入值与新任务持久化状态。

本次不包含真实模型生成、Desktop 打包、实际安装 App 验收或发布。后续制作 Desktop 包时仍须重新构建并嵌入本次 Web 和模板目录，不能复用旧包。

## 本次验证结果

2026-09-18：

- 93 个模板校验及目录编译通过，其中 92 个已发布模板由运行中的服务返回。
- 后端定向测试 9 项通过，前端相关定向测试 52 项通过。
- Daemon 与 Web 类型检查通过。
- 定向浏览器测试 2 项通过，覆盖 1440×900 与 390×844 内容视口、Browser/Desktop Bridge、中英正文以及完整英文新任务状态。
- 本机缺少 Playwright 配套浏览器和录像组件，验收使用已安装的 Chrome，关闭测试录像，保留截图与追踪；未修改项目公共测试配置。
- 开发工作台服务已加载最新目录；不代表已有 Desktop 安装包已更新。
