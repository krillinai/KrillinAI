# Images Go Hard 动作电影缩略图模板

## 来源与内容

- 模板页面：https://youmind.com/zh-CN/prompts/images-go-hard-thumbnail-34164
- 英文页面：https://youmind.com/en-US/prompts/images-go-hard-thumbnail-34164
- 原作者：@Theoretically Media。
- 原始来源：https://x.com/TheoMediaAI/status/2097817049472934162#reversed-0
- 示例图片：https://cms-assets.youmind.com/media/1789117719450_2hfika_HRzw2FKa8AA1gcU-900x507.jpg
- 读取与添加日期：2026-09-18。

中英文页面的原提示词分别保存在对应的 `defaultsByLocale`（按语言区分的默认配置）中。原提示词保留双人角色、晚霞码头、直升机、黑白 OpenAI 标志，以及 `images / go / hard` 三行标题，不替换成其他模板内容。

## 产品接入

模板目录为 `template/cover-generator/images-go-hard-thumbnail/1/`，沿用已有 `cover@2` 执行流程、封面工作区和唯一的 `CreatorCollaborationPanel`（创作协作面板），没有增加独立页面或执行器。

模板在首页“推荐”和“图像设计”分类可见，可搜索 `Images Go Hard`。点击“使用此模板”后，默认英文主标题为 `images go hard`，比例为 16:9，自定义风格明确要求三行排版，质量为高，候选数为 2。中文界面也保留原版英文封面文字，不自动翻译成中文。

`preview.jpg` 是来源页面的完整示例图片，`cover.jpg` 是由该示例转换的 1280×720 展示图。预览仅用于模板展示，不自动成为用户任务的参考图附件。

现有封面执行器对非自定义风格仍默认最多两行标题；自定义风格明确指定标题行布局时，保留该布局，避免与本模板三行大字冲突。

## 验证与限制

定向验证命令：

```bash
pnpm templates:validate
pnpm templates:compile
pnpm --filter @opencreator/daemon exec vitest run test/unit/images-go-hard-thumbnail-preset.test.ts test/unit/creator-image-executor.test.ts test/unit/creator-preset-registry.test.ts test/integration/creator-cover-generation.test.ts
pnpm --filter @opencreator/daemon exec tsc -p tsconfig.json --noEmit
pnpm --filter @opencreator/daemon exec tsc -p tsconfig.test.json
```

本次结果：模板校验与编译通过；上述 4 个测试文件共 21 项测试通过；Daemon 源码及测试类型检查通过。运行中的本地工作台已加载新模板，中英文目录接口均返回正确模板和提示词；实际浏览器检查了 1440×1000 首页与详情页、390×844 详情页，封面与完整预览图片正常加载，窄屏没有横向溢出。仅在确认无运行中的任务后重启了对应 Daemon，Web 服务未重启，后台健康检查通过。

没有执行 Web 生产构建、Web/Desktop 一致性测试或实际打包 App 验证。本次仅确认源码接入与本地 Web 工作台展示，不声明已安装的 Desktop App 已同步或可发布。

模板沿用用户已配置的图像服务，不额外固定供应商或模型。来源页面的模型标签不代表 OpenCreator 已接入该模型，也不保证其他模型能复现相同画面。没有为添加模板调用付费生图服务，生成质量、文字准确度和标志还原效果仍需真实生图审查。

来源归属不等于素材商业使用授权。实际发布时应确认示例素材和 OpenAI 标志的使用条件，不暗示官方背书；如更换标题、角色或品牌，应同步修改原提示词和自定义风格，避免与主标题字段冲突。

## 作者头像补齐（2026-09-18）

原预设仅声明作者名称及来源链接，缺少头像字段和资源。本轮从 `@TheoMediaAI` 的 X 主页核对真实头像，将 400×400 的 JPEG 保存为 `author-avatar.jpg`，并补齐 `author.avatar`（作者头像）。现有编译器将图片打包为内容寻址的本地资源，再映射到 `avatarUrl`（头像地址），不修改共享前端组件或使用外部头像链接。

新增测试覆盖头像元数据及中英文地址映射；三组模板定向测试共 12 项通过，测试类型检查、目录编译及实际接口/图片请求通过。已在本地详情页确认作者头像正常显示。新增模板需要同时提供作者字段与对应本地图片，仅提供来源链接不会自动获取头像。未重新构建或打包 Desktop，不声明已安装 App 同步或可发布。
