<div align="center">
  <img src="/docs/images/logo.png" alt="KrillinAI" height="90">

  # Minimalist AI Video Translation and Dubbing Tool

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

 ## Project Introduction  ([Try the online version now!](https://www.klic.studio/))

Krillin AI is a versatile audio and video localization and enhancement solution. This minimalist yet powerful tool integrates video translation, dubbing, and voice cloning, supporting both landscape and portrait formats to ensure perfect presentation across all major platforms (Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok, etc.). With an end-to-end workflow, Krillin AI can transform raw materials into beautifully ready-to-use cross-platform content with just a few clicks.

## Key Features and Functions:
🎯 **One-click Start**: No complex environment setup required, automatic dependency installation, ready to use immediately, with a new desktop version for easier access!

📥 **Video Acquisition**: Supports downloading via yt-dlp or local file uploads

📜 **Accurate Recognition**: High-accuracy speech recognition based on Whisper

🧠 **Intelligent Segmentation**: Subtitle segmentation and alignment using LLM

🔄 **Terminology Replacement**: One-click replacement of specialized vocabulary 

🌍 **Professional Translation**: LLM translation with context to maintain natural semantics

🎙️ **Voice Cloning**: Offers CosyVoice selected tones or custom voice cloning

🎬 **Video Composition**: Automatically handles landscape and portrait video and subtitle layout

💻 **Cross-Platform**: Supports Windows, Linux, macOS, providing both desktop and server versions


## Effect Demonstration
The image below shows the effect of the subtitle file generated after importing a 46-minute local video and executing it with one click, without any manual adjustments. There are no omissions or overlaps, the sentence breaks are natural, and the translation quality is very high.
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
_**All local models in the table below support automatic installation of executable files + model files; you just need to choose, and KrillinAI will prepare everything for you.**_

| Service Source         | Supported Platforms | Model Options                                  | Local/Cloud | Remarks          |
|-----------------------|---------------------|------------------------------------------------|-------------|------------------|
| **OpenAI Whisper**    | All Platforms        | -                                              | Cloud       | Fast and effective |
| **FasterWhisper**     | Windows/Linux       | `tiny`/`medium`/`large-v2` (recommended medium+) | Local       | Faster, no cloud service costs |
| **WhisperKit**        | macOS (M-series only) | `large-v2`                                     | Local       | Native optimization for Apple chips |
| **WhisperCpp**        | All Platforms        | `large-v2`                                     | Local       | Supports all platforms |
| **Aliyun ASR**        | All Platforms        | -                                              | Cloud       | Avoids network issues in mainland China |

## 🚀 Supported Large Language Models

✅ Compatible with all cloud/local large language model services that comply with **OpenAI API specifications**, including but not limited to:
- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- Locally deployed open-source models
- Other API services compatible with OpenAI format

## 🎤 TTS Text-to-Speech Support
- Aliyun Voice Service
- OpenAI TTS

## Language Support
Input languages supported: Chinese, English, Japanese, German, Turkish, Korean, Russian, Malay (continuously increasing)

Translation languages supported: English, Chinese, Russian, Spanish, French, and 101 other languages

## Interface Preview
![Interface Preview](/docs/images/ui_desktop.png)


## 🚀 Quick Start
### Basic Steps
First, download the executable file that matches your device system from the [Release](https://github.com/krillinai/KrillinAI/releases), then follow the tutorial below to choose between the desktop version or non-desktop version, and place it in an empty folder. Download the software into an empty folder because it will generate some directories after running, making it easier to manage.

【If it is the desktop version, i.e., the release file contains "desktop," see here】  
_The desktop version is newly released to solve the problem of new users having difficulty correctly editing configuration files, and there are some bugs that are continuously being updated._
1. Double-click the file to start using it (the desktop version also requires configuration within the software)

【If it is the non-desktop version, i.e., the release file does not contain "desktop," see here】  
_The non-desktop version is the initial version, with a more complex configuration, but stable functionality, suitable for server deployment, as it provides a UI in a web format._
1. Create a `config` folder within the directory, then create a `config.toml` file in the `config` folder, copy the contents of the `config-example.toml` file from the source code's `config` directory into `config.toml`, and fill in your configuration information according to the comments.
2. Double-click or execute the executable file in the terminal to start the service 
3. Open your browser and enter `http://127.0.0.1:8888` to start using it (replace 8888 with the port you filled in the configuration file)

### To: macOS Users
【If it is the desktop version, i.e., the release file contains "desktop," see here】  
Currently, due to signing issues, the desktop version cannot be run directly by double-clicking or installed via dmg; you need to manually trust the application. The method is as follows:
1. Open the terminal in the directory where the executable file (assuming the file name is KrillinAI_1.0.0_desktop_macOS_arm64) is located
2. Execute the following commands in order:
```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【If it is the non-desktop version, i.e., the release file does not contain "desktop," see here】  
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

### Cookie Configuration Instructions (Optional)

If you encounter video download failures,

please refer to the [Cookie Configuration Instructions](./get_cookies.md) to configure your Cookie information.

### Configuration Help (Must Read)
The quickest and easiest configuration method:
* Fill in `transcribe.provider.name` with `openai`, so you only need to fill in the `transcribe.openai` block and the large model configuration in the `llm` block to perform subtitle translation. (`app.proxy`, `model`, and `openai.base_url` can be filled in as needed)

Using local language recognition model configuration (balancing cost, speed, and quality):
* Fill in `transcribe.provider.name` with `fasterwhisper`, fill in `transcribe.fasterwhisper.model` with `large-v2`, and then fill in the `llm` with the large model configuration to perform subtitle translation; the local model will be automatically downloaded and installed. (`app.proxy` and `openai.base_url` are the same as above)

Text-to-speech (TTS) is optional; the configuration logic is the same as above. Fill in `tts.provider.name`, then fill in the corresponding configuration block under `tts`. The sound codes in the UI should be filled in according to the documentation of the selected provider. The filling of Aliyun's aksk, etc., may be repetitive to ensure a clear configuration structure.  
Note: If using voice cloning, `tts` only supports selecting `aliyun`.

**For obtaining Aliyun AccessKey, Bucket, and AppKey, please read**: [Aliyun Configuration Instructions](./aliyun.md) 

Please understand that the task = speech recognition + large model translation + voice service (TTS, etc., optional), which will help you understand the configuration file better.

## Frequently Asked Questions

Please visit [Frequently Asked Questions](./faq.md)

## Contribution Guidelines
1. Do not submit useless files, such as .vscode, .idea, etc.; please make good use of .gitignore to filter them out.
2. Do not submit config.toml; instead, submit config-example.toml.

## Contact Us
1. Join our QQ group for questions: 754069680
2. Follow our social media accounts, [Bilibili](https://space.bilibili.com/242124650), where we share quality content in the AI technology field every day.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)