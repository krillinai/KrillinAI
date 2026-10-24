# 字幕 NLP 运行时打包

桌面包复用 yt-dlp 的便携 Python 3.13，随包提供 spaCy 3.8.16 及
`en_core_web_md` 3.8.0。用户无需安装系统 Python，运行时不下载库或模型。
自定义独立 yt-dlp 的构建会另放一份便携 Python 供 NLP 使用。

## 依赖与构建

- `apps/desktop/scripts/creator-nlp-lock.json` 固定五种现有打包目标的全部
  wheel 版本、下载地址及 SHA-256，同时固定英文模型。
- 原有 `install-creator-runtime-dependencies.mjs` 会下载并校验这些文件，缓存于
  目标平台 vendor 目录的 `nlp-wheels/`；离线模式仅允许使用已校验缓存。
- `prepare-creator-runtime.mjs` 将 wheel 的库文件放进便携 Python 的
  `site-packages`，不打包 console scripts，不运行目标平台的二进制安装代码。
- 原生构建使用便携 Python 执行标准库解包脚本；交叉构建需要构建机上的
  Python，仅使用其标准库，可用 `OPENCREATOR_BUILD_PYTHON` 指定路径。
- 新增库、模型、锁文件均纳入 Creator Runtime 文件哈希清单。原生构建及
  最终安装包校验均实际加载模型、执行依存分析。

更新锁文件时应重新解析 spaCy 的依赖，检查各目标 CPython 3.13 wheel 的
兼容标签与依赖条件（包括 Windows 的 colorama），从 PyPI 的对应发行版
元数据取得 wheel 哈希。模型来自 spaCy 官方模型发行，固定版本及文件哈希；
更新后必须重新执行原生模型和切分回归检查。

## 调用与覆盖

清单中的 `nlp.executable` 绑定实际便携 Python。Web 和 Desktop 共用 Daemon
启动逻辑，通过 `KRILLINAI_NLP_PYTHON` 将该路径传给 KrillinAI，不继承外部
Python 路径配置。NLP 子进程使用 `-I -B`，隔离用户包且不生成字节码缓存，
避免安装包运行后与哈希清单不一致。

当前默认携带英文模型；spaCy 的其他语言模型不会因为安装库而自动出现。
其他源语言仍按现有规则回退，后续新增模型需要一并更新锁文件与清单。
本改动不切换 `legacy` / `segmented` 翻译流程的默认值。
