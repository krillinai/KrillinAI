<div align="center">
  <img src="/docs/images/logo.jpg" alt="KrillinAI" height="90">

# أداة ترجمة ودبلجة الفيديو للبشر / وكلاء الذكاء الاصطناعي (مع مجموعة Skills)

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KrillinAI)

</div>

## مقدمة المشروع  (الإصدار 2.0 مع دعم Agent — جرّبه الآن)
[**البدء السريع**](#-quick-start)

KrillinAI هو حل متعدد الاستخدامات لتوطين الصوت والفيديو وتعزيزه، طوّره فريق Krillin AI وصُمِّم لكل من المستخدمين البشريين ووكلاء الذكاء الاصطناعي. تغطي الأداة المسار الكامل بما في ذلك تنزيل الفيديو، والنسخ الصوتي، وترجمة الترجمات، والتعليق الصوتي TTS، وتحويل الوضع الرأسي، وتوليد الأغلفة، مع دعم التنسيقات الأفقية والرأسية لضمان عرض مثالي على جميع المنصات الرئيسية (Bilibili، Xiaohongshu، Douyin، WeChat Video، Kuaishou، YouTube، TikTok، إلخ). يمكن للمستخدمين البشريين إنجاز توطين المحتوى من البداية إلى النهاية بنقرة واحدة عبر العميل؛ كما يمكن استدعاء كل قدرة بشكل مستقل عبر CLI، ويمكن لوكلاء الذكاء الاصطناعي تنسيق مرحلة واحدة أو مراحل متعددة حسب الحاجة لتأليف سير عمل آلية مرنة.

## الميزات الجديدة

🤖 **دعم CLI**: يوفر واجهة سطر أوامر متدرجة حيث تُنفَّذ كل مرحلة باستقلالية وتُنتج نتائج منظمة، مع دعم إعادة استخدام المخرجات بين المراحل.

🧩 **مجموعة Skills**: يوفر مجلد `skills/` مهارات لكل مرحلة يمكن لوكلاء الذكاء الاصطناعي استدعاؤها مباشرة وفق عقد ثابت، دون الحاجة إلى تحليل وثائق CLI بأنفسهم.

🔗 **تنسيق Pipeline**: ربط مراحل متعددة في أمر واحد، مما يتيح أتمتة كاملة من التنزيل إلى العرض.

🖼️ **توليد الغلاف**: إنشاء صور غلاف للمنصات تلقائياً من صورة مصغرة للفيديو الأصلي وقالب موجّه.

## الميزات والوظائف الرئيسية:

📥 **الحصول على الفيديو**: يدعم تنزيلات yt-dlp أو تحميل الملفات المحلية

📜 **التعرف الدقيق**: التعرف على الكلام بدقة عالية يعتمد على Whisper

🧠 **التقسيم الذكي**: تقسيم وتنسيق الترجمة باستخدام LLM

🔄 **استبدال المصطلحات**: استبدال المصطلحات المهنية بنقرة واحدة

🌍 **ترجمة احترافية**: ترجمة LLM مع سياق للحفاظ على المعاني الطبيعية

🎙️ **استنساخ الصوت**: يقدم نغمات صوتية مختارة من CosyVoice أو استنساخ صوت مخصص

🎬 **تركيب الفيديو**: يعالج تلقائيًا مقاطع الفيديو الأفقية والرأسية وتنسيق الترجمة

💻 **عبر المنصات**: يدعم Windows وLinux وmacOS، ويوفر إصدارات لكل من سطح المكتب والخادم

## عرض التأثير

تظهر الصورة أدناه تأثير ملف الترجمة الذي تم إنشاؤه بعد استيراد فيديو محلي مدته 46 دقيقة وتنفيذه بنقرة واحدة، دون أي تعديلات يدوية. لا توجد أي فوات أو تداخلات، والتقسيم طبيعي، وجودة الترجمة عالية جدًا.
![تأثير المحاذاة](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### ترجمة الترجمة

---

https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### التعليق الصوتي

---

https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### وضع الرأس

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 خدمات التعرف على الكلام المدعومة

_**جميع النماذج المحلية في الجدول أدناه تدعم التثبيت التلقائي للملفات التنفيذية + ملفات النموذج؛ كل ما عليك هو الاختيار، وKlic سيتولى كل شيء من أجلك.**_

| مصدر الخدمة          | المنصات المدعومة | خيارات النموذج                             | محلي/سحابي | ملاحظات                     |
|----------------------|-------------------|--------------------------------------------|-------------|-----------------------------|
| **OpenAI Whisper**   | جميع المنصات      | -                                          | سحابي       | سرعة عالية وتأثير جيد       |
| **FasterWhisper**    | Windows/Linux      | `tiny`/`medium`/`large-v2` (الموصى به medium+) | محلي       | سرعة أعلى، بدون تكلفة خدمة سحابية |
| **WhisperKit**       | macOS (M-series فقط) | `large-v2`                                | محلي       | تحسين محلي لشرائح Apple     |
| **WhisperCpp**       | جميع المنصات      | `large-v2`                                | محلي       | يدعم جميع المنصات           |
| **Alibaba Cloud ASR**| جميع المنصات      | -                                          | سحابي       | يتجنب مشاكل الشبكة في الصين |

## 🚀 دعم نموذج اللغة الكبير

✅ متوافق مع جميع خدمات نموذج اللغة الكبير السحابية/المحلية التي تتوافق مع **مواصفات واجهة برمجة تطبيقات OpenAI**، بما في ذلك على سبيل المثال لا الحصر:

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- نماذج مفتوحة المصدر تم نشرها محليًا
- خدمات واجهة برمجة التطبيقات الأخرى المتوافقة مع تنسيق OpenAI

## 🎤 دعم تحويل النص إلى كلام (TTS)

- خدمة صوت Alibaba Cloud
- OpenAI TTS

## دعم اللغات

اللغات المدخلة المدعومة: الصينية، الإنجليزية، اليابانية، الألمانية، التركية، الكورية، الروسية، الماليزية (تزداد باستمرار)

اللغات المدعومة للترجمة: الإنجليزية، الصينية، الروسية، الإسبانية، الفرنسية، و101 لغة أخرى

## معاينة الواجهة

![معاينة الواجهة](/docs/images/ui_desktop_light.png)
![معاينة الواجهة](/docs/images/ui_desktop_dark.png)

## 🚀 البدء السريع

يمكنك طرح الأسئلة على [Deepwiki of KrillinAI](https://deepwiki.com/krillinai/KrillinAI). يقوم بفهرسة الملفات في المستودع، لذا يمكنك العثور على الإجابات بسرعة.

### الخطوات الأساسية

أولاً، قم بتنزيل الملف التنفيذي الذي يتناسب مع نظام جهازك من [الإصدار](https://github.com/KrillinAI/KrillinAI/releases)، ثم اتبع الدليل أدناه للاختيار بين إصدار سطح المكتب أو الإصدار غير المكتبي. ضع تحميل البرنامج في مجلد فارغ، حيث أن تشغيله سيولد بعض الدلائل، والحفاظ عليه في مجلد فارغ سيسهل الإدارة.

【إذا كان إصدار سطح المكتب، أي ملف الإصدار الذي يحتوي على "desktop"، انظر هنا】
_تم إصدار إصدار سطح المكتب حديثًا لمعالجة مشكلات المستخدمين الجدد الذين يواجهون صعوبة في تحرير ملفات التكوين بشكل صحيح، وهناك بعض الأخطاء التي يتم تحديثها باستمرار._

1. انقر نقرًا مزدوجًا على الملف لبدء استخدامه (يتطلب إصدار سطح المكتب أيضًا تكوينًا داخل البرنامج)

【إذا كان الإصدار غير المكتبي، أي ملف الإصدار بدون "desktop"، انظر هنا】
_الإصدار غير المكتبي هو الإصدار الأولي، والذي يحتوي على تكوين أكثر تعقيدًا ولكنه مستقر في الوظائف ومناسب للنشر على الخادم، حيث يوفر واجهة مستخدم بتنسيق ويب._

1. أنشئ مجلد `config` داخل المجلد، ثم أنشئ ملف `config.toml` في مجلد `config`. انسخ محتويات ملف `config-example.toml` من دليل `config` في الشيفرة المصدرية إلى `config.toml`، واملأ معلومات التكوين الخاصة بك وفقًا للتعليقات.
2. انقر نقرًا مزدوجًا أو نفذ الملف التنفيذي في الطرفية لبدء الخدمة
3. افتح متصفحك وأدخل `http://127.0.0.1:8888` لبدء استخدامه (استبدل 8888 بالمنفذ الذي حددته في ملف التكوين)

### إلى: مستخدمي macOS

【إذا كان إصدار سطح المكتب، أي ملف الإصدار الذي يحتوي على "desktop"، انظر هنا】
بسبب مشكلات التوقيع، لا يمكن حاليًا تشغيل إصدار سطح المكتب بنقرة مزدوجة أو تثبيته عبر dmg؛ تحتاج إلى الوثوق بالبرنامج يدويًا. الطريقة هي كما يلي:

1. افتح الطرفية في الدليل حيث يوجد الملف التنفيذي (افترض أن اسم الملف هو KrillinAI_1.0.0_desktop_macOS_arm64)
2. نفذ الأوامر التالية بالترتيب:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【إذا كان الإصدار غير المكتبي، أي ملف الإصدار بدون "desktop"، انظر هنا】
هذا البرنامج غير موقع، لذا عند التشغيل على macOS، بعد إكمال تكوين الملف في "الخطوات الأساسية"، تحتاج أيضًا إلى الوثوق بالبرنامج يدويًا. الطريقة هي كما يلي:

1. افتح الطرفية في الدليل حيث يوجد الملف التنفيذي (افترض أن اسم الملف هو KrillinAI_1.0.0_macOS_arm64)
2. نفذ الأوامر التالية بالترتيب:
   ```
   sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
   sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
   ./KrillinAI_1.0.0_macOS_arm64
   ```

   سيبدأ هذا الخدمة

### نشر Docker

يدعم هذا المشروع نشر Docker؛ يرجى الرجوع إلى [تعليمات نشر Docker](./docker.md)

### استخدام CLI

يوفر KrillinAI الآن واجهة أوامر مرحلية مناسبة للسكريبتات وخطوط الأتمتة ووكلاء الذكاء الاصطناعي. تعمل الأوامر بشكل متزامن افتراضيًا، وتطبع في stdout سطر JSON واحدًا عند الانتهاء، وتكتب `krillinai_manifest.json` في مجلد العمل حتى تتمكن المراحل اللاحقة من إعادة استخدام المخرجات.

بناء CLI من المصدر:

```bash
go build -o build/krillinai-cli ./cmd/cli
```

نظرة عامة على الأوامر:

| الأمر | الغرض | المخرجات الشائعة |
|---|---|---|
| `subtitle` | إنشاء ترجمات من رابط YouTube / Bilibili أو فيديو محلي؛ يفضل تنزيل ترجمات المنصة ثم يعود إلى Whisper عند الفشل | `origin_language_srt.srt`، `target_language_srt.srt`، `bilingual_srt.srt`، `short_origin_mixed_srt.srt` |
| `tts` | إنشاء دبلجة باللغة الهدف من الترجمة الهدف | `tts_final_audio.wav`، `video_with_tts.mp4` |
| `render-horizontal` | إنشاء فيديو أفقي: الفيديو الأصلي + ترجمة ثنائية، أو فيديو مدبلج + ترجمة باللغة الهدف | `horizontal_bilingual.mp4` |
| `render-vertical` | إنشاء فيديو عمودي: تحويل الفيديو الأصلي إلى عمودي + ترجمة قصيرة، أو فيديو مدبلج + ترجمة باللغة الهدف | `transferred_vertical_video.mp4`، `vertical_bilingual.mp4` |
| `pipeline` | ربط عدة مراحل حسب قيمة outputs | يعتمد على المراحل المحددة |
| `cover` | إنشاء غلاف من غلاف الفيديو الأصلي وقالب prompt | `generated_cover.png` |

سير عمل نموذجي:

```bash
# 1. إنشاء ترجمات المصدر والهدف والترجمة الثنائية والترجمة القصيرة للفيديو العمودي
./build/krillinai-cli subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo \
  --caption-source any

# 2. إنشاء الدبلجة من ترجمة اللغة الهدف
./build/krillinai-cli tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt \
  --line-mode target-only \
  --video tasks/demo/origin_video.mp4

# 3. إنشاء فيديو أفقي بترجمة ثنائية
./build/krillinai-cli render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/bilingual_srt.srt

# 4. إنشاء فيديو عمودي بترجمة ثنائية قصيرة
./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/short_origin_mixed_srt.srt \
  --major-title "موضوع اليوم" \
  --minor-title "AI Video"
```

اتفاقيات تكامل Agent:

- اقرأ آخر سطر JSON في stdout وملف `krillinai_manifest.json` أولًا؛ لا تعتمد على تحليل السجلات العادية.
- يسجل حقل `outputs` مسارات المخرجات، ويمكن للأوامر اللاحقة استخدام `--workdir` فقط لإعادة استخدام manifest.
- يدعم `--dry-run` للتحقق من المعلمات وإنشاء manifest دون تنزيل فيديو أو استدعاء خدمات ذكاء اصطناعي خارجية.
- عالج الأخطاء حسب `error.kind`: `usage` لتصحيح المعلمات، و`retryable` لإعادة المحاولة، و`dependency` لتثبيت `ffmpeg` / `ffprobe` / `yt-dlp`.

للحصول على شرح أكثر تفصيلًا للمعلمات، راجع [ملخص قدرات CLI](../zh/cli.md).

### Agent Skills

يوفر المستودع أيضًا Skills جاهزة للاستخدام داخل `skills/` حتى تتمكن الوكلاء من استدعاء CLI وفق اتفاقيات مستقرة:

- [`krillinai-cli`](../../skills/krillinai-cli/SKILL.md): skill المدخل العام لاختيار سير عمل الترجمة، TTS، التصيير، pipeline أو الغلاف.
- [`krillinai-subtitle`](../../skills/krillinai-subtitle/SKILL.md)، [`krillinai-tts`](../../skills/krillinai-tts/SKILL.md)، [`krillinai-render-horizontal`](../../skills/krillinai-render-horizontal/SKILL.md)، و[`krillinai-render-vertical`](../../skills/krillinai-render-vertical/SKILL.md): أدلة تشغيل خاصة بكل مرحلة.
- [`krillinai-pipeline`](../../skills/krillinai-pipeline/SKILL.md) و[`krillinai-cover`](../../skills/krillinai-cover/SKILL.md): أدلة تخطيط/واجهات محجوزة لتنظيم pipeline وتوليد الغلاف إلى أن يتم توصيل مسارات التنفيذ بالكامل.
- [`cli-contract.md`](../../skills/krillinai-cli/references/cli-contract.md): عقد JSON وmanifest والمخرجات ومعالجة الأخطاء المشترك.

استنادًا إلى ملف التكوين المقدم، إليك قسم "مساعدة التكوين (يجب قراءته)" المحدث لملف README الخاص بك:

### مساعدة التكوين (يجب قراءته)

ملف التكوين مقسم إلى عدة أقسام: `[app]`، `[server]`، `[llm]`، `[transcribe]`، و`[tts]`. تتكون المهمة من التعرف على الكلام (`transcribe`) + ترجمة النموذج الكبير (`llm`) + خدمات الصوت الاختيارية (`tts`). سيساعدك فهم ذلك على فهم ملف التكوين بشكل أفضل.

**أسهل وأسرع تكوين:**

**لترجمة الترجمة فقط:**
   * في قسم `[transcribe]`، قم بتعيين `provider.name` إلى `openai`.
   * بعد ذلك، ستحتاج فقط إلى ملء مفتاح واجهة برمجة تطبيقات OpenAI الخاص بك في كتلة `[llm]` لبدء إجراء ترجمات الترجمة. يمكن ملء `app.proxy` و`model` و`openai.base_url` حسب الحاجة.

**تكلفة متوازنة، سرعة، وجودة (باستخدام التعرف على الكلام المحلي):**

* في قسم `[transcribe]`، قم بتعيين `provider.name` إلى `fasterwhisper`.
* قم بتعيين `transcribe.fasterwhisper.model` إلى `large-v2`.
* املأ تكوين نموذج اللغة الكبير الخاص بك في كتلة `[llm]`.
* سيتم تنزيل النموذج المحلي المطلوب وتثبيته تلقائيًا.

**تكوين تحويل النص إلى كلام (TTS) (اختياري):**

* تكوين TTS اختياري.
* أولاً، قم بتعيين `provider.name` تحت قسم `[tts]` (مثل `aliyun` أو `openai`).
* ثم، املأ كتلة التكوين المقابلة لمزود الخدمة المحدد. على سبيل المثال، إذا اخترت `aliyun`، يجب عليك ملء قسم `[tts.aliyun]`.
* يجب اختيار رموز الصوت في واجهة المستخدم بناءً على وثائق المزود المحدد.
* **ملاحظة:** إذا كنت تخطط لاستخدام ميزة استنساخ الصوت، يجب عليك اختيار `aliyun` كمزود TTS.

**تكوين Alibaba Cloud:**

* للحصول على تفاصيل حول الحصول على `AccessKey` و`Bucket` و`AppKey` اللازمة لخدمات Alibaba Cloud، يرجى الرجوع إلى [تعليمات تكوين Alibaba Cloud](https://www.google.com/search?q=./aliyun.md). تم تصميم الحقول المتكررة لـ AccessKey، إلخ، للحفاظ على هيكل تكوين واضح.

## الأسئلة المتكررة

يرجى زيارة [الأسئلة المتكررة](./faq.md)

## إرشادات المساهمة

1. لا تقدم ملفات غير مفيدة، مثل .vscode، .idea، إلخ؛ يرجى استخدام .gitignore لتصفية هذه الملفات.
2. لا تقدم config.toml؛ بدلاً من ذلك، قدم config-example.toml.

## اتصل بنا

1. انضم إلى مجموعة QQ الخاصة بنا لطرح الأسئلة: 754069680
2. تابع حساباتنا على وسائل التواصل الاجتماعي، [Bilibili](https://space.bilibili.com/242124650)، حيث نشارك محتوى عالي الجودة في مجال تكنولوجيا الذكاء الاصطناعي كل يوم.

## تاريخ النجوم

[![مخطط تاريخ النجوم](https://api.star-history.com/svg?repos=KrillinAI/KrillinAI&type=Date)](https://star-history.com/#KrillinAI/KrillinAI&Date)
