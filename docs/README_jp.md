<div align="center">
  <img src="./images/logo.png" alt="KrillinAI" height="100">

  # AI動画翻訳・吹き替えツール（簡単デプロイ）

**[English](../README.md) ｜[简体中文](../docs/README_zh.md)｜[日本語](../docs/README_jp.md)｜[Русский](../docs/README_rus.md)**

  [![Discord](https://img.shields.io/badge/Discord-KrillinAI-blue)](https://discord.gg/7RUa4WuW)
  [![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![哔哩哔哩](https://img.shields.io/badge/哔哩哔哩-KrillinAI-red?logo=bilibili)](https://space.bilibili.com/242124650)

</div>

## 🚀 プロジェクト概要  

クリリンAIは、動画のローカライズと品質向上を簡単に実現するオールインワンソリューションです。このシンプルでありながら強力なツールは、翻訳、吹き替え、ボイスクローニングからフォーマット調整までをカバー。縦横画面のシームレスな変換により、YouTube、TikTok、Bilibili、抖音（Douyin）、微信チャンネル、RedNote、快手（Kuaishou）など、あらゆるコンテンツプラットフォームに最適化された表示を実現します。エンドツーエンドのワークフローで、わずかなクリックだけで未編集の素材から完成度の高いプラットフォーム対応コンテンツへと仕上げます。

## 主な特徴と機能：
🎯 **ワンクリック起動**：複雑な環境設定不要、依存関係を自動インストール
📥 **動画取得**：yt-dlpダウンロードまたはローカルファイルアップロード対応
📜 **高精度認識**：Whisperベースの音声認識  
🧠 **インテリジェント分割**：LLMを使用した字幕分割と調整
🔄 **用語置換**：専門分野の語彙をワンクリックで置換
🌍 **プロ翻訳**：LLMベースの段落単位翻訳で文脈一貫性を保持
🎙️ **音声クローン**：デフォルト音声またはカスタム音声クローニング
🎬 **動画合成**：縦横画面と字幕レイアウトを自動処理

## 効果デモ
下図は46分のローカル動画をインポートし、ワンクリック実行後に生成された字幕ファイルをトラックに追加した効果です。手動調整なしで、欠落・重複なく、自然な文節区切りと高品質な翻訳を実現。
![調整効果](./images/alignment.png)

<table>
<tr>
<td width="50%">

### 字幕翻訳
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="50%">



### 配音
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>
</tr>
</table>

## 対応言語
入力言語対応：中国語、英語、日本語、ドイツ語、トルコ語（随時追加中）

翻訳言語対応：英語、中国語、ロシア語、スペイン語、フランス語など56言語

## インターフェースプレビュー
![インターフェースプレビュー](./images/ui.jpg)



## クイックスタート
### 基本手順
1. [Release](https://github.com/krillinai/KrillinAI/releases)からお使いのデバイスに合った実行ファイルをダウンロードし、空のフォルダに配置
2. フォルダ内に`config`フォルダを作成し、`config`フォルダ内に`config.toml`ファイルを作成、ソースコードの`config`ディレクトリにある`config-example.toml`ファイルの内容をコピーして貼り付け、設定情報を記入（OpenAIモデルを使いたいがキーの取得方法がわからない場合はグループに参加して無料で試用可能）
3. 実行ファイルをダブルクリック、またはターミナルで実行してサービスを起動
4. ブラウザを開き `http://127.0.0.1:8888`と入力して使用開始

### macOSユーザー向け
本ソフトウェアは署名されていないため、macOSで実行する場合、「基本手順」のファイル設定完了後、手動でアプリを信頼する必要があります。方法は以下の通り：
1. ターミナルで実行ファイル（ファイル名がKrillinAI_1.0.0_macOS_arm64と仮定）があるディレクトリを開く
2. 以下のコマンドを順に実行：
   ```
    sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
    ```
    これでサービスが起動します

### Dockerデプロイ
本プロジェクトはDockerデプロイをサポートしています。[Docker部署说明](./docker.md)を参照してください

### Cookie設定説明（オプション）

動画ダウンロードに失敗する場合

 [Cookie 配置说明](./get_cookies.md) を参照してCookie情報を設定してください。

### 設定ヘルプ（必読）
最速で簡単な設定方法：
* transcription_providerとllm_providerの両方にopenaiを選択すると、openai、local_model、aliyunの3つの設定項目でopenai.apikeyのみ記入すれば字幕翻訳が可能です。（app.proxy、model、openai.base_urlは状況に応じて記入）

ローカル音声認識モデルを使用する設定方法（macOS未対応）（コスト、速度、品質を考慮した選択）
* transcription_providerにfasterwhisper、llm_providerにopenaiを記入すると、openai、local_modelの2つの設定項目でopenai.apikeyとlocal_model.faster_whisperを記入するだけで字幕翻訳が可能で、ローカルモデルは自動ダウンロードされます。（app.proxyとopenai.base_urlは同上）

以下の使用状況では、Alibaba Cloudの設定が必要です：
* llm_providerにaliyunを記入した場合、Alibaba Cloudの大規模モデルサービスを使用するため、aliyun.bailian項目の設定が必要
* transcription_providerにaliyunを記入した場合、またはタスク起動時に「吹き替え」機能を有効にした場合、Alibaba Cloudの音声サービスを使用するため、aliyun.speech項目の記入が必要
* 「吹き替え」機能を有効にし、ローカルオーディオを音声クローニング用にアップロードした場合、Alibaba CloudのOSSクラウドストレージサービスを使用するため、aliyun.oss項目の記入が必要
Alibaba Cloud設定ヘルプ：[阿里云配置说明](./aliyun.md)

## よくある質問

[よくある質問](./faq.md)をご覧ください

## コントリビューション規範
1. .vscode、.ideaなどの不要なファイルをコミットしないでください。.gitignoreを活用してフィルタリングしてください
2. config.tomlをコミットせず、代わりにconfig-example.tomlを使用してコミットしてください

## お問い合わせ
1. QQグループに参加して質問にお答えします：754069680
2. ソーシャルメディアアカウントBilibiliをフォローし、AI技術分野の高品質なコンテンツを毎日シェアしています

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)
