## 전제 조건
먼저 [알리바바 클라우드](https://www.aliyun.com) 계정이 필요하며, 실명 인증을 받아야 합니다. 대부분의 서비스는 무료 할당량이 있습니다.

## 알리바바 클라우드 `access_key_id` 및 `access_key_secret` 획득
1. [알리바바 클라우드 AccessKey 관리 페이지](https://ram.console.aliyun.com/profile/access-keys)에 접속합니다.
2. AccessKey 생성을 클릭하고, 필요시 사용 방식을 선택합니다. "로컬 개발 환경에서 사용"을 선택합니다.
![알리바바 클라우드 access key](/docs/images/aliyun_accesskey_1.png)
3. 안전하게 보관하며, 가능하면 로컬 파일에 복사하여 저장합니다.

## 알리바바 클라우드 음성 서비스 개통
1. [알리바바 클라우드 음성 서비스 관리 페이지](https://nls-portal.console.aliyun.com/applist)에 접속하여, 처음 들어가면 서비스를 개통해야 합니다.
2. 프로젝트 생성을 클릭합니다.
![알리바바 클라우드 speech](/docs/images/aliyun_speech_1.png)
3. 기능을 선택하고 개통합니다.
![알리바바 클라우드 speech](/docs/images/aliyun_speech_2.png)
4. "스트리밍 텍스트 음성 합성(CosyVoice 대모델)"은 상업용 버전으로 업그레이드해야 하며, 다른 서비스는 무료 체험판을 사용할 수 있습니다.
![알리바바 클라우드 speech](/docs/images/aliyun_speech_3.png)
5. app key를 복사합니다.
![알리바바 클라우드 speech](/docs/images/aliyun_speech_4.png)

## 알리바바 클라우드 OSS 서비스 개통
1. [알리바바 클라우드 객체 저장 서비스 콘솔](https://oss.console.aliyun.com/overview)에 접속하여, 처음 들어가면 서비스를 개통해야 합니다.
2. 왼쪽에서 Bucket 목록을 선택한 후, 생성을 클릭합니다.
![알리바바 클라우드 OSS](/docs/images/aliyun_oss_1.png)
3. 빠른 생성을 선택하고, 요구 사항에 맞는 Bucket 이름을 입력한 후 **상하이** 지역을 선택하여 생성을 완료합니다(여기서 입력한 이름이 구성 항목 `aliyun.oss.bucket`의 값이 됩니다).
![알리바바 클라우드 OSS](/docs/images/aliyun_oss_2.png)
4. 생성 완료 후 Bucket에 들어갑니다.
![알리바바 클라우드 OSS](/docs/images/aliyun_oss_3.png)
5. "공공 접근 차단" 스위치를 끄고, 읽기 및 쓰기 권한을 "공공 읽기"로 설정합니다.
![알리바바 클라우드 OSS](/docs/images/aliyun_oss_4.png)
![알리바바 클라우드 OSS](/docs/images/aliyun_oss_5.png)