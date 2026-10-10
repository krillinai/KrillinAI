# 기여 가이드 (한국어)

> [English](../../CONTRIBUTING.md) | [简体中文](../zh/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | **한국어** | [Bahasa Indonesia](../id/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Deutsch](../de/CONTRIBUTING.md) | [Português](../pt/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [العربية](../ar/CONTRIBUTING.md)

OpenCreator에 기여해 주셔서 감사합니다. OpenCreator는 Codex 에이전트 루프 위에 구축된 로컬 우선 크리에이터 워크스페이스이며, 프로젝트 가치의 대부분은 작고 집중된 추가 — Skill 폴터 하나, 생성 템플릿 하나, 범위가 명확한 수정 하나 — 에서 나옵니다. 이 가이드는 각 유형의 기여가 어디에 위치해야 하는지, 그리고 PR이 머지되기 전에 충족해야 하는 기준을 설명합니다.

---

## 기여 지도

| 원하는 작업 | 실제로 추가하는 것 | 위치 | 전달 규모 |
|---|---|---|---|
| 버그 수정 또는 워크플로 개선 | 코드 | `apps/web/`, `apps/daemon/` | 테스트를 포함한 집중된 PR 1개 |
| 재사용 가능한 에이전트 워크플로 추가 | **Skill** | [`skills/<your-skill>/`](../../skills/) | `SKILL.md`와 선택적 references가 포함된 폴터 1개 → [가이드](./contributing/skills-contributing.md) |
| 재사용 가능한 이미지/비디오/커버 프리셋 추가 | **생성 템플릿** | [`template/<module>/<id>/<version>/`](../../template/) | `template.json`과 에셋이 포함된 폴터 1개 → [가이드](./contributing/templates-contributing.md) |
| 일러스트, 아이콘, UI 디자인 기여 | 디자인 에셋 | 합의된 에셋 위치 | 미리보기, 소스 파일, 라이선스가 포함된 PR 1개 |
| AI 또는 미디어 서비스 연동 | **서비스 통합** | 관련 Web 또는 Daemon 모듈 | 오류 처리, 자격 증명 보안, 테스트가 포함된 PR 1개 |
| 문서 또는 번역 개선 | 문서 | `README.md`, `docs/`, `docs/<locale>/README.md` | PR 1개 |

## 질문과 검토 담당

아이디어를 논의하거나 적절한 영역을 모르면 [Issue](https://github.com/krillinai/OpenCreator/issues/new)를 여세요. PR을 제출할 때 코드 및 버그 수정, 제작 템플릿, 디자인 및 에셋, Skills 및 문서에 맞는 [운영 팀](../../README.md#the-crew) 담당자를 언급하세요. 팀은 기여 기준, 검토 및 커뮤니티 질문을 지원하며 병합은 저장소 권한과 필수 검사에 따릅니다.

---

## 로컬 설정

전체 설정은 [README 빠른 시작](../../README.md#quick-start)에 있습니다. 기여자를 위한 요약:

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # packageManager에 고정된 pnpm 선택
pnpm install
pnpm web:dev             # Web + 필요 시 로컬 daemon 실행
pnpm typecheck           # 저장소 전체 TypeScript 검사
pnpm test                # 워크스페이스 단위 및 통합 테스트
```

Node.js 22 이상과 Codex CLI 실행 파일이 필요합니다. `pnpm web:dev` 후 `http://127.0.0.1:19861/`을 여세요. 첫 실행 시 Runtime이 기본 프로젝트를 자동으로 준비하며, 연결이 완료되면 바로 입력할 수 있습니다.

---

## 기여 방법

1. [이슈](https://github.com/krillinai/OpenCreator/issues)에서 문제, 사용 사례, 기대 동작을 설명합니다.
2. 최신 개발 브랜치에서 집중된 기능 또는 수정 브랜치를 생성합니다.
3. 기존 아키텍처를 따릅니다: 범용 제품 기능은 Web과 Daemon에서 **한 번만** 구현하고, Desktop 네이티브 차이는 명시적 capability(예: `canSelectDirectory`)로 분리합니다.
4. 동작 변경에는 적절한 단위, 통합 또는 E2E 테스트를 추가하고, PR에 수행한 검증과 건너뛴 검증을 모두 나열합니다.
5. `.runtime/`, 로컬 자격 증명, Codex 세션, 빌드 캐시 또는 기타 사용자 데이터를 절대 커밋하지 않습니다.

## 리뷰어가 확인하는 사항

- **공유 동작은 단일 구현.** 동일한 기능을 Browser Bridge와 Desktop Bridge에 각각 구현해서는 안 됩니다.
- **조용한 스텁이 아닌 capability 게이팅.** capability를 사용할 수 없을 때 플랫폼 전용 진입점은 숨겨야 하며, 클릭필도 아무 반응이 없는 버튼을 표시해서는 안 됩니다.
- **테스트는 변경 위험도에 맞게.** 작은 문구나 스타일 조정은 대상 검사만으로 충분하며, 공유 상태, 영속성, Runtime 계약 변경은 최소 모듈 테스트와 typecheck가 필요합니다.
- **문서는 동작과 함께 업데이트.** 변경이 사용자에게 보이는 워크플로를 바꾼다면 같은 PR에서 README나 `docs/`의 관련 문서를 업데이트하세요.

## PR이 반려되는 일반적인 이유

- 동일한 로직이 공유 서비스 레이어가 아닌 Web과 Desktop 경로에 각각 추가됨.
- 플랫폼이 지원하지 않는 버튼이 보이지만 핸들러가 조용히 return함.
- 동작이 변경되었지만 테스트나 검증 설명이 없음.
- PR에 무관한 리팩터링이나 수정이 섞여 있음.
- 생성된 파일, `.runtime/` 데이터 또는 자격 증명이 커밋됨.

---

OpenCreator · Create locally, work continuously.
