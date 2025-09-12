<div align="center">
  <img src="/docs/images/logo.jpg" alt="KrillinAI" height="90">

# 极简 AI 视频翻译与配音工具

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KrillinAI)

</div>

## 项目介绍  ([立即体验在线版本！](https://www.klic.studio/))
[**快速开始**](#-quick-start)

Klic Studio 是由 Krillin AI 开发的多功能音视频本地化和增强解决方案。这个极简而强大的工具集成了视频翻译、配音和语音克隆，支持横屏和竖屏格式，确保在所有主要平台（Bilibili、小红书、抖音、微信视频、快手、YouTube、TikTok 等）上完美呈现。通过端到端的工作流程，您只需几次点击即可将原材料转化为精美的跨平台内容。

## 主要特点和功能：

🎯 **一键启动**：无需复杂的环境配置，自动安装依赖，立即可用，提供新的桌面版本以便于访问！

📥 **视频获取**：支持 yt-dlp 下载或本地文件上传

📜 **准确识别**：基于 Whisper 的高精度语音识别

🧠 **智能分段**：使用 LLM 进行字幕分段和对齐

🔄 **术语替换**：一键替换专业词汇

🌍 **专业翻译**：基于上下文的 LLM 翻译，保持自然语义

🎙️ **语音克隆**：提供 CosyVoice 中选择的语音音调或自定义语音克隆

🎬 **视频合成**：自动处理横屏和竖屏视频及字幕布局

💻 **跨平台**：支持 Windows、Linux、macOS，提供桌面和服务器版本

## 效果演示

下图展示了在导入一段 46 分钟的本地视频并一键执行后生成的字幕文件效果，无需任何手动调整。没有遗漏或重叠，分段自然，翻译质量非常高。
![对齐效果](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### 字幕翻译

---

https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### 配音

---

https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### 竖屏模式

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 支持的语音识别服务

_**下表中的所有本地模型支持可执行文件 + 模型文件的自动安装；您只需选择，Klic 将为您准备一切。**_

| 服务来源              | 支持的平台         | 模型选项                             | 本地/云      | 备注                       |
|----------------------|---------------------|--------------------------------------|--------------|-----------------------------|
| **OpenAI Whisper**   | 所有平台            | -                                    | 云           | 速度快，效果好            |
| **FasterWhisper**    | Windows/Linux       | `tiny`/`medium`/`large-v2`（推荐 medium+） | 本地         | 速度更快，无云服务费用    |
| **WhisperKit**       | macOS（仅限 M 系列） | `large-v2`                          | 本地         | 针对 Apple 芯片的本地优化 |
| **WhisperCpp**       | 所有平台            | `large-v2`                          | 本地         | 支持所有平台               |
| **Alibaba Cloud ASR**| 所有平台            | -                                    | 云           | 避免中国大陆的网络问题    |

## 🚀 大语言模型支持

✅ 兼容所有符合 **OpenAI API 规范** 的云/本地大语言模型服务，包括但不限于：

- OpenAI
- Gemini
- DeepSeek
- 通义千问
- 本地部署的开源模型
- 其他兼容 OpenAI 格式的 API 服务

## 🎤 TTS 文本转语音支持

- 阿里云语音服务
- OpenAI TTS

## 语言支持

支持的输入语言：中文、英语、日语、德语、土耳其语、韩语、俄语、马来语（持续增加中）

支持的翻译语言：英语、中文、俄语、西班牙语、法语及其他 101 种语言

## 界面预览

![界面预览](/docs/images/ui_desktop_light.png)
![界面预览](/docs/images/ui_desktop_dark.png)

## 🚀 快速开始

您可以在 [KrillinAI 的 Deepwiki](https://deepwiki.com/krillinai/KrillinAI) 上提问。它会索引库中的文件，因此您可以快速找到答案。

### 基本步骤

首先，从 [Release](https://github.com/KrillinAI/KrillinAI/releases) 下载与您的设备系统匹配的可执行文件，然后按照下面的教程选择桌面版或非桌面版。将软件下载放在一个空文件夹中，因为运行它会生成一些目录，保持在空文件夹中会使管理更容易。

【如果是桌面版，即带有“desktop”的发布文件，请查看这里】
_桌面版是新发布的，旨在解决新用户在正确编辑配置文件时遇到的问题，并且有一些错误正在持续更新。_

1. 双击文件开始使用（桌面版也需要在软件内进行配置）

【如果是非桌面版，即不带“desktop”的发布文件，请查看这里】
_非桌面版是初始版本，配置更复杂，但功能稳定，适合服务器部署，因为它以网页格式提供 UI。_

1. 在文件夹内创建一个 `config` 文件夹，然后在 `config` 文件夹中创建一个 `config.toml` 文件。将源代码 `config` 目录中的 `config-example.toml` 文件内容复制到 `config.toml` 中，并根据注释填写您的配置信息。
2. 双击或在终端中执行可执行文件以启动服务
3. 打开浏览器并输入 `http://127.0.0.1:8888` 开始使用（将 8888 替换为您在配置文件中指定的端口）

### 对于：macOS 用户

【如果是桌面版，即带有“desktop”的发布文件，请查看这里】
由于签名问题，桌面版目前无法双击运行或通过 dmg 安装；您需要手动信任该应用程序。方法如下：

1. 在可执行文件所在目录打开终端（假设文件名为 KrillinAI_1.0.0_desktop_macOS_arm64）
2. 按顺序执行以下命令：

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【如果是非桌面版，即不带“desktop”的发布文件，请查看这里】
该软件未签名，因此在 macOS 上运行时，在完成“基本步骤”中的文件配置后，您还需要手动信任该应用程序。方法如下：

1. 在可执行文件所在目录打开终端（假设文件名为 KrillinAI_1.0.0_macOS_arm64）
2. 按顺序执行以下命令：
   ```
   sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
   sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
   ./KrillinAI_1.0.0_macOS_arm64
   ```
   
   这将启动服务

### Docker 部署

该项目支持 Docker 部署；请参阅 [Docker 部署说明](./docker.md)

根据提供的配置文件，以下是您 README 文件中更新的“配置帮助（必读）”部分：

### 配置帮助（必读）

配置文件分为几个部分：`[app]`、`[server]`、`[llm]`、`[transcribe]` 和 `[tts]`。一个任务由语音识别（`transcribe`）+ 大模型翻译（`llm`）+ 可选的语音服务（`tts`）组成。理解这一点将帮助您更好地掌握配置文件。

**最简单和最快的配置：**

**仅用于字幕翻译：**
   * 在 `[transcribe]` 部分，将 `provider.name` 设置为 `openai`。
   * 然后，您只需在 `[llm]` 块中填写您的 OpenAI API 密钥即可开始进行字幕翻译。`app.proxy`、`model` 和 `openai.base_url` 可根据需要填写。

**平衡成本、速度和质量（使用本地语音识别）：**

* 在 `[transcribe]` 部分，将 `provider.name` 设置为 `fasterwhisper`。
* 将 `transcribe.fasterwhisper.model` 设置为 `large-v2`。
* 在 `[llm]` 块中填写您的大语言模型配置。
* 所需的本地模型将自动下载和安装。

**文本转语音（TTS）配置（可选）：**

* TTS 配置是可选的。
* 首先，在 `[tts]` 部分设置 `provider.name`（例如，`aliyun` 或 `openai`）。
* 然后，填写所选提供商的相应配置块。例如，如果选择 `aliyun`，则必须填写 `[tts.aliyun]` 部分。
* 用户界面中的语音代码应根据所选提供商的文档进行选择。
* **注意：** 如果您计划使用语音克隆功能，则必须选择 `aliyun` 作为 TTS 提供商。

**阿里云配置：**

* 有关获取阿里云服务所需的 `AccessKey`、`Bucket` 和 `AppKey` 的详细信息，请参阅 [阿里云配置说明](https://www.google.com/search?q=./aliyun.md)。重复的 AccessKey 等字段旨在保持清晰的配置结构。

## 常见问题

请访问 [常见问题](./faq.md)

## 贡献指南

1. 请勿提交无用文件，如 .vscode、.idea 等；请使用 .gitignore 过滤它们。
2. 请勿提交 config.toml；请提交 config-example.toml。

## 联系我们

1. 加入我们的 QQ 群以获取问题解答：754069680
2. 关注我们的社交媒体账号，[Bilibili](https://space.bilibili.com/242124650)，我们每天分享 AI 技术领域的优质内容。

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=KrillinAI/KrillinAI&type=Date)](https://star-history.com/#KrillinAI/KrillinAI&Date)