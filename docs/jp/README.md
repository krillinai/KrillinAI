<div align="center">
  <img src="/docs/images/logo.jpg" alt="KlicStudio" height="90">

  # 極簡デプロイAI動画翻訳音声ツール

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKlicStudio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=フォロワー&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

 ## プロジェクト概要  ([今すぐオンライン版を体験！](https://www.klic.studio/))

Klic StudioはKrillin AIが開発したオールインワンの音声・動画ローカライズおよび強化ソリューションです。このシンプルで強力なツールは、音声・動画翻訳、ナレーション、音声クローンを一体化し、横向き・縦向きのフォーマット出力をサポートし、すべての主要プラットフォーム（Bilibili、小紅書、Douyin、動画号、Kuaishou、YouTube、TikTokなど）で完璧に表示されることを保証します。エンドツーエンドのワークフローを通じて、数回のクリックで元の素材を美しいクロスプラットフォームコンテンツに変換できます。

## 主な特徴と機能：
🎯 **ワンクリック起動**：複雑な環境設定は不要、自動的に依存関係をインストールし、すぐに使用開始。デスクトップ版が新たに追加され、より便利に使用できます！

📥 **動画取得**：yt-dlpによるダウンロードまたはローカルファイルのアップロードをサポート

📜 **高精度認識**：Whisperに基づく高精度音声認識

🧠 **スマートセグメンテーション**：LLMを使用して字幕のセグメンテーションと整列を行います

🔄 **用語置換**：専門用語をワンクリックで置換

🌍 **専門翻訳**：文脈を考慮したLLM翻訳で自然な意味を保持

🎙️ **音声クローン**：CosyVoiceの厳選音色またはカスタム音色のクローンを提供

🎬 **動画合成**：横向き・縦向きの動画と字幕のレイアウトを自動処理

💻 **クロスプラットフォーム**：Windows、Linux、macOSをサポートし、デスクトップ版とサーバー版を提供


## 効果の展示
下の画像は46分のローカル動画をインポートし、ワンクリックで生成された字幕ファイルのトラック上の効果で、手動調整は一切ありません。欠落や重複はなく、文の切れ目も自然で、翻訳の質も非常に高いです。
![整列効果](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### 字幕翻訳
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">



### ナレーション
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### 縦向き
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 音声認識サービスのサポート
_**下表のローカルモデルはすべて自動インストール可能な実行ファイル+モデルファイルをサポートしています。選択するだけで、Klicがすべて準備します。**_

| サービス源                | サポートプラットフォーム            | モデル選択肢                                  | ローカル/クラウド | 備考          |
|--------------------|-----------------|----------------------------------------|-------|-------------|
| **OpenAI Whisper** | 全プラットフォーム             | -                                      | クラウド    | 速度が速く、効果が良い      |
| **FasterWhisper**  | Windows/Linux   | `tiny`/`medium`/`large-v2` (推奨medium+) | ローカル    | 速度がさらに速く、クラウドサービスのコストがかからない |
| **WhisperKit**     | macOS (Mシリーズチップのみ) | `large-v2`                             | ローカル    | Appleチップに最適化 |
| **WhisperCpp**     | 全プラットフォーム             | `large-v2`                             | ローカル    | 全プラットフォームをサポート       |
| **阿里云ASR**         | 全プラットフォーム             | -                                      | クラウド    | 中国本土のネットワーク問題を回避  |

## 🚀 大言語モデルのサポート

✅ すべての **OpenAI API仕様** に準拠したクラウド/ローカルの大言語モデルサービスに対応しており、以下を含みますが、これに限定されません：
- OpenAI
- Gemini
- DeepSeek
- 通義千問
- ローカルにデプロイされたオープンソースモデル
- その他OpenAI形式のAPIサービスに対応

## 🎤 TTSテキストから音声へのサポート
- 阿里云音声サービス
- OpenAI TTS

## 言語サポート
入力言語サポート：中文、英語、日本語、ドイツ語、トルコ語、韓国語、ロシア語、マレー語（継続的に増加中）

翻訳言語サポート：英語、中国語、ロシア語、スペイン語、フランス語など101言語

## インターフェースプレビュー
![インターフェースプレビュー](/docs/images/ui_desktop.png)


## 🚀 クイックスタート
### 基本ステップ
まず、[Release](https://github.com/KrillinAI/KlicStudio/releases)からあなたのデバイスシステムに合った実行ファイルをダウンロードし、以下のチュートリアルに従ってデスクトップ版か非デスクトップ版を選択し、空のフォルダにソフトウェアをダウンロードしてください。実行後にいくつかのディレクトリが生成されるため、空のフォルダに置くと管理が楽になります。  

【デスクトップ版の場合、releaseファイルにdesktopが含まれている場合はこちら】  
_デスクトップ版は新たにリリースされ、新規ユーザーが設定ファイルを正しく編集するのが難しい問題を解決するために、いくつかのバグがあり、継続的に更新中です。_
1. ファイルをダブルクリックするだけで使用開始できます（デスクトップ版も設定が必要です。ソフトウェア内で設定します）

【非デスクトップ版の場合、releaseファイルにdesktopが含まれていない場合はこちら】  
_非デスクトップ版は最初のバージョンで、設定が比較的複雑ですが、機能は安定しており、サーバーへのデプロイに適しています。ウェブの形式でUIを提供します。_
1. フォルダ内に`config`フォルダを作成し、その中に`config.toml`ファイルを作成します。ソースコードの`config`ディレクトリ内の`config-example.toml`ファイルの内容をコピーして`config.toml`に貼り付け、コメントに従って設定情報を記入します。
2. ダブルクリックするか、ターミナルで実行ファイルを実行してサービスを起動します 
3. ブラウザを開き、`http://127.0.0.1:8888`を入力して使用開始します（8888は設定ファイルに記入したポートに置き換えてください）

### To: macOSユーザー
【デスクトップ版の場合、releaseファイルにdesktopが含まれている場合はこちら】  
デスクトップ版は現在、署名などの問題により、ダブルクリックで直接実行したりdmgインストールを行うことができず、手動でアプリを信頼する必要があります。方法は以下の通りです：
1. ターミナルで実行ファイル（ファイル名がKlicStudio_1.0.0_desktop_macOS_arm64だと仮定）のあるディレクトリを開きます
2. 次のコマンドを順に実行します：
```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【非デスクトップ版の場合、releaseファイルにdesktopが含まれていない場合はこちら】  
本ソフトウェアは署名を行っていないため、macOS上で実行する際には、「基本ステップ」でのファイル設定が完了した後、手動でアプリを信頼する必要があります。方法は以下の通りです：
1. ターミナルで実行ファイル（ファイル名がKlicStudio_1.0.0_macOS_arm64だと仮定）のあるディレクトリを開きます
2. 次のコマンドを順に実行します：
   ```
    sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
    sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
    ./KlicStudio_1.0.0_macOS_arm64
    ```
    これでサービスが起動します

### Dockerデプロイ
本プロジェクトはDockerデプロイをサポートしています。詳細は[Dockerデプロイ説明](./docker.md)を参照してください。

### Cookie設定説明（必須ではありません）

動画ダウンロードに失敗した場合は、

[Cookie設定説明](./get_cookies.md)を参照してCookie情報を設定してください。

### 設定ヘルプ（必見）
最も迅速で便利な設定方法：
* `transcribe.provider.name`に`openai`を記入すると、`transcribe.openai`ブロックと`llm`ブロックの大モデル設定を記入するだけで字幕翻訳が可能になります。(`app.proxy`、`model`、`openai.base_url`は状況に応じて記入)

ローカル音声認識モデルを使用する設定方法（コスト、速度、品質の選択を考慮）
* `transcribe.provider.name`に`fasterwhisper`を記入し、`transcribe.fasterwhisper.model`に`large-v2`を記入、その後`llm`に大モデル設定を記入すれば、字幕翻訳が可能です。ローカルモデルは自動的にダウンロードされます。(`app.proxy`と`openai.base_url`は同様)

テキストから音声への変換（TTS）はオプションで、設定ロジックは上記と同様に、`tts.provider.name`を記入し、`tts`の下の対応する設定ブロックを記入すればよいです。UI内の音声コードは選択したプロバイダーのドキュメントに従って記入してください（下方のよくある質問にドキュメントのアドレスがあります）。阿里云のakskなどの記入は重複する可能性がありますが、これは設定構造を明確にするためです。  
注意：音声クローンを使用する場合、`tts`は`aliyun`の選択のみをサポートします。

**阿里云のAccessKey、Bucket、AppKeyの取得方法は**：[阿里云設定説明](./aliyun.md)をお読みください。

タスク=音声認識+大モデル翻訳+音声サービス（TTSなど、オプション）であることを理解してください。これは設定ファイルを理解するのに役立ちます。

## よくある質問

[よくある質問](./faq.md)をご覧ください。

## 貢献規範
1. 無駄なファイル（.vscode、.ideaなど）を提出しないでください。`.gitignore`を使用してフィルタリングしてください。
2. config.tomlを提出せず、config-example.tomlを使用して提出してください。

## お問い合わせ
1. 私たちのQQグループに参加して質問を解決してください：754069680
2. 私たちのソーシャルメディアアカウントをフォローしてください。[Bilibili](https://space.bilibili.com/242124650)、毎日AI技術分野の質の高いコンテンツを共有しています。

## Star履歴

[![Star履歴チャート](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)