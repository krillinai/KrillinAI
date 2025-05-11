# Docker デプロイガイド

## クイックスタート
まず、設定ファイルを準備し、サーバーのリスニングポートを`8888`、サーバーのリスニングアドレスを`0.0.0.0`に設定します。

### docker runでの起動
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  asteria798/krillinai
```

### docker-composeでの起動
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml # 設定ファイル
      - /path/to/tasks:/app/tasks # 出力ディレクトリ
```

## モデルの永続化
fasterwhisperモデルを使用する場合、KrillinAIは自動的にモデルに必要なファイルを`/app/models`ディレクトリと`/app/bin`ディレクトリにダウンロードします。コンテナが削除されると、これらのファイルは失われます。モデルを永続化する必要がある場合は、これらの2つのディレクトリをホストマシンのディレクトリにマッピングしてください。

### docker runでの起動
```bash
docker run -d \
  -p 8888:8888 \
  -v /path/to/config.toml:/app/config/config.toml \
  -v /path/to/tasks:/app/tasks \
  -v /path/to/models:/app/models \
  -v /path/to/bin:/app/bin \
  asteria798/krillinai
```

### docker-composeでの起動
```yaml
version: '3'
services:
  krillin:
    image: asteria798/krillinai
    ports:
      - "8888:8888"
    volumes:
      - /path/to/config.toml:/app/config/config.toml      
      - /path/to/tasks:/app/tasks
      - /path/to/models:/app/models
      - /path/to/bin:/app/bin
```

## 注意事項
1. dockerコンテナのネットワークモードがhostでない場合、設定ファイルのサーバーリスニングアドレスを`0.0.0.0`に設定することをお勧めします。そうしないと、サービスにアクセスできない可能性があります。
2. コンテナ内でホストマシンのネットワークプロキシにアクセスする必要がある場合、プロキシアドレス設定項目`proxy`の`127.0.0.1`を`host.docker.internal`に設定してください。例えば`http://host.docker.internal:7890`のように。