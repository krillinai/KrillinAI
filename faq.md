### 1. The program reports "Configuration file not found" or "xxxxx requires configuration of xxxxx API Key." How do I fix this?

This is a common setup issue. There are a few reasons this might happen:

1. **Incorrect File Location or Name:**

* The program requires a configuration file named exactly `config.toml`. Ensure you have not accidentally named it `config.toml.txt`.
* This file must be placed inside a `config` folder. The correct structure of the working directory should be:
  ```
  /── config/
  │   └── config.toml
  └── krillinai.exe(your executable file)
  ```
* **For Windows users:** It is recommended to place the entire software directory in a folder that is not on the C: drive to avoid potential permission issues.

2. **Incomplete API Key Configuration:**

* The application requires separate configurations for the large language model (for translation), the voice service (for transcription and speech synthesis) and the tts service.
* Even if you use OpenAI for all, you must fill in the key in different sections of the `config.toml` file. Look for the `llm` section, the `transcribe` section, the `tts` section and fill in the corresponding API Keys and other required information.

### 2. I'm getting an error that contains "yt-dlp error." What should I do?

This error points to a problem with the video downloader, which is usually related to your network or the downloader's version.

* **Network:** If you use a proxy, ensure it is correctly configured in the proxy settings within your `config.toml` file.
* **Update `yt-dlp`:** The version of `yt-dlp` bundled with the software may be outdated. You can update it manually by opening a terminal in the software's `bin` directory and running the command:
  ```
  ./yt-dlp.exe -U
  ```
  
  (Replace `yt-dlp.exe` with the correct filename for your operating system if it differs).

### 3. The subtitles in the final video are garbled or appear as square blocks, especially on Linux.

This is almost always caused by missing fonts on the system, particularly those that support Chinese characters. To fix this, you need to install the necessary fonts.

1. Download the required fonts, such as [Microsoft YaHei](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc) and [Microsoft YaHei Bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc).
2. Create a new font directory: `sudo mkdir -p /usr/share/fonts/msyh`.
3. Copy the downloaded `.ttc` font files into this new directory.
4. Execute the following commands to rebuild the font cache:
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    sudo fc-cache -fv
    ```

### 4. On macOS, the application won't start and shows an error like "KrillinAI is damaged and can’t be opened."

This is caused by macOS's security feature, Gatekeeper, which restricts apps from unidentified developers. To fix this, you must manually remove the quarantine attribute.

1. Open the **Terminal** app.
2. Type the command `xattr -cr` followed by a space, then drag the `KrillinAI.app` file from your Finder window into the Terminal. The command will look something like this:
    ```
    xattr -cr /Applications/KrillinAI.app
    ```
3. Press Enter. You should now be able to open the application.

### 5. I'm getting errors like `ffmpeg error`, `audioToSrt error`, or `exit status 1` during processing.

These errors usually point to issues with dependencies or system resources.

* **`ffmpeg error`:** This indicates that `ffmpeg` is either not installed or not accessible from the system's PATH. Ensure you have a complete, official version of `ffmpeg` installed and that its location is added to your system's environment variables.
* **`audioToSrt error` or `exit status 1`:** This error occurs during the transcription phase (audio-to-text). The common causes are:
  * **Model Issues:** The local transcription model (e.g., `fasterwhisper`) failed to load or was corrupted during download.
  * **Insufficient Memory (RAM):** Running local models is resource-intensive. If your machine runs out of memory, the operating system may terminate the process, resulting in an error.
  * **Network Failure:** If you are using an online transcription service (like OpenAI's Whisper API), this indicates a problem with your network connection or an invalid API key.

### 6. The progress bar isn't moving. Is the program frozen?

No, as long as you don't see an error message, the program is working. The progress bar only updates after a major task (like transcription or video encoding) is fully completed. These tasks can be very time-consuming, causing the progress bar to pause for an extended period. Please be patient and wait for the task to finish.

### 7. My NVIDIA 5000 series GPU is not supported by `fasterwhisper`. What should I do?

It has been observed that the `fasterwhisper` model may not work correctly with NVIDIA 5000 series GPUs (as of mid-2025). You have a few alternatives for transcription:

1. **Use a Cloud-Based Model:** Set `transcribe.provider.name` to `openai` or `aliyun` in your `config.toml` file. Then, fill in the corresponding API key and configuration details. This will use the cloud provider's Whisper model instead of the local one.
2. **Use Another Local Model:** You can experiment with other local transcription models, such as the original `whisper.cpp`.

### 8. How do I find and fill in the correct voice/tone code for text-to-speech?

The available voices and their corresponding codes are defined by the voice service provider you are using. Please refer to their official documentation.

* **OpenAI TTS:** [Documentation](https://platform.openai.com/docs/guides/text-to-speech/api-reference) (see the `voice` options).
* **Alibaba Cloud:** [Documentation](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis) (see the `voice` parameter in the tone list).

### 9. How can I use a local Large Language Model (LLM), like one running on Ollama, for translation?

Yes, you can configure KrillinAI to use any local LLM that provides an OpenAI-compatible API endpoint.

1. **Start Your Local LLM:** Ensure your local service (e.g., Ollama running Llama3) is active and accessible.
2. **Edit `config.toml`:** In the section for the large language model (translator):

* Set the provider `name` (or `type`) to `"openai"`.
* Set the `api_key` to any random string (e.g., `"ollama"`), as it is not needed for local calls.
* Set the `base_url` to your local model's API endpoint. For Ollama, this is typically `http://localhost:11434/v1`.
* Set the `model` to the name of the model you are serving, for example, `"llama3"`.

### 10. Can I customize the subtitle style (font, size, color) in the final video?

No. Currently, KrillinAI generates **hardcoded subtitles**, meaning they are burned directly into the video frames. The application **does not offer options to customize the subtitle style**; it uses a preset style.

For advanced customization, the recommended workaround is to:

1. Use KrillinAI to generate the translated `.srt` subtitle file.
2. Import your original video and this `.srt` file into a professional video editor (e.g., Premiere Pro, Final Cut Pro, DaVinci Resolve) to apply custom styles before rendering.

### 11. I already have a translated `.srt` file. Can KrillinAI use it to just perform the dubbing?

No, this feature is not currently supported. The application runs a full pipeline from transcription to final video generation.

