FROM alpine:latest

# 创建并切换工作目录
WORKDIR /app

# 复制二进制文件
COPY KrillinAI ./

# 设置可执行权限
RUN chmod +x ./KrillinAI

# 设置入口点
ENTRYPOINT ["./KrillinAI"]