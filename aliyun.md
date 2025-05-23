## Prerequisites
You need to have an [Alibaba Cloud](https://www.aliyun.com) account and complete real-name authentication. Most services have free quotas.

## Obtaining API Keys from Alibaba Cloud Bailian Platform
1. Log in to the [Alibaba Cloud Bailian Model Service Platform](https://bailian.console.aliyun.com/), hover over the personal center icon in the upper right corner of the page, and click on API-KEY in the dropdown menu.
![Bailian](/docs/images/bailian_1.png)
2. In the left navigation bar, select All API-KEYs or My API-KEYs, then create or view your API Key.

## Obtaining `access_key_id` and `access_key_secret` from Alibaba Cloud
1. Go to the [Alibaba Cloud AccessKey Management Page](https://ram.console.aliyun.com/profile/access-keys).
2. Click on Create AccessKey, and if needed, select the usage method as "Used in local development environment."
![Alibaba Cloud Access Key](/docs/images/aliyun_accesskey_1.png)
3. Keep it safe; it's best to copy it to a local file for storage.

## Activating Alibaba Cloud Voice Service
1. Go to the [Alibaba Cloud Voice Service Management Page](https://nls-portal.console.aliyun.com/applist). You need to activate the service on your first visit.
2. Click on Create Project.
![Alibaba Cloud Speech](/docs/images/aliyun_speech_1.png)
3. Select features and activate them.
![Alibaba Cloud Speech](/docs/images/aliyun_speech_2.png)
4. The "Streaming Text-to-Speech (CosyVoice Large Model)" needs to be upgraded to the commercial version; other services can use the free trial version.
![Alibaba Cloud Speech](/docs/images/aliyun_speech_3.png)
5. Simply copy the app key.
![Alibaba Cloud Speech](/docs/images/aliyun_speech_4.png)

## Activating Alibaba Cloud OSS Service
1. Go to the [Alibaba Cloud Object Storage Service Console](https://oss.console.aliyun.com/overview). You need to activate the service on your first visit.
2. Select the Bucket list on the left, then click on Create.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_1.png)
3. Choose Quick Create, fill in a compliant Bucket name, and select the **Shanghai** region to complete the creation (the name you enter here will be the value for the configuration item `aliyun.oss.bucket`).
![Alibaba Cloud OSS](/docs/images/aliyun_oss_2.png)
4. After creation, enter the Bucket.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_3.png)
5. Turn off the "Block Public Access" switch and set the read and write permissions to "Public Read."
![Alibaba Cloud OSS](/docs/images/aliyun_oss_4.png)
![Alibaba Cloud OSS](/docs/images/aliyun_oss_5.png)