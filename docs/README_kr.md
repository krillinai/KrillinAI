<div align="center">
  <img src="../docs/images/logo.png" alt="KrillinAI" height="90">


  # AI 오디오&비디오 번역 및 더빙 도구

<a href="https://trendshift.io/repositories/13360" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13360" alt="krillinai%2FKrillinAI | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

  **[English](../README.md)｜[简体中文](../docs/README_zh.md)｜[日本語](../docs/README_jp.md)｜[한국어](../docs/README_kr.md)｜[Tiếng Việt](../docs/README_vi.md)｜[Français](../docs/README_fr.md)｜[Deutsch](../docs/README_de.md)｜[Español](../docs/README_es.md)｜[Português](../docs/README_pt.md)｜[Русский](../docs/README_rus.md)｜[اللغة العربية](../docs/README_ar.md)**
  
  [![Twitter](https://img.shields.io/badge/Twitter-KrillinAI-orange?logo=twitter)](https://x.com/KrillinAI)
[![Bilibili](https://img.shields.io/badge/dynamic/json?label=Bilibili&query=%24.data.follower&suffix=%20followers&url=https%3A%2F%2Fapi.bilibili.com%2Fx%2Frelation%2Fstat%3Fvmid%3D242124650&logo=bilibili&color=00A1D6&labelColor=FE7398&logoColor=FFFFFF)](https://space.bilibili.com/242124650)

</div>

### 📢 Win & Mac 데스크톱 버전 신규 출시 – 테스트 후 피드백 제공 부탁드립니다

## 개요

크릴린 AI(Krillin AI)는 번역, 더빙, 음성 복제에서부터 화면 비율 변환까지 모든 과정을 처리하는 올인원 비디오 현지화 및 향상 솔루션입니다. 이 미니멀하면서도 강력한 도구는 유튜브, 틱톡, 빌리빌리, 더우인, 위챗 채널, 레드노트, 쿠아이쇼우 등 모든 콘텐츠 플랫폼에 최적화된 가로/세로 영상 변환을 자동으로 수행합니다. 엔드투엔드 워크플로우로 원본 영상을 클릭 몇 번만에 각 플랫폼에 맞는 완성된 콘텐츠로 변환해 줍니다.

## 주요 기능:
🎯 **원클릭 시작** - 즉시 작업 프로세스 실행

📥 **비디오 다운로드** - yt-dlp 지원 및 로컬 파일 업로드 가능

📜 **정밀 자막** - Whisper 기반 고정확도 음성 인식

🧠 **스마트 분할** - LLM 기반 자막 청크 분할 및 정렬

🌍 **전문가 수준 번역** - 문단 단위 자연스러운 번역

🔄 **용어 대체** - 분야별 전문 어휘 한 번에 변경

🎙️ ** 더빙 및 음성 복제** - CosyVoice 선택 또는 개인 음성 클로닝

🎬 **비디오 합성** - 가로/세로 레이아웃 자동 포맷팅

## 데모 영상
46분 분량의 로컬 비디오 파일을 불러온 후 원클릭 작업으로 생성된 자막 파일을 트랙에 삽입한 결과입니다. 전혀 수동 조정 없이도 자막 누락이나 겹침 현상 없이 문장 분할이 자연스럽게 이루어졌으며, 번역 품질 또한 매우 우수합니다.
![Alignment](./docs/images/alignment.png)

<table>
<tr>
<td width="50%">

### 자막 번역
---
https://github.com/user-attachments/assets/bba1ac0a-fe6b-4947-b58d-ba99306d0339

</td>
<td width="50%">

### 더빙
---
https://github.com/user-attachments/assets/0b32fad3-c3ad-4b6a-abf0-0865f0dd2385

</td>
</tr>
</table>

## 🌍 언어 지원
입력 언어: 중국어, 영어, 일본어, 독일어, 터키어, 한국어 지원 (추가 언어 계속 확장 중)
번역 언어: 영어, 중국어, 러시아어, 스페인어, 프랑스어 등 56개 언어 지원

## 인터페이스 미리보기
![ui preview](./docs/images/ui_desktop.png)

## 🚀 빠른 시작
### 기본 단계
1. 릴리스에서 사용자 기기 시스템에 맞는 실행 파일을 다운로드 후 빈 폴더에 배치하세요.
2. 해당 폴더 내부에 config 폴더를 생성하고, config 폴더 안에 config.toml 파일을 만드세요. 소스 코드의 config 디렉토리에 있는 config-example.toml 파일 내용을 복사해 config.toml에 붙여넣은 후 설정 정보를 입력하세요.
3. 실행 파일을 더블클릭해 서비스를 시작하세요.
4. 브라우저에서 http://127.0.0.1:8888 주소로 접속하면 사용이 가능합니다(8888은 config.toml에서 설정한 포트 번호로 변경해주세요).

### macOS 사용자분들께
본 소프트웨어는 서명되지 않았으므로, "기본 단계"의 파일 구성 완료 후 macOS에서 수동으로 애플리케이션 신뢰 설정이 필요합니다. 다음 절차를 따라주세요:
1. 터미널을 열고 실행 파일(예: 파일명이 KrillinAI_1.0.0_macOS_arm64인 경우)이 위치한 디렉토리로 이동합니다.
2. 다음 명령어들을 순차적으로 실행해주세요:
```
sudo xattr -rd com.apple.quarantine ./KrillinAI_1.0.0_macOS_arm64
sudo chmod +x ./KrillinAI_1.0.0_macOS_arm64
./KrillinAI_1.0.0_macOS_arm64
```
이렇게 하면 서비스가 시작됩니다.

### 도커 배포
이 프로젝트는 도커 배포를 지원합니다. 자세한 내용은 [Docker Deployment Instructions](./docs/docker.md)를 참고해주세요.

### 쿠키 설정 안내

비디오 다운로드 실패 시 [Cookie Configuration Instructions](./docs/get_cookies.md) 를 참조하여 쿠키 정보를 설정해주세요.

### 설정 가이드
가장 빠르고 편리한 설정 방법:
* transcription_provider와 llm_provider 모두 openai를 선택하세요. 이 경우 다음 3가지 주요 설정 항목 카테고리(openai, local_model, aliyun) 중 openai.apikey만 입력하면 자막 번역을 수행할 수 있습니다. (app.proxy, model, openai.base_url은 각자의 상황에 맞게 입력하세요.)

로컬 음성 인식 모델 사용 설정 방법 (현재 macOS 미지원) (비용, 속도, 품질을 고려한 선택):
* transcription_provider에는 fasterwhisper를, llm_provider에는 openai를 입력하세요. 이 경우 openai와 local_model 카테고리에서 openai.apikey와 local_model.faster_whisper만 입력하면 자막 번역이 가능합니다. 로컬 모델은 자동으로 다운로드됩니다. (위에서 언급한 app.proxy와 openai.base_url도 동일하게 적용됩니다.)

다음 사용 상황에서는 알리바바 클라우드 설정이 필요합니다:
* llm_provider에 aliyun을 입력한 경우: 알리바바 클라우드의 대형 모델 서비스를 사용하게 되므로, aliyun.bailian 항목 설정이 필요합니다.
* transcription_provider에 aliyun을 입력하거나 작업 시작 시 "보이스 더빙" 기능을 활성화한 경우: 알리바바 클라우드의 음성 서비스를 사용하게 되므로, aliyun.speech 항목 설정이 필요합니다.
* "보이스 더빙" 기능을 활성화하면서 동시에 로컬 오디오 파일을 업로드해 음색 복제를 하는 경우: 알리바바 클라우드의 OSS 클라우드 스토리지 서비스도 사용하게 되므로, aliyun.oss 항목 설정이 필요합니다.
설정 가이드: [Alibaba Cloud Configuration Instructions](./docs/aliyun.md)

## 자주 묻는 질문
자세한 내용은 [Frequently Asked Questions](./docs/faq.md)를 참조해주세요.

## 기여 가이드라인

- .vscode, .idea 등 불필요한 파일은 제출하지 마세요. .gitignore 파일을 활용해 필터링해주세요.
- config.toml 대신 config-example.toml 파일을 제출해주세요.

## 스타 히스토리

[![Star History Chart](https://api.star-history.com/svg?repos=krillinai/KrillinAI&type=Date)](https://star-history.com/#krillinai/KrillinAI&Date)
