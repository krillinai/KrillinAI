## 前提条件
您需要拥有一个 [阿里云](https://www.aliyun.com) 账户并完成实名认证。大多数服务都有免费配额。

## 获取阿里云 `access_key_id` 和 `access_key_secret`
1. 访问 [阿里云 AccessKey 管理页面](https://ram.console.aliyun.com/profile/access-keys)。
2. 点击“创建 AccessKey”。如有需要，选择使用方式为“用于本地开发环境”。
![阿里云访问密钥](/docs/images/aliyun_accesskey_1.png)
3. 妥善保管；最好将其复制到本地文件中进行存储。

## 激活阿里云语音服务
1. 访问 [阿里云语音服务管理页面](https://nls-portal.console.aliyun.com/applist)。您需要在首次访问时激活该服务。
2. 点击“创建项目”。
![阿里云语音](/docs/images/aliyun_speech_1.png)
3. 选择功能并激活它们。
![阿里云语音](/docs/images/aliyun_speech_2.png)
4. “流式文本转语音（CosyVoice 大模型）”需要升级到商业版；其他服务可以使用免费试用版。
![阿里云语音](/docs/images/aliyun_speech_3.png)
5. 直接复制应用密钥。
![阿里云语音](/docs/images/aliyun_speech_4.png)

## 激活阿里云 OSS 服务
1. 访问 [阿里云对象存储服务控制台](https://oss.console.aliyun.com/overview)。您需要在首次访问时激活该服务。
2. 在左侧选择 Bucket 列表，然后点击“创建”。
![阿里云 OSS](/docs/images/aliyun_oss_1.png)
3. 选择“快速创建”，填写合规的 Bucket 名称，并选择 **上海** 区域以完成创建（您在此处输入的名称将作为配置项 `aliyun.oss.bucket` 的值）。
![阿里云 OSS](/docs/images/aliyun_oss_2.png)
4. 创建后，进入该 Bucket。
![阿里云 OSS](/docs/images/aliyun_oss_3.png)
5. 关闭“阻止公共访问”开关，并将读写权限设置为“公共读取”。
![阿里云 OSS](/docs/images/aliyun_oss_4.png)
![阿里云 OSS](/docs/images/aliyun_oss_5.png)