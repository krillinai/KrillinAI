<div align="center">
  <h1>Krillin AI
  <p></p><p></p>

  世界帧精彩</h1>
  <p>基于AI大模型的视频字幕翻译和配音工具，语音识别，智能断句，专业级翻译，一键部署全流程</p>
  <p>交流Q群: 754069680</p>
  其他语言: [English](README_en.md)

</div>

🚀 **项目简介（在线版本免费体验）**  

Krillin AI 是一个专为追求高质量视频处理的用户和开发者设计的一站式解决方案，提供从视频下载到最终成品的一站式工作流程，确保你的每一帧内容都精彩。

## 主要特点与功能：

🎯 **一键部署**：无需复杂的环境配置，Krillin AI支持快速上手，立即投入使用。  
📥 **视频获取**：集成yt-dlp库，直接通过YouTube，Bilibili链接下载视频，简化素材收集过程。  
📜 **字幕识别**：采用Whisper模型进行单词级别的字幕识别，显著降低幻觉错误率，确保高精度转录。  
🧠 **智能字幕分割**：利用NLP和AI算法对字幕进行智能分割，保证自然流畅的阅读体验。  
🔄 **自定义词汇替换**：支持一键替换词汇，优化翻译连贯性，适应特定领域或品牌的语言风格。  
🌍 **专业级翻译**：整句翻译引擎，确保上下文一致，避免片段化表达。  
🎙️ **多样化配音选择**：支持阿里云、Google Cloud、Azure等主流TTS服务，满足不同场景下的需求。

---
## 效果展示
<div style="display: flex; justify-content: space-between;">
  <div style="flex: 1; margin-right: 10px;">
    <h3>字幕翻译</h3>
    <iframe width="100%" height="315" src="./docs/subtitle_translation.mp4" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
  </div>
  <div style="flex: 1; margin-left: 10px;">
    <h3>配音和声音克隆</h3>

[//]: # (    <iframe width="100%" height="315" src="" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>)
  </div>
</div>


---
## 快速开始
### 基本步骤
1. 下载release中的可执行文件，放入空文件夹
2. 在文件夹内创建config文件夹，然后在config文件夹创建config.toml文件，复制源代码config目录下的config-example.toml文件的内容填入config.toml，并对照填写你的配置信息。
3. 双击可执行文件，启动服务
4. 打开浏览器，输入`http://127.0.0.1:8888`，开始使用 (8888替换成你在配置文件中填写的端口)

### Cookie配置说明

如果你遇到视频下载失败的情况

请参考 [Cookie 配置说明](./docs/get_cookies.md) 配置你的Cookie信息。

---
## 贡献规范
1. 不要提交无用文件，如.vscode、.idea等，请善于使用.gitignore过滤
2. 不要提交config.toml，而是使用config-example.toml提交
