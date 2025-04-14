<div align="center">
  <img src="../docs/images/logo.png" alt="KrillinAI" height="90">


 # أداة ترجمة ودبلجة الصوت والفيديو بالذكاء الاصطناعي

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](../README.md)｜[简体中文](../docs/README_zh.md)｜[日本語](../docs/README_jp.md)｜[한국어](../docs/README_kr.md)｜[Français](../docs/README_fr.md)｜[Deutsch](../docs/README_de.md)｜[Español](../docs/README_es.md)｜[Português](../docs/README_pt.md)｜[Русский](../docs/README_rus.md)｜[اللغة العربية](../docs/README_ar.md)**

  [![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%20followers&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

 ### إصدار جديد لنظامي ويندوز وماك - مرحبًا باختباره وتقديم الملاحظات

## نظرة عامة

كريلين AI هو حل متكامل لتحسين وتوطين الفيديوهات بسهولة. هذه الأداة البسيطة لكن القوية تتعامل مع كل شيء من الترجمة والدبلجة إلى استنساخ الأصوات، وإعادة التنسيق - حيث تقوم بتحويل الفيديوهات بسلاسة بين الوضع الأفقي والعمودي لعرض مثالي على جميع منصات المحتوى (يوتيوب، تيك توك، بيلبلي، دويين، قناة وي تشات، ريد نوت، كوايشو). من خلال سير العمل الشامل، يحوّل كريلين AI اللقطات الخام إلى محتوى نهائي وجاهز للنشر ببضع نقرات فقط.

الميزات الرئيسية:
🎯 بدء بنقرة واحدة - ابدأ سير العمل فورًا، النسخة الجديدة لسطح المكتب متاحة الآن - أسهل في الاستخدام!

📥 تنزيل الفيديو - يدعم yt-dlp ورفع الملفات المحلية

📜 ترجمات دقيقة - تعتمد على Whisper للتعرف عالي الدقة

🧠 تقسيم ذكي - تجزئة المحاذاة التلقائية للترجمات بناءً على نماذج اللغات الكبيرة (LLM)

🌍 ترجمة احترافية - ترجمة على مستوى الفقرات للحفاظ على الاتساق

🔄 استبدال المصطلحات - تبديل المفردات المتخصصة بنقرة واحدة

🎙️ الدبلجة واستنساخ الأصوات - اختيار أصوات CosyVoice أو استنساخ الأصوات

🎬 تكوين الفيديو - إعادة التنسيق التلقائي للوضع الأفقي/العمودي

## عرض توضيحي
الصورة التالية توضح النتيجة بعد إدراج ملف الترجمة - الذي تم إنشاؤه بنقرة واحدة بعد استيراد فيديو محلي مدته 46 دقيقة - في المسار. لم يتم إجراء أي تعديل يدوي على الإطلاق. لا توجد ترجمات ناقصة أو متداخلة، وتقسيم الجمل طبيعي، وجودة الترجمة عالية جدًا.
![Alignment](../docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### ترجمة الترجمة النصية
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### الدبلجة
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### الوضع العمودي
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🌍 اللغات المدعومة
لغات الإدخال: الصينية، الإنجليزية، اليابانية، الألمانية، التركية (مع إضافة المزيد من اللغات قريبًا)
لغات الترجمة: 56 لغة مدعومة، بما في ذلك الإنجليزية، الصينية، الروسية، الإسبانية، الفرنسية، وغيرها.

## معاينة الواجهة
![ui preview](../docs/images/ui_desktop.png)

## 🚀 بدء سريع
### الخطوات الأساسية

First, download the Release executable file that matches your device's system. Follow the instructions below to choose between the desktop or non-desktop version, then place the software in an empty folder. Running the program will generate some directories, so keeping it in an empty folder makes management easier.

[For the desktop version (release files with "desktop" in the name), refer here]  
_The desktop version is newly released to address the difficulty beginners face in editing configuration files correctly. It still has some bugs and is being continuously updated._  

Double-click the file to start using it.

[For the non-desktop version (release files without "desktop" in the name), refer here]  
_The non-desktop version is the original release, with more complex configuration but stable functionality. It is also suitable for server deployment, as it provides a web-based UI._  

Create a `config` folder in the directory, then create a `config.toml` file inside it. Copy the contents of the `config-example.toml` file from the source code's `config` directory into your `config.toml` and fill in your configuration details. (If you want to use OpenAI models but don’t know how to get a key, you can join the group for free trial access.)

Double-click the executable or run it in the terminal to start the service.

Open your browser and enter http://127.0.0.1:8888 to begin using it. (Replace 8888 with the port number you specified in the config file.)

### To: macOS Users
[For the desktop version, i.e., release files with "desktop" in the name, refer here]  
The current packaging method for the desktop version cannot support direct double-click execution or DMG installation due to signing issues. Manual trust configuration is required as follows:

1. Open the directory containing the executable file (assuming the filename is KrillinAI_1.0.0_desktop_macOS_arm64) in Terminal

2. Execute the following commands sequentially:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64  
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64  
./KrillinAI_1.0.0_desktop_macOS_arm64  
```

[For the non-desktop version, i.e., release files without "desktop" in the name, refer here]  
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
This project supports Docker deployment. Please refer to the [Docker Deployment Instructions](../docs/docker.md).

### Cookie Configuration Instructions

If you encounter video download failures, please refer to the [Cookie Configuration Instructions](../docs/get_cookies.md) to configure your cookie information.

### Configuration Help
The quickest and most convenient configuration method:
* Select `openai` for both `transcription_provider` and `llm_provider`. In this way, you only need to fill in `openai.apikey` in the following three major configuration item categories, namely `openai`, `local_model`, and `aliyun`, and then you can conduct subtitle translation. (Fill in `app.proxy`, `model` and `openai.base_url` as per your own situation.)

The configuration method for using the local speech recognition model (macOS is not supported for the time being) (a choice that takes into account cost, speed, and quality):
* Fill in `fasterwhisper` for `transcription_provider` and `openai` for `llm_provider`. In this way, you only need to fill in `openai.apikey` and `local_model.faster_whisper` in the following three major configuration item categories, namely `openai` and `local_model`, and then you can conduct subtitle translation. The local model will be downloaded automatically. (The same applies to `app.proxy` and `openai.base_url` as mentioned above.)

The following usage situations require the configuration of Alibaba Cloud:
* If `llm_provider` is filled with `aliyun`, it indicates that the large model service of Alibaba Cloud will be used. Consequently, the configuration of the `aliyun.bailian` item needs to be set up.
* If `transcription_provider` is filled with `aliyun`, or if the "voice dubbing" function is enabled when starting a task, the voice service of Alibaba Cloud will be utilized. Therefore, the configuration of the `aliyun.speech` item needs to be filled in.
* If the "voice dubbing" function is enabled and local audio files are uploaded for voice timbre cloning at the same time, the OSS cloud storage service of Alibaba Cloud will also be used. Hence, the configuration of the `aliyun.oss` item needs to be filled in.
Configuration Guide: [Alibaba Cloud Configuration Instructions](../docs/aliyun.md)

## Frequently Asked Questions
Please refer to [Frequently Asked Questions](../docs/faq.md)

## Contribution Guidelines

- Do not submit unnecessary files like `.vscode`, `.idea`, etc. Please make good use of `.gitignore` to filter them.
- Do not submit `config.toml`; instead, submit `config-example.toml`.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)

