// 인증 이미지 blob URL 캐시 (세션 수명, FIFO 상한) — 서류 전환 시 재다운로드와
// "로딩 중" 플래시(전체 새로고침처럼 보이는 레이아웃 점프)를 없앤다.
export const AUTHED_IMAGE_CACHE_MAX = 80;
export const authedImageCache = new Map(); // "batchId/filename" → objectUrl

export function cacheAuthedImage(key, url) {
  if (authedImageCache.size >= AUTHED_IMAGE_CACHE_MAX) {
    const oldestKey = authedImageCache.keys().next().value;
    URL.revokeObjectURL(authedImageCache.get(oldestKey));
    authedImageCache.delete(oldestKey);
  }
  authedImageCache.set(key, url);
}
