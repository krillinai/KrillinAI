# Cookie 配置说明

## 问题说明
在生成字幕的时候，可能会遇到出错的情况，例如“Sign in to confirm you are not a bot”：

这是因为:
1. 部分视频平台需要用户登录信息才能获取高质量视频
2. 您当前的代理的ip不够纯净，已被视频网站官方限制

## 解决方法

### 1. 安装浏览器扩展
根据你使用的浏览器选择安装:

- Chrome浏览器: [Get CookieTxt Locally](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- Edge浏览器: [Export Cookies File](https://microsoftedge.microsoft.com/addons/detail/export-cookies-file/hbglikhfdcfhdfikmocdflffaecbnedo)

### 2. 导出Cookie文件
1. 登录需要下载视频的网站(如B站、YouTube等)
2. 点击浏览器扩展图标
3. 选择"Export Cookies"选项
4. 将导出的cookies.txt文件保存到本软件所在的目录下
5. 如果导出的文件名不是cookies.txt，请将文件名改为cookies.txt

图示：
![导出cookies](./images/export_cookies.png)

导出后，工具的工作文件夹的结构应该是这样的：
```
/── config/
│   └── config.toml
├── tasks/
├── cookies.txt （<- 导出的cookies.txt文件）
└── krillinai.exe
```