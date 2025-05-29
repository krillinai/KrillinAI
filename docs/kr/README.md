<div align="center">
  <img src="/docs/images/logo.jpg" alt="KlicStudio" height="90">

  # 극간소화 AI 비디오 번역 및 더빙 도구

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKlicStudio | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

 ## 프로젝트 소개  ([지금 온라인 버전 체험하기!](https://www.klic.studio/))

Klic Studio는 Krillin AI가 개발한 다목적 오디오 및 비디오 현지화 및 향상 솔루션입니다. 이 간단하면서도 강력한 도구는 오디오 및 비디오 번역, 더빙, 음성 복제를 통합하여 가로 및 세로 화면 형식 출력을 지원하며, 모든 주요 플랫폼(비리비리, 샤오홍슈, 도우인, 비디오 번호, 쾌손, 유튜브, 틱톡 등)에서 완벽하게 표시됩니다. 엔드 투 엔드 워크플로우를 통해 몇 번의 클릭만으로 원본 자료를 아름답고 즉시 사용할 수 있는 크로스 플랫폼 콘텐츠로 변환할 수 있습니다.

## 주요 특징 및 기능:
🎯 **원클릭 시작**: 복잡한 환경 설정 없이 자동으로 종속성을 설치하고 즉시 사용할 수 있으며, 새로운 데스크톱 버전으로 더 편리하게 사용할 수 있습니다!

📥 **비디오 가져오기**: yt-dlp 다운로드 또는 로컬 파일 업로드 지원

📜 **정확한 인식**: Whisper 기반의 높은 정확도의 음성 인식

🧠 **스마트 분할**: LLM을 사용하여 자막 분할 및 정렬

🔄 **용어 교체**: 전문 분야 용어를 원클릭으로 교체

🌍 **전문 번역**: 문맥을 고려한 LLM 번역으로 자연스러운 의미 유지

🎙️ **더빙 복제**: CosyVoice의 선택된 음색 또는 사용자 정의 음색 복제 제공

🎬 **비디오 합성**: 가로 및 세로 비디오 및 자막 레이아웃 자동 처리

💻 **크로스 플랫폼**: Windows, Linux, macOS 지원, 데스크톱 버전 및 서버 버전 제공


## 효과 시연
아래 이미지는 46분 길이의 로컬 비디오를 가져온 후 원클릭 실행으로 생성된 자막 파일의 효과로, 수동 조정 없이도 자연스럽게 구분되어 있으며, 번역 품질도 매우 높습니다.
![정렬 효과](/docs/images/alignment.png)

<table>
<tr>
<td width="33%">

### 자막 번역
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="33%">



### 더빙
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>

<td width="33%">

### 세로 화면
---
https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 음성 인식 서비스 지원
_**아래 표의 로컬 모델은 모두 자동 설치 가능한 실행 파일 + 모델 파일을 지원하며, 선택만 하면 Klic이 나머지를 준비해드립니다.**_

| 서비스 출처                | 지원 플랫폼            | 모델 선택 옵션                                  | 로컬/클라우드 | 비고          |
|--------------------|-----------------|----------------------------------------|-------|-------------|
| **OpenAI Whisper** | 모든 플랫폼             | -                                      | 클라우드    | 빠르고 효과적      |
| **FasterWhisper**  | Windows/Linux   | `tiny`/`medium`/`large-v2` (추천 medium+) | 로컬    | 더 빠르며 클라우드 서비스 비용 없음 |
| **WhisperKit**     | macOS (M 시리즈 칩 전용) | `large-v2`                             | 로컬    | Apple 칩 최적화 |
| **WhisperCpp**     | 모든 플랫폼             | `large-v2`                             | 로컬    | 모든 플랫폼 지원       |
| **Alibaba Cloud ASR**         | 모든 플랫폼             | -                                      | 클라우드    | 중국 본토 네트워크 문제 회피  |

## 🚀 대형 언어 모델 지원

✅ **OpenAI API 규격**에 부합하는 모든 클라우드/로컬 대형 언어 모델 서비스와 호환되며, 포함하되 이에 국한되지 않습니다:
- OpenAI
- Gemini
- DeepSeek
- 통의천문
- 로컬 배포된 오픈 소스 모델
- 기타 OpenAI 형식의 API 서비스

## 🎤 TTS 텍스트 음성 변환 지원
- Alibaba Cloud 음성 서비스
- OpenAI TTS

## 언어 지원
입력 언어 지원: 중국어, 영어, 일본어, 독일어, 터키어, 한국어, 러시아어, 말레이어(지속적으로 증가 중)

번역 언어 지원: 영어, 중국어, 러시아어, 스페인어, 프랑스어 등 101개 언어

## 인터페이스 미리보기
![인터페이스 미리보기](/docs/images/ui_desktop.png)


## 🚀 빠른 시작
### 기본 단계
먼저 [Release](https://github.com/KrillinAI/KlicStudio/releases)에서 귀하의 장치 시스템에 맞는 실행 파일을 다운로드하고, 아래의 튜토리얼에 따라 데스크톱 버전 또는 비데스크톱 버전을 선택한 후 빈 폴더에 소프트웨어를 다운로드하세요. 실행 후 몇 개의 디렉토리가 생성되므로 빈 폴더에 두면 관리하기 더 좋습니다.  

【데스크톱 버전인 경우, 즉 release 파일에 desktop이 포함된 경우 이곳을 참조】  
_데스크톱 버전은 새로 출시된 것으로, 초보 사용자가 구성 파일을 올바르게 편집하기 어려운 문제를 해결하기 위해 지속적으로 업데이트되고 있습니다._
1. 파일을 두 번 클릭하여 사용을 시작합니다(데스크톱에서도 구성이 필요하며, 소프트웨어 내에서 구성합니다).

【비데스크톱 버전인 경우, 즉 release 파일에 desktop이 포함되지 않은 경우 이곳을 참조】  
_비데스크톱 버전은 초기 버전으로, 구성이 복잡하지만 기능이 안정적이며 서버 배포에 적합합니다. 웹 방식으로 UI를 제공합니다._
1. 폴더 내에 `config` 폴더를 생성한 후, `config` 폴더 내에 `config.toml` 파일을 생성하고, 소스 코드 `config` 디렉토리 내의 `config-example.toml` 파일 내용을 복사하여 `config.toml`에 붙여넣고 주석에 따라 구성 정보를 입력합니다.
2. 두 번 클릭하거나 터미널에서 실행 파일을 실행하여 서비스를 시작합니다.
3. 브라우저를 열고 `http://127.0.0.1:8888`를 입력하여 사용을 시작합니다 (8888은 구성 파일에 입력한 포트로 대체).

### macOS 사용자에게
【데스크톱 버전인 경우, 즉 release 파일에 desktop이 포함된 경우 이곳을 참조】  
데스크톱 버전은 현재 패키징 방식으로 인해 서명 등의 문제로 인해 두 번 클릭하여 직접 실행하거나 dmg 설치를 할 수 없으며, 수동으로 애플리케이션을 신뢰해야 합니다. 방법은 다음과 같습니다:
1. 터미널에서 실행 파일(가정: 파일 이름은 KlicStudio_1.0.0_desktop_macOS_arm64)이 있는 디렉토리를 엽니다.
2. 다음 명령을 순서대로 실행합니다:
```
sudo xattr -cr ./KlicStudio_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KlicStudio_1.0.0_desktop_macOS_arm64 
./KlicStudio_1.0.0_desktop_macOS_arm64
```

【비데스크톱 버전인 경우, 즉 release 파일에 desktop이 포함되지 않은 경우 이곳을 참조】  
본 소프트웨어는 서명을 하지 않았으므로 macOS에서 실행할 때 "기본 단계"의 파일 구성을 완료한 후 수동으로 애플리케이션을 신뢰해야 합니다. 방법은 다음과 같습니다:
1. 터미널에서 실행 파일(가정: 파일 이름은 KlicStudio_1.0.0_macOS_arm64)이 있는 디렉토리를 엽니다.
2. 다음 명령을 순서대로 실행합니다:
   ```
    sudo xattr -rd com.apple.quarantine ./KlicStudio_1.0.0_macOS_arm64
    sudo chmod +x ./KlicStudio_1.0.0_macOS_arm64
    ./KlicStudio_1.0.0_macOS_arm64
    ```
    서비스를 시작할 수 있습니다.

### Docker 배포
본 프로젝트는 Docker 배포를 지원하며, [Docker 배포 설명서](./docker.md)를 참조하십시오.

### 쿠키 구성 설명(선택 사항)

비디오 다운로드 실패 상황이 발생한 경우

[쿠키 구성 설명](./get_cookies.md)을 참조하여 쿠키 정보를 구성하십시오.

### 구성 도움말 (필독)
가장 빠르고 편리한 구성 방법:
* `transcribe.provider.name`에 `openai`를 입력하면 `transcribe.openai` 블록과 `llm` 블록의 대형 모델 구성만 입력하면 자막 번역이 가능합니다.(`app.proxy`, `model` 및 `openai.base_url`은 상황에 따라 선택적으로 입력)

로컬 음성 인식 모델을 사용하는 구성 방법(비용, 속도 및 품질의 균형 선택)
* `transcribe.provider.name`에 `fasterwhisper`를 입력하고, `transcribe.fasterwhisper.model`에 `large-v2`를 입력한 후, `llm`에 대형 모델 구성을 입력하면 자막 번역이 가능합니다. 로컬 모델은 자동으로 다운로드 및 설치됩니다.(`app.proxy` 및 `openai.base_url`은 위와 동일)

텍스트 음성 변환(TTS)은 선택 사항이며, 구성 논리는 위와 동일하며 `tts.provider.name`을 입력한 후 `tts` 아래의 해당 구성 블록을 입력하면 됩니다. UI에서 음성 코드는 선택한 제공자의 문서에 따라 입력하면 됩니다(아래의 자주 묻는 질문에 문서 주소가 있습니다). Alibaba Cloud의 aksk 등의 입력은 중복될 수 있으며, 이는 구성 구조를 명확하게 하기 위함입니다.  
주의: 음성 복제를 사용하는 경우, `tts`는 `aliyun`만 선택할 수 있습니다.

**Alibaba Cloud AccessKey, Bucket, AppKey의 획득 방법은**: [Alibaba Cloud 구성 설명](./aliyun.md) 를 참조하십시오.

작업 = 음성 인식 + 대형 모델 번역 + 음성 서비스(TTS 등, 선택 사항)이라는 점을 이해하면 구성 파일을 이해하는 데 도움이 됩니다.

## 자주 묻는 질문

[자주 묻는 질문](./faq.md)로 이동하십시오.

## 기여 규범
1. .vscode, .idea 등과 같은 쓸모없는 파일을 제출하지 마십시오. .gitignore를 사용하여 필터링하는 데 능숙해지십시오.
2. config.toml을 제출하지 말고 config-example.toml을 제출하십시오.

## 문의하기
1. 우리의 QQ 그룹에 가입하여 질문을 해결하십시오: 754069680
2. 우리의 소셜 미디어 계정을 팔로우하십시오, [비리비리](https://space.bilibili.com/242124650), 매일 AI 기술 분야의 양질의 콘텐츠를 공유합니다.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=KrillinAI/KlicStudio&type=Date)](https://star-history.com/#KrillinAI/KlicStudio&Date)