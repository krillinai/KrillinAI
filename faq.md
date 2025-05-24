### 1. Cannot find `app.log` configuration file, unable to know the error content
Windows users should place the working directory of this software in a folder that is not on the C drive.

### 2. The configuration file was created for the non-desktop version, but it still reports "Configuration file not found"
Ensure that the configuration file is named `config.toml`, not `config.toml.txt` or something else. After configuration, the structure of the working folder for this software should look like this:
```
/── config/
│   └── config.toml
├── cookies.txt （<- Optional cookies.txt file）
└── krillinai.exe
```

### 3. Filled in the large model configuration, but it reports "xxxxx requires configuration of xxxxx API Key"
Although both the model service and the voice service can use OpenAI's services, there are scenarios where the large model uses non-OpenAI services separately. Therefore, these two configurations are separate. In addition to the large model configuration, please look for the whisper configuration below to fill in the corresponding keys and other information.

### 4. Error contains "yt-dlp error"
The issue with the video downloader seems to be either a network problem or a downloader version issue. Check if the network proxy is enabled and configured in the proxy configuration item of the configuration file, and it is recommended to choose a Hong Kong node. The downloader is automatically installed by this software, and while I will update the installation source, it is not an official source, so it may be outdated. If you encounter issues, try updating it manually with the following method:

Open a terminal in the software's bin directory and execute
```
./yt-dlp.exe -U
```
Replace `yt-dlp.exe` with the actual name of the ytdlp software on your system.

### 5. After deployment, subtitle generation is normal, but the synthesized subtitles embedded in the video have a lot of garbled text
This is mostly due to the lack of Chinese fonts in Linux. Please download the [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) and [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc) fonts (or choose fonts that meet your requirements), and then follow these steps:
1. Create a msyh folder under /usr/share/fonts/ and copy the downloaded fonts to that directory.
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```