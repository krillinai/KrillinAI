# Docker Bereitstellungsanleitung

## Schnellstart
Bereiten Sie zunächst die Konfigurationsdatei vor und setzen Sie den Server-Listener-Port auf `8888` und die Server-Listener-Adresse auf `0.0.0.0`.

### docker run starten
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### docker-compose starten
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # Konfigurationsdatei
      - /path/to/tasks:/app/tasks # Ausgabeverzeichnis
```

## Modellpersistenz
Wenn das fasterwhisper-Modell verwendet wird, lädt KrillinAI automatisch die benötigten Dateien in das Verzeichnis `/app/models` und das Verzeichnis `/app/bin`. Diese Dateien gehen verloren, wenn der Container gelöscht wird. Um das Modell zu persistieren, können Sie diese beiden Verzeichnisse auf ein Verzeichnis des Hosts abbilden.

### docker run starten
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### docker-compose starten
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

## Hinweise
1. Wenn der Netzwerkmodus des Docker-Containers nicht `host` ist, wird empfohlen, die Server-Listener-Adresse der Konfigurationsdatei auf `0.0.0.0` zu setzen, da sonst der Zugriff auf den Dienst möglicherweise nicht möglich ist.
2. Wenn der Container auf den Netzwerkproxy des Hosts zugreifen muss, setzen Sie die Proxy-Adresse in der Konfiguration `proxy` von `127.0.0.1` auf `host.docker.internal`, z. B. `http://host.docker.internal:7890`.