// 학생 표시용 포매터 (표시 전용 — 저장 데이터는 변형하지 않는다)

/**
 * 여권 MRZ에서 추출된 이름을 대문자로 표시하되, 기존 공백(여권 간격)은 보존한다.
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function formatStudentName(name) {
  if (name == null) return "";
  return String(name).toUpperCase();
}

/**
 * 외국인등록번호 표시: 13자리 숫자를 NNNNNN-NNNNNNN (6 + 하이픈 + 7) 형태로 표시.
 * 정확히 13자리 숫자가 아니면 원본 값을 그대로 반환한다(크래시 방지).
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function formatAlienRegistrationNumber(value) {
  if (value == null) return "";
  const raw = String(value);
  return /^\d{13}$/.test(raw) ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
}
