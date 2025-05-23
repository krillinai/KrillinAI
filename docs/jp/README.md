<div align="center">
  <img src="/docs/images/logo.png" alt="KrillinAI" height="90">

  # 極簡デプロイAI動画翻訳音声ツール

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=ファン&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢win&macデスクトップ版新リリース テストフィードバック歓迎[ドキュメントは少し遅れていますが、継続的に更新中]

 ## プロジェクト概要  

Krillin AIは、音声と動画のローカライズおよび強化ソリューションのオールインワンツールです。このシンプルで強力なツールは、音声翻訳、ナレーション、音声クローンを一体化し、横画面と縦画面のフォーマット出力をサポートし、すべての主要プラットフォーム（Bilibili、小紅書、Douyin、動画号、快手、YouTube、TikTokなど）で完璧に表示されることを保証します。エンドツーエンドのワークフローを通じて、Krillin AIは数回のクリックで元の素材を美しいクロスプラットフォームコンテンツに変換します。

## 主な特徴と機能：
🎯 **ワンクリック起動**：複雑な環境設定は不要、自動で依存関係をインストールし、すぐに使用開始。新しいデスクトップ版で、より便利に！

📥 **動画取得**：yt-dlpダウンロードまたはローカルファイルのアップロードをサポート

📜 **正確な認識**：Whisperに基づく高精度音声認識

🧠 **スマートセグメンテーション**：LLMを使用して字幕のセグメンテーションと整列を行う

🔄 **用語置換**：専門用語をワンクリックで置換 

🌍 **専門翻訳**：LLMに基づき、段落レベルの翻訳で意味の一貫性を保持

🎙️ **音声クローン**：CosyVoiceの厳選音色またはカスタム音色のクローンを提供

🎬 **動画合成**：横画面と縦画面の動画および字幕レイアウトを自動処理


## 効果の展示
下の画像は46分のローカル動画をインポートし、ワンクリックで生成された字幕ファイルのトラックに入った後の効果で、手動調整は一切ありません。欠落や重複はなく、文の切れ目も自然で、翻訳の質も非常に高いです。
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

### 縦画面
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 音声認識サービスのサポート
_**下表のローカルモデルはすべて自動インストール可能な実行ファイル+モデルファイルをサポートしています。選択するだけで、他はKrillinAIがすべて準備します。**_

| サービスソース          | 対応プラットフォーム  | モデルオプション                          | ローカル/クラウド | 備考          |
|--------------------|-----------------|----------------------------------------|-------|-------------|
| **OpenAI Whisper** | 全プラットフォーム     | -                                      | クラウド  | 速度が速く、効果が良い      |
| **FasterWhisper**  | Windows/Linux   | `tiny`/`medium`/`large-v2` (推奨medium+) | ローカル  | さらに速く、クラウドサービスのコストなし |
| **WhisperKit**     | macOS (Mシリーズチップのみ) | `large-v2`                             | ローカル  | Appleチップに最適化 |
| **WhisperCpp**     | 全プラットフォーム     | `large-v2`                             | ローカル  | 全プラットフォームをサポート |
| **阿里云ASR**         | 全プラットフォーム     | -                                      | クラウド  | 中国本土のネットワーク問題を回避  |

## 🚀 大言語モデルのサポート

✅ すべての **OpenAI API仕様** に準拠したクラウド/ローカルの大言語モデルサービスに対応しており、以下を含むがこれに限らない：
- OpenAI
- DeepSeek
- 通義千問
- ローカルにデプロイされたオープンソースモデル
- その他OpenAI形式のAPIサービス

## 言語サポート
入力言語サポート：中文、英語、日本語、ドイツ語、トルコ語、韓国語、ロシア語、マレー語（継続的に追加中）

翻訳言語サポート：英語、中国語、ロシア語、スペイン語、フランス語など101言語

## インターフェースプレビュー
![インターフェースプレビュー](/docs/images/ui_desktop.png)


## 🚀 クイックスタート
### 基本ステップ
まず、[Release](https://github.com/krillinai/KrillinAI/releases)からデバイスシステムに合った実行ファイルをダウンロードし、以下のチュートリアルに従ってデスクトップ版または非デスクトップ版を選択し、空のフォルダに配置します。ソフトウェアを空のフォルダにダウンロードしてください。実行後にいくつかのディレクトリが生成されるため、空のフォルダに置くと管理がしやすくなります。  

【デスクトップ版の場合、releaseファイルにdesktopが含まれている場合はここを参照】  
_デスクトップ版は新しくリリースされたもので、新規ユーザーが設定ファイルを正しく編集するのが難しい問題を解決するために、まだ多くのバグがあり、継続的に更新中です。_
1. ファイルをダブルクリックするだけで使用開始できます（デスクトップ版も設定が必要です。ソフトウェア内で設定します）。

【非デスクトップ版の場合、releaseファイルにdesktopが含まれていない場合はここを参照】  
_非デスクトップ版は最初のバージョンで、設定が比較的複雑ですが、機能は安定しており、サーバーへのデプロイに適しています。UIはWeb方式で提供されます。_
1. フォルダ内に`config`フォルダを作成し、その中に`config.toml`ファイルを作成します。ソースコードの`config`ディレクトリにある`config-example.toml`ファイルの内容をコピーして`config.toml`に貼り付け、あなたの設定情報を照らし合わせて記入します。
2. ダブルクリックするか、ターミナルで実行ファイルを実行してサービスを起動します。
3. ブラウザを開き、`http://127.0.0.1:8888`を入力して使用を開始します（8888は設定ファイルに記入したポートに置き換えてください）。

### To: macOSユーザー
【デスクトップ版の場合、releaseファイルにdesktopが含まれている場合はここを参照】  
デスクトップ版は現在、パッケージ化の方法により、署名などの問題でダブルクリックで直接実行したり、dmgインストールを行ったりすることができません。手動でアプリを信頼する必要があります。方法は以下の通りです：
1. ターミナルで実行ファイル（ファイル名がKrillinAI_1.0.0_desktop_macOS_arm64と仮定）のあるディレクトリを開きます。
2. 次のコマンドを順に実行します：
```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【非デスクトップ版の場合、releaseファイルにdesktopが含まれていない場合はここを参照】  
本ソフトウェアは署名を行っていないため、macOS上で実行する際には、「基本ステップ」でのファイル設定を完了した後、手動でアプリを信頼する必要があります。方法は以下の通りです：
1. ターミナルで実行ファイル（ファイル名がKrillinAI_1.0.0_macOS_arm64と仮定）のあるディレクトリを開きます。
2. 次のコマンドを順に実行します：
   ```
    sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
    ```
    これでサービスが起動します。

### Dockerデプロイ
本プロジェクトはDockerデプロイをサポートしています。詳細は[Dockerデプロイ説明](./docker.md)を参照してください。

### Cookie設定説明（必須ではありません）

動画ダウンロードに失敗した場合は、

[Cookie設定説明](./get_cookies.md)を参照してCookie情報を設定してください。

### 設定ヘルプ（必見）
最も迅速かつ便利な設定方法：
* `transcription_provider`と`llm_provider`の両方を`openai`に設定すると、下の`openai`、`local_model`、`aliyun`の3つの設定項目の中で`openai.apikey`だけを記入すれば字幕翻訳が可能です。(`app.proxy`、`model`、`openai.base_url`は必要に応じて記入)

ローカル音声認識モデルを使用する設定方法（macOSは未対応）の場合（コスト、速度、品質のバランスを考慮）
* `transcription_provider`に`fasterwhisper`を記入し、`llm_provider`に`openai`を記入すると、下の`openai`、`local_model`の3つの設定項目の中で`openai.apikey`と`local_model.faster_whisper`だけを記入すれば字幕翻訳が可能で、ローカルモデルは自動でダウンロードされます。(`app.proxy`と`openai.base_url`は同様)

以下の使用状況では、阿里云の設定が必要です：
* `llm_provider`に`aliyun`を記入した場合、阿里云の大モデルサービスを使用する必要があるため、`aliyun.bailian`項目の設定が必要です。
* `transcription_provider`に`aliyun`を記入した場合、またはタスクを開始する際に「ナレーション」機能を有効にした場合、阿里云の音声サービスを使用する必要があるため、`aliyun.speech`項目の設定が必要です。
* 「ナレーション」機能を有効にし、ローカルの音声をアップロードして音色クローンを行った場合、阿里云のOSSクラウドストレージサービスを使用する必要があるため、`aliyun.oss`項目の設定が必要です。  
阿里云設定ヘルプ：[阿里云設定説明](./aliyun.md)

## よくある質問

[よくある質問](./faq.md)をご覧ください。

## 貢献規範
1. 無駄なファイル（.vscode、.ideaなど）を提出しないでください。`.gitignore`を使用してフィルタリングしてください。
2. `config.toml`を提出せず、`config-example.toml`を使用して提出してください。

## お問い合わせ
1. 私たちのQQグループに参加して質問を解決してください：754069680
2. 私たちのソーシャルメディアアカウントをフォローしてください。[Bilibili](https://space.bilibili.com/242124650)、毎日AIテクノロジー分野の質の高いコンテンツを共有しています。

## Star履歴

[![Star履歴チャート](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)