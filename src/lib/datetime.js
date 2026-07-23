// 로컬 타임존 기준 오늘 날짜(YYYY-MM-DD). toISOString()은 UTC라 KST 오전엔 하루 밀리므로 직접 조립한다.
export function todayLocalIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function formatDisplayDateTime(value) {
  if (!value) {
    return "";
  }

  const normalizedValue = String(value).trim();
  const match = normalizedValue.match(
    /^(\d{4})[-.](\d{2})[-.](\d{2})(?:[T ](\d{2}):(\d{2}))?/,
  );

  if (!match) {
    return normalizedValue;
  }

  const [, year, month, day, hour, minute] = match;

  if (!hour || !minute) {
    return `${year}.${month}.${day}`;
  }

  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export function formatProcessingDuration(seconds) {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}
