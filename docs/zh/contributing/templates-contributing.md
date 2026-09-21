# 贡献一个创作模板（简体中文）

> [English](../../contributing/templates-contributing.md) | 简体中文

创作模板是 [`template/<module>/<id>/<version>/`](../../../template/) 下的一个文件夹，包含 `template.json` 和本地素材。模板为图像生成、视频生成和封面生成的可视化选择器提供预设——用户从你的预设开始创作，而不是面对空白 prompt。本指南说明如何新增一个模板。

---

## 创作模板是什么 / 不是什么

**模板是：**
- 一套调好的预设：prompt 默认值、风格提示、比例/时长/质量设置，加上展示效果的封面和预览。
- 自包含。选择器展示的所有内容都在模板文件夹内。

**模板不是：**
- 新的模板*类型*。当前模块为 `image-generation`、`video-generation` 和 `cover-generator`。如果需要新模块，先提 Issue 讨论——那是产品变更，不是模板。
- prompt 堆砌。prompt 为空或过于通用、没有本地化默认值的模板会被退回；模板的价值在于调优。
- 没有授权的他人作品。见[署名与版权](#署名与版权)。

## 快速开始

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<module>/<your-template-id>
# 编辑 template.json，替换封面/预览素材
pnpm templates:validate     # 提 PR 前必须通过
```

模板 ID 使用小写连字符，在模块内唯一。版本从 `1` 开始——一个版本一个文件夹，更新时新建 `<id>/2/` 而不是修改 `<id>/1/`。

## 目录结构

```
template/<module>/<id>/1/
├── template.json        # 必需：元数据、默认值、本地化内容
├── cover.jpg            # 必需：模板选择器中展示的封面
├── preview.jpg          # 图像/封面模块：更大尺寸的结果预览
├── previewVideo         # 视频模块：示例片段，如 example.mp4
└── author-avatar.jpg    # 可选：署名作者头像
```

## template.json 字段说明

| 字段 | 是否必需 | 说明 |
|---|---|---|
| `schemaVersion` | 是 | 当前为 `1`。 |
| `id`、`version`、`module` | 是 | 必须与文件夹路径 `<module>/<id>/<version>/` 一致。 |
| `runtimeTemplate` | 是 | 映射到 Runtime 执行器，如 `{"id": "cover", "version": 2}`。从同模块模板复制。 |
| `status` | 是 | 发布用 `published`；迭代期间用 `draft`。 |
| `title`、`description` | 是 | `zh-CN` 和 `en-US` 都必填，其他语言可选。 |
| `cover` | 是 | 选择器缩略图的相对路径。 |
| `preview` / `previewVideo` | 视模块而定 | 图像和封面模块用 `preview`，视频模块用 `previewVideo`。 |
| `defaults` | 是 | 用户开始的基线设置（prompt、比例、时长、质量等）。 |
| `defaultsByLocale` | 强烈建议 | 按语言的 prompt 和风格覆盖。真正的调优都在这里——见下文。 |
| `tags` | 建议 | 可搜索的标签；保持客观。 |
| `author` | 如适用 | 署名外部来源的 `name`、`url`、`avatar`。 |
| `featured`、`sortOrder` | 否 | 保持 `featured: false`；是否精选由维护者决定。 |

## prompt 就是产品

Reviewer 的大部分时间会花在 `defaults` 和 `defaultsByLocale` 上：

- **两种语言都必须是真实调优过的 prompt**，而不是丢失调优信息的直译。`zh-CN` 和 `en-US` 的 prompt 应各自发挥语言优势，产出等价结果。
- **明确哪些内容是让用户改的。** 如果标题文字或主体应由用户编辑，在 prompt 中明确说明（现有模板使用 "Customizable text: …" 这类标记）。
- **写清约束。** "无水印、无额外文字、无额外人物"——负向约束对可复现的输出和描述同样重要。
- **匹配模块的 defaults 结构。** 图像模板带 ratio/candidateCount/quality；视频模板带 size/duration；封面模板带 headline、文字语言和风格字段。从同模块现有模板复制结构。

## 素材

- `cover.jpg` 和预览必须**用模板本身生成**——使用库存图片或无关作品会被拒绝。
- 文件大小保持合理；这些文件随应用分发并在选择器中加载。
- 预览应代表*典型*结果，而不是五十选一的最佳样本。

## 署名与版权

如果你的模板改编自他人已发布的 prompt 或风格：

- 你必须拥有再分发的权利。
- 按现有模板的做法填写 `author` 字段，包括 `name` 和 `url`（如有头像则附 `author-avatar.jpg`）。
- 不确定时，先提 Issue 询问，再开始动手。

## 合并门槛

- [ ] 文件夹路径与 `id`/`version`/`module` 一致；ID 在模块内唯一。
- [ ] `pnpm templates:validate` 通过。
- [ ] `title` 和 `description` 同时提供 `zh-CN` 和 `en-US`。
- [ ] `defaultsByLocale` 包含两种语言调优过的 prompt。
- [ ] 封面和预览素材由模板本身生成。
- [ ] 改编外部作品时包含 `author` 署名。
- [ ] `featured: false`，`status: "published"`（或 `draft` 并在 PR 中说明）。

## 常见被拒原因

- **prompt 过于通用** —— 相比空白 prompt 没有增量价值；选择器不需要它。
- **缺少语言** —— 只调了一种语言，或机器翻译导致风格约束丢失。
- **素材不符** —— 封面与 prompt 实际生成的效果对不上。
- **版权不明** —— 改编他人作品但没有署名或授权。
- **原地修改旧版本** —— 应新建版本文件夹，而不是改写 `<id>/1/` 的历史。

---

有问题？[提一个 Issue](https://github.com/krillinai/OpenCreator/issues/new)，附上你的模板想法和一个示例输出，我们会帮你明确范围。
