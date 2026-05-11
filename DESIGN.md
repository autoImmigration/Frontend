# Design System — Immigration Ops Frontend

## Product Context
- **What this is:** 유학원, 학교, 학생이 같은 신청 데이터를 다른 관점에서 확인하는 내부 운영용 비자/OCR 관리 화면입니다.
- **Who it's for:** 반복적으로 문서를 검토하고 상태를 갱신하는 운영자, 학교 담당자, 학생 본인
- **Space/industry:** 출입국 서류 처리, 교육 행정, OCR 기반 내부 업무 툴
- **Project type:** 웹 기반 내부 운영 대시보드

## Aesthetic Direction
- **Direction:** Calm Operations
- **Decoration level:** intentional
- **Mood:** 차갑지 않지만 단정한 운영 화면. 사용자가 오래 봐도 피곤하지 않고, 상태와 작업 우선순위가 바로 읽혀야 합니다.
- **Reference stance:** 화려한 SaaS 대시보드보다 문서 검토 툴, 운영 백오피스, 금융 콘솔에 가까운 밀도와 긴장감을 유지합니다.

## Typography
- **Display/Hero:** Pretendard Variable
  이유: 한글에서 숫자와 제목이 또렷하고, 내부 업무 툴에서 과장되지 않은 힘이 있습니다.
- **Body:** Pretendard Variable
  이유: 긴 표, 필터, 상세 설명에서 가독성이 안정적입니다.
- **UI/Labels:** Pretendard Variable 600~700
  이유: 작은 라벨도 흐려지지 않게 해야 합니다.
- **Data/Tables:** Pretendard Variable with `font-variant-numeric: tabular-nums`
  이유: 날짜, 건수, 배치 ID가 줄마다 흔들리지 않아야 합니다.
- **Code:** JetBrains Mono
- **Loading:** 로컬 시스템 폰트 폴백 허용. 외부 웹폰트 의존도를 늘리지 않습니다.
- **Scale:**
  - page title: `30px`
  - section title: `19px`
  - metric value: `26px`
  - body: `14px`
  - helper/meta: `12px`

## Color
- **Approach:** restrained blue system
- **Primary:** `#2563eb`
  의미: 주요 액션, 선택 상태, 운영 화면의 기준축
- **Primary deep:** `#1d4ed8`
  의미: hover, 강조 숫자, 중요 링크
- **Neutrals:** `#f4f8ff` → `#0f172a`
  의미: 흰색 바탕에 푸른 기운이 도는 중성 계열
- **Semantic:**
  - success: `#166534`
  - warning: `#b7791f`
  - error/info는 후속 구현 시 별도 정의
- **Dark mode:** 현재 범위 제외. 라이트 모드 완성도를 먼저 확보합니다.

## Spacing
- **Base unit:** `4px`
- **Density:** comfortable-compact
- **Scale:** `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`
- **Rule:** 표와 필터는 촘촘하게, 상세 패널과 요약 카드는 숨 쉴 공간을 조금 더 줍니다.

## Layout
- **Approach:** grid-disciplined app UI
- **Navigation:** 좌측 고정 사이드바, 우측 단일 작업 영역
- **Content width:** `max-width: 1360px`
- **Cards:** 카드가 장식이 아니라 실제 작업 단위일 때만 사용합니다.
- **Border radius:** `10px` input/button, `12px` table wrapper and nested panels, `14px` surface card

## Motion
- **Approach:** minimal-functional
- **Easing:** 일반 상태 전환은 `0.18s ease`
- **Use:** hover, focus, 선택 상태 변화만 허용. 장식용 이동 애니메이션은 넣지 않습니다.

## Screen Rules
- **학생 화면:** 신청 리스트와 제출 상태를 가장 먼저 보여줍니다. 과한 KPI는 금지.
- **학교 화면:** 요약 카드 없이 필터와 표 중심. 이 화면의 주인공은 학생 목록입니다.
- **유학원 대시보드:** 요약 카드 4개는 같은 크기로 정렬하고, 색 톤으로만 우선순위를 구분합니다.
- **유학원 상세:** 좌우 분할 허용. 좌측은 문서 상태, 우측은 제출본 확인.
- **업로드 화면:** 규칙 설명과 배치 이력을 분리합니다. 한 화면에 다 넣지 않습니다.

## Anti-Patterns
- 보라색 그라디언트
- 카드마다 다른 반경
- 이유 없이 큰 히어로 영역
- 같은 크기의 흰 카드만 반복되는 KPI 줄
- 표 위에 검색 조건이 흩어져 있는 형태
- 운영 화면인데 장식성 복사 문구가 많은 헤더

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-09 | 내부 운영툴 전용 디자인 시스템 초안 작성 | 학생/학교/유학원 화면을 하나의 규칙으로 묶기 위해 |
| 2026-05-09 | 흰색+파란색 기반의 restrained palette 채택 | 밝지만 가벼워 보이지 않는 운영 화면 톤이 필요했기 때문 |
| 2026-05-09 | 요약 카드는 동일 크기, 톤만 구분 | 숫자 위계는 주되 레이아웃 불균형은 피하기 위해 |
