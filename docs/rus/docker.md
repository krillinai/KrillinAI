# Руководство по развертыванию Docker

## Быстрый старт
Сначала подготовьте файл конфигурации, установите порт прослушивания сервера на `8888`, адрес прослушивания сервера на `0.0.0.0`.

### Запуск с помощью docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### Запуск с помощью docker-compose
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # Файл конфигурации
      - /path/to/tasks:/app/tasks # Каталог вывода
```

## Периодическое сохранение модели
Если используется модель fasterwhisper, KrillinAI автоматически загрузит необходимые файлы модели в каталоги `/app/models` и `/app/bin`. После удаления контейнера эти файлы будут потеряны. Если необходимо сохранить модель, можно смонтировать эти два каталога в каталог хоста.

### Запуск с помощью docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### Запуск с помощью docker-compose
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

## Важные замечания
1. Если сетевой режим контейнера Docker не является host, рекомендуется установить адрес прослушивания сервера конфигурационного файла на `0.0.0.0`, иначе может возникнуть проблема с доступом к сервису.
2. Если контейнеру необходимо получить доступ к сетевому прокси хоста, измените параметр конфигурации прокси `proxy` с `127.0.0.1` на `host.docker.internal`, например `http://host.docker.internal:7890`.