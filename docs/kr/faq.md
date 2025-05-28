### 1. `app.log` 구성 파일을 볼 수 없어 오류 내용을 알 수 없음
Windows 사용자께서는 본 소프트웨어의 작업 디렉토리를 C 드라이브가 아닌 폴더에 두시기 바랍니다.

### 2. 비데스크톱 버전에서 구성 파일이 생성되었지만 여전히 "구성 파일을 찾을 수 없음" 오류 발생
구성 파일 이름이 `config.toml`인지 확인하세요. `config.toml.txt` 또는 다른 이름이 아니어야 합니다.
구성이 완료된 후, 본 소프트웨어의 작업 폴더 구조는 다음과 같아야 합니다:
```
/── config/
│   └── config.toml
├── cookies.txt （<- 선택적 cookies.txt 파일）
└── krillinai.exe
```

### 3. 대모델 구성을 입력했지만 "xxxxx는 xxxxx API Key 구성이 필요합니다" 오류 발생
모델 서비스와 음성 서비스는 모두 OpenAI의 서비스를 사용할 수 있지만, 대모델은 OpenAI가 아닌 다른 서비스를 사용할 수 있는 경우도 있습니다. 따라서 이 두 가지 구성은 분리되어 있으며, 대모델 구성 외에도 아래의 whisper 구성에서 해당 키 등의 정보를 입력해야 합니다.

### 4. 오류 메시지에 "yt-dlp error" 포함
비디오 다운로드 도구의 문제로, 현재로서는 네트워크 문제 또는 다운로드 도구 버전 문제일 수 있습니다. 네트워크 프록시가 활성화되어 있고 구성 파일의 프록시 구성 항목에 설정되어 있는지 확인하세요. 또한 홍콩 노드를 선택하는 것이 좋습니다. 다운로드 도구는 본 소프트웨어가 자동으로 설치하며, 설치 소스는 업데이트하겠지만 공식 소스가 아니므로 구버전일 수 있습니다. 문제가 발생하면 수동으로 업데이트를 시도해 보세요. 업데이트 방법은 다음과 같습니다:

소프트웨어 bin 디렉토리 위치에서 터미널을 열고 다음을 실행하세요:
```
./yt-dlp.exe -U
```
여기서 `yt-dlp.exe`는 시스템에서 실제 ytdlp 소프트웨어 이름으로 교체하세요.

### 5. 배포 후 자막 생성은 정상이나 합성된 자막이 비디오에 많은 깨짐 현상 발생
대부분은 Linux에 중국어 글꼴이 없기 때문입니다. [微软雅黑](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyh.ttc)와 [微软雅黑-bold](https://modelscope.cn/models/Maranello/KrillinAI_dependency_cn/resolve/master/%E5%AD%97%E4%BD%93/msyhbd.ttc) 글꼴(또는 요구 사항을 충족하는 글꼴)을 다운로드한 후, 아래 단계를 따라 진행하세요:
1. `/usr/share/fonts/` 아래에 msyh 폴더를 새로 만들고 다운로드한 글꼴을 해당 디렉토리에 복사합니다.
2. 
    ```
    cd /usr/share/fonts/msyh
    sudo mkfontscale
    sudo mkfontdir
    fc-cache
    ```

### 6. 음성 합성의 음색 코드는 어떻게 입력하나요?
음성 서비스 제공자의 문서를 참조하세요. 다음은 본 프로젝트와 관련된 문서입니다:  
[OpenAI TTS 문서](https://platform.openai.com/docs/guides/text-to-speech/api-reference), Voice options에 위치  
[알리바바 클라우드 스마트 음성 상호작용 문서](https://help.aliyun.com/zh/isi/developer-reference/overview-of-speech-synthesis), 음색 목록 - voice 매개변수 값에 위치