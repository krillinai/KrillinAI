# Skill 기여하기 (한국어)

> [English](../../contributing/skills-contributing.md) | [简体中文](../../zh/contributing/skills-contributing.md) | [日本語](../../ja/contributing/skills-contributing.md) | **한국어** | [Bahasa Indonesia](../../id/contributing/skills-contributing.md) | [Español](../../es/contributing/skills-contributing.md) | [Français](../../fr/contributing/skills-contributing.md) | [Deutsch](../../de/contributing/skills-contributing.md) | [Português](../../pt/contributing/skills-contributing.md) | [Русский](../../ru/contributing/skills-contributing.md) | [العربية](../../ar/contributing/skills-contributing.md)

Skill은 [`skills/`](../../../skills/) 아래의 폴터로, 루트에 `SKILL.md`를 두고 [`SKILL.md` 규약](https://agentskills.io)을 따릅니다. 재사용 가능한 에이전트 워크플로 — 언제 사용하는지, 어떤 명령이나 도구를 호출하는지, 출력을 어떻게 해석하는지 — 를 패키징합니다. 이 가이드는 Skill을 추가하는 방법을 안내합니다.

---

## Skill인 것 / 아닌 것

**Skill인 것:**
- 에이전트가 따를 수 있는 반복 가능한 워크플로로, 자연어와 명령으로 설명합니다.
- 코어 코드에 속하지 않는 도메인 지식: CLI 단계 호출 방법, 미디어 제공자용 프롬프트 구성 방법, 플랜 검증 방법.
- 작은 것. 폴터 하나, `SKILL.md` 하나, 에이전트가 필요할 때 읽는 긴 자료를 위한 선택적 `references/`.

**Skill이 아닌 것:**
- 제품 기능. UI 변경, 새로운 Runtime 엔드포인트, 새로운 워크스페이스 동작은 코드 기여입니다(`apps/web/`, `apps/daemon/`).
- 기존 Skill의 표현만 살짝 바꾼 복사본. 변경이 기존 워크플로를 개선한다면 해당 Skill을 직접 수정하세요.
- 자격 증명이나 특정 사용자의 로컬 경로를 감싸는 래퍼. Skill은 깨끗한 체크아웃에서 동작해야 합니다.

## 빠른 시작

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<your-skill>   # 가장 비슷한 기존 Skill에서 시작
# skills/<your-skill>/SKILL.md 편집
pnpm web:dev                                     # 대화에서 에이전트가 인식하는지 확인
```

가장 빠른 방법은 아이디어와 가장 비슷한 Skill을 복사해 다시 작성하는 것입니다. 기존 `krillinai-*` Skill들이 기대되는 구조와 어조를 보여줍니다.

## Skill 구조

```
skills/<your-skill>/
├── SKILL.md            # 필수: frontmatter + 지침
└── references/         # 선택: SKILL.md가 가리키는 긴 문서
    └── cli-contract.md
```

`SKILL.md`는 YAML frontmatter로 시작합니다:

```yaml
---
name: your-skill
description: Use when <트리거 조건>, including <주요 기능>.
---
```

리뷰어가 적용하는 두 가지 규칙:

- **`name`은 폴터 이름과 일치해야 합니다.** 소문자, 하이픈 구분.
- **`description`은 발견의 표면입니다.** 에이전트가 이 Skill의 적용 여부를 결정할 때 읽는 내용입니다. "Use when …" 형태로 작성하고, 트리거와 결과를 명시하며, 한두 문장으로 유지하세요. 모호한 설명("비디오에 도움")은 반려됩니다.

본문은 다음 순서로 구성하세요:

1. **언제 사용하는가** — 한 단락.
2. **명령** — 필요한 환경 변수나 작업 디렉터리를 포함한 정확한 호출을 코드 블록으로.
3. **입력과 플래그** — 자명하지 않은 것은 표로 정리하고 필수/선택을 표시.
4. **출력** — 결과가 어디에 생성되고 어떻게 읽는지(예: "manifest에서 경로 읽기").
5. **실패 모드** — 알려진 오류와 대처 방법.

`SKILL.md`는 훑어보기 쉽게 유지하세요. 긴 계약, 전체 플래그 목록, 배경 자료는 `references/`로 옮기고 상대 경로로 링크하세요. 에이전트는 필요할 때만 references를 읽습니다.

## 로컬 검증

`pnpm web:dev` 후 대화를 시작하고 Skill이 트리거되어야 할 작업을 설명하세요. 확인 사항:

- 에이전트가 올바른 요청에 Skill을 선택하고, 무관한 요청에는 선택하지 않는가.
- Skill의 명령이 깨끗한 체크아웃에서 수동 수정 없이 실행되는가.
- 출력 경로와 오류 처리가 문서와 일치하는가.

## 머지 기준

리뷰어는 아래 모든 항목을 확인합니다. PR에 붙여넣고 체크하세요:

- [ ] 폴터 이름과 `name` frontmatter가 일치. 소문자 하이픈 구분.
- [ ] `description`이 트리거 조건과 결과를 명시("Use when …").
- [ ] 명령이 깨끗한 체크아웃에서 실행됨. 절대 로컬 경로나 자격 증명 없음.
- [ ] 입력, 출력, 실패 모드가 문서화됨.
- [ ] 긴 참고 자료가 인라인이 아닌 `references/`에 있음.
- [ ] 실제 대화에서 검증됨: 트리거되어야 할 때만 트리거됨.
- [ ] 기존 Skill과 중복되는 경우 별도 Skill이 필요한 이유를 PR에서 설명.

## 일반적인 반려 패턴

- **기존 Skill의 중복** — 표현상의 미세한 변경만 있는 경우. 대신 기존 Skill을 개선하세요.
- **기능의 위장** — Runtime이나 UI 코드 변경과 함께해야만 동작하는 Skill. 코드 변경은 별도 PR로 제출하세요.
- **테스트되지 않은 명령** — 존재하지 않는 플래그, 문서에 명시된 경로와 일치하지 않는 출력.
- **문서화되지 않은 전제 조건** — 제공자 설정, 바이너리, 네트워크 서비스를 암묵적으로 가정.

---

질문이 있으신가요? `skill` 주제로 [이슈를 열어](https://github.com/krillinai/OpenCreator/issues/new) 주시면 범위 조정을 도와드리겠습니다.
