<div align="center">
  <h1>Krillin AI</h1>
  <p>世界帧精彩</p>

  <p>基于AI大模型的视频字幕翻译和配音工具，语音识别，智能断句，专业级翻译，一键部署全流程</p>
  <p>交流Q群: 754069680</p>

  其他语言: [English](./docs/README_en.md)

</div>

🚀 **项目简介**  

KrillinAI是一个为追求高质量视频翻译的用户和开发者设计的解决方案，提供从视频下载到最终成品的一站式工作流程，用AI赋能跨语言文化沟通。

## 主要特点与功能：
🎯 **一键启动**：无需复杂的环境配置，Krillin AI支持自动安装依赖，快速上手，立即投入使用。  
📥 **视频获取**：集成yt-dlp，直接通过YouTube，Bilibili链接下载视频，简化素材收集过程。  
📜 **字幕识别**：基于Whisper模型进行字幕识别，高速、高质量转录。  
🧠 **智能字幕分割对齐**：利用自研算法对字幕进行智能分割和对齐，避免错位和上下文丢失。  
🔄 **自定义词汇替换**：支持一键替换词汇，适应特定领域语言风格。  
🌍 **专业级翻译**：整句翻译引擎，确保上下文一致和语义连贯。  
🎙️ **多样化外部服务选择**：支持OpenAI、阿里云等主流供应商（持续集成中）的语音和大模型服务，满足不同场景下的需求。

## 语言支持
输入语言支持：🇨🇳中文，🇺🇸英文，🇯🇵日语（持续增加中）

翻译语言支持：英文，中文，俄语，西班牙语，法语等56种语言，还支持翻译成拼音

## 效果展示
<table>
<tr>
<td width="50%">

### 字幕翻译
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="50%">



### 配音
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>
</tr>
</table>

## 快速开始
### 基本步骤
1. 下载[Release](https://github.com/krillinai/KrillinAI/releases)中与你设备系统匹配的可执行文件，放入空文件夹
2. 在文件夹内创建`config`文件夹，然后在`config`文件夹创建`config.toml`文件，复制源代码`config`目录下的`config-example.toml`文件的内容填入`config.toml`，并对照填写你的配置信息。
3. 双击，或在终端执行可执行文件，启动服务
4. 打开浏览器，输入`http://127.0.0.1:8888`，开始使用 (8888替换成你在配置文件中填写的端口)

### To: macOS用户
本软件没有做签名，因此在macOS上运行时，在完成“基本步骤”中的文件配置后，还需要手动信任应用，方法如下：
1. 在终端打开可执行文件（假设文件名是krillinai）所在目录
2. 依次执行以下命令：
   ```
    sudo xattr -rd com.apple.quarantine ./krillinai
    sudo chmod +x ./krillinai
    ./krillinai
    ```
    即可启动服务

### Cookie配置说明

如果你遇到视频下载失败的情况

请参考 [Cookie 配置说明](./docs/get_cookies.md) 配置你的Cookie信息。

## 常见问题

请移步[常见问题](./docs/faq.md)

## 贡献规范
1. 不要提交无用文件，如.vscode、.idea等，请善于使用.gitignore过滤
2. 不要提交config.toml，而是使用config-example.toml提交

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)
