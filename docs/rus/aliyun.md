## Предварительные требования
Вам необходимо иметь учетную запись [Alibaba Cloud](https://www.aliyun.com) и пройти проверку реального имени. Большинство услуг имеют бесплатные квоты.

## Получение `access_key_id` и `access_key_secret` Alibaba Cloud
1. Перейдите на [страницу управления AccessKey Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Нажмите "Создать AccessKey". При необходимости выберите способ использования как "Используется в локальной среде разработки".
![Access key Alibaba Cloud](/docs/images/aliyun_accesskey_1.png)
3. Храните его в безопасности; лучше всего скопировать его в локальный файл для хранения.

## Активация голосового сервиса Alibaba Cloud
1. Перейдите на [страницу управления голосовым сервисом Alibaba Cloud](https://nls-portal.console.aliyun.com/applist). Вам необходимо активировать сервис при первом посещении.
2. Нажмите "Создать проект".
![Речь Alibaba Cloud](/docs/images/aliyun_speech_1.png)
3. Выберите функции и активируйте их.
![Речь Alibaba Cloud](/docs/images/aliyun_speech_2.png)
4. "Потоковая синтезация речи (модель CosyVoice Large)" должна быть обновлена до коммерческой версии; другие услуги могут использовать бесплатную пробную версию.
![Речь Alibaba Cloud](/docs/images/aliyun_speech_3.png)
5. Просто скопируйте ключ приложения.
![Речь Alibaba Cloud](/docs/images/aliyun_speech_4.png)

## Активация сервиса OSS Alibaba Cloud
1. Перейдите на [консоль сервиса объектного хранения Alibaba Cloud](https://oss.console.aliyun.com/overview). Вам необходимо активировать сервис при первом посещении.
2. Выберите список Bucket слева, затем нажмите "Создать".
![OSS Alibaba Cloud](/docs/images/aliyun_oss_1.png)
3. Выберите "Быстрое создание", заполните имя Bucket, соответствующее требованиям, и выберите регион **Шанхай** для завершения создания (имя, которое вы вводите здесь, будет значением для элемента конфигурации `aliyun.oss.bucket`).
![OSS Alibaba Cloud](/docs/images/aliyun_oss_2.png)
4. После создания войдите в Bucket.
![OSS Alibaba Cloud](/docs/images/aliyun_oss_3.png)
5. Выключите переключатель "Блокировать публичный доступ" и установите права на чтение и запись на "Публичное чтение".
![OSS Alibaba Cloud](/docs/images/aliyun_oss_4.png)
![OSS Alibaba Cloud](/docs/images/aliyun_oss_5.png)