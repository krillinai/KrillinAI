<div align="center">
  <img src="/docs/images/logo.png" alt="KrillinAI" height="90">

  # 극소형 배포 AI 비디오 번역 더빙 도구

  <a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Discord](https://img.shields.io/discord/1333374141092331605?label=Discord&logo=discord&style=flat-square)](https://discord.gg/sKUAsHfy)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢윈도우 및 맥 데스크탑 버전 새로 출시, 테스트 및 피드백 환영합니다[문서가 다소 구식이며 지속적으로 업데이트 중입니다]

 ## 프로젝트 소개  

Krillin AI는 다목적 음성 및 비디오 현지화 및 향상 솔루션입니다. 이 간단하면서도 강력한 도구는 음성 및 비디오 번역, 더빙, 음성 복제를 통합하여 가로 및 세로 화면 형식 출력을 지원하며, 모든 주요 플랫폼(비리비리, 샤오홍슈, 도우인, 비디오 번호, 쾌손, 유튜브, 틱톡 등)에서 완벽하게 표시됩니다. 엔드 투 엔드 워크플로우를 통해 Krillin AI는 몇 번의 클릭만으로 원본 자료를 아름답고 즉시 사용할 수 있는 크로스 플랫폼 콘텐츠로 변환합니다.

## 주요 특징 및 기능:
🎯 **원클릭 시작**: 복잡한 환경 설정 없이 자동으로 종속성을 설치하고 즉시 사용할 수 있으며, 새로 추가된 데스크탑 버전으로 더 편리하게 사용할 수 있습니다!

📥 **비디오 가져오기**: yt-dlp 다운로드 또는 로컬 파일 업로드 지원

📜 **정확한 인식**: Whisper 기반의 높은 정확도의 음성 인식

🧠 **스마트 분할**: LLM을 사용하여 자막 분할 및 정렬

🔄 **용어 교체**: 전문 분야 용어를 원클릭으로 교체

🌍 **전문 번역**: LLM 기반으로 문단 수준의 번역이 의미의 일관성을 유지합니다.

🎙️ **더빙 복제**: CosyVoice의 선택된 음색 또는 사용자 정의 음색 복제 제공

🎬 **비디오 합성**: 자동으로 가로 및 세로 비디오와 자막 레이아웃을 처리합니다.


## 효과 시연
아래 이미지는 46분의 로컬 비디오를 가져온 후 원클릭 실행으로 생성된 자막 파일의 효과로, 수동 조정 없이도 자연스럽게 구분되어 있으며, 번역 품질도 매우 높습니다.
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
_**아래 표의 로컬 모델은 모두 자동 설치 가능한 실행 파일 + 모델 파일을 지원합니다. 선택하기만 하면 KrillinAI가 모든 것을 준비해 드립니다.**_

| 서비스 소스         | 지원 플랫폼          | 모델 선택 옵션                           | 로컬/클라우드 | 비고                   |
| ------------------ | --------------------- | ---------------------------------------- | --------- | ---------------------- |
| **OpenAI Whisper** | 모든 플랫폼           | -                                        | 클라우드  | 빠르고 효과적           |
| **FasterWhisper**  | Windows/Linux         | `tiny`/`medium`/`large-v2` (추천 medium+) | 로컬      | 더 빠르며 클라우드 서비스 비용 없음 |
| **WhisperKit**     | macOS (M 시리즈 칩 전용) | `large-v2`                               | 로컬      | Apple 칩 원주 최적화   |
| **알리바바 클라우드 ASR** | 모든 플랫폼           | -                                        | 클라우드  | 중국 본토 네트워크 문제 회피 |

## 🚀 대형 언어 모델 지원

✅ **OpenAI API 규격**에 부합하는 모든 클라우드/로컬 대형 언어 모델 서비스와 호환됩니다. 포함하되 이에 국한되지 않습니다:
- OpenAI
- DeepSeek
- 통의천문
- 로컬 배포된 오픈 소스 모델
- 기타 OpenAI 형식의 API 서비스

## 언어 지원
입력 언어 지원: 중국어, 영어, 일본어, 독일어, 터키어, 한국어, 러시아어, 말레이어(지속적으로 증가 중)

번역 언어 지원: 영어, 중국어, 러시아어, 스페인어, 프랑스어 등 101개 언어

## 인터페이스 미리보기
![인터페이스 미리보기](/docs/images/ui_desktop.png)


## 🚀 빠른 시작
### 기본 단계
먼저 [Release](https://github.com/krillinai/KrillinAI/releases)에서 귀하의 장치 시스템에 맞는 실행 파일을 다운로드하고, 아래의 튜토리얼에 따라 데스크탑 버전 또는 비데스크탑 버전을 선택한 후 빈 폴더에 넣어 소프트웨어를 다운로드합니다. 실행 후 몇 개의 디렉토리가 생성되므로 빈 폴더에 두면 관리하기 더 좋습니다.  

【데스크탑 버전인 경우, 즉 release 파일에 desktop이 포함된 경우 여기를 참조】  
_데스크탑 버전은 새로 출시된 것으로, 초보 사용자가 구성 파일을 올바르게 편집하기 어려운 문제를 해결하기 위해 많은 버그가 있으며 지속적으로 업데이트 중입니다._
1. 파일을 두 번 클릭하여 사용을 시작합니다(데스크탑 버전도 구성해야 하며, 소프트웨어 내에서 구성합니다).

【비데스크탑 버전인 경우, 즉 release 파일에 desktop이 포함되지 않은 경우 여기를 참조】  
_비데스크탑 버전은 초기 버전으로, 구성은 다소 복잡하지만 기능은 안정적이며 서버 배포에 적합합니다. 웹 방식으로 UI를 제공합니다._
1. 폴더 내에 `config` 폴더를 생성한 후, `config` 폴더 내에 `config.toml` 파일을 생성합니다. 소스 코드 `config` 디렉토리의 `config-example.toml` 파일 내용을 복사하여 `config.toml`에 붙여넣고, 귀하의 구성 정보를 대조하여 입력합니다.
2. 두 번 클릭하거나 터미널에서 실행 파일을 실행하여 서비스를 시작합니다.
3. 브라우저를 열고 `http://127.0.0.1:8888`를 입력하여 사용을 시작합니다 (8888은 구성 파일에 입력한 포트로 대체).

### macOS 사용자에게
【데스크탑 버전인 경우, 즉 release 파일에 desktop이 포함된 경우 여기를 참조】  
데스크탑 버전은 현재 패키징 방식 때문에 서명 등의 문제로 인해 두 번 클릭하여 직접 실행하거나 dmg 설치가 불가능하며, 수동으로 애플리케이션을 신뢰해야 합니다. 방법은 다음과 같습니다:
1. 터미널에서 실행 파일(가정: 파일 이름은 KrillinAI_1.0.0_desktop_macOS_arm64)이 있는 디렉토리를 엽니다.
2. 다음 명령을 순차적으로 실행합니다:
```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【비데스크탑 버전인 경우, 즉 release 파일에 desktop이 포함되지 않은 경우 여기를 참조】  
본 소프트웨어는 서명을 하지 않았으므로 macOS에서 실행할 때 "기본 단계"의 파일 구성을 완료한 후 수동으로 애플리케이션을 신뢰해야 합니다. 방법은 다음과 같습니다:
1. 터미널에서 실행 파일(가정: 파일 이름은 KrillinAI_1.0.0_macOS_arm64)이 있는 디렉토리를 엽니다.
2. 다음 명령을 순차적으로 실행합니다:
   ```
    sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
    sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
    ./KrillinAI_1.0.0_macOS_arm64
    ```
    그러면 서비스가 시작됩니다.

### Docker 배포
본 프로젝트는 Docker 배포를 지원합니다. [Docker 배포 설명서](./docker.md)를 참조하십시오.

### 쿠키 구성 설명(선택 사항)

비디오 다운로드 실패 상황이 발생하면

[쿠키 구성 설명](./get_cookies.md)을 참조하여 쿠키 정보를 구성하십시오.

### 구성 도움말 (필독)
가장 빠르고 편리한 구성 방법:
* `transcription_provider`와 `llm_provider`를 모두 `openai`로 선택하면 아래의 `openai`, `local_model`, `aliyun` 세 가지 구성 항목에서 `openai.apikey`만 입력하면 자막 번역이 가능합니다. (`app.proxy`, `model` 및 `openai.base_url`은 상황에 따라 선택적으로 입력)

로컬 언어 인식 모델을 사용하는 구성 방법(현재 macOS는 지원하지 않음):
* `transcription_provider`에 `fasterwhisper`를 입력하고, `llm_provider`에 `openai`를 입력하면 아래의 `openai`, `local_model` 두 가지 구성 항목에서 `openai.apikey`와 `local_model.faster_whisper`만 입력하면 자막 번역이 가능하며, 로컬 모델이 자동으로 다운로드됩니다. (`app.proxy`와 `openai.base_url`은 동일)

다음과 같은 경우에는 알리바바 클라우드 구성이 필요합니다:
* `llm_provider`에 `aliyun`을 입력한 경우, 알리바바 클라우드의 대형 모델 서비스를 사용해야 하므로 `aliyun.bailian` 항목을 구성해야 합니다.
* `transcription_provider`에 `aliyun`을 입력하거나 작업 시작 시 "더빙" 기능을 활성화한 경우, 알리바바 클라우드의 음성 서비스를 사용해야 하므로 `aliyun.speech` 항목을 구성해야 합니다.
* "더빙" 기능을 활성화하고 로컬 오디오를 업로드하여 음색 복제를 수행한 경우, 알리바바 클라우드의 OSS 클라우드 저장소 서비스를 사용해야 하므로 `aliyun.oss` 항목을 구성해야 합니다.  
알리바바 클라우드 구성 도움말: [알리바바 클라우드 구성 설명](./aliyun.md)

## 자주 묻는 질문

자세한 내용은 [자주 묻는 질문](./faq.md)을 참조하십시오.

## 기여 규칙
1. .vscode, .idea 등과 같은 쓸모없는 파일을 제출하지 마십시오. .gitignore를 사용하여 필터링하십시오.
2. config.toml을 제출하지 말고 config-example.toml을 제출하십시오.

## 문의하기
1. 우리의 QQ 그룹에 가입하여 질문을 해결하십시오: 754069680
2. 우리의 소셜 미디어 계정을 팔로우하십시오, [비리비리](https://space.bilibili.com/242124650), 매일 AI 기술 분야의 양질의 콘텐츠를 공유합니다.

## 스타 역사

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)