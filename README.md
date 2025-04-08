<div align="center">
  <img src="./docs/images/logo.png" alt="KrillinAI" height="90">


  # AI Audio&Video Translation and Dubbing Tool

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](./README.md) | [简体中文](./docs/README_zh.md) |[日本語](./docs/README_jp.md)｜[Русский](./docs/README_rus.md)**

  [![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%20followers&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)

</div>

### 📢 New Release for Win & Mac Desktop Version – Welcome to Test and Provide Feedback

## Overview

Krillin AI is an all-in-one solution for effortless video localization and enhancement. This minimalist yet powerful tool handles everything from translation, dubbing to voice cloning，formatting—seamlessly converting videos between landscape and portrait modes for optimal display across all content platforms(YouTube, TikTok, Bilibili, Douyin, WeChat Channel, RedNote, Kuaishou). With its end-to-end workflow, Krillin AI transforms raw footage into polished, platform-ready content in just a few clicks.

## Key Features:
🎯 **One-Click Start** - Launch your workflow instantly 

📥 **Video download** - yt-dlp and local file uploading supported

📜 **Precise Subtitles** - Whisper-powered high-accuracy recognition

🧠 **Smart Segmentation** - LLM-based subtitle chunking & alignment

🌍 **Professional Translation** - Paragraph-level translation for consistency 

🔄 **Term Replacement** - One-click domain-specific vocabulary swap 

🎙️ **Dubbing and Voice Cloning** - CosyVoice selected or cloning voices

🎬 **Video Composition** - Auto-formatting for horizontal/vertical layouts

## Showcase
The following picture demonstrates the effect after the subtitle file, which was generated through a one-click operation after importing a 46-minute local video, was inserted into the track. There was no manual adjustment involved at all. There are no missing or overlapping subtitles, the sentence segmentation is natural, and the translation quality is also quite high.
![Alignment](./docs/images/alignment.png)

<table>
<tr>
<td width="50%">

### Subtitle Translation
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="50%">

### Dubbing
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>
</tr>
</table>

## 🌍 Language Support
Input languages: Chinese, English, Japanese, German, Turkish supported (more languages being added)  
Translation languages: 56 languages supported, including English, Chinese, Russian, Spanish, French, etc.

## Interface Preview
![ui preview](./docs/images/ui_desktop.png)

## 🚀 Quick Start
### Basic Steps
1. Download the executable file that matches your device system from the release and place it in an empty folder.
2. Create a `config` folder inside the folder, then create a `config.toml` file in the `config` folder. Copy the content from the `config-example.toml` file in the source code's `config` directory into `config.toml` and fill in your configuration information accordingly.
3. Double-click the executable file to start the service.
4. Open a browser and enter `http://127.0.0.1:8888` to start using it (replace 8888 with the port you configured in the `config.toml` file).

### To: macOS Users
This software is not signed, so after completing the file configuration in the "Basic Steps," you will need to manually trust the application on macOS. Follow these steps:
1. Open the terminal and navigate to the directory where the executable file (assuming the file name is `KrillinAI_1.0.0_macOS_arm64`) is located.
2. Execute the following commands in sequence:
```
sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
./KrillinAI_1.0.0_macOS_arm64
```
This will start the service.

### Docker Deployment
This project supports Docker deployment. Please refer to the [Docker Deployment Instructions](./docs/docker.md).

### Cookie Configuration Instructions

If you encounter video download failures, please refer to the [Cookie Configuration Instructions](./docs/get_cookies.md) to configure your cookie information.

### Configuration Help
The quickest and most convenient configuration method:
* Select `openai` for both `transcription_provider` and `llm_provider`. In this way, you only need to fill in `openai.apikey` in the following three major configuration item categories, namely `openai`, `local_model`, and `aliyun`, and then you can conduct subtitle translation. (Fill in `app.proxy`, `model` and `openai.base_url` as per your own situation.)

The configuration method for using the local speech recognition model (macOS is not supported for the time being) (a choice that takes into account cost, speed, and quality):
* Fill in `fasterwhisper` for `transcription_provider` and `openai` for `llm_provider`. In this way, you only need to fill in `openai.apikey` and `local_model.faster_whisper` in the following three major configuration item categories, namely `openai` and `local_model`, and then you can conduct subtitle translation. The local model will be downloaded automatically. (The same applies to `app.proxy` and `openai.base_url` as mentioned above.)

The following usage situations require the configuration of Alibaba Cloud:
* If `llm_provider` is filled with `aliyun`, it indicates that the large model service of Alibaba Cloud will be used. Consequently, the configuration of the `aliyun.bailian` item needs to be set up.
* If `transcription_provider` is filled with `aliyun`, or if the "voice dubbing" function is enabled when starting a task, the voice service of Alibaba Cloud will be utilized. Therefore, the configuration of the `aliyun.speech` item needs to be filled in.
* If the "voice dubbing" function is enabled and local audio files are uploaded for voice timbre cloning at the same time, the OSS cloud storage service of Alibaba Cloud will also be used. Hence, the configuration of the `aliyun.oss` item needs to be filled in.
Configuration Guide: [Alibaba Cloud Configuration Instructions](./docs/aliyun.md)

## Frequently Asked Questions
Please refer to [Frequently Asked Questions](./docs/faq.md)

## Contribution Guidelines

- Do not submit unnecessary files like `.vscode`, `.idea`, etc. Please make good use of `.gitignore` to filter them.
- Do not submit `config.toml`; instead, submit `config-example.toml`.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)
