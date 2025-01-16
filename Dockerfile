FROM alpine:latest as builder

# 安装基础工具并创建目录
WORKDIR /build
RUN apk add --no-cache wget unzip && \
    mkdir -p bin

# 下载并安装所有依赖
RUN wget -O bin/ffmpeg.zip https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/ffmpeg-6.1-linux-64.zip && \
    unzip bin/ffmpeg.zip -d bin && \
    rm bin/ffmpeg.zip && \
    chmod +x bin/ffmpeg && \
    wget -O bin/ffprobe.zip https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/ffprobe-6.1-linux-64.zip && \
    unzip bin/ffprobe.zip -d bin && \
    rm bin/ffprobe.zip && \
    chmod +x bin/ffprobe && \
    wget -O bin/yt-dlp https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/yt-dlp_linux && \
    chmod +x bin/yt-dlp

# 最终镜像
FROM alpine:latest

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

# 设置入口点
ENTRYPOINT ["./KrillinAI"]