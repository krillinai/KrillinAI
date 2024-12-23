<div align="center">
  <h1>Krillin AI</h1>
  <p>Frames of the World in Splendor</p>
  <p>An AI-powered video subtitle translation and dubbing tool featuring speech recognition, intelligent sentence segmentation, professional-level translation, and one-click deployment for the entire workflow</p>

  Read this in other languages: [中文](../README.md)

</div>

🚀 **Project Overview (Online version free trial)**

Krillin AI is a one-stop solution designed for users and developers seeking high-quality video processing. It provides an end-to-end workflow, from video download to the final product, ensuring every frame of your content is extraordinary.

## Key Features and Functions:

🎯 **One-click Start**: No complicated environment setup required. Krillin AI supports automatic dependency installation, allowing you to quickly get started and use it immediately.

📥 **Video Acquisition**: Integrated with yt-dlp, directly download videos from YouTube and Bilibili links, simplifying the material collection process.

📜 **Subtitle Recognition**: Using the Whisper model for subtitle recognition, ensuring high-precision transcription.

🧠 **Intelligent Subtitle Segmentation and Alignment**: Utilizing self-developed algorithms to intelligently segment and align subtitles, preventing misalignment and loss of context.

🔄 **Custom Vocabulary Replacement**: Supports one-click vocabulary replacement [TODO], adaptable to specific domain language styles.

🌍 **Professional Translation**: Full-sentence translation engine, ensuring contextual consistency and semantic coherence.

🎙️ **Diverse Voiceover Options**: Supports mainstream TTS services such as Alibaba Cloud, Google Cloud [TODO], meeting the needs of various scenarios.

---
### Language Support

Input languages: 🇨🇳 Chinese, 🇺🇸 English, 🇯🇵 Japanese supported (more languages being added)

Translation languages: 56 languages supported, including English, Chinese, Russian, Spanish, French, etc. Also supports translation into Pinyin (more languages being added).


---
## Showcase
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

---
## Quick Start
### Basic Steps
1. Download the executable file that matches your device system from the release and place it in an empty folder.
2. Create a `config` folder inside the folder, then create a `config.toml` file in the `config` folder. Copy the content from the `config-example.toml` file in the source code's `config` directory into `config.toml` and fill in your configuration information accordingly.
3. Double-click the executable file to start the service.
4. Open a browser and enter `http://127.0.0.1:8888` to start using it (replace 8888 with the port you configured in the `config.toml` file).

### To: macOS Users
This software is not signed, so after completing the file configuration in the "Basic Steps," you will need to manually trust the application on macOS. Follow these steps:
1. Open the terminal and navigate to the directory where the executable file (assuming the file name is `krillinai`) is located.
2. Execute the following commands in sequence:
```
sudo xattr -rd com.apple.quarantine ./krillinai
sudo chmod +x ./krillinai
./krillinai
```
This will start the service.

### Cookie Configuration Instructions

If you encounter video download failures, please refer to the [Cookie Configuration Instructions](./get_cookies.md) to configure your cookie information.

## Contribution Guidelines

- Do not submit unnecessary files like `.vscode`, `.idea`, etc. Please make good use of `.gitignore` to filter them.
- Do not submit `config.toml`; instead, submit `config-example.toml`.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)
