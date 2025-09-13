<div align="center">
  <img src="/docs/images/logo.jpg" alt="KrillinAI" height="90">

# 미니멀리스트 AI 비디오 번역 및 더빙 도구

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="KrillinAI%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

**[English](/README.md)｜[简体中文](/docs/zh/README.md)｜[日本語](/docs/jp/README.md)｜[한국어](/docs/kr/README.md)｜[Tiếng Việt](/docs/vi/README.md)｜[Français](/docs/fr/README.md)｜[Deutsch](/docs/de/README.md)｜[Español](/docs/es/README.md)｜[Português](/docs/pt/README.md)｜[Русский](/docs/rus/README.md)｜[اللغة العربية](/docs/ar/README.md)**

[![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![QQ 群](https://img.shields.io/badge/QQ%20群-754069680-green?logo=tencent-qq)](https://jq.qq.com/?_wv=1027&k=754069680)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=粉丝&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/krillinai/KrillinAI)

</div>

## 프로젝트 소개  ([지금 온라인 버전 사용해보기!](https://www.klic.studio/))
[**빠른 시작**](#-quick-start)

KrilliAI는 Krillin AI가 개발한 다재다능한 오디오 및 비디오 현지화 및 향상 솔루션입니다. 이 미니멀하면서도 강력한 도구는 비디오 번역, 더빙 및 음성 클로닝을 통합하여 모든 주요 플랫폼(Bilibili, Xiaohongshu, Douyin, WeChat Video, Kuaishou, YouTube, TikTok 등)에서 완벽한 프레젠테이션을 보장하는 가로 및 세로 형식을 지원합니다. 엔드 투 엔드 워크플로우를 통해 원자재를 몇 번의 클릭만으로 아름답게 사용할 수 있는 크로스 플랫폼 콘텐츠로 변환할 수 있습니다.

## 주요 기능 및 기능:

🎯 **원클릭 시작**: 복잡한 환경 구성 필요 없이 자동 종속성 설치, 즉시 사용 가능, 더 쉽게 접근할 수 있는 새로운 데스크탑 버전 제공!

📥 **비디오 수집**: yt-dlp 다운로드 또는 로컬 파일 업로드 지원

📜 **정확한 인식**: Whisper 기반의 고정밀 음성 인식

🧠 **지능형 분할**: LLM을 사용한 자막 분할 및 정렬

🔄 **용어 교체**: 전문 용어의 원클릭 교체

🌍 **전문 번역**: 자연스러운 의미를 유지하기 위한 LLM 번역

🎙️ **음성 클로닝**: CosyVoice의 선택된 음성 톤 또는 사용자 정의 음성 클로닝 제공

🎬 **비디오 구성**: 가로 및 세로 비디오 및 자막 레이아웃 자동 처리

💻 **크로스 플랫폼**: Windows, Linux, macOS 지원, 데스크탑 및 서버 버전 제공

## 효과 시연

아래 이미지는 46분 길이의 로컬 비디오를 가져와 원클릭으로 실행한 후 생성된 자막 파일의 효과를 보여줍니다. 수동 조정 없이도 누락이나 겹침이 없고, 분할이 자연스럽고, 번역 품질이 매우 높습니다.
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

### 세로 모드

---

https://github.com/user-attachments/assets/c2c7b528-0ef8-4ba9-b8ac-f9f92f6d4e71

</td>

</tr>
</table>

## 🔍 지원되는 음성 인식 서비스

_**아래 표의 모든 로컬 모델은 실행 파일 + 모델 파일의 자동 설치를 지원합니다. 선택하기만 하면 Klic이 모든 것을 준비합니다.**_

| 서비스 출처          | 지원 플랫폼 | 모델 옵션                             | 로컬/클라우드 | 비고                     |
|----------------------|--------------|----------------------------------------|---------------|--------------------------|
| **OpenAI Whisper**   | 모든 플랫폼  | -                                      | 클라우드      | 빠른 속도와 좋은 효과    |
| **FasterWhisper**    | Windows/Linux | `tiny`/`medium`/`large-v2` (추천: medium+) | 로컬          | 빠른 속도, 클라우드 서비스 비용 없음 |
| **WhisperKit**       | macOS (M 시리즈 전용) | `large-v2`                            | 로컬          | Apple 칩에 대한 네이티브 최적화 |
| **WhisperCpp**       | 모든 플랫폼  | `large-v2`                            | 로컬          | 모든 플랫폼 지원         |
| **Alibaba Cloud ASR**| 모든 플랫폼  | -                                      | 클라우드      | 중국 본토의 네트워크 문제 회피 |

## 🚀 대형 언어 모델 지원

✅ **OpenAI API 사양**을 준수하는 모든 클라우드/로컬 대형 언어 모델 서비스와 호환됩니다. 여기에는 다음이 포함되지만 이에 국한되지 않습니다:

- OpenAI
- Gemini
- DeepSeek
- Tongyi Qianwen
- 로컬 배포된 오픈 소스 모델
- OpenAI 형식과 호환되는 기타 API 서비스

## 🎤 TTS 텍스트 음성 변환 지원

- Alibaba Cloud 음성 서비스
- OpenAI TTS

## 언어 지원

지원되는 입력 언어: 중국어, 영어, 일본어, 독일어, 터키어, 한국어, 러시아어, 말레이어(지속적으로 증가 중)

지원되는 번역 언어: 영어, 중국어, 러시아어, 스페인어, 프랑스어 및 기타 101개 언어

## 인터페이스 미리보기

![인터페이스 미리보기](/docs/images/ui_desktop_light.png)
![인터페이스 미리보기](/docs/images/ui_desktop_dark.png)

## 🚀 빠른 시작

[KrillinAI의 Deepwiki](https://deepwiki.com/krillinai/KrillinAI)에서 질문할 수 있습니다. 이곳은 리포지토리의 파일을 색인화하여 빠르게 답변을 찾을 수 있습니다.

### 기본 단계

먼저, [Release](https://github.com/KrillinAI/KrillinAI/releases)에서 장치 시스템에 맞는 실행 파일을 다운로드한 후, 아래 튜토리얼에 따라 데스크탑 버전 또는 비데스크탑 버전을 선택합니다. 소프트웨어 다운로드를 빈 폴더에 두세요. 실행하면 일부 디렉토리가 생성되며, 빈 폴더에 두면 관리가 더 쉬워집니다.

【데스크탑 버전인 경우, 즉 "desktop"이 포함된 릴리스 파일인 경우, 여기를 참조하세요】
_데스크탑 버전은 새로운 사용자가 구성 파일을 올바르게 편집하는 데 어려움을 겪는 문제를 해결하기 위해 새로 출시되었으며, 지속적으로 업데이트되는 몇 가지 버그가 있습니다._

1. 파일을 두 번 클릭하여 사용을 시작합니다 (데스크탑 버전은 소프트웨어 내에서 구성도 필요합니다)

【비데스크탑 버전인 경우, 즉 "desktop"이 포함되지 않은 릴리스 파일인 경우, 여기를 참조하세요】
_비데스크탑 버전은 초기 버전으로, 구성은 더 복잡하지만 기능적으로 안정적이며 서버 배포에 적합합니다. 웹 형식의 UI를 제공합니다._

1. 폴더 내에 `config` 폴더를 생성한 후, `config` 폴더 내에 `config.toml` 파일을 생성합니다. 소스 코드의 `config` 디렉토리에서 `config-example.toml` 파일의 내용을 `config.toml`에 복사하고 주석에 따라 구성 정보를 입력합니다.
2. 실행 파일을 두 번 클릭하거나 터미널에서 실행하여 서비스를 시작합니다.
3. 브라우저를 열고 `http://127.0.0.1:8888`에 접속하여 사용을 시작합니다 (8888을 구성 파일에서 지정한 포트로 교체).

### macOS 사용자에게

【데스크탑 버전인 경우, 즉 "desktop"이 포함된 릴리스 파일인 경우, 여기를 참조하세요】
서명 문제로 인해 현재 데스크탑 버전은 두 번 클릭하여 실행하거나 dmg를 통해 설치할 수 없습니다. 애플리케이션을 수동으로 신뢰해야 합니다. 방법은 다음과 같습니다:

1. 실행 파일이 있는 디렉토리에서 터미널을 엽니다 (파일 이름이 KrillinAI_1.0.0_desktop_macOS_arm64라고 가정).
2. 다음 명령을 순서대로 실행합니다:

```
sudo xattr -cr ./KrillinAI_1.0.0_desktop_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_desktop_macOS_arm64 
./KrillinAI_1.0.0_desktop_macOS_arm64
```

【비데스크탑 버전인 경우, 즉 "desktop"이 포함되지 않은 릴리스 파일인 경우, 여기를 참조하세요】
이 소프트웨어는 서명되지 않았으므로 macOS에서 실행할 때 "기본 단계"에서 파일 구성을 완료한 후에도 애플리케이션을 수동으로 신뢰해야 합니다. 방법은 다음과 같습니다:

1. 실행 파일이 있는 디렉토리에서 터미널을 엽니다 (파일 이름이 KrillinAI_1.0.0_macOS_arm64라고 가정).
2. 다음 명령을 순서대로 실행합니다:
   ```
   sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
   sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
   ./KrillinAI_1.0.0_macOS_arm64
   ```
   
   이렇게 하면 서비스가 시작됩니다.

### Docker 배포

이 프로젝트는 Docker 배포를 지원합니다. [Docker 배포 지침](./docker.md)을 참조하세요.

제공된 구성 파일을 기반으로, README 파일의 "구성 도움말(반드시 읽어야 함)" 섹션을 업데이트한 내용은 다음과 같습니다:

### 구성 도움말 (반드시 읽어야 함)

구성 파일은 여러 섹션으로 나뉩니다: `[app]`, `[server]`, `[llm]`, `[transcribe]`, `[tts]`. 작업은 음성 인식(`transcribe`) + 대형 모델 번역(`llm`) + 선택적 음성 서비스(`tts`)로 구성됩니다. 이를 이해하면 구성 파일을 더 잘 파악할 수 있습니다.

**가장 쉽고 빠른 구성:**

**자막 번역만을 위한 경우:**
   * `[transcribe]` 섹션에서 `provider.name`을 `openai`로 설정합니다.
   * 그런 다음 `[llm]` 블록에 OpenAI API 키만 입력하면 자막 번역을 시작할 수 있습니다. `app.proxy`, `model`, `openai.base_url`은 필요에 따라 입력할 수 있습니다.

**비용, 속도 및 품질의 균형 (로컬 음성 인식 사용):**

* `[transcribe]` 섹션에서 `provider.name`을 `fasterwhisper`로 설정합니다.
* `transcribe.fasterwhisper.model`을 `large-v2`로 설정합니다.
* `[llm]` 블록에 대형 언어 모델 구성을 입력합니다.
* 필요한 로컬 모델은 자동으로 다운로드 및 설치됩니다.

**텍스트 음성 변환(TTS) 구성 (선택 사항):**

* TTS 구성은 선택 사항입니다.
* 먼저, `[tts]` 섹션에서 `provider.name`을 설정합니다 (예: `aliyun` 또는 `openai`).
* 그런 다음 선택한 제공자에 대한 해당 구성 블록을 입력합니다. 예를 들어 `aliyun`을 선택하면 `[tts.aliyun]` 섹션을 입력해야 합니다.
* 사용자 인터페이스의 음성 코드는 선택한 제공자의 문서에 따라 선택해야 합니다.
* **참고:** 음성 클로닝 기능을 사용하려면 TTS 제공자로 `aliyun`을 선택해야 합니다.

**Alibaba Cloud 구성:**

* Alibaba Cloud 서비스에 필요한 `AccessKey`, `Bucket`, `AppKey`를 얻는 방법에 대한 자세한 내용은 [Alibaba Cloud 구성 지침](https://www.google.com/search?q=./aliyun.md)을 참조하세요. AccessKey 등의 반복 필드는 명확한 구성 구조를 유지하기 위해 설계되었습니다.

## 자주 묻는 질문

[자주 묻는 질문](./faq.md)을 방문하세요.

## 기여 지침

1. .vscode, .idea 등과 같은 쓸모없는 파일을 제출하지 마세요. .gitignore를 사용하여 필터링하세요.
2. config.toml을 제출하지 말고 config-example.toml을 제출하세요.

## 문의하기

1. 질문이 있는 경우 QQ 그룹에 가입하세요: 754069680
2. 매일 AI 기술 분야의 양질의 콘텐츠를 공유하는 [Bilibili](https://space.bilibili.com/242124650) 소셜 미디어 계정을 팔로우하세요.

## 스타 역사

[![스타 역사 차트](https://api.star-history.com/svg?repos=KrillinAI/KrillinAI&type=Date)](https://star-history.com/#KrillinAI/KrillinAI&Date)