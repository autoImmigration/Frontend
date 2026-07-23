import { useEffect, useMemo, useRef, useState } from "react";
import { updateCaseStatus, updateDocumentNote } from "../../api.js";
import { AuthenticatedImage } from "../../components/media/AuthenticatedImage.jsx";
import { StudentExtraInfoModal } from "../../components/modals/StudentExtraInfoModal.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { CASE_STATUS_OPTIONS } from "../../constants/status.js";
import { basicInfoRows } from "../../lib/caseFormat.js";
import { formatAlienRegistrationNumber, formatStudentName } from "../../lib/studentFormat.js";

export function AgencyDetailPage({ application, selectedDocument, onSelectDocument, onBack, backLabel = "목록", session, onStatusChange, onNoteChange }) {
  const [selectedStatusKey, setSelectedStatusKey] = useState(application.statusKey ?? CASE_STATUS_OPTIONS[0].key);
  const [statusChanging, setStatusChanging] = useState(false);
  const [noteText, setNoteText] = useState(selectedDocument.note ?? "");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showExtraInfo, setShowExtraInfo] = useState(false);

  // 이미지 보기 — 업로드 내역 학생 상세와 동일: 클릭 → 모달, 휠 줌, 드래그 이동
  const [zoomedImage, setZoomedImage] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const zoomDrag = useRef(null);

  function openZoom(filename) {
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
    setZoomedImage(filename);
  }

  // 한 양식에 스캔이 여러 장일 수 있다(1:N). 레거시 단일 sourceFilename 도 1장으로 취급.
  const docFiles = selectedDocument.sourceFilenames?.length
    ? selectedDocument.sourceFilenames
    : (selectedDocument.sourceFilename ? [selectedDocument.sourceFilename] : []);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  useEffect(() => { setActiveFileIndex(0); }, [selectedDocument.code]);
  const safeFileIndex = Math.min(activeFileIndex, Math.max(docFiles.length - 1, 0));
  const imageFilename = docFiles[safeFileIndex] ?? null;

  // Sync note textarea when selected document changes
  useEffect(() => {
    setNoteText(selectedDocument.note ?? "");
  }, [selectedDocument.code, selectedDocument.note]);

  const timelineEntries = useMemo(() => {
    const entries = [];
    if (application.applicationDate) {
      entries.push({
        date: application.applicationDate,
        action: "케이스 생성",
        detail: `${application.applicationType} · ${application.visaType}`,
        type: "system",
      });
    }
    // Group documents by submittedAt date
    const byDate = new Map();
    application.documents
      .filter((d) => d.submittedAt)
      .forEach((d) => {
        if (!byDate.has(d.submittedAt)) byDate.set(d.submittedAt, []);
        byDate.get(d.submittedAt).push(d.name);
      });
    byDate.forEach((names, date) => {
      entries.push({
        date,
        action: names.length === 1 ? "서류 업로드" : `서류 업로드 ${names.length}건`,
        detail: names.slice(0, 2).join(", ") + (names.length > 2 ? ` 외 ${names.length - 2}건` : ""),
        type: "upload",
      });
    });
    if (application.status && application.status !== "접수대기") {
      entries.push({
        date: application.applicationDate ?? "",
        action: `상태 변경 · ${application.status}`,
        detail: "",
        type: "status",
      });
    }
    return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [application]);

  async function handleStatusChange() {
    if (statusChanging) return;
    setStatusChanging(true);
    try {
      const result = await updateCaseStatus(application.id, selectedStatusKey);
      if (onStatusChange) onStatusChange(result);
    } catch (err) {
      alert(`상태 변경 실패: ${err.message}`);
    } finally {
      setStatusChanging(false);
    }
  }

  async function handleNoteSave() {
    if (noteSaving) return;
    setNoteSaving(true);
    try {
      await updateDocumentNote(application.id, selectedDocument.code, noteText);
      if (onNoteChange) onNoteChange(selectedDocument.code, noteText);
    } catch (err) {
      alert(err.message);
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={`유학원 / ${backLabel} / 신청 상세`}
        title={`${formatStudentName(application.studentName)} · ${application.visaType}`}
        description={`${application.schoolName} · ${application.applicationType} · 담당 ${application.coordinator} · 최근 제출일 ${selectedDocument.submittedAt || "—"}`}
        actions={
          <button type="button" className="secondaryButton" onClick={onBack}>
            ← {backLabel}(으)로 돌아가기
          </button>
        }
      />

      {/* 확대 모달 — 업로드 내역 학생 상세와 동일: 휠 줌, 드래그 이동, 더블클릭 리셋 */}
      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)}
          onWheel={(e) => setZoomScale((s) => Math.min(8, Math.max(1, s - e.deltaY * 0.0015)))}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out", overflow: "hidden" }}>
          <button type="button" onClick={() => setZoomedImage(null)}
            style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#fff", fontSize: "1.8rem", cursor: "pointer", lineHeight: 1, zIndex: 1 }}>✕</button>
          <div style={{ position: "absolute", top: 18, left: 20, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
            휠: 확대/축소 · 드래그: 이동 · 더블클릭: 원래대로 · {Math.round(zoomScale * 100)}%
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => { zoomDrag.current = { x: e.clientX - zoomOffset.x, y: e.clientY - zoomOffset.y }; }}
            onMouseMove={(e) => { if (zoomDrag.current) setZoomOffset({ x: e.clientX - zoomDrag.current.x, y: e.clientY - zoomDrag.current.y }); }}
            onMouseUp={() => { zoomDrag.current = null; }}
            onMouseLeave={() => { zoomDrag.current = null; }}
            onDoubleClick={() => { setZoomScale(1); setZoomOffset({ x: 0, y: 0 }); }}
            style={{
              maxWidth: "94vw", maxHeight: "92vh",
              cursor: zoomScale > 1 ? "grab" : "default",
              transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
              transition: zoomDrag.current ? "none" : "transform 0.08s ease-out",
            }}>
            <AuthenticatedImage batchId={application.intakeBatch} filename={zoomedImage}
              imgStyle={{ maxWidth: "94vw", maxHeight: "92vh", objectFit: "contain", display: "block", pointerEvents: "none" }} />
          </div>
        </div>
      )}

      <div className="agencyDetailThreeSplit">
        {/* LEFT: 문서 체크리스트 */}
        <div className="surfaceCard" style={{ padding: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="sectionHeading" style={{ marginBottom: 12 }}>
            <h2>문서 체크리스트</h2>
            <p>
              제출 {application.submittedCount}건 ·{" "}
              <span style={{ color: application.missingCount > 0 ? "var(--warning)" : "var(--success)" }}>
                미제출 {application.missingCount}건
              </span>
            </p>
          </div>
          <div className="documentStatusList">
            {application.documents.map((document) => (
              <button
                key={document.code}
                type="button"
                className={`documentStatusButton${selectedDocument.code === document.code ? " isActive" : ""}`}
                onClick={() => onSelectDocument(document.code)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong>{document.name}</strong>
                  {document.note && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--primary)", flexShrink: 0, display: "inline-block" }} />
                  )}
                </div>
                <StatusBadge value={document.status} />
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: 이미지 뷰어 */}
        <div className="surfaceCard">
          <div className="sectionHeading">
            <h2 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {selectedDocument.name}
              {selectedDocument.note && (
                <span style={{ color: "var(--danger)", fontSize: 14, fontWeight: 600 }}>
                  {selectedDocument.note}
                </span>
              )}
            </h2>
            <p>{selectedDocument.category}</p>
          </div>
          {imageFilename && session?.isAuthenticated && application.intakeBatch ? (
            <div>
              {/* 한 양식에 스캔이 여러 장이면 장 선택 탭 */}
              {docFiles.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {docFiles.map((fn, idx) => {
                    const active = idx === safeFileIndex;
                    return (
                      <button
                        key={fn}
                        type="button"
                        onClick={() => setActiveFileIndex(idx)}
                        title={fn}
                        style={{
                          fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                          border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
                          background: active ? "var(--primary-soft)" : "#fff",
                          color: active ? "var(--primary)" : "var(--text-main)",
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {idx + 1}장
                      </button>
                    );
                  })}
                </div>
              )}
              <div
                onClick={() => openZoom(imageFilename)}
                title="클릭하면 확대 (확대 후 휠로 줌, 드래그로 이동)"
                style={{
                  width: "100%", height: 540, overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid var(--line)", background: "#fff", borderRadius: 4,
                  cursor: "zoom-in",
                }}
              >
                <AuthenticatedImage
                  batchId={application.intakeBatch}
                  filename={imageFilename}
                  imgStyle={{ maxWidth: "100%", maxHeight: "540px", objectFit: "contain", display: "block" }}
                />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", textAlign: "center" }}>
                클릭하면 확대 · 확대 후 휠로 줌, 드래그로 이동
              </p>
            </div>
          ) : (
            <div className="previewSurface">
              <span className="previewTag">문서 미리보기</span>
              <strong>{selectedDocument.name}</strong>
              <p>{selectedDocument.preview}</p>
            </div>
          )}

          <div className="sectionBlock">
            <div className="sectionHeading" style={{ marginBottom: 8 }}>
              <h2>검토 메모</h2>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: 13,
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                className="primaryButton"
                onClick={handleNoteSave}
                disabled={noteSaving}
                style={{ fontSize: 13, minHeight: 36 }}
              >
                {noteSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: 학생 정보 + 케이스 상태 + 타임라인 */}
        <div className="surfaceCard" style={{ display: "flex", flexDirection: "column" }}>
          <div className="sectionHeading" style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2>학생 정보</h2>
            <button
              type="button"
              onClick={() => setShowExtraInfo(true)}
              style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--primary)", padding: 0 }}
            >
              상세보기
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-strong)" }}>
            {[
              ["성명", formatStudentName(application.studentName), false],
              ["국적", application.nationality, true],
              ["생년월일", application.birthDate, true],
              ["여권번호", application.passportNumber, true],
              ["외국인등록번호", formatAlienRegistrationNumber(application.alienRegistrationNumber), false],
              ["학교명", application.schoolName, false],
              ["배치", application.intakeBatch, false],
            ].map(([label, value, required]) => {
              const isMissing = required && (!value || value === "UNKNOWN");
              return (
                <div key={label} style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--text-main)", minWidth: 100, flexShrink: 0 }}>{label}</span>
                  <span style={{ color: isMissing ? "var(--danger)" : undefined, fontWeight: isMissing ? 600 : undefined }}>
                    : {value ?? "—"} {isMissing && "⚠ 미입력"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="sectionBlock">
            <div className="sectionHeading" style={{ marginBottom: 10 }}>
              <h2>케이스 상태</h2>
              <p>현재: <strong>{application.status}</strong></p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={selectedStatusKey}
                onChange={(e) => setSelectedStatusKey(e.target.value)}
                style={{ flex: 1, minHeight: 38, padding: "0 8px", fontSize: 13 }}
              >
                {CASE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="primaryButton"
                onClick={handleStatusChange}
                disabled={statusChanging}
                style={{ whiteSpace: "nowrap", minHeight: 38 }}
              >
                {statusChanging ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>

          <div className="sectionBlock">
            <div className="sectionHeading" style={{ marginBottom: 10, flexShrink: 0 }}>
              <h2>ACTIVITY · 타임라인</h2>
            </div>
            {timelineEntries.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>—</p>
            ) : (
              <div>
                {timelineEntries.map((entry, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      paddingBottom: 14,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
                      <div style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: entry.type === "system" ? "var(--text-muted)" : entry.type === "status" ? "var(--primary)" : "var(--text-strong)",
                        flexShrink: 0,
                        marginTop: 3,
                      }} />
                      <div style={{ width: 1, flex: 1, background: "var(--line)", marginTop: 3 }} />
                    </div>
                    <div style={{ flex: 1, paddingBottom: 2 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{entry.date}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{entry.action}</div>
                      {entry.detail && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{entry.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {showExtraInfo && (
        <StudentExtraInfoModal
          extraInfo={application.extraInfo}
          basic={basicInfoRows(application)}
          studentName={application.studentName}
          onClose={() => setShowExtraInfo(false)}
        />
      )}
    </>
  );
}
