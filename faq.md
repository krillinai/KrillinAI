### 1. Cannot find `app.log` configuration file, unable to know the error content
Windows users, please place the working directory of this software in a folder outside of the C drive.

### 2. The configuration file was created for the non-desktop version, but still reports "Configuration file not found"
Ensure that the configuration file name is `config.toml`, not `config.toml.txt` or something else. After configuration, the structure of the working folder for this software should look like this:
```
/── config/
│   └── config.toml
├── cookies.txt （<- Optional cookies.txt file）
└── krillinai.exe
```

### 3. Filled in the large model configuration, but reports "xxxxx requires configuration of xxxxx API Key"
Although both the model service and the voice service can use OpenAI's services, there are scenarios where the large model uses non-OpenAI services separately. Therefore, these two configurations are separate. In addition to the large model configuration, please look for the whisper configuration below to fill in the corresponding keys and other information.

### 4. Error contains "yt-dlp error"
The issue with the video downloader seems to be related to network problems or the version of the downloader. Check if the network proxy is enabled and configured in the proxy configuration section of the configuration file, and it is recommended to choose a Hong Kong node. The downloader is automatically installed by this software, and while I will update the installation source, it is not an official source, so it may be outdated. If you encounter issues, try updating it manually with the following method:

Open a terminal in the software's bin directory and execute
```
./yt-dlp.exe -U
```
Replace `yt-dlp.exe` with the actual name of the ytdlp software on your system.

### 5. After deployment, subtitles are generated normally, but the embedded subtitles in the video have a lot of garbled text
This is mostly due to missing Chinese fonts on Linux. Please download the Microsoft YaHei font from the "Fonts" folder [here](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) (or choose a font that meets your requirements), and then follow these steps:
1. Create a msyh folder under /usr/share/fonts/ and copy the downloaded font into that directory.
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```