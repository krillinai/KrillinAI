<div align="center">
  <img src="/docs/images/logo.jpg" alt="KrillinAI" height="90">

# ミニマリストAIビデオ翻訳および吹き替えツール

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=ファン&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KrillinAI)

</div>

## プロジェクト紹介  ([今すぐオンライン版を試す！](https://www.klic.studio/))
[**クイックスタート**](#-quick-start)

KrillinAIは、Krillin AIによって開発された多目的な音声およびビデオのローカリゼーションと強化ソリューションです。このミニマリストでありながら強力なツールは、ビデオ翻訳、吹き替え、音声クローンを統合し、すべての主要プラットフォーム（Bilibili、Xiaohongshu、Douyin、WeChat Video、Kuaishou、YouTube、TikTokなど）で完璧なプレゼンテーションを保証するために、横向きおよび縦向きのフォーマットをサポートしています。エンドツーエンドのワークフローにより、数回のクリックで生素材を美しく使えるクロスプラットフォームコンテンツに変換できます。

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

[Deepwiki of KrillinAI](https://deepwiki.com/krillinai/KrillinAI)で質問できます。リポジトリ内のファイルをインデックス化しているので、迅速に回答を見つけることができます。

### 基本ステップ

まず、[Release](https://github.com/KrillinAI/KrillinAI/releases)からデバイスシステムに合った実行可能ファイルをダウンロードし、以下のチュートリアルに従ってデスクトップ版または非デスクトップ版を選択します。ソフトウェアのダウンロードは空のフォルダーに配置してください。実行するといくつかのディレクトリが生成されるため、空のフォルダーに保管することで管理が容易になります。

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

1. 実行可能ファイル（ファイル名がKrillinAI_1.0.0_desktop_macOS_arm64と仮定）のあるディレクトリでターミナルを開きます。
2. 以下のコマンドを順番に実行します：

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【非デスクトップ版の場合、「desktop」を含まないリリースファイルを参照】
このソフトウェアは署名されていないため、macOSで実行する際には、「基本ステップ」でファイル設定を完了した後、アプリケーションを手動で信頼する必要があります。方法は以下の通りです：

1. 実行可能ファイル（ファイル名がKrillinAI_1.0.0_macOS_arm64と仮定）のあるディレクトリでターミナルを開きます。
2. 以下のコマンドを順番に実行します：
   ```
   sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
   sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
   ./KrillinAI_1.0.0_macOS_arm64
   ```
   
   これでサービスが開始されます。

### Docker展開

このプロジェクトはDocker展開をサポートしています。詳細は[Docker展開手順](./docker.md)を参照してください。

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

[![スター履歴チャート](https://api.star-history.com/svg?repos=KrillinAI/KrillinAI&type=Date)](https://star-history.com/#KrillinAI/KrillinAI&Date)