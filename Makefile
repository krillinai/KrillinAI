# Makefile

APP_NAME=KrillinAI

OUTPUT_DIR=build

# 目标平台
PLATFORMS=\
    "darwin/arm64" \
    "darwin/amd64" \
    "linux/amd64" \
    "windows/amd64"

all: clean build

# 清理构建目录
clean:
	rm -rf $(OUTPUT_DIR)

# 构建所有平台
build:
	@for platform in $(PLATFORMS); do \
		GOOS=$$(echo $$platform | cut -d'/' -f1) \
		GOARCH=$$(echo $$platform | cut -d'/' -f2) \
		&& output_name=$(OUTPUT_DIR)/$(APP_NAME)-$${GOOS}-$${GOARCH} \
		&& [ "$${GOOS}" = "windows" ] && output_name=$${output_name}.exe ; \
		echo "Building for $${GOOS}/$${GOARCH}..." ; \
		GOOS=$${GOOS} GOARCH=$${GOARCH} go build -o $${output_name} . ; \
	done
