import { useEffect, useState } from "react";
import { fetchAuthedBlob } from "../../api.js";
import { authedImageCache, cacheAuthedImage } from "../../lib/authedImageCache.js";

export function AuthenticatedImage({ batchId, filename, imgStyle }) {
  const cacheKey = batchId && filename ? `${batchId}/${filename}` : null;
  // "FAILED" | objectUrl | null(최초 로딩). 파일 전환 시 초기화하지 않고
  // 이전 이미지를 그대로 보여주다가 새 이미지가 도착하면 교체한다(깜빡임 방지).
  const [current, setCurrent] = useState(() => (cacheKey ? authedImageCache.get(cacheKey) ?? null : "FAILED"));

  useEffect(() => {
    if (!cacheKey) {
      setCurrent("FAILED");
      return;
    }
    const cached = authedImageCache.get(cacheKey);
    if (cached) {
      setCurrent(cached);
      return;
    }
    let cancelled = false;
    const path = `/agency/upload-batches/${encodeURIComponent(batchId)}/images/${encodeURIComponent(filename)}`;
    fetchAuthedBlob(path, "이미지를 불러올 수 없습니다.")
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        cacheAuthedImage(cacheKey, url);
        if (!cancelled) setCurrent(url);
      })
      .catch(() => { if (!cancelled) setCurrent("FAILED"); }); // 실패는 캐시하지 않음 → 재방문 시 재시도
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const failed = current === "FAILED";
  const objectUrl = failed ? null : current;

  const defaultImgStyle = { maxWidth: "100%", maxHeight: "540px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--line)" };
  const resolvedImgStyle = imgStyle ?? defaultImgStyle;

  if (failed) {
    return (
      <div className="previewSurface" style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>이미지를 불러올 수 없습니다.</p>
      </div>
    );
  }
  if (!objectUrl) {
    return (
      <div className="previewSurface" style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>로딩 중...</p>
      </div>
    );
  }
  return <img src={objectUrl} alt={filename} style={resolvedImgStyle} />;
}
