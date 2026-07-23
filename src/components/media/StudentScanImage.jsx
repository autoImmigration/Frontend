import { useEffect, useState } from "react";
import { fetchStudentBlob, studentCaseImagePath } from "../../api.js";

export function StudentScanImage({ caseId, filename, alt, loadBlob }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!caseId || !filename) { setFailed(true); return; }
    let cancelled = false;
    let objectUrl = null;
    const fetcher = loadBlob || ((cid, fn) => fetchStudentBlob(studentCaseImagePath(cid, fn)));
    fetcher(caseId, filename)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [caseId, filename]);

  if (failed) {
    return <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>이미지를 불러올 수 없습니다.</div>;
  }
  if (!url) {
    return <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>불러오는 중…</div>;
  }
  return <img src={url} alt={alt} style={{ maxWidth: "100%", maxHeight: "76vh", objectFit: "contain", display: "block", margin: "0 auto", borderRadius: 6 }} />;
}
