## Предварительные условия
Необходимо иметь аккаунт на [Alibaba Cloud](https://www.aliyun.com) и пройти процедуру реальной идентификации, большинство услуг имеют бесплатный лимит.

## Получение ключа платформы Alibaba Cloud BaiLian
1. Войдите на [платформу услуг больших моделей Alibaba Cloud BaiLian](https://bailian.console.aliyun.com/), наведите курсор на иконку личного кабинета в правом верхнем углу страницы и в выпадающем меню нажмите на API-KEY.
![百炼](/docs/images/bailian_1.png)
2. В левом навигационном меню выберите "Все API-KEY" или "Мои API-KEY", затем создайте или просмотрите API Key.

## Получение `access_key_id` и `access_key_secret` Alibaba Cloud
1. Перейдите на [страницу управления AccessKey Alibaba Cloud](https://ram.console.aliyun.com/profile/access-keys).
2. Нажмите "Создать AccessKey", если необходимо, выберите способ использования, выберите "Использование в локальной среде разработки".
![阿里云access key](/docs/images/aliyun_accesskey_1.png)
3. Храните в надежном месте, лучше скопируйте в локальный файл для сохранения.

## Подключение голосового сервиса Alibaba Cloud
1. Перейдите на [страницу управления голосовым сервисом Alibaba Cloud](https://nls-portal.console.aliyun.com/applist), при первом входе необходимо активировать услугу.
2. Нажмите "Создать проект".
![阿里云speech](/docs/images/aliyun_speech_1.png)
3. Выберите функции и активируйте их.
![阿里云speech](/docs/images/aliyun_speech_2.png)
4. "Потоковая текстовая синтезация речи (модель CosyVoice)" требует обновления до коммерческой версии, другие услуги можно использовать в бесплатной пробной версии.
![阿里云speech](/docs/images/aliyun_speech_3.png)
5. Скопируйте app key.
![阿里云speech](/docs/images/aliyun_speech_4.png)

## Подключение услуги OSS Alibaba Cloud
1. Перейдите на [консоль управления объектным хранилищем Alibaba Cloud](https://oss.console.aliyun.com/overview), при первом входе необходимо активировать услугу.
2. Выберите "Список Bucket" слева, затем нажмите "Создать".
![阿里云OSS](/docs/images/aliyun_oss_1.png)
3. Выберите "Быстрое создание", введите имя Bucket, соответствующее требованиям, и выберите регион **Шанхай**, завершите создание (имя, введенное здесь, будет значением конфигурационного параметра `aliyun.oss.bucket`).
![阿里云OSS](/docs/images/aliyun_oss_2.png)
4. После создания перейдите в Bucket.
![阿里云OSS](/docs/images/aliyun_oss_3.png)
5. Отключите переключатель "Запретить общий доступ" и установите права на чтение и запись как "Общий доступ для чтения".
![阿里云OSS](/docs/images/aliyun_oss_4.png)
![阿里云OSS](/docs/images/aliyun_oss_5.png)