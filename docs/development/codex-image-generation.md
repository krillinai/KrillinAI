# 本机 Codex 生图

图像设置中的“本机 Codex 生图”根据当前 Runtime 的认证模式分流，所有图像、封面、文章配图和火柴人镜头共用同一实现。

## API Key 模式

- 保留现有配置的 Base URL、API Key 和图片模型，调用 `/images/generations` 或带参考图的 `/images/edits`。
- 文本模型不是图片模型时，保持原有 `gpt-image-1` 默认值。
- 接口必须支持图片生成。设置状态检查只检查本地配置，不会发送收费的生成请求。

## ChatGPT 登录模式

- 通过当前 Runtime 的 Codex CLI 原生生图工具执行，不把 OAuth 凭据当作图片 API Key。
- 使用原始 `CODEX_HOME` 的文件认证，由 Codex 负责登录凭据刷新；不复制或改写用户认证。
- 忽略用户自定义接口和模型配置，移除子进程继承的 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`CODEX_API_KEY`、`CODEX_ACCESS_TOKEN`，避免误走其他认证通道。
- 使用独立的临时工作区，关闭 shell、MCP、插件、浏览器等无关工具；参考图片通过附件传入。
- 只接受当前请求工作区或当前线程专属目录中的新图片，校验路径、大小与格式。不会扫描其他线程图片或把文字回复视作生图成功。
- 原生工具失败时不回退到 API 通道。登录失效、额度限制和超时有明确提示，取消任务会终止子进程。

## 状态与进度

- `GET /creator-services/image/codex/status` 只读检查认证模式、Runtime 版本和原生工具能力，不返回凭据。
- 设置页展示检查结果，并通过现有“配置 Agent”入口处理登录；刷新状态会重新检查当前认证。
- Creator 阶段预检查会阻止缺少登录配置或不支持原生生图的 Runtime。
- 共用协作面板展示“准备 ChatGPT 登录态生图”“生成图片”“整理输出文件”及说明；未获得真实百分比时不编造进度。
- 本地凭据和工具检查通过不等于账号权限、额度或上游接口已在线验证，这些以真实生成结果为准。

## 定向验证

```sh
pnpm --filter @opencreator/protocol build
pnpm --filter @opencreator/daemon exec vitest run test/unit/codex-local-provider.test.ts test/unit/codex-argv.test.ts test/unit/codex-native-image.test.ts test/unit/image-generation-codex-native.test.ts test/unit/creator-preflight.test.ts test/integration/creator-services-api.test.ts test/integration/image-generation-api.test.ts test/integration/creator-image-generation.test.ts
pnpm --filter @opencreator/web exec vitest run src/features/settings/CodexImageStatusNotice.test.tsx src/features/settings/CreatorServicesSettingsView.test.tsx src/features/dashboard/creator-panel-adapters.test.ts src/services/creator-services-service.test.ts
```

自动测试使用模拟 Codex 子进程，覆盖认证分流、进度、产物、错误与取消，不构成真实 ChatGPT 账号生图验收。真实验收应在用户已经登录的 Runtime 上执行；不要替换用户当前的 API Key 配置来制造登录态测试。
