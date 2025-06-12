### 1. `app.log`設定ファイルが見えず、エラー内容がわからない
Windowsユーザーは、本ソフトウェアの作業ディレクトリをCドライブ以外のフォルダに配置してください。

### 2. デスクトップ版では明らかに設定ファイルが作成されたが、「設定ファイルが見つかりません」とエラーが出る
設定ファイル名が`config.toml`であることを確認してください。`config.toml.txt`やその他の名前ではありません。
設定が完了した後、本ソフトウェアの作業フォルダの構造は以下のようになります：
```
/── config/
│   └── config.toml
├── cookies.txt （<- オプションのcookies.txtファイル）
└── krillinai.exe
```

### 3. 大モデルの設定を記入したが、「xxxxxにはxxxxx API Keyの設定が必要です」とエラーが出る
モデルサービスと音声サービスは両方ともopenaiのサービスを使用できますが、大モデルが非openaiのシーンで単独使用されることもあるため、これらの設定は分かれています。大モデルの設定に加えて、設定の下にあるwhisper設定で対応するキーなどの情報を記入してください。

### 4. エラーに「yt-dlp error」が含まれている
動画ダウンローダーの問題で、現在のところネットワークの問題かダウンローダーのバージョンの問題である可能性があります。ネットワークプロキシが開いていて、設定ファイルのプロキシ設定項目に正しく構成されているか確認してください。また、香港ノードを選択することをお勧めします。ダウンローダーは本ソフトウェアが自動的にインストールしたもので、インストール元は更新しますが、公式のものではないため、古くなる可能性があります。問題が発生した場合は手動で更新を試みてください。更新方法：

ソフトウェアのbinディレクトリでターミナルを開き、次のコマンドを実行します。
```
./yt-dlp.exe -U
```
ここで`yt-dlp.exe`は、あなたのシステムで実際のytdlpソフトウェア名に置き換えてください。

### 5. デプロイ後、字幕生成は正常だが、合成された字幕が動画に埋め込まれると多くの文字化けがある
ほとんどはLinuxに中国語フォントが欠けているためです。[微软雅黑](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc)と[微软雅黑-bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc)フォント（または自分の要件を満たすフォントを選択）をダウンロードし、以下の手順に従って操作してください：
1. `/usr/share/fonts/`にmsyhフォルダを新規作成し、ダウンロードしたフォントをそのディレクトリにコピーします。
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```

### 6. 音声合成の音色コードはどう記入すればよいですか？
音声サービス提供者のドキュメントを参照してください。以下は本プロジェクトに関連するものです：  
[OpenAI TTSドキュメント](https://platform.openai.com/docs/guides/text-to-speech/api-reference)、Voice optionsにあります  
[アリババクラウドのインテリジェント音声インタラクションドキュメント](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis)、音色リスト-voiceパラメータ値にあります