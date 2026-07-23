export const SCHOOL_SEARCH_OPTIONS = [
  { value: "name", label: "학생명" },
  { value: "nationality", label: "국적" },
  { value: "agencyName", label: "유학원명" },
];

export const AGENCY_SEARCH_OPTIONS = [
  { value: "applicationType", label: "신청 유형" },
  { value: "visaType", label: "비자 타입" },
  { value: "schoolName", label: "학교명" },
  { value: "coordinator", label: "담당자" },
  { value: "studentName", label: "학생명" },
];

export const ALL_FILTER = "전체";

export const VISA_TYPE_OPTIONS = [
  { code: "ALIEN_REGISTRATION", label: "외국인등록" },
  { code: "D2_EXTENSION", label: "D2연장" },
  { code: "D4_EXTENSION", label: "D4연장" },
  { code: "STATUS_CHANGE_AND_EXTENSION", label: "세부체류자격 변경 및 연장" },
  { code: "D2_CHANGE", label: "D2변경" },
];

// 초기화 시 한 번에 지울 URL 파라미터 (모듈 상수 — 렌더마다 새 배열을 만들지 않는다)
// 학생 목록은 '완료'된 케이스만 보여주므로 상태 필터는 두지 않는다 (선택지가 하나뿐이라 의미가 없다)
export const STUDENT_FILTER_KEYS = ["name", "nationality", "visa", "school", "date"];
// "missing"은 옛 필터(케이스로 대체됨) — 초기화 시 레거시 URL 파라미터를 함께 쓸어내려 남겨둔다.
export const SUPPLEMENT_FILTER_KEYS = ["name", "nationality", "visa", "school", "case", "date", "missing"];
