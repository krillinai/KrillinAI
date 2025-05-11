# دليل نشر Docker

## البدء السريع
قم أولاً بإعداد ملف التكوين، واضبط منفذ الاستماع للخادم على `8888`، وعنوان الاستماع للخادم على `0.0.0.0`.

### بدء تشغيل docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### بدء تشغيل docker-compose
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # ملف التكوين
      - /path/to/tasks:/app/tasks # دليل الإخراج
```

## نماذج الاستمرارية
إذا كنت تستخدم نموذج fasterwhisper، سيقوم KrillinAI بتنزيل الملفات المطلوبة للنموذج تلقائيًا إلى دليل `/app/models` ودليل `/app/bin`. ستفقد هذه الملفات بعد حذف الحاوية. إذا كنت بحاجة إلى استمرارية النموذج، يمكنك ربط هذين الدليلين بدليل المضيف.

### بدء تشغيل docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### بدء تشغيل docker-compose
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml      
      - /path/to/tasks:/app/tasks
      - /path/to/models:/app/models
      - /path/to/bin:/app/bin
```

## ملاحظات
1. إذا لم يكن وضع الشبكة لحاوية docker هو host، يُنصح بتعيين عنوان الاستماع لخادم ملف التكوين على `0.0.0.0`، وإلا قد لا تتمكن من الوصول إلى الخدمة.
2. إذا كانت الحاوية بحاجة إلى الوصول إلى وكيل الشبكة للمضيف، يرجى تعيين عنوان الوكيل في خيار التكوين `proxy` من `127.0.0.1` إلى `host.docker.internal`، على سبيل المثال `http://host.docker.internal:7890`.