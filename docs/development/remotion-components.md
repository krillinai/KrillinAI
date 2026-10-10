# Remotion 按需渲染组件

Remotion 由共享 Daemon 管理。Web 和 Desktop 使用同一组 `/creator/components/status` 和 `/creator/components/download` API；下载请求指定 `componentId: "remotion"`，不会修改语音识别或模板设置。

启动应用、查看角色、编辑脚本和生成图片不触发下载。渲染阶段预检在存在兼容组件描述时允许进入准备阶段；执行器等待安装、校验完成后继续当前任务。手动下载和多个任务共用同一次安装，取消某个任务不取消其他订阅者的安装。

## 资源边界

- App 保留模板逻辑、通用协作面板和 `daemon/runtime/stickman-assets` 中的角色、风格目录与预览。
- 独立组件包含 Chrome Headless Shell、预编译渲染 Bundle、字体、Renderer 生产依赖和当前平台的原生 compositor。
- `@remotion/renderer`、Bundler 仅作为开发依赖，不进入 App 的 Daemon 生产依赖。
- Worker 从经过校验的组件目录加载 Renderer，不在用户机器上运行 npm、pnpm 或编译器。

## 构建与发布

`pnpm --filter @opencreator/desktop prepare:stickman-runtime` 为当前平台构建：

- `.pack/stickman-runtime`：完整的独立渲染组件。
- `.pack/stickman-assets`：App 保留的轻量角色资源。
- `.pack/components/Remotion-VERSION-PLATFORM-ARCH.tar.gz`：下载产物。
- `.pack/components/remotion-component.json`：包含版本、平台、下载 URL、压缩包大小与 SHA-256、内部 manifest SHA-256 的兼容性描述。

Desktop 打包只嵌入兼容性描述和轻量资源。构建清单绑定完整组件及其描述；校验门禁拒绝 App 内残留的浏览器和 Remotion 生产依赖，并比较本次 Web 构建与 App 内 Web 的完整文件列表和哈希。

正式 Release 必须将独立组件压缩包与安装器一起上传同一个版本的 GitHub Release；发布附件整理与校验流程包含 macOS arm64、macOS x64、Windows x64 的组件产物。未上传对应组件时，安装器的远端下载不能成功，不得仅发布安装器。

macOS Developer ID 打包先独立签名组件中的所有 Mach-O，再生成资源哈希和下载压缩包。正式 Release 对组件执行独立公证。使用仅由 Electron Builder 临时导入的签名证书时，需要为组件准备可用的签名 keychain，或设置 `OPENCREATOR_REMOTION_SIGNING_IDENTITY`；无法独立签名时发布必须失败。

## 安装与更新

组件安装在用户数据目录 `creator-runtime/stickman/MANIFEST_SHA256`，不写 App 资源目录。下载验证压缩包 SHA-256 和大小，拒绝路径穿越、符号链接及硬链接，验证内部 manifest 和全部资源哈希后才启用。新版本使用新目录，保留正在使用的旧版本；已通过校验的同版本资源不重复下载。

更新只安装当前 App 描述中锁定的兼容版本，不直接追踪 Remotion 最新版本。Renderer、Bundle 和原生库必须配套更新。

设置页将“检查更新”和“更新到受支持版本”分开：检查只刷新状态，不开始下载；已就绪且版本一致时不显示更新按钮，只展示组件状态；版本不一致时才显示更新入口。尚未安装、缺少资源和准备失败仍分别提供下载、补齐和重试入口。

开发环境可以显式指定 `OPENCREATOR_REMOTION_COMPONENT_MANIFEST`、`OPENCREATOR_REMOTION_COMPONENT_ARCHIVE` 和 `OPENCREATOR_STICKMAN_ASSETS_ROOT`。Vite 管理的开发 Daemon 优先使用本机构建的组件包，但不自动构建或安装它。正式 App 不自动回退到开发机依赖。

## 验证范围

改动属于 P2：执行组件下载/并发/取消/校验/重试测试、渲染与预检测试、共享设置页和 Panel Adapter 测试、相关包类型检查，以及真实 Desktop 打包、资源校验和 packaged App 下载后渲染测试。不同平台的原生包及正式签名、公证需要在对应发布环境分别验证。
