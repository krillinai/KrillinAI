### 1. Cannot find `app.log` configuration file, unable to know the error content
Windows users please place the working directory of this software in a folder that is not on the C drive.

### 2. The configuration file was clearly created in the non-desktop version, but still reports "Configuration file not found"
Ensure that the configuration file name is `config.toml`, not `config.toml.txt` or anything else. After configuration, the structure of the working folder for this software should look like this:
```
/── config/
│   └── config.toml
├── cookies.txt (optional cookies.txt file)
└── krillinai.exe
```

### 3. Filled in the large model configuration, but reports "xxxxx requires configuration of xxxxx API Key"
Although both the model service and voice service can use OpenAI's services, there are scenarios where the large model uses non-OpenAI services separately. Therefore, these two configurations are separate. In addition to the large model configuration, please look for the whisper configuration below to fill in the corresponding keys and other information.

### 4. Error contains "yt-dlp error"
The issue with the video downloader seems to be either a network problem or a downloader version issue. Check if the network proxy is enabled and configured in the proxy configuration section of the configuration file, and it is recommended to choose a Hong Kong node. The downloader is automatically installed by this software, and while I will update the installation source, it is not an official source, so it may be outdated. If you encounter issues, try updating it manually. The update method is:

Open the terminal in the software's bin directory and execute
```
./yt-dlp.exe -U
```
Replace `yt-dlp.exe` with the actual name of the ytdlp software on your system.