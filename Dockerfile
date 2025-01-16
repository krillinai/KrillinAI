FROM alpine:latest as builder

# 安装基础工具并创建目录
WORKDIR /build
RUN apk add --no-cache wget && \
    mkdir -p bin && \
    ARCH=$(uname -m) && \
    case "$ARCH" in \
        x86_64) \
            URL="https://github.com/yt-dlp/yt-dlp/releases/download/2025.01.15/yt-dlp_linux"; \
            ;; \
        armv7l) \
            URL="https://github.com/yt-dlp/yt-dlp/releases/download/2025.01.15/yt-dlp_linux_armv7l"; \
            ;; \
        aarch64) \
            URL="https://github.com/yt-dlp/yt-dlp/releases/download/2025.01.15/yt-dlp_linux_aarch64"; \
            ;; \
        *) \
            echo "Unsupported architecture: $ARCH" && exit 1; \
            ;; \
    esac && \
    wget -O bin/yt-dlp "$URL" && \
    chmod +x bin/yt-dlp

# 最终镜像
FROM jrottenberg/ffmpeg:6.1-alpine

# 设置工作目录并复制文件
WORKDIR /app
COPY --from=builder /build/bin /app/bin
COPY KrillinAI ./

# 创建必要目录并设置权限
RUN mkdir -p /app/models && \
    chmod +x ./KrillinAI

# 声明卷
VOLUME ["/app/bin", "/app/models"]

# 设置环境变量
ENV PATH="/app/bin:${PATH}"

# 设置端口
EXPOSE 8888/tcp

# 设置入口点
ENTRYPOINT ["./KrillinAI"]