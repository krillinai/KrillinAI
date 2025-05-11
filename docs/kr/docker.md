# Docker 배포 가이드

## 빠른 시작
먼저 구성 파일을 준비하고, 서버 리스닝 포트를 `8888`로, 서버 리스닝 주소를 `0.0.0.0`으로 설정합니다.

### docker run 시작
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### docker-compose 시작
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # 구성 파일
      - /path/to/tasks:/app/tasks # 출력 디렉토리
```

## 모델 지속성
fasterwhisper 모델을 사용하는 경우, KrillinAI는 모델에 필요한 파일을 `/app/models` 디렉토리와 `/app/bin` 디렉토리로 자동 다운로드합니다. 컨테이너가 삭제되면 이러한 파일은 사라집니다. 모델을 지속적으로 유지하려면 이 두 디렉토리를 호스트 머신의 디렉토리에 매핑할 수 있습니다.

### docker run 시작
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### docker-compose 시작
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

## 주의 사항
1. docker 컨테이너의 네트워크 모드가 host가 아닐 경우, 구성 파일의 서버 리스닝 주소를 `0.0.0.0`으로 설정하는 것이 좋습니다. 그렇지 않으면 서비스에 접근할 수 없을 수 있습니다.
2. 컨테이너 내에서 호스트 머신의 네트워크 프록시에 접근해야 하는 경우, 프록시 주소 구성 항목 `proxy`의 `127.0.0.1`을 `host.docker.internal`로 설정하십시오. 예: `http://host.docker.internal:7890`