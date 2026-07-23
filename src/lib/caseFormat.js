import { formatStudentName, formatAlienRegistrationNumber } from "./studentFormat.js";

export function formatExtraDate(value) {
  if (!value) return "—";
  // 서버에서 ISO(YYYY-MM-DD) 로 직렬화됨. 운영 화면 표기(YYYY.MM.DD)로 변환.
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : String(value);
}

export function formatExtraNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isNaN(num) ? String(value) : num;
}

export function formatExtraAmount(amount, currency) {
  const num = formatExtraNumber(amount);
  if (num === null) return "—";
  const formatted = typeof num === "number" ? num.toLocaleString("ko-KR") : num;
  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatExtraGpa(value, scale) {
  const num = formatExtraNumber(value);
  if (num === null) return "—";
  return scale ? `${num} / ${scale}` : String(num);
}

export function formatExtraRate(value) {
  const num = formatExtraNumber(value);
  if (num === null) return "—";
  return `${num}%`;
}

export function formatExtraText(value) {
  if (value === null || value === undefined || value === "" || value === "UNKNOWN") return "—";
  return String(value);
}

export function formatExtraCount(value, suffix) {
  const num = formatExtraNumber(value);
  if (num === null) return "—";
  return suffix ? `${num}${suffix}` : String(num);
}

// 값이 없는 행("—"/null/빈문자열)은 버린다 — "추출한 항목만" 보여주기 위함.
export const EMPTY_CELL = new Set(["—", "", null, undefined]);

/** 성별 코드(M/F)를 한국어 라벨로. 값이 없으면 빈 문자열(표시부에서 "—"로 대체). */
export function genderLabel(code) {
  if (code === "M") return "남성";
  if (code === "F") return "여성";
  return "";
}

/** 상세보기 모달에 넘길 기본 정보 행 — application/caseData 공통 필드에서 뽑는다. */
export function basicInfoRows(src) {
  if (!src) return [];
  return [
    ["이름", formatStudentName(src.studentName)],
    ["국적", src.nationality],
    ["여권번호", src.passportNumber],
    ["생년월일", src.birthDate],
    ["외국인등록번호", formatAlienRegistrationNumber(src.alienRegistrationNumber) || src.alienRegistrationNumber],
    ["학교", src.schoolName],
    ["주소", src.address],
    ["전화번호", src.phoneNumber],
  ];
}
