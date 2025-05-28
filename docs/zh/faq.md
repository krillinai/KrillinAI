### 1. 看不到`app.log`配置文件，无法知道报错内容
Windows用户请将本软件的工作目录放在非C盘的文件夹。

### 2. 非桌面版明明创建了配置文件，但还是报错“找不到配置文件”
确保配置文件名是`config.toml`，而不是`config.toml.txt`或其它。
配置完成后，本软件的工作文件夹的结构应该是这样的：
```
/── config/
│   └── config.toml
├── cookies.txt （<- 可选的cookies.txt文件）
└── krillinai.exe
```

### 3. 填写了大模型配置，但是报错“xxxxx需要配置xxxxx API Key”
模型服务和语音服务虽然可以都用openai的服务，但是也有大模型单独使用非openai的场景，因此这两块配置是分开的，除了大模型配置，请往配置下方找whisper配置填写对应的密钥等信息。

### 4. 报错内含“yt-dlp error”
视频下载器的问题，目前看来无非就是网络问题或者下载器版本问题，检查下网络代理有没有打开并且配置到配置文件的代理配置项，同时建议选择香港节点。下载器是本软件自动安装的，安装的源我会更新但毕竟不是官方源，所以可能会有落后，遇到问题尝试手动更新一下，更新方法：

在软件bin目录位置打开终端，执行
```
./yt-dlp.exe -U
```
此处`yt-dlp.exe`替换为你系统实际的ytdlp软件名称。

### 5. 部署后，字幕生成正常，但是合成的字幕嵌入视频里有很多乱码
多数是因为Linux缺失中文字体。请下载[微软雅黑](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc)和[微软雅黑-bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc)字体（或者自行选择满足你要求的字体），然后按下面的步骤操作：
1. 在/usr/share/fonts/下新建msyh文件夹并拷贝下载的字体到该目录内
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```
   
### 6. 语音合成的音色代码怎么填？
请参照语音服务提供商的文档，以下是本项目相关的：  
[OpenAI TTS文档](https://platform.openai.com/docs/guides/text-to-speech/api-reference)， 位于Voice options  
[阿里云智能语音交互文档](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis) ，位于音色列表-voice参数值