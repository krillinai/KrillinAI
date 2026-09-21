# 생성 템플릿 기여하기 (한국어)

> [English](../../contributing/templates-contributing.md) | [简体中文](../../zh/contributing/templates-contributing.md) | [日本語](../../ja/contributing/templates-contributing.md) | **한국어** | [Bahasa Indonesia](../../id/contributing/templates-contributing.md) | [Español](../../es/contributing/templates-contributing.md) | [Français](../../fr/contributing/templates-contributing.md) | [Deutsch](../../de/contributing/templates-contributing.md) | [Português](../../pt/contributing/templates-contributing.md) | [Русский](../../ru/contributing/templates-contributing.md) | [العربية](../../ar/contributing/templates-contributing.md)

생성 템플릿은 [`template/<module>/<id>/<version>/`](../../../template/) 아래의 폴터로, `template.json`과 로컬 에셋을 포함합니다. 템플릿은 이미지 생성, 비디오 생성, 커버 생성의 비주얼 선택기를 구동하며, 사용자는 빈 프롬프트 대신 당신의 프리셋에서 시작합니다. 이 가이드는 템플릿을 추가하는 방법을 안내합니다.

---

## 생성 템플릿인 것 / 아닌 것

**템플릿인 것:**
- 조정된 프리셋: 프롬프트 기본값, 스타일 힌트, 비율/길이/품질 설정, 결과를 보여주는 커버와 미리보기.
- 자급자족적. 선택기가 표시하는 모든 것이 템플릿 폴터 안에 있습니다.

**템플릿이 아닌 것:**
- 새로운 템플릿 *유형*. 현재 모듈은 `image-generation`, `video-generation`, `cover-generator`입니다. 새 모듈이 필요하면 먼저 이슈에서 논의하세요. 그것은 제품 변경이지 템플릿이 아닙니다.
- 프롬프트 모음. 프롬프트가 비어 있거나 일반적이고 현지화된 기본값이 없는 템플릿은 반려됩니다. 가치는 조정에 있습니다.
- 권리 없는 타인의 작업. [저작자 표시와 권리](#저작자-표시와-권리)를 참조하세요.

## 빠른 시작

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<module>/<your-template-id>
# template.json 편집, 커버/미리보기 에셋 교체
pnpm templates:validate     # PR 전에 반드시 통과
```

템플릿 ID는 소문자 하이픈 구분이며 모듈 내에서 고유합니다. 버전은 `1`부터 시작하며, 버전당 폴터 하나이므로 업데이트는 `<id>/1/`을 수정하는 대신 `<id>/2/`를 생성합니다.

## 폴터 구조

```
template/<module>/<id>/1/
├── template.json        # 필수: 메타데이터, 기본값, 현지화 콘텐츠
├── cover.jpg            # 필수: 템플릿 선택기에 표시
├── preview.jpg          # 이미지/커버 모듈: 더 큰 결과 미리보기
├── previewVideo         # 비디오 모듈: 예시 클립 (예: example.mp4)
└── author-avatar.jpg    # 선택: 저작자 아바타
```

## template.json 필드 설명

| 필드 | 필수 | 참고 |
|---|---|---|
| `schemaVersion` | 예 | 현재 `1`. |
| `id`, `version`, `module` | 예 | 폴터 경로 `<module>/<id>/<version>/`와 일치해야 함. |
| `runtimeTemplate` | 예 | Runtime 실행기에 대응 (예: `{"id": "cover", "version": 2}`). 같은 모듈의 템플릿에서 복사. |
| `status` | 예 | 게시는 `published`, 작업 중에는 `draft`. |
| `title`, `description` | 예 | `zh-CN`과 `en-US` 필수. 다른 언어는 선택. |
| `cover` | 예 | 선택기 썸네일의 상대 경로. |
| `preview` / `previewVideo` | 모듈에 따라 | 이미지와 커버는 `preview`, 비디오는 `previewVideo`. |
| `defaults` | 예 | 사용자가 시작하는 기준 설정 (프롬프트, 비율, 길이, 품질 등). |
| `defaultsByLocale` | 강력 권장 | 로케일별 프롬프트와 스타일 재정의. 실제 조정이 여기에 있습니다. 아래 참조. |
| `tags` | 권장 | 검색 가능한 라벨. 사실적으로 유지. |
| `author` | 해당 시 | 외부 출처를 표시하는 `name`, `url`, `avatar`. |
| `featured`, `sortOrder` | 아니오 | `featured: false` 유지. 추천 여부는 메인테이너가 결정. |

## 프롬프트가 곧 제품

리뷰어는 대부분의 시간을 `defaults`와 `defaultsByLocale`에 씁니다:

- **두 언어 모두 실제 프롬프트여야 합니다.** 조정이 손실된 번역은 안 됩니다. `zh-CN`과 `en-US` 프롬프트는 각 언어의 장점을 살리면서 동등한 결과를 생성해야 합니다.
- **변경되어야 할 부분을 매개변수화하세요.** 헤드라인 텍스트나 주제가 사용자 편집 가능하다면 프롬프트에서 명시하세요(기존 템플릿은 "Customizable text: …" 같은 마커 사용).
- **제약을 명시하세요.** "워터마크 없음, 추가 텍스트 없음, 추가 인물 없음" — 재현 가능한 출력에는 부정적 제약이 설명만큼 중요합니다.
- **모듈의 defaults 구조에 맞추세요.** 이미지 템플릿은 ratio/candidateCount/quality, 비디오는 size/duration, 커버는 헤드라인, 텍스트 언어, 스타일 필드를 가집니다. 같은 모듈의 기존 템플릿에서 구조를 복사하세요.

## 에셋

- `cover.jpg`와 미리보기는 **템플릿 자체로 생성**하세요. 스톡 이미지나 무관한 아트워크는 반려됩니다.
- 파일 크기를 적절히 유지하세요. 이 파일들은 앱과 함께 배포되고 선택기에서 로드됩니다.
- 미리보기는 50번 중 최고가 아니라 *일반적인* 결과를 보여주세요.

## 저작자 표시와 권리

템플릿이 타인의 공개된 프롬프트나 스타일을 각색한 경우:

- 재배포할 권리가 있어야 합니다.
- 기존 템플릿처럼 `author` 필드에 `name`과 `url`(가능하면 `author-avatar.jpg`)을 채우세요.
- 확실하지 않으면 작업 전에 이슈를 열어 문의하세요.

## 머지 기준

- [ ] 폴터 경로가 `id`/`version`/`module`과 일치. ID가 모듈 내에서 고유.
- [ ] `pnpm templates:validate` 통과.
- [ ] `title`과 `description`이 `zh-CN`과 `en-US`로 제공됨.
- [ ] `defaultsByLocale`에 두 언어로 조정된 프롬프트 포함.
- [ ] 커버와 미리보기 에셋이 템플릿 자체로 생성됨.
- [ ] 외부 작업 각색 시 `author` 표시 포함.
- [ ] `featured: false`, `status: "published"` (또는 `draft`와 PR에 메모).

## 일반적인 반려 패턴

- **일반적인 프롬프트** — 빈 프롬프트 대비 부가 가치가 없음. 선택기에 불필요.
- **언어 누락** — 한 언어만 조정되었거나 기계 번역으로 스타일 제약이 손실됨.
- **에셋 불일치** — 커버가 프롬프트의 실제 생성 결과와 맞지 않음.
- **불분명한 권리** — 저작자 표시나 허가 없이 타인의 작업을 각색.
- **이전 버전 덮어쓰기** — `<id>/1/`의 이력을 다시 쓰는 대신 새 버전 폴터를 생성하세요.

---

질문이 있으신가요? 템플릿 아이디어와 샘플 출력을 첨부해 [이슈를 열어](https://github.com/krillinai/OpenCreator/issues/new) 주시면 범위 조정을 도와드리겠습니다.
