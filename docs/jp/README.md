<div align="center">
  <img src="/docs/images/logo.jpg" alt="KlicStudio" height="90">

# ミニマリストAIビデオ翻訳および吹き替えツール

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKlicStudio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=ファン&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KlicStudio)

</div>

## プロジェクト紹介  ([今すぐオンライン版を試す！](https://www.klic.studio/))
[**クイックスタート**](#-quick-start)

Klic Studioは、Krillin AIによって開発された多目的な音声およびビデオのローカリゼーションと強化ソリューションです。このミニマリストでありながら強力なツールは、ビデオ翻訳、吹き替え、音声クローンを統合し、すべての主要プラットフォーム（Bilibili、Xiaohongshu、Douyin、WeChat Video、Kuaishou、YouTube、TikTokなど）で完璧なプレゼンテーションを保証するために、横向きおよび縦向きのフォーマットをサポートしています。エンドツーエンドのワークフローにより、数回のクリックで生素材を美しく使えるクロスプラットフォームコンテンツに変換できます。

## 主な機能と機能:

🎯 **ワンクリックスタート**: 複雑な環境設定は不要、自動依存関係のインストール、すぐに使用可能、新しいデスクトップ版でアクセスが簡単！

📥 **ビデオ取得**: yt-dlpダウンロードまたはローカルファイルのアップロードをサポート

📜 **正確な認識**: Whisperに基づく高精度の音声認識

🧠 **インテリジェントセグメンテーション**: LLMを使用した字幕のセグメンテーションと整列

🔄 **用語の置き換え**: 専門用語のワンクリック置き換え

🌍 **プロフェッショナル翻訳**: 自然な意味を維持するための文脈を考慮したLLM翻訳

🎙️ **音声クローン**: CosyVoiceから選択された音声トーンまたはカスタム音声クローンを提供

🎬 **ビデオ合成**: 横向きおよび縦向きのビデオと字幕レイアウトを自動的に処理

💻 **クロスプラットフォーム**: Windows、Linux、macOSをサポートし、デスクトップ版とサーバー版の両方を提供

## 効果のデモ

以下の画像は、46分のローカルビデオをインポートし、ワンクリックで実行した後に生成された字幕ファイルの効果を示しています。手動調整は一切なく、欠落や重複はなく、セグメンテーションは自然で、翻訳の質は非常に高いです。
![整列効果](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### 字幕翻訳

---

https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">

### 吹き替え

---

https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### 縦向きモード

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 サポートされている音声認識サービス

_**以下の表のすべてのローカルモデルは、実行可能ファイルとモデルファイルの自動インストールをサポートしています。選択するだけで、Klicがすべてを準備します。**_

| サービスソース          | サポートされているプラットフォーム | モデルオプション                             | ローカル/クラウド | 備考                     |
|------------------------|---------------------|------------------------------------------|-------------|-----------------------------|
| **OpenAI Whisper**     | すべてのプラットフォーム        | -                                        | クラウド       | 高速で良好な効果  |
| **FasterWhisper**      | Windows/Linux       | `tiny`/`medium`/`large-v2`（推奨medium+） | ローカル       | 高速、クラウドサービスコストなし |
| **WhisperKit**         | macOS（Mシリーズのみ） | `large-v2`                              | ローカル       | Appleチップ向けのネイティブ最適化 |
| **WhisperCpp**         | すべてのプラットフォーム        | `large-v2`                              | ローカル       | すべてのプラットフォームをサポート       |
| **Alibaba Cloud ASR**  | すべてのプラットフォーム        | -                                        | クラウド       | 中国本土でのネットワーク問題を回避 |

## 🚀 大規模言語モデルサポート

✅ **OpenAI API仕様**に準拠したすべてのクラウド/ローカル大規模言語モデルサービスと互換性があります。これには以下が含まれますが、これに限定されません：

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- ローカルに展開されたオープンソースモデル
- OpenAI形式と互換性のある他のAPIサービス

## 🎤 TTS テキスト読み上げサポート

- Alibaba Cloud Voice Service
- OpenAI TTS

## 言語サポート

サポートされている入力言語: 中国語、英語、日本語、ドイツ語、トルコ語、韓国語、ロシア語、マレー語（継続的に増加中）

サポートされている翻訳言語: 英語、中国語、ロシア語、スペイン語、フランス語、その他101言語

## インターフェースプレビュー

![インターフェースプレビュー](/docs/images/ui_desktop_light.png)
![インターフェースプレビュー](/docs/images/ui_desktop_dark.png)

## 🚀 クイックスタート

[Deepwiki of KlicStudio](https://deepwiki.com/krillinai/KlicStudio)で質問できます。リポジトリ内のファイルをインデックス化しているので、迅速に回答を見つけることができます。

### 基本ステップ

まず、[Release](https://github.com/KrillinAI/KlicStudio/releases)からデバイスシステムに合った実行可能ファイルをダウンロードし、以下のチュートリアルに従ってデスクトップ版または非デスクトップ版を選択します。ソフトウェアのダウンロードは空のフォルダーに配置してください。実行するといくつかのディレクトリが生成されるため、空のフォルダーに保管することで管理が容易になります。

【デスクトップ版の場合、「desktop」を含むリリースファイルを参照】
_デスクトップ版は、新しいユーザーが設定ファイルを正しく編集するのに苦労する問題に対処するために新たにリリースされており、いくつかのバグが継続的に更新されています。_

1. ファイルをダブルクリックして使用を開始します（デスクトップ版もソフトウェア内での設定が必要です）

【非デスクトップ版の場合、「desktop」を含まないリリースファイルを参照】
_非デスクトップ版は初期版で、設定がより複雑ですが、機能は安定しており、サーバー展開に適しており、ウェブ形式のUIを提供します。_

1. フォルダー内に`config`フォルダーを作成し、次に`config`フォルダー内に`config.toml`ファイルを作成します。ソースコードの`config`ディレクトリから`config-example.toml`ファイルの内容を`config.toml`にコピーし、コメントに従って設定情報を記入します。
2. ダブルクリックするか、ターミナルで実行可能ファイルを実行してサービスを開始します。
3. ブラウザを開き、`http://127.0.0.1:8888`にアクセスして使用を開始します（8888は設定ファイルで指定したポートに置き換えてください）。

### macOSユーザーへ

【デスクトップ版の場合、「desktop」を含むリリースファイルを参照】
署名の問題により、デスクトップ版は現在ダブルクリックで実行したり、dmg経由でインストールしたりできません。アプリケーションを手動で信頼する必要があります。方法は以下の通りです：

1. 実行可能ファイル（ファイル名がKlicStudio_1.0.0_desktop_macOS_arm64と仮定）のあるディレクトリでターミナルを開きます。
2. 以下のコマンドを順番に実行します：

```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【非デスクトップ版の場合、「desktop」を含まないリリースファイルを参照】
このソフトウェアは署名されていないため、macOSで実行する際には、「基本ステップ」でファイル設定を完了した後、アプリケーションを手動で信頼する必要があります。方法は以下の通りです：

1. 実行可能ファイル（ファイル名がKlicStudio_1.0.0_macOS_arm64と仮定）のあるディレクトリでターミナルを開きます。
2. 以下のコマンドを順番に実行します：
   ```
   sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
   sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
   ./KlicStudio_1.0.0_macOS_arm64
   ```
   
   これでサービスが開始されます。

### Docker展開

このプロジェクトはDocker展開をサポートしています。詳細は[Docker展開手順](./docker.md)を参照してください。

### CLIの使い方

KrillinAI は、スクリプト、自動化パイプライン、AI Agent から呼び出しやすい段階型 CLI を提供しています。CLI はデフォルトで同期実行され、完了時に stdout に 1 行の JSON を出力し、作業ディレクトリに `krillinai_manifest.json` を書き込みます。これにより、後続の段階で既存の成果物を再利用できます。

ソースから CLI をビルドします：

```bash
go build -o build/krillinai-cli ./cmd/cli
```

コマンド概要：

| コマンド | 用途 | 主な成果物 |
|---|---|---|
| `subtitle` | YouTube / Bilibili リンクまたはローカル動画から字幕を生成します。まずプラットフォーム字幕を取得し、失敗した場合は Whisper にフォールバックします | `origin_language_srt.srt`、`target_language_srt.srt`、`bilingual_srt.srt`、`short_origin_mixed_srt.srt` |
| `tts` | 目標言語字幕から目標言語の吹き替え音声を生成します | `tts_final_audio.wav`、`video_with_tts.mp4` |
| `render-horizontal` | 横向き動画を生成します：元動画 + 二言語字幕、または吹き替え動画 + 目標言語字幕 | `horizontal_bilingual.mp4` |
| `render-vertical` | 縦向き動画を生成します：元動画を縦向きに変換 + 短い字幕、または吹き替え動画 + 目標言語字幕 | `transferred_vertical_video.mp4`、`vertical_bilingual.mp4` |
| `pipeline` | outputs に基づいて複数段階を連結します | 選択した段階によって異なります |
| `cover` | 元動画のカバー画像と prompt テンプレートからカバーを生成します | `generated_cover.png` |

典型的なワークフロー：

```bash
# 1. 元言語、目標言語、二言語字幕、縦向き用短字幕を生成
./build/krillinai-cli subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo \
  --caption-source any

# 2. 目標言語字幕から吹き替えを生成
./build/krillinai-cli tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt \
  --line-mode target-only \
  --video tasks/demo/origin_video.mp4

# 3. 二言語字幕付きの横向き動画を生成
./build/krillinai-cli render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/bilingual_srt.srt

# 4. 短い二言語字幕付きの縦向き動画を生成
./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/short_origin_mixed_srt.srt \
  --major-title "今日の話題" \
  --minor-title "AI Video"
```

Agent 連携の規約：

- stdout の最後の JSON 行と `krillinai_manifest.json` を優先して読み取ってください。通常ログは解析しないでください。
- `outputs` フィールドには成果物パスが記録されます。後続コマンドは `--workdir` だけで manifest を再利用できます。
- `--dry-run` は、動画ダウンロードや外部 AI サービス呼び出しを行わずに、引数検証と manifest 生成を行います。
- `error.kind` に応じてエラーを処理します：`usage` は引数修正、`retryable` は再試行、`dependency` は `ffmpeg` / `ffprobe` / `yt-dlp` のインストールが必要です。

より詳しいパラメータ説明は、[CLI 機能概要](../zh/cli.md)を参照してください。

### Agent Skills

このリポジトリには、Agent が安定した規約で CLI を呼び出せるように、`skills/` 配下にすぐ使える Agent Skills も含まれています：

- [`krillinai-cli`](../../skills/krillinai-cli/SKILL.md)：字幕、TTS、レンダリング、pipeline、カバーのワークフローを選択するための総合入口 skill。
- [`krillinai-subtitle`](../../skills/krillinai-subtitle/SKILL.md)、[`krillinai-tts`](../../skills/krillinai-tts/SKILL.md)、[`krillinai-render-horizontal`](../../skills/krillinai-render-horizontal/SKILL.md)、[`krillinai-render-vertical`](../../skills/krillinai-render-vertical/SKILL.md)：各段階に特化した操作ガイド。
- [`krillinai-pipeline`](../../skills/krillinai-pipeline/SKILL.md) と [`krillinai-cover`](../../skills/krillinai-cover/SKILL.md)：pipeline 編成とカバー生成のための計画/予約済みガイド。対応する実行パスが完全に接続されるまでは計画用途として扱います。
- [`cli-contract.md`](../../skills/krillinai-cli/references/cli-contract.md)：JSON、manifest、outputs、エラー処理に関する共通契約。

提供された設定ファイルに基づいて、READMEファイルの「設定ヘルプ（必読）」セクションを更新しました：

### 設定ヘルプ（必読）

設定ファイルは、`[app]`、`[server]`、`[llm]`、`[transcribe]`、および`[tts]`のいくつかのセクションに分かれています。タスクは音声認識（`transcribe`）+大規模モデル翻訳（`llm`）+オプションの音声サービス（`tts`）で構成されています。これを理解することで、設定ファイルをよりよく把握できます。

**最も簡単で迅速な設定：**

**字幕翻訳のみの場合：**
   * `[transcribe]`セクションで`provider.name`を`openai`に設定します。
   * その後、`[llm]`ブロックにOpenAI APIキーを記入するだけで、字幕翻訳を開始できます。`app.proxy`、`model`、および`openai.base_url`は必要に応じて記入できます。

**コスト、速度、品質のバランス（ローカル音声認識を使用）：**

* `[transcribe]`セクションで`provider.name`を`fasterwhisper`に設定します。
* `transcribe.fasterwhisper.model`を`large-v2`に設定します。
* `[llm]`ブロックに大規模言語モデルの設定を記入します。
* 必要なローカルモデルは自動的にダウンロードおよびインストールされます。

**テキスト読み上げ（TTS）設定（オプション）：**

* TTS設定はオプションです。
* まず、`[tts]`セクションで`provider.name`を設定します（例：`aliyun`または`openai`）。
* 次に、選択したプロバイダーの対応する設定ブロックを記入します。たとえば、`aliyun`を選択した場合は、`[tts.aliyun]`セクションを記入する必要があります。
* ユーザーインターフェースの音声コードは、選択したプロバイダーのドキュメントに基づいて選択する必要があります。
* **注意:** 音声クローン機能を使用する予定がある場合は、TTSプロバイダーとして`aliyun`を選択する必要があります。

**Alibaba Cloud設定：**

* Alibaba Cloudサービスに必要な`AccessKey`、`Bucket`、および`AppKey`を取得する方法については、[Alibaba Cloud設定手順](https://www.google.com/search?q=./aliyun.md)を参照してください。AccessKeyなどの繰り返しフィールドは、明確な設定構造を維持するために設計されています。

## よくある質問

[よくある質問](./faq.md)をご覧ください。

## 貢献ガイドライン

1. .vscode、.ideaなどの無駄なファイルを提出しないでください。これらは.gitignoreを使用してフィルタリングしてください。
2. config.tomlを提出しないでください。代わりにconfig-example.tomlを提出してください。

## お問い合わせ

1. 質問がある場合は、QQグループに参加してください：754069680
2. ソーシャルメディアアカウントをフォローしてください。[Bilibili](https://space.bilibili.com/242124650)では、毎日AI技術分野の質の高いコンテンツを共有しています。

## スター履歴

[![スター履歴チャート](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)
