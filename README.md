<div align="center">
  <img src="/docs/images/logo.jpg" alt="KrillinAI" height="90">

# Video Translation & Dubbing Tool for Humans / Agents (Skills Included)

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KrillinAI)

</div>

## Project Introduction  (v2.0 with Agent support — now released)
[**Quick Start**](#-quick-start)

KrillinAI is a versatile audio and video localization and enhancement solution developed by the Krillin AI team, designed for both human users and AI Agents. The tool covers the complete pipeline including video download, speech transcription, subtitle translation, TTS dubbing, portrait conversion, and cover generation, supporting both landscape and portrait formats to ensure perfect presentation on all major platforms (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.). Human users can complete end-to-end content localization with one click via the client; each capability can also be invoked independently via CLI, and AI Agents can orchestrate single or multiple stages on demand to flexibly compose automated workflows.

## New Features

🤖 **CLI Support**: Provides a phased command-line interface where each stage executes independently and outputs structured results, supporting cross-stage artifact reuse.

🧩 **Skills Collection**: The `skills/` directory provides per-stage Skills for AI Agents to invoke directly under a stable contract, no need to parse CLI documentation.

🔗 **Pipeline Orchestration**: Chain multiple stages in one command, enabling full automation from download to rendering.

🖼️ **Cover Generation**: Automatically generate platform cover images from the original video thumbnail and a prompt template.

## Key Features and Functions:

📥 **Video Acquisition**: Supports yt-dlp downloads or local file uploads

📜 **Accurate Recognition**: High-accuracy speech recognition based on Whisper

🧠 **Intelligent Segmentation**: Subtitle segmentation and alignment using LLM

🔄 **Terminology Replacement**: One-click replacement of professional vocabulary

🌍 **Professional Translation**: LLM translation with context to maintain natural semantics

🎙️ **Voice Cloning**: Offers selected voice tones from CosyVoice or custom voice cloning

🎬 **Video Composition**: Automatically processes landscape and portrait videos and subtitle layout

💻 **Cross-Platform**: Supports Windows, Linux, macOS, providing desktop, server, and CLI modes

## Effect Demonstration

The image below shows the effect of the subtitle file generated after importing a 46-minute local video and executing it with one click, without any manual adjustments. There are no omissions or overlaps, the segmentation is natural, and the translation quality is very high.
![Alignment Effect](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### Subtitle Translation

---

https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### Dubbing

---

https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### Portrait Mode

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 Supported Speech Recognition Services

_**All local models in the table below support automatic installation of executable files + model files; you just need to choose, and Klic will prepare everything for you.**_

| Service Source          | Supported Platforms | Model Options                             | Local/Cloud | Remarks                     |
|------------------------|---------------------|------------------------------------------|-------------|-----------------------------|
| **OpenAI Whisper**     | All Platforms        | -                                        | Cloud       | Fast speed and good effect  |
| **FasterWhisper**      | Windows/Linux       | `tiny`/`medium`/`large-v2` (recommended medium+) | Local       | Faster speed, no cloud service cost |
| **WhisperKit**         | macOS (M-series only) | `large-v2`                              | Local       | Native optimization for Apple chips |
| **WhisperCpp**         | All Platforms        | `large-v2`                              | Local       | Supports all platforms       |
| **Alibaba Cloud ASR**  | All Platforms        | -                                        | Cloud       | Avoids network issues in mainland China |

## 🚀 Large Language Model Support

✅ Compatible with all cloud/local large language model services that comply with **OpenAI API specifications**, including but not limited to:

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Locally deployed open-source models
- Other API services compatible with OpenAI format

## 🎤 TTS Text-to-Speech Support

- Alibaba Cloud Voice Service
- OpenAI TTS

## Language Support

Input languages supported: Chinese, English, Japanese, German, Turkish, Korean, Russian, Malay (continuously increasing)

Translation languages supported: English, Chinese, Russian, Spanish, French, and 101 other languages

## Interface Preview

![Interface Preview](/docs/images/ui_desktop_light.png)
![Interface Preview](/docs/images/ui_desktop_dark.png)

## 🚀 Quick Start

You can ask questions on the [Deepwiki of KrillinAI](https://deepwiki.com/krillinai/KrillinAI). It indexes the files in the repository, so you can find answers quickly.

### Basic Steps

First, download the executable file that matches your device system from the [Release](https://github.com/KrillinAI/KrillinAI/releases), then follow the tutorial below to choose between the desktop version or non-desktop version. Place the software download in an empty folder, as running it will generate some directories, and keeping it in an empty folder will make management easier.

【If it is the desktop version, i.e., the release file with "desktop," see here】
_The desktop version is newly released to address the issues of new users struggling to edit configuration files correctly, and there are some bugs that are continuously being updated._

1. Double-click the file to start using it (the desktop version also requires configuration within the software)

【If it is the non-desktop version, i.e., the release file without "desktop," see here】
_The non-desktop version is the initial version, which has a more complex configuration but is stable in functionality and suitable for server deployment, as it provides a UI in a web format._

1. Create a `config` folder within the folder, then create a `config.toml` file in the `config` folder. Copy the contents of the `config-example.toml` file from the source code's `config` directory into `config.toml`, and fill in your configuration information according to the comments.
2. Double-click or execute the executable file in the terminal to start the service
3. Open your browser and enter `http://127.0.0.1:8888` to start using it (replace 8888 with the port you specified in the configuration file)

### To: macOS Users

【If it is the desktop version, i.e., the release file with "desktop," see here】
Due to signing issues, the desktop version currently cannot be double-clicked to run or installed via dmg; you need to manually trust the application. The method is as follows:

1. Open the terminal in the directory where the executable file (assuming the file name is KrillinAI_1.0.0_desktop_macOS_arm64) is located
2. Execute the following commands in order:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【If it is the non-desktop version, i.e., the release file without "desktop," see here】
This software is not signed, so when running on macOS, after completing the file configuration in the "Basic Steps," you also need to manually trust the application. The method is as follows:

1. Open the terminal in the directory where the executable file (assuming the file name is KrillinAI_1.0.0_macOS_arm64) is located
2. Execute the following commands in order:
   ```
   sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
   ```

   This will start the service

### Docker Deployment

This project supports Docker deployment; please refer to the [Docker Deployment Instructions](./docker.md)

### CLI Usage

KrillinAI provides a staged CLI suitable for scripting, automation pipelines, and AI Agent invocation. The CLI executes synchronously by default, outputs a single JSON line to stdout upon completion, and writes `krillinai_manifest.json` to the working directory for subsequent stages to reuse prior artifacts.

Build from source:

```bash
go build -o build/krillinai-cli ./cmd/cli
```

Command overview:

| Command | Purpose | Typical Outputs |
|---|---|---|
| `subtitle` | Generate subtitles from YouTube / Bilibili links or local videos; tries platform captions first, falls back to Whisper transcription | `origin_language_srt.srt`, `target_language_srt.srt`, `bilingual_srt.srt`, `short_origin_mixed_srt.srt` |
| `tts` | Generate target-language dubbing from target subtitles | `tts_final_audio.wav`, `video_with_tts.mp4` |
| `render-horizontal` | Produce horizontal video: original + bilingual subtitles, or dubbed video + target subtitles | `horizontal_bilingual.mp4` |
| `render-vertical` | Produce vertical video: original converted to vertical + short subtitles, or dubbed video + target subtitles | `transferred_vertical_video.mp4`, `vertical_bilingual.mp4` |
| `pipeline` | Orchestrate multiple stages via `--outputs` | Determined by selected stages |
| `cover` | Generate a cover image from the original cover and prompt templates | `generated_cover.png` |

Typical workflow:

```bash
# 1. Generate subtitles: original, target, bilingual, and vertical short subtitles
./build/krillinai-cli subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo \
  --caption-source any

# 2. Generate dubbing from target-language subtitles
./build/krillinai-cli tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt \
  --line-mode target-only \
  --video tasks/demo/origin_video.mp4

# 3. Produce horizontal bilingual-subtitle video
./build/krillinai-cli render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/bilingual_srt.srt

# 4. Produce vertical short-subtitle video
./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/short_origin_mixed_srt.srt \
  --major-title "今日话题" \
  --minor-title "AI Video"
```

Agent integration conventions:

- Parse the last JSON line on stdout and `krillinai_manifest.json` — do not parse plain-text logs.
- The `outputs` field records stage artifact paths; subsequent commands can pass only `--workdir` to reuse the manifest.
- Supports `--dry-run` to validate parameters and generate a manifest without downloading video or calling external AI services.
- Handle errors by `error.kind`: `usage` → fix parameters, `retryable` → retry, `dependency` → install `ffmpeg` / `ffprobe` / `yt-dlp`.

For a complete parameter reference, see [CLI Capability Summary](./docs/zh/cli.md).

### Agent Skills

The repository also includes ready-to-use Agent Skills under `skills/` so coding agents can call the CLI with stable conventions:

- [`krillinai-cli`](./skills/krillinai-cli/SKILL.md): top-level routing skill for choosing subtitle, TTS, render, pipeline, or cover workflows.
- [`krillinai-subtitle`](./skills/krillinai-subtitle/SKILL.md), [`krillinai-tts`](./skills/krillinai-tts/SKILL.md), [`krillinai-render-horizontal`](./skills/krillinai-render-horizontal/SKILL.md), and [`krillinai-render-vertical`](./skills/krillinai-render-vertical/SKILL.md): stage-specific operating guides.
- [`krillinai-pipeline`](./skills/krillinai-pipeline/SKILL.md) and [`krillinai-cover`](./skills/krillinai-cover/SKILL.md): planning/reserved guides for pipeline orchestration and cover generation until those execution paths are fully wired.
- [`cli-contract.md`](./skills/krillinai-cli/references/cli-contract.md): shared JSON, manifest, outputs, and error-handling contract.

Based on the provided configuration file, here is the updated "Configuration Help (Must Read)" section for your README file:

### Configuration Help (Must Read)

The configuration file is divided into several sections: `[app]`, `[server]`, `[llm]`, `[transcribe]`, and `[tts]`. A task is composed of speech recognition (`transcribe`) + large model translation (`llm`) + optional voice services (`tts`). Understanding this will help you better grasp the configuration file.

**Easiest and Quickest Configuration:**

**For Subtitle Translation Only:**
   * In the `[transcribe]` section, set `provider.name` to `openai`.
   * You will then only need to fill in your OpenAI API key in the `[llm]` block to start performing subtitle translations. The `app.proxy`, `model`, and `openai.base_url` can be filled in as needed.

**Balanced Cost, Speed, and Quality (Using Local Speech Recognition):**

* In the `[transcribe]` section, set `provider.name` to `fasterwhisper`.
* Set `transcribe.fasterwhisper.model` to `large-v2`.
* Fill in your large language model configuration in the `[llm]` block.
* The required local model will be automatically downloaded and installed.

**Text-to-Speech (TTS) Configuration (Optional):**

* TTS configuration is optional.
* First, set the `provider.name` under the `[tts]` section (e.g., `aliyun` or `openai`).
* Then, fill in the corresponding configuration block for the selected provider. For example, if you choose `aliyun`, you must fill in the `[tts.aliyun]` section.
* Voice codes in the user interface should be chosen based on the selected provider's documentation.
* **Note:** If you plan to use the voice cloning feature, you must select `aliyun` as the TTS provider.

**Alibaba Cloud Configuration:**

* For details on obtaining the necessary `AccessKey`, `Bucket`, and `AppKey` for Alibaba Cloud services, please refer to the [Alibaba Cloud Configuration Instructions](https://www.google.com/search?q=./aliyun.md). The repeated fields for AccessKey, etc., are designed to maintain a clear configuration structure.

**Short Subtitle Configuration:**

* `short_subtitle_max_chars`: Maximum characters per line for English short subtitles (default: 20)
  - Designed for portrait/vertical videos
  - Chinese text remains intact, English text is split according to this length
  - Recommended value: 15-25

## Frequently Asked Questions

Please visit [Frequently Asked Questions](./faq.md)

## Contribution Guidelines

1. Do not submit useless files, such as .vscode, .idea, etc.; please use .gitignore to filter them out.
2. Do not submit config.toml; instead, submit config-example.toml.

## Contact Us

1. Join our QQ group for questions: 754069680
2. Follow our social media accounts, [Bilibili](https://space.bilibili.com/242124650), where we share quality content in the AI technology field every day.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=KrillinAI/KrillinAI&type=Date)](https://star-history.com/#KrillinAI/KrillinAI&Date)
