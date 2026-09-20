# OpenCreator Desktop 发布运行手册

## 环境与基线

在仓库根目录先检查 `git status --short --branch`、`git rev-parse HEAD`、`origin/master` 和 `gh auth status --hostname github.com`。所有 `git fetch`、GitHub 下载和 `gh` 命令设置：

```bash
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
```

检查 Node、pnpm 和 `runtime/krillinai/go.mod` 要求的 Go 版本。运行 `command -v go` 和 `go version`，确认 PATH 中的系统 Go 满足 `go.mod` 且兼容当前操作系统；不得把未经验证的 `.tools/go-*` 放在 PATH 前面。项目级 `.codex/skills/oc-*` 可以提交，其他 `.codex` 本地状态和 `.tools/` 不得提交。

## Diagnose：只读诊断

先定位现有 run，不启动新 run：

```bash
gh run list --repo krillinai/OpenCreator --workflow desktop-release.yml --limit 10
gh run view <run-id> --repo krillinai/OpenCreator --json url,headSha,event,status,conclusion,jobs
gh run view <run-id> --repo krillinai/OpenCreator --log-failed
```

判断失败属于编译、测试、资源准备、签名、公证、包校验、实际 App E2E、artifact 上传还是 publish。引用首个决定性错误，不把后续连锁错误当根因。日志不完整时下载该 run 已有 diagnostics artifact，不用 rerun 获取诊断。

## Preflight：本地候选包

先按改动影响运行定向测试。发布门禁至少包括当前机器原生架构的实际 App 打包和完整 packaged App E2E。macOS arm64 示例：

```bash
command -v go
go version

PATH="/usr/local/bin:$PATH" \
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
OPENCREATOR_DESKTOP_TARGET_PLATFORM=darwin OPENCREATOR_DESKTOP_TARGET_ARCH=arm64 \
pnpm desktop:package

PATH="/usr/local/bin:$PATH" \
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
pnpm --filter @opencreator/desktop e2e:package
```

记录实际 `.app` 路径和测试总数。当前完整套件预期 18 项；以仓库当时清单为准，但 skipped/failed 必须说明。发布实现有变化时补充：

```bash
pnpm --filter @opencreator/web test -- src/features/settings/CreatorServicesSettingsView.test.tsx
pnpm --filter @opencreator/desktop test -- test/stickman-runtime-package.test.mjs test/creator-runtime-signing.test.mjs test/mac-signing.test.mjs
./node_modules/.bin/tsc -p apps/desktop/tsconfig.test.json --noEmit
```

preflight 失败就在本地修复，不触发 GitHub package workflow。

## Candidate：master 远端候选构建

仅在用户明确要求且 preflight 已通过时执行：

1. 确认目标 commit 已推送到 `master`，且该 commit 的 `ci.yml` push run 成功。
2. 检查 `.github/workflows/desktop-release.yml`，确认 `publish.if` 仍只匹配 tag ref。
3. 记录现有 tags 和 Releases，供运行后比对。
4. 只触发一次：

```bash
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
gh workflow run desktop-release.yml --repo krillinai/OpenCreator --ref master -f target=all
```

5. 任一 package job 首次失败，立即 `gh run cancel <run-id>`，再读取失败日志；不要自动重跑。
6. `target=all` 的成功标准：verify、三个 package jobs、Linux package 和 `candidate-ready` 成功；macOS arm64 运行完整 packaged App E2E，macOS x64 与 Windows x64 运行包含 Runtime、平台能力、代理、恢复、安全和进程回收的 smoke 套件；用户附件、KrillinAI 附件及 `opencreator-release-candidate-<build-input-digest>` 身份凭据存在；publish skipped；tag 和 Release 未变化。

只验证某个已知平台问题时，可在用户同意后选单平台 target 以节省费用；单平台结果不能用于正式发布，完整跨平台候选验收必须使用 `all`。

## Release：正式 tag 发布

release 是独立授权边界。用户必须明确指定版本并要求发布：

1. 确认版本、目标 commit、工作区、`origin/master`、同 commit 本地 preflight 和 master push CI。
2. 确认 tag 不存在；已存在时由用户明确决定，不自行覆盖。
3. 确认完整 candidate run 已生成身份凭据和全部附件。通常 candidate 与 tag commit 相同；若只有发布基础设施变化，确认 candidate 是 tag 的祖先，且 tag 与 candidate 的应用构建输入 SHA-256 相同。
4. 创建并推送一次 tag，监控由 tag 触发的唯一 promotion run。tag workflow 只能下载并校验该 candidate 的 artifacts，不得重新打包、签名、公证或运行 packaged App E2E。
5. promotion 失败时读取候选解析、身份凭据或附件校验错误，不通过移动 tag 或重新付费打包绕过。
6. 成功后验证 Release 非 draft、附件完整、命名和下载说明正确，并记录被提升的 candidate run。

## 故障分类与已知陷阱

- **依赖**：Daemon 精确依赖声明必须与 lockfile 解析结果一致。例如 `toml` 版本不一致会确定性失败，无需远端重跑确认。
- **macOS 签名**：`Resources/daemon`、`Resources/creator-runtime`、`Resources/stickman-runtime` 内的 dylib、ffmpeg、Chromium 等 Mach-O 必须递归签名。GitHub `release` Environment secrets 会持续保存，不需每次上传。
- **包校验**：签名会改变 Mach-O 字节。不能把签名后 Chromium 哈希直接与未签名源文件比较；应保留文件列表、版本、manifest、来源绑定检查，并验证所有 Mach-O 的 Developer ID 签名。
- **Stickman Chromium**：它是 Stickman 自动化运行时携带的浏览器，体积大且包含需要签名的原生文件，不是陌生外部应用。
- **Electron 竞态**：首次并发解压可能报 `icudtl.dat: File exists` 或安装损坏。CI 构建前用 `pnpm --filter @opencreator/desktop exec node -e "require('electron')"` 预热；Linux 不执行 `electron --version`，避免 SUID sandbox 错误。
- **E2E 平台能力**：测试从 `/creator-services/capabilities` 获取事实，不复制平台规则。已知矩阵是 macOS arm64 `WhisperKit / large-v2`、macOS x64 无本地 provider 且入口禁用、Windows x64 `Whisper.cpp / tiny`。
- **体积**：macOS arm64 App 曾约 1.35 GB，主要来自 Electron、Creator/KrillinAI 依赖与模型、Remotion FFmpeg、Stickman Chromium、libvips。优化前按 bundle 子目录统计并查重复文件，再评估按需下载、去重、压缩或拆包；不能破坏离线契约、签名、公证、manifest 和 packaged App E2E。
