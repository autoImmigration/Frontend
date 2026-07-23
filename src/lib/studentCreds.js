// 학생 로그인 자격(3필드) 탭 세션 보관 — 새로고침 시 자동 재로그인용.
// sessionStorage라 탭을 닫으면 사라진다(공용 PC에서 PII가 남지 않도록 localStorage는 쓰지 않음).
const STUDENT_CREDS_KEY = "immigrationOps.studentLogin";

export function saveStudentCreds(form) {
  try { sessionStorage.setItem(STUDENT_CREDS_KEY, JSON.stringify(form)); } catch { /* 저장 실패해도 로그인 자체는 유지 */ }
}

export function loadStudentCreds() {
  try {
    const raw = sessionStorage.getItem(STUDENT_CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearStudentCreds() {
  try { sessionStorage.removeItem(STUDENT_CREDS_KEY); } catch { /* noop */ }
}
