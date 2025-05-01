FROM ubuntu:latest

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends wget ca-certificates ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p bin && \
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

COPY KrillinAI ./

RUN mkdir -p /app/models && \
    chmod +x ./KrillinAI

VOLUME ["/app/bin", "/app/models"]

ENV PATH="/app/bin:${PATH}"

EXPOSE 8888/tcp

ENTRYPOINT ["./KrillinAI"]
