# Immigration Ops Frontend

1차 내부 OCR 업로드 흐름을 위한 React 프론트엔드 프로젝트입니다.

## 범위

- 기본 로그인 정보 입력
- 백엔드 파일 업로드
- 최신 OCR 처리 결과 표시
- 처리된 문서 목록 조회

## 백엔드 연결

- 기본 API 주소는 `http://localhost:8080/api/v1` 입니다.
- 환경 변수 `VITE_API_BASE_URL`로 변경할 수 있습니다.
- 예시는 `.env.example` 파일을 참고하면 됩니다.

## 실행

1. `npm install`
2. `.env.example`을 참고해 필요 시 `.env` 파일을 만듭니다.
3. `npm run dev`
