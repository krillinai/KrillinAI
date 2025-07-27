# Docker Deployment Guide

## Quick Start
First, prepare the configuration file, setting the server listening port to `8888` and the server listening address to `0.0.0.0`.

### Starting with docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### Starting with docker-compose
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # Configuration file
      - /path/to/tasks:/app/tasks # Output directory
```

## Persisting Models
If using the fasterwhisper model, KrillinAI will automatically download the necessary files to the `/app/models` and `/app/bin` directories. These files will be lost when the container is deleted. To persist the models, you can map these two directories to a directory on the host.

### Starting with docker run
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### Starting with docker-compose
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

## Notes
1. If the network mode of the Docker container is not set to host, it is recommended to set the server listening address in the configuration file to `0.0.0.0`, otherwise the service may not be accessible.
2. If the container needs to access the host's network proxy, please set the proxy address configuration item `proxy`'s `127.0.0.1` to `host.docker.internal`, for example, `http://host.docker.internal:7890`.