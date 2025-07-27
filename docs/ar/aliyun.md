## المتطلبات الأساسية
يجب أن يكون لديك حساب على [Alibaba Cloud](https://www.aliyun.com) وإكمال التحقق من الهوية. معظم الخدمات لديها حصص مجانية.

## الحصول على `access_key_id` و `access_key_secret` من Alibaba Cloud
1. انتقل إلى [صفحة إدارة AccessKey في Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. انقر على "إنشاء AccessKey". إذا لزم الأمر، اختر طريقة الاستخدام كـ "مستخدمة في بيئة تطوير محلية."
![Alibaba Cloud access key](/docs/images/aliyun_accesskey_1.png)
3. احتفظ به في مكان آمن؛ من الأفضل نسخه إلى ملف محلي للتخزين.

## تفعيل خدمة الصوت من Alibaba Cloud
1. انتقل إلى [صفحة إدارة خدمة الصوت من Alibaba Cloud](https://nls-portal.console.aliyun.com/applist). تحتاج إلى تفعيل الخدمة في زيارتك الأولى.
2. انقر على "إنشاء مشروع."
![Alibaba Cloud speech](/docs/images/aliyun_speech_1.png)
3. اختر الميزات وقم بتفعيلها.
![Alibaba Cloud speech](/docs/images/aliyun_speech_2.png)
4. يحتاج "البث النصي إلى كلام (نموذج CosyVoice الكبير)" إلى الترقية إلى النسخة التجارية؛ يمكن استخدام الخدمات الأخرى النسخة التجريبية المجانية.
![Alibaba Cloud speech](/docs/images/aliyun_speech_3.png)
5. ببساطة انسخ مفتاح التطبيق.
![Alibaba Cloud speech](/docs/images/aliyun_speech_4.png)

## تفعيل خدمة OSS من Alibaba Cloud
1. انتقل إلى [وحدة تخزين الكائنات من Alibaba Cloud](https://oss.console.aliyun.com/overview). تحتاج إلى تفعيل الخدمة في زيارتك الأولى.
2. اختر قائمة الدلاء على اليسار، ثم انقر على "إنشاء."
![Alibaba Cloud OSS](/docs/images/aliyun_oss_1.png)
3. اختر "إنشاء سريع"، املأ اسم دلاء متوافق، واختر منطقة **شنغهاي** لإكمال الإنشاء (الاسم الذي تدخله هنا سيكون القيمة لعنصر التكوين `aliyun.oss.bucket`).
![Alibaba Cloud OSS](/docs/images/aliyun_oss_2.png)
4. بعد الإنشاء، ادخل إلى الدلاء.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_3.png)
5. قم بإيقاف تشغيل مفتاح "حظر الوصول العام" واضبط أذونات القراءة والكتابة على "قراءة عامة."
![Alibaba Cloud OSS](/docs/images/aliyun_oss_4.png)
![Alibaba Cloud OSS](/docs/images/aliyun_oss_5.png)