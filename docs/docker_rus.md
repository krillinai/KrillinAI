# Руководство по развертыванию Docker

## Метод 1. Использование конфигурационного файла
Сначала подготовьте конфигурационный файл, предположим, что порт сервера - 8888, а адрес прослушивания - 0.0.0.0

### Запуск с docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  ghcr.io/krillinai/krillin
```

### Запуск с docker-compose
```yaml
version: '3'
services:
  krillin:
    image: ghcr.io/krillinai/krillin
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml
```

## Метод 2. Использование переменных окружения

KrillinAI поддерживает использование переменных окружения вместо конфигурационного файла. Все переменные окружения имеют префикс `KRILLIN_`.

### Конфигурация приложения
- `KRILLIN_SEGMENT_DURATION`: Длительность сегмента видео (целое число, по умолчанию: 5)
- `KRILLIN_TRANSLATE_PARALLEL_NUM`: Количество параллельных процессов перевода (целое число, по умолчанию: 5, принудительно установлено на 1 при использовании fasterwhisper)
- `KRILLIN_PROXY`: Адрес прокси-сервера (необязательно, по умолчанию: пусто)
- `KRILLIN_TRANSCRIBE_PROVIDER`: Поставщик службы транскрибации (по умолчанию: openai, варианты: openai/fasterwhisper/aliyun)
- `KRILLIN_LLM_PROVIDER`: Поставщик службы LLM (по умолчанию: openai, варианты: openai/aliyun)

### Конфигурация сервера
- `KRILLIN_SERVER_HOST`: Адрес прослушивания сервера (по умолчанию: 127.0.0.1, рекомендуется установить 0.0.0.0 в Docker)
- `KRILLIN_SERVER_PORT`: Порт прослушивания сервера (целое число, по умолчанию: 8888)

### Конфигурация локальной модели
- `KRILLIN_LOCAL_WHISPER`: Модель, используемая для Local Whisper (действительно, когда transcribe_provider - fasterwhisper или whisperkit, по умолчанию: medium, варианты: tiny/medium/large-v2)

### Конфигурация OpenAI
- `KRILLIN_OPENAI_BASE_URL`: Базовый URL API OpenAI (необязательно, по умолчанию: официальный адрес API)
- `KRILLIN_OPENAI_MODEL`: Название модели OpenAI (необязательно, по умолчанию: gpt-4-mini)
- `KRILLIN_OPENAI_API_KEY`: Ключ API OpenAI (обязательно при использовании сервисов OpenAI)

### Конфигурация Alibaba Cloud

#### Конфигурация OSS (для функции клонирования голоса)
- `KRILLIN_ALIYUN_OSS_ACCESS_KEY_ID`: Alibaba Cloud OSS AccessKey ID (обязательно при использовании функции клонирования голоса)
- `KRILLIN_ALIYUN_OSS_ACCESS_KEY_SECRET`: Alibaba Cloud OSS AccessKey Secret (обязательно при использовании функции клонирования голоса)
- `KRILLIN_ALIYUN_OSS_BUCKET`: Имя бакета Alibaba Cloud OSS (обязательно при использовании функции клонирования голоса)

#### Конфигурация голосовой службы (для распознавания речи или озвучивания)
- `KRILLIN_ALIYUN_SPEECH_ACCESS_KEY_ID`: Alibaba Cloud Speech AccessKey ID (обязательно при использовании голосовой службы Alibaba Cloud)
- `KRILLIN_ALIYUN_SPEECH_ACCESS_KEY_SECRET`: Alibaba Cloud Speech AccessKey Secret (обязательно при использовании голосовой службы Alibaba Cloud)
- `KRILLIN_ALIYUN_SPEECH_APP_KEY`: Alibaba Cloud Speech AppKey (обязательно при использовании голосовой службы Alibaba Cloud)

#### Конфигурация Bailian (для LLM)
- `KRILLIN_ALIYUN_BAILIAN_API_KEY`: Ключ API Alibaba Cloud Bailian (обязательно, когда llm_provider - aliyun)

### Запуск с docker run (пример минимальной конфигурации)
```bash
docker run -d \
  -p 8888:8888 \
  -e KRILLIN_SERVER_HOST=0.0.0.0 \
  -e KRILLIN_OPENAI_API_KEY=your-api-key \
  ghcr.io/krillinai/krillin
```

### Запуск с docker-compose (пример минимальной конфигурации)
```yaml
version: '3'
services:
  krillin:
    image: ghcr.io/krillinai/krillin
    ports:
      - "8888:8888"
    environment:
      - KRILLIN_SERVER_HOST=0.0.0.0
      - KRILLIN_OPENAI_API_KEY=your-api-key
```

## Сохранение моделей
При использовании модели fasterwhisper, KrillinAI автоматически загружает необходимые файлы в директории `/app/models` и `/app/bin`. После удаления контейнера эти файлы будут потеряны. Если вам нужно сохранить модели, вы можете подключить эти две директории к директориям на хост-машине.

### Запуск с docker run
```bash
docker run -d \
  # ...другие параметры
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  ghcr.io/krillinai/krillin
```

### Запуск с docker-compose
```yaml
version: '3'
services:
  krillin:
    image: ghcr.io/krillinai/krillin
    # ...другие параметры
    volumes:
      # ...другие подключения
      - /path/to/models:/app/models
      - /path/to/bin:/app/bin
```

## Примечания
1. Значения переменных окружения переопределяют соответствующие настройки в конфигурационном файле. То есть, переменные окружения имеют более высокий приоритет, чем конфигурационный файл. Не рекомендуется совместное использование конфигурационного файла и переменных окружения.
2. Можно использовать либо конфигурационный файл, либо переменные окружения, рекомендуется использовать переменные окружения.
3. Если сетевой режим контейнера Docker не установлен на host, рекомендуется установить адрес прослушивания сервера в конфигурационном файле на 0.0.0.0, иначе сервис может быть недоступен.
4. Если внутри контейнера требуется доступ к сетевому прокси хост-машины, измените адрес прокси в параметре конфигурации `proxy` с `127.0.0.1` на `host.docker.internal`, например, `http://host.docker.internal:7890`
