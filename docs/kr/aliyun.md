## 전제 조건
[Alibaba Cloud](https://www.aliyun.com) 계정이 필요하며 실명 인증을 완료해야 합니다. 대부분의 서비스는 무료 할당량이 있습니다.

## Alibaba Cloud `access_key_id` 및 `access_key_secret` 얻기
1. [Alibaba Cloud AccessKey 관리 페이지](https://ram.console.aliyun.com/profile/access-keys)로 이동합니다.
2. "AccessKey 생성"을 클릭합니다. 필요에 따라 사용 방법을 "로컬 개발 환경에서 사용"으로 선택합니다.
![Alibaba Cloud access key](/docs/images/aliyun_accesskey_1.png)
3. 안전하게 보관하세요; 로컬 파일에 복사하여 저장하는 것이 가장 좋습니다.

## Alibaba Cloud 음성 서비스 활성화
1. [Alibaba Cloud 음성 서비스 관리 페이지](https://nls-portal.console.aliyun.com/applist)로 이동합니다. 첫 방문 시 서비스를 활성화해야 합니다.
2. "프로젝트 생성"을 클릭합니다.
![Alibaba Cloud speech](/docs/images/aliyun_speech_1.png)
3. 기능을 선택하고 활성화합니다.
![Alibaba Cloud speech](/docs/images/aliyun_speech_2.png)
4. "스트리밍 텍스트-음성 변환 (CosyVoice 대형 모델)"은 상업용 버전으로 업그레이드해야 하며, 다른 서비스는 무료 체험 버전을 사용할 수 있습니다.
![Alibaba Cloud speech](/docs/images/aliyun_speech_3.png)
5. 앱 키를 간단히 복사합니다.
![Alibaba Cloud speech](/docs/images/aliyun_speech_4.png)

## Alibaba Cloud OSS 서비스 활성화
1. [Alibaba Cloud 객체 저장소 서비스 콘솔](https://oss.console.aliyun.com/overview)로 이동합니다. 첫 방문 시 서비스를 활성화해야 합니다.
2. 왼쪽에서 버킷 목록을 선택한 후 "생성"을 클릭합니다.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_1.png)
3. "빠른 생성"을 선택하고, 규정에 맞는 버킷 이름을 입력한 후 **상하이** 지역을 선택하여 생성을 완료합니다 (여기서 입력한 이름은 구성 항목 `aliyun.oss.bucket`의 값이 됩니다).
![Alibaba Cloud OSS](/docs/images/aliyun_oss_2.png)
4. 생성 후 버킷에 들어갑니다.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_3.png)
5. "공개 액세스 차단" 스위치를 끄고 읽기 및 쓰기 권한을 "공개 읽기"로 설정합니다.
![Alibaba Cloud OSS](/docs/images/aliyun_oss_4.png)
![Alibaba Cloud OSS](/docs/images/aliyun_oss_5.png)