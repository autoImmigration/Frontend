# 프론트엔드 JWT 인증 연동 계획서

> 백엔드(immigration-ops-backend)가 httpBasic → **JWT Bearer** 인증으로 전환 완료됨에 따라,
> 프론트(immigration-ops-frontend)를 거기에 맞춰 연결하기 위한 계획서.
> **이 문서는 계획만 담는다. 코드 변경은 별도 단계에서 진행.**
> 작성일: 2026-05-29

---

## 0. 백엔드가 바뀐 점 (연동 대상 API 계약)

| 엔드포인트 | 인증 | 요청 | 응답 |
|---|---|---|---|
| `POST /api/v1/auth/login` | 없음(공개) | `{username, password}` | `{accessToken, refreshToken, tokenType:"Bearer", expiresIn, role, displayName, username}` |
| `POST /api/v1/auth/refresh` | 없음(공개) | `{refreshToken}` | login과 동일 형태 (**리프레시 회전**: 기존 refresh 폐기 + 새 access·refresh 발급) |
| `POST /api/v1/auth/logout` | Bearer | — | `204` (Redis access 제거 + DB refresh 폐기) |
| `GET /api/v1/auth/me` | Bearer | — | `{username, role}` |
| `POST /api/v1/student-access/lookup` | 없음(공개) | `{nationality, passportNumber, birthDate}` | 기존 body + **`accessToken`**(학생 임시 JWT, TTL 1시간, refresh 없음) |
| 그 외 `/api/v1/**` | **Bearer 필수** | — | 미인증/만료/Redis 미존재 시 **401** |

핵심 변화:
- 모든 보호 API가 `Authorization: Basic ...` → **`Authorization: Bearer <accessToken>`** 요구.
- access TTL **1시간**. 만료되면 401 → refresh로 갱신해야 함(학교/유학원). 학생은 refresh 없음 → 재조회(재로그인).
- 미인증/만료는 이제 일관되게 **401** (백엔드 AuthenticationEntryPoint 적용). 403 아님.

---

## 1. 토큰 저장 전략 (결정 필요)

백엔드가 토큰을 **응답 body**로 주므로(httpOnly 쿠키 아님) 프론트가 직접 저장·주입해야 한다.

**권장안 (내부 운영툴 기준):**
- **accessToken**: 메모리(React Context/모듈 변수)에 보관. 새로고침 시 사라지므로 refresh로 복구.
- **refreshToken**: `localStorage`에 보관(새로고침·재방문 지속). 학교/유학원만 해당.
- **학생 accessToken**: `sessionStorage`에 보관(탭 단위, refresh 없음). 만료 시 여권/생년월일 재입력.

> ⚠️ XSS 트레이드오프: localStorage 토큰은 XSS에 노출될 수 있음. 내부 운영툴이라 실용성을 택하지만,
> 외부 공개로 갈 경우 refresh를 httpOnly 쿠키로 옮기는 백엔드 변경을 재검토할 것.
> (대안: refresh도 메모리만 → 새로고침 시 재로그인. 보안↑ UX↓)

저장 키 예: `ops_refresh_token`, (메모리) `ops_access_token`, `student_access_token`.

---

## 2. `src/api.js` 리팩터링

### 2-1. 현재 구조
- `request(path, {username, password, ...})` 가 `basicAuth()`로 `Authorization: Basic` 세팅.
- 모든 export 함수가 `(username, password, ...)`를 받아 넘김.
- `uploadStudentSupplement`은 **인증 헤더 없음**(현재 lookup이 공개라 통과) → 백엔드가 student 엔드포인트를 Bearer로 보호하면 **깨짐. 수정 필요.**
- `uploadSupplementDocument`, `downloadBlob`는 fetch 직접 호출하며 Basic 사용.

### 2-2. 목표 구조 — 중앙 토큰 관리 + Bearer 주입
1. **토큰 스토어 모듈** 신설 (`src/auth/tokenStore.js`):
   - `getAccessToken()/setAccessToken()`, `getRefreshToken()/setRefreshToken()`, `clear()`
   - 학생용 `getStudentToken()/setStudentToken()/clearStudent()`
2. `request()` 시그니처에서 `username/password` 제거 → 내부에서 `getAccessToken()`(또는 학생 토큰) 주입:
   ```js
   if (token) headers.set("Authorization", `Bearer ${token}`);
   ```
3. **401 → 자동 refresh 인터셉터** (학교/유학원 경로):
   - 응답이 401이면 → `refreshAccessToken()` 1회 시도 → 성공 시 원요청 **재시도 1번**.
   - refresh도 401/실패면 → `clear()` + 로그인 화면으로 (이벤트/콜백 `onAuthExpired`).
   - **단일 비행(single-flight)**: 동시 다발 401이 각자 refresh 호출하지 않도록, 진행 중 refresh Promise를 공유(큐잉)해 한 번만 호출하고 결과를 모두에게 전파.
   - refresh 응답의 **새 refreshToken으로 교체 저장**(회전 반영).
4. 기존 **5xx 재시도 로직**은 유지하되 401 처리와 분리(401은 refresh 경로, 5xx는 backoff 재시도).
5. fetch 직접 호출하던 함수(`uploadStudentSupplement`, `uploadSupplementDocument`, `downloadBlob`)도 동일한 Bearer 주입·401 처리 경로로 통일.

### 2-3. 영향받는 export 함수 (전부 `username,password` 인자 제거)
`fetchMe`, `fetchSchoolStudents`, `fetchAgencyApplications`, `fetchAgencyApplicationDetail`,
`fetchAgencyUploadBatches`, `fetchOcrProgress`, `fetchAgencyUploadBatchDetail`, `fetchSchools`,
`uploadAgencyBatchFile`, `reprocessBatch`, `updateCaseStatus`, `updateDocumentNote`,
`requestSupplement`, `fetchCaseActivities`, `updateStudentInfo`, `uploadSupplementDocument`,
`linkDocumentFile`, `renameUploadBatchDocument`, `downloadGroupPayment`, `downloadOcrResults`
→ 호출부(App.jsx) 전부 동반 수정.

학생 경로(`lookupStudentAccess`, `uploadStudentSupplement`)는 **학생 토큰** 사용.

### 2-4. 신규 함수
```js
export async function login(username, password)        // POST /auth/login → 토큰 저장
export async function refreshAccessToken()             // POST /auth/refresh (회전)
export async function logout()                          // POST /auth/logout + clear()
```

---

## 3. 인증 상태/세션 (`App.jsx`)

현재 `session`이 `{username, password}`를 들고 매 호출에 넘기는 구조 → 변경:

- **학교/유학원 세션**: `{username, displayName, role, isAuthenticated}` (토큰은 tokenStore가 보관, 세션엔 비저장 권장).
- 로그인 폼: id/pw → `login()` 호출 → 성공 시 role 따라 학교/유학원 화면 진입. (role: `ROLE_SCHOOL`/`ROLE_AGENCY` 등 백엔드 `app_user.role` 매핑값 확인 필요)
- **앱 부팅 시 복구**: localStorage refresh 있으면 `refreshAccessToken()` → 성공 시 `GET /auth/me`로 사용자 확정, 실패 시 로그인 화면.
- **로그아웃 버튼**: `logout()` → tokenStore.clear() → 로그인 화면.
- `onAuthExpired` 콜백을 api 레이어에 주입해, refresh 최종 실패 시 전역 로그아웃 처리.

- **학생 세션**: lookup 성공 시 응답의 `accessToken`을 `setStudentToken()`. 이후 학생 업로드는 Bearer로 호출.
  - 학생 토큰 만료(401) → "여권번호/생년월일 다시 입력" 안내 후 재lookup. (refresh 없음)

---

## 4. 자동 갱신 흐름 (시퀀스)

```
[보호 API 호출]
   │  Authorization: Bearer <access>
   ▼
 401? ──No──► 정상 응답
   │Yes
   ▼
 refresh 진행중? ──Yes──► 진행중 Promise 대기(공유)
   │No
   ▼
 POST /auth/refresh {refreshToken}
   │
   ├─ 200 → access/refresh 교체 저장 → 원요청 1회 재시도
   └─ 4xx → tokenStore.clear() → onAuthExpired() → 로그인 화면
```

학생: refresh 단계 없음 → 401이면 즉시 재lookup 유도.

---

## 5. 기타 점검 항목

- **CORS**: 백엔드가 `allowCredentials(true)` + `allowedHeaders("*")`라 `Authorization` 헤더 허용됨. Bearer는 쿠키 불필요 → 추가 설정 없음. (단 credentials 쿠키를 안 쓰므로 `fetch` `credentials` 옵션은 기본값 유지.)
- **에러 표시**: 401 자동 처리로 흡수되므로, 사용자에게는 "세션이 만료되어 다시 로그인해주세요" 류 메시지 일관 적용.
- **환경변수**: `VITE_API_BASE_URL`(이미 사용 중) 유지.
- **role 값 확정**: 백엔드 `DatabaseUserDetailsService`가 `ROLE_<role>`로 매핑. `app_user.role`의 실제 문자열(SCHOOL/AGENCY/OPS 등)을 DB/초기데이터에서 확인 후 프론트 분기와 일치시킬 것.
- **expiresIn 활용(선택)**: 만료 임박 시 사전 갱신(proactive refresh) 타이머는 선택사항. 우선은 401-기반 사후 갱신으로 충분.

---

## 6. 단계별 실행 순서 (구현 시)

1. `tokenStore.js` + `login/refresh/logout` api 함수 추가.
2. `request()`에서 Basic 제거 → Bearer 주입 + 401 single-flight refresh 인터셉터.
3. fetch 직접 호출 3개 함수 통일.
4. 모든 export 함수에서 `username,password` 인자 제거 + App.jsx 호출부 수정.
5. App.jsx 로그인/부팅복구/로그아웃/학생세션 로직 교체.
6. `uploadStudentSupplement`에 학생 Bearer 추가(현재 무인증 → 깨질 부분).
7. 수동 검증: 로그인 → 보호 API → (access 만료 모사) 401→refresh→재시도 → 로그아웃 후 401 확인 / 학생 lookup→업로드→토큰만료 재lookup.

---

## 7. 리스크

| 리스크 | 대응 |
|---|---|
| api.js·App.jsx 광범위 동시 수정 → 회귀 | 401 인터셉터를 먼저 안정화 후 호출부 일괄 치환, 화면별 스모크 테스트 |
| refresh 동시 호출 폭주 | single-flight 큐로 1회만 호출 |
| localStorage refresh의 XSS 노출 | 내부툴 한정 허용, 외부공개 시 httpOnly 쿠키 재검토 |
| 학생 무인증 업로드(`uploadStudentSupplement`)가 보호로 바뀌며 깨짐 | 학생 토큰 Bearer 주입 필수 포함 |
| role 문자열 불일치로 화면 분기 오작동 | 연동 전 실제 role 값 확인 |

---

## 8. 참고: 백엔드 구현 요약(이미 완료)
- `POST /auth/login|refresh|logout`, `GET /auth/me` 신설. access=Redis(1h)·refresh=DB(1주, 회전).
- 학생 lookup 응답에 임시 access JWT(1h, stateless) 추가.
- 미인증 401, JWT secret fail-fast, refresh 회전, Redis write afterCommit, refresh_token 테이블(V15, timestamptz) 적용.
- (범위 밖·별도 권장) `/api/v1/internal/**` 보호, 학생 본인확인 AND 검증, 로그인 레이트리밋.
