<div align="center">
  <img src="./images/logo.png" alt="KrillinAI" height="140">

  # Frames of the World in Splendor

  <p>An AI-powered video subtitle translation and dubbing tool featuring speech recognition, intelligent sentence segmentation, professional-level translation, and one-click deployment for the entire workflow</p>

  Read this in other languages: [中文](../README.md)

</div>

🚀 **Project Overview (Online version free trial)**

Krillin AI is a one-stop solution designed for users and developers seeking high-quality video processing. It provides an end-to-end workflow, from video download to the final product, ensuring every frame of your content is extraordinary.

## Key Features and Functions:
🎯 **One-Click Startup**: There is no need for complicated environment configuration. Krillin AI supports automatic installation of dependencies, allowing you to quickly get started and put it into use immediately.  
📥 **Video Acquisition**: With yt-dlp integrated, it can directly download videos via YouTube and Bilibili links, simplifying the process of collecting materials.  
📜 **Subtitle Recognition**: Based on the Whisper model, it conducts subtitle recognition, enabling high-speed and high-quality transcription.  
🧠 **Intelligent Subtitle Segmentation and Alignment**: Utilizing self-developed algorithms to perform intelligent segmentation and alignment of subtitles, avoiding misalignment and loss of context.  
🔄 **Custom Vocabulary Replacement**: It supports one-click replacement of vocabulary to adapt to the language style of specific fields.  
🌍 **Professional-Level Translation**: The sentence translation engine ensures the consistency of context and semantic coherence.  
🎙️ **Diverse Options for External Services**: It supports voice and large model services from mainstream providers (ongoing integration) such as OpenAI and Alibaba Cloud, meeting the needs in different scenarios.

## Language Support
Input languages: 🇨🇳 Chinese, 🇺🇸 English, 🇯🇵 Japanese supported (more languages being added)  
Translation languages: 56 languages supported, including English, Chinese, Russian, Spanish, French, etc. Also supports translation into Pinyin.

## Interface Preview
![界面预览](./images/ui.jpg)

## Showcase
The following picture demonstrates the effect after the subtitle file, which was generated through a one-click operation after importing a 46-minute local video, was inserted into the track. There was no manual adjustment involved at all. There are no missing or overlapping subtitles, the sentence segmentation is natural, and the translation quality is also quite high.
![Alignment](./images/alignment.png)

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

### Alibaba Cloud Configuration Instructions
The following usage situations require the configuration of Alibaba Cloud:
* If `llm_provider` is filled with `aliyun`, it indicates that the large model service of Alibaba Cloud will be used. Consequently, the configuration of the `aliyun.bailian` item needs to be set up.
* If `transcription_provider` is filled with `aliyun`, or if the "voice dubbing" function is enabled when starting a task, the voice service of Alibaba Cloud will be utilized. Therefore, the configuration of the `aliyun.speech` item needs to be filled in.
* If the "voice dubbing" function is enabled and local audio files are uploaded for voice timbre cloning at the same time, the OSS cloud storage service of Alibaba Cloud will also be used. Hence, the configuration of the `aliyun.oss` item needs to be filled in.
Configuration Guide: [Alibaba Cloud Configuration Instructions](./aliyun.md)

## Frequently Asked Questions
Please refer to [Frequently Asked Questions](./faq.md)

## Contribution Guidelines

- Do not submit unnecessary files like `.vscode`, `.idea`, etc. Please make good use of `.gitignore` to filter them.
- Do not submit `config.toml`; instead, submit `config-example.toml`.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)
