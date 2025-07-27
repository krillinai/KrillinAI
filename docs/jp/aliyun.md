## 前提条件
[Alibaba Cloud](https://www.aliyun.com) アカウントを持ち、実名認証を完了する必要があります。ほとんどのサービスには無料のクォータがあります。

## Alibaba Cloud `access_key_id` と `access_key_secret` の取得
1. [Alibaba Cloud AccessKey 管理ページ](https://ram.console.aliyun.com/profile/access-keys)に移動します。
2. 「AccessKeyを作成」をクリックします。必要に応じて、使用方法を「ローカル開発環境で使用」に選択します。
![Alibaba Cloud access key](/docs/images/aliyun_accesskey_1.png)
3. 安全に保管してください。ローカルファイルにコピーして保存するのが最良です。

## Alibaba Cloud 音声サービスの有効化
1. [Alibaba Cloud 音声サービス管理ページ](https://nls-portal.console.aliyun.com/applist)に移動します。初回訪問時にサービスを有効化する必要があります。
2. 「プロジェクトを作成」をクリックします。
![Alibaba Cloud speech](/docs/images/aliyun_speech_1.png)
3. 機能を選択し、有効化します。
![Alibaba Cloud speech](/docs/images/aliyun_speech_2.png)
4. 「ストリーミングテキスト音声変換（CosyVoice 大モデル）」は商用版にアップグレードする必要があります。他のサービスは無料トライアル版を使用できます。
![Alibaba Cloud speech](/docs/images/aliyun_speech_3.png)
5. アプリキーをコピーします。
![Alibaba Cloud speech](/docs/images/aliyun_speech_4.png)

## Alibaba Cloud OSS サービスの有効化
1. [Alibaba Cloud オブジェクトストレージサービスコンソール](https://oss.console.aliyun.com/overview)に移動します。初回訪問時にサービスを有効化する必要があります。
2. 左側のバケットリストを選択し、「作成」をクリックします。
![Alibaba Cloud OSS](/docs/images/aliyun_oss_1.png)
3. 「クイック作成」を選択し、準拠したバケット名を入力し、**上海**リージョンを選択して作成を完了します（ここで入力した名前が設定項目 `aliyun.oss.bucket` の値になります）。
![Alibaba Cloud OSS](/docs/images/aliyun_oss_2.png)
4. 作成後、バケットに入ります。
![Alibaba Cloud OSS](/docs/images/aliyun_oss_3.png)
5. 「パブリックアクセスをブロック」スイッチをオフにし、読み取りおよび書き込み権限を「パブリックリード」に設定します。
![Alibaba Cloud OSS](/docs/images/aliyun_oss_4.png)
![Alibaba Cloud OSS](/docs/images/aliyun_oss_5.png)