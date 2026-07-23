export function buildStudentMap(apps) {
  const map = new Map();
  for (const app of apps) {
    const key = app.studentName || app.id;
    if (!map.has(key)) map.set(key, { studentName: app.studentName, nationality: app.nationality, schoolName: app.schoolName, cases: [] });
    map.get(key).cases.push(app);
  }
  return Array.from(map.values()).map((s) => ({
    ...s,
    caseCount: s.cases.length,
    latestCase: s.cases.sort((a, b) => (a.applicationDate < b.applicationDate ? 1 : -1))[0],
  }));
}

export function isExtractionFailed(app) {
  return !app.studentName || app.studentName.toUpperCase() === "UNKNOWN";
}

/** 값 배열 → FilterBar 가 쓰는 옵션 배열. */
export function toOptions(values) {
  return values.map((value) => ({ value, label: value }));
}

/**
 * 화면에 쓰이는 여러 날짜 표기("2026.07.11 15:19", "2026-07-11", ISO)에서 날짜만 뽑아
 * <input type="date"> 와 같은 "YYYY-MM-DD" 로 맞춘다. 못 읽으면 빈 문자열.
 */
export function toDateKey(value) {
  if (!value) return "";
  const matched = String(value).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!matched) return "";
  const [, year, month, day] = matched;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * 배치의 접수일. 업로드할 때 운영자가 입력한 값이며 note 에 "접수일: 2026-07-11" 형태로 들어간다.
 * 업로드 일시(uploadedAt)와는 다른 값이다 — 어제 접수분을 오늘 올릴 수 있다.
 */
export function receiptDateOf(batch) {
  return toDateKey(batch?.note) || "";
}
