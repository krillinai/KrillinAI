# Docker 部署指南

## 方法1. 使用配置文件
先准备好配置文件，假设服务器监听端口为8888，服务器监听地址为0.0.0.0

### docker run启动
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  ghcr.io/krillinai/krillin
```

### docker-compose启动
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

## 方法2. 使用环境变量

KrillinAI 支持通过环境变量来代替配置文件。所有环境变量都以 `KRILLIN_` 为前缀。

### 应用配置
- `KRILLIN_SEGMENT_DURATION`: 视频分段时长（整数，默认值: 5）
- `KRILLIN_TRANSLATE_PARALLEL_NUM`: 翻译并行数（整数，默认值: 5，使用fasterwhisper时强制为1）
- `KRILLIN_PROXY`: 代理服务器地址（可选，默认值: 空）
- `KRILLIN_TRANSCRIBE_PROVIDER`: 转写服务提供商（默认值: openai，可选: openai/fasterwhisper/aliyun）
- `KRILLIN_LLM_PROVIDER`: LLM 服务提供商（默认值: openai，可选: openai/aliyun）

### 服务器配置
- `KRILLIN_SERVER_HOST`: 服务器监听地址（默认值: 127.0.0.1，docker中推荐设置为0.0.0.0）
- `KRILLIN_SERVER_PORT`: 服务器监听端口（整数，默认值: 8888）

### 本地模型配置
- `KRILLIN_LOCAL_WHISPER`: Local Whisper 所使用的模型（当 transcribe_provider 为 fasterwhisper 或 whisperkit 时有效，默认值: medium，可选: tiny/medium/large-v2）

### OpenAI 配置
- `KRILLIN_OPENAI_BASE_URL`: OpenAI API 基础 URL（可选，默认值: 官方 API 地址）
- `KRILLIN_OPENAI_MODEL`: OpenAI 模型名称（可选，默认值: gpt-4-mini）
- `KRILLIN_OPENAI_API_KEY`: OpenAI API 密钥（当使用 OpenAI 服务时必填）

### 阿里云配置

#### OSS 配置（用于音色克隆功能）
- `KRILLIN_ALIYUN_OSS_ACCESS_KEY_ID`: 阿里云 OSS AccessKey ID（使用音色克隆功能时必填）
- `KRILLIN_ALIYUN_OSS_ACCESS_KEY_SECRET`: 阿里云 OSS AccessKey Secret（使用音色克隆功能时必填）
- `KRILLIN_ALIYUN_OSS_BUCKET`: 阿里云 OSS Bucket 名称（使用音色克隆功能时必填）

#### 语音服务配置（用于语音识别或配音功能）
- `KRILLIN_ALIYUN_SPEECH_ACCESS_KEY_ID`: 阿里云语音服务 AccessKey ID（使用阿里云语音服务时必填）
- `KRILLIN_ALIYUN_SPEECH_ACCESS_KEY_SECRET`: 阿里云语音服务 AccessKey Secret（使用阿里云语音服务时必填）
- `KRILLIN_ALIYUN_SPEECH_APP_KEY`: 阿里云语音服务 AppKey（使用阿里云语音服务时必填）

#### 百炼配置（用于 LLM）
- `KRILLIN_ALIYUN_BAILIAN_API_KEY`: 阿里云百炼 API 密钥（当 llm_provider 为 aliyun 时必填）

### docker run启动（最简配置示例）
```bash
docker run -d \
  -p 8888:8888 \
  -e KRILLIN_SERVER_HOST=0.0.0.0 \
  -e KRILLIN_OPENAI_API_KEY=your-api-key \
  ghcr.io/krillinai/krillin
```

### docker-compose启动（最简配置示例）
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

## 持久化模型
如果使用fasterwhisper模型， KrillinAI 会自动下载模型所需文件到`/app/models`目录和`/app/bin`目录。容器删除后，这些文件会丢失。如果需要持久化模型，可以将这两个目录映射到宿主机的目录。

### docker run启动
```bash
docker run -d \
  # ...其他参数
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  ghcr.io/krillinai/krillin
```

### docker-compose启动
```yaml
version: '3'
services:
  krillin:
    image: ghcr.io/krillinai/krillin
    # ...其他参数
    volumes:
      # ...其他映射
      - /path/to/models:/app/models
      - /path/to/bin:/app/bin
```

## 注意事项
1. 环境变量的值会覆盖配置文件中的对应设置。即环境变量优先级高于配置文件。不推荐混合使用配置文件和环境变量。
2. 配置文件和环境变量二选一即可，推荐使用环境变量方式。
3. 如果docker容器的网络模式不为host，建议将配置文件服务器监听地址设置为0.0.0.0，否则可能无法访问服务。
4. 如果容器内需要访问宿主机的网络代理，请将代理地址配置项`proxy`的`127.0.0.1`设置为`host.docker.internal`，例如`http://host.docker.internal:7890`