## 前提条件
需要先有[阿里云](https://www.aliyun.com)账号并经过实名认证，多数服务有免费额度

## 阿里云百炼平台密钥获取
1. 登录[阿里云百炼大模型服务平台](https://bailian.console.aliyun.com/)，鼠标悬停于页面右上角的个人中心图标上，在下拉菜单中单击API-KEY
![百炼](./images/bailian_1.png)
2. 在左侧导航栏，选择全部API-KEY或我的API-KEY，然后创建或查看API Key

## 阿里云`access_key_id`和`access_key_secret`获取
1. 进入[阿里云AccessKey管理页面](https://ram.console.aliyun.com/profile/access-keys)
2. 点击创建AccessKey，如需要选择使用方式，选择“本地开发环境中使用”
![阿里云access key](./images/aliyun_accesskey_1.png)
3. 妥善保管，最好复制到本地文件保存

## 阿里云语音服务开通
1. 进入[阿里云语音服务管理页面](https://nls-portal.console.aliyun.com/applist)，首次进入需开通服务
2. 点击创建项目
![阿里云speech](images/aliyun_speech_1.png)
3. 选择功能并开通
![阿里云speech](images/aliyun_speech_2.png)
4. “流式文本语音合成（CosyVoice大模型）”需要升级成商业版，其它服务可以用免费体验版
![阿里云speech](images/aliyun_speech_3.png)
5. 复制app key即可
![阿里云speech](images/aliyun_speech_4.png)

## 阿里云OSS服务开通
1. 进入[阿里云对象存储服务控制台](https://oss.console.aliyun.com/overview)，首次进入需开通服务
2. 左侧选择Bucket列表，然后点击创建
![阿里云OSS](./images/aliyun_oss_1.png)
3. 选择快捷创建，填写符合要求的Bucket名称并选择**上海**地域，完成创建(此处填写的名字就是配置项`aliyun.oss.bucket`的值)
![阿里云OSS](./images/aliyun_oss_2.png)
4. 创建完成后进入Bucket
![阿里云OSS](./images/aliyun_oss_3.png)
5. 将“阻止公共访问”开关关闭，并设置读写权限为“公共读”
![阿里云OSS](./images/aliyun_oss_4.png)
![阿里云OSS](./images/aliyun_oss_5.png)