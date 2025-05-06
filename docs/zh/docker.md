# Docker 部署指南

## 快速开始
先准备好配置文件，设置服务器监听端口为`8888`、服务器监听地址为`0.0.0.0`

### docker run启动
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### docker-compose启动
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # 配置文件
      - /path/to/tasks:/app/tasks # 输出目录
```

## 持久化模型
如果使用fasterwhisper模型， KrillinAI 会自动下载模型所需文件到`/app/models`目录和`/app/bin`目录。容器删除后，这些文件会丢失。如果需要持久化模型，可以将这两个目录映射到宿主机的目录。

### docker run启动
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### docker-compose启动
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

## 注意事项
1. 如果docker容器的网络模式不为host，建议将配置文件服务器监听地址设置为`0.0.0.0`，否则可能无法访问服务。
2. 如果容器内需要访问宿主机的网络代理，请将代理地址配置项`proxy`的`127.0.0.1`设置为`host.docker.internal`，例如`http://host.docker.internal:7890`
