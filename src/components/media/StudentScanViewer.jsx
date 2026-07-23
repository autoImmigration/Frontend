import { useState } from "react";
import { StudentScanImage } from "./StudentScanImage.jsx";

/** 학생이 자기 서류 스캔을 넘겨보는 라이트박스. */
export function StudentScanViewer({ caseId, doc, onClose, loadBlob }) {
  const scans = doc?.scans ?? [];
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, scans.length - 1));
  if (!doc || scans.length === 0) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 14, padding: 20, width: "min(720px, 95vw)", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{doc.name}</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              업로드된 스캔 {scans.length}장{scans.length > 1 ? ` · ${safeIndex + 1}/${scans.length}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        {scans.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {scans.map((fn, i) => (
              <button
                key={fn}
                type="button"
                onClick={() => setIndex(i)}
                style={{
                  fontSize: 12, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${i === safeIndex ? "var(--primary)" : "var(--line)"}`,
                  background: i === safeIndex ? "var(--primary-soft)" : "#fff",
                  color: i === safeIndex ? "var(--primary)" : "var(--text-main)",
                  fontWeight: i === safeIndex ? 600 : 400,
                }}
              >
                {i + 1}장
              </button>
            ))}
          </div>
        )}
        <StudentScanImage caseId={caseId} filename={scans[safeIndex]} alt={`${doc.name} ${safeIndex + 1}장`} loadBlob={loadBlob} />
      </div>
    </div>
  );
}
