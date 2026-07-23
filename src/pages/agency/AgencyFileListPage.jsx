import { useEffect, useState } from "react";
import { downloadBatchFiles, fetchAgencyUploadBatchDetail, renameUploadBatchDocument } from "../../api.js";
import { FolderCard } from "../../components/cards/FolderCard.jsx";
import { AuthenticatedImage } from "../../components/media/AuthenticatedImage.jsx";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { PaginationNav } from "../../components/ui/PaginationNav.jsx";
import { normalizeAgencyUploadBatch } from "../../lib/batchNormalize.js";
import { usePagination } from "../../lib/usePagination.js";

export function AgencyFileListPage({ batches, session }) {
  const [level, setLevel] = useState(0);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lightboxDoc, setLightboxDoc] = useState(null);
  const [renames, setRenames] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingKey, setSavingKey] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [downloadingZip, setDownloadingZip] = useState(false);

  const { currentPage: batchPage, setCurrentPage: setBatchPage, totalPages: batchTotalPages, paginatedItems: pagedBatchFolders } = usePagination(batches, 20);

  async function handleDownloadBatchZip() {
    if (downloadingZip || !selectedBatch) return;
    setLoadError("");
    setDownloadingZip(true);
    try {
      const label = selectedBatch.displayName || selectedBatch.fileName || selectedBatch.id;
      const ok = await downloadBatchFiles(selectedBatch.id, `${label}.zip`);
      if (!ok) setLoadError("다운로드할 스캔 파일이 없습니다.");
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setDownloadingZip(false);
    }
  }

  useEffect(() => {
    if (!lightboxDoc) return;
    function onKey(e) { if (e.key === "Escape") setLightboxDoc(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxDoc]);

  function startEdit(doc) {
    const key = `${selectedCase.id}:${doc.code}`;
    setEditingKey(key);
    setEditValue(renames[key] ?? doc.name ?? doc.sourceFilename);
    setSaveError("");
  }

  async function confirmEdit(doc) {
    const key = `${selectedCase.id}:${doc.code}`;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === (renames[key] ?? doc.name)) {
      setEditingKey(null);
      return;
    }
    setRenames((prev) => ({ ...prev, [key]: trimmed }));
    setEditingKey(null);
    setSavingKey(key);
    setSaveError("");
    try {
      await renameUploadBatchDocument(selectedBatch.id, selectedCase.id, doc.code, trimmed);
    } catch {
      setSaveError("저장 실패 (서버 미지원) — 현재 세션에서만 유지됩니다.");
    } finally {
      setSavingKey(null);
    }
  }

  function cancelEdit() {
    setEditingKey(null);
    setSaveError("");
  }

  async function handleOpenBatch(batch) {
    setLoadError("");
    if (Array.isArray(batch.cases) && batch.cases.length > 0) {
      setSelectedBatch(batch);
      setLevel(1);
      return;
    }
    setLoadingBatch(true);
    try {
      const detail = normalizeAgencyUploadBatch(
        await fetchAgencyUploadBatchDetail(batch.id),
        batch,
      );
      setSelectedBatch(detail);
      setLevel(1);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoadingBatch(false);
    }
  }

  function handleOpenCase(caseData) {
    setSelectedCase(caseData);
    setLevel(2);
  }

  function handleBack() {
    if (level === 2) { setLevel(1); setSelectedCase(null); }
    else if (level === 1) { setLevel(0); setSelectedBatch(null); }
  }

  const breadcrumbParts = ["파일 목록"];
  if (level >= 1 && selectedBatch) breadcrumbParts.push(selectedBatch.displayName || selectedBatch.fileName);
  if (level >= 2 && selectedCase) breadcrumbParts.push(selectedCase.studentName);

  const caseDocuments = level === 2 && selectedCase
    ? [
        ...(selectedCase.documents ?? []).filter((d) => d.sourceFilename),
        ...(selectedCase.otherDocuments ?? []).map((filename) => ({
          code: `other:${filename}`,
          name: "기타",
          sourceFilename: filename,
        })),
      ]
    : [];

  return (
    <>
      <PageHeader
        title="파일 목록"
        description="케이스 · 학생 · 문서 이미지를 폴더 구조로 탐색합니다."
      />

      <div className="fileBreadcrumb">
        {breadcrumbParts.map((part, i) => (
          <span key={i} className="fileBreadcrumbItem">
            {i > 0 && <span className="fileBreadcrumbSep">›</span>}
            {i < breadcrumbParts.length - 1 ? (
              <button
                type="button"
                className="fileBreadcrumbLink"
                onClick={() => {
                  if (i === 0) { setLevel(0); setSelectedBatch(null); setSelectedCase(null); }
                  else if (i === 1) { setLevel(1); setSelectedCase(null); }
                }}
              >
                {part}
              </button>
            ) : (
              <span className="fileBreadcrumbCurrent">{part}</span>
            )}
          </span>
        ))}
      </div>

      {loadError && <div className="errorBox" style={{ marginBottom: 12 }}>{loadError}</div>}

      {level === 0 && (
        <section className="surfaceCard">
          <div className="sectionHeading">
            <h2>케이스 폴더</h2>
            <p>ZIP 업로드 단위로 생성된 케이스입니다. 폴더를 클릭하면 학생 목록으로 이동합니다.</p>
          </div>
          {batches.length === 0 ? (
            <EmptyState title="케이스가 없습니다." description="ZIP 파일을 업로드하면 케이스가 생성됩니다." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, marginTop: 12 }}>
              {pagedBatchFolders.map((batch) => (
                <FolderCard
                  key={batch.id}
                  icon="📁"
                  name={batch.displayName || batch.fileName}
                  meta={[batch.fileName, batch.studentCount != null ? `${batch.studentCount}명` : null]}
                  onClick={() => handleOpenBatch(batch)}
                  disabled={loadingBatch}
                />
              ))}
            </div>
          )}
          <PaginationNav currentPage={batchPage} totalPages={batchTotalPages} onPageChange={setBatchPage} />
          {loadingBatch && (
            <p style={{ marginTop: 12, fontSize: "0.875rem", color: "var(--text-muted)" }}>불러오는 중...</p>
          )}
        </section>
      )}

      {level === 1 && selectedBatch && (
        <section className="surfaceCard">
          <div className="sectionHeading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" className="secondaryButton" onClick={handleBack} style={{ fontSize: "0.8rem", padding: "4px 10px" }}>← 뒤로</button>
                <h2>학생 폴더</h2>
              </div>
              <p>{selectedBatch.displayName || selectedBatch.fileName} 케이스의 학생 목록입니다.</p>
            </div>
            <button
              type="button"
              className="primaryButton"
              onClick={handleDownloadBatchZip}
              disabled={downloadingZip || !selectedBatch.cases || selectedBatch.cases.length === 0}
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {downloadingZip ? "압축 중…" : "⬇ 학생별 ZIP 다운로드"}
            </button>
          </div>
          {!selectedBatch.cases || selectedBatch.cases.length === 0 ? (
            <EmptyState title="학생 케이스가 없습니다." description="배치 처리가 완료되면 학생 폴더가 표시됩니다." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
              {selectedBatch.cases.map((c) => (
                <FolderCard
                  key={c.id}
                  icon="📂"
                  name={c.studentName}
                  meta={[
                    c.nationality,
                    c.documents ? `${c.documents.filter((d) => d.sourceFilename).length}개 파일` : null,
                  ]}
                  onClick={() => handleOpenCase(c)}
                  disabled={false}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {level === 2 && selectedCase && (
        <section className="surfaceCard">
          <div className="sectionHeading">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" className="secondaryButton" onClick={handleBack} style={{ fontSize: "0.8rem", padding: "4px 10px" }}>← 뒤로</button>
              <h2>{selectedCase.studentName}</h2>
            </div>
            <p>업로드된 스캔 이미지 목록입니다.</p>
          </div>
          {caseDocuments.length === 0 ? (
            <EmptyState title="이미지가 없습니다." description="배치 처리 완료 후 스캔 이미지가 연결됩니다." />
          ) : (
            <>
            {saveError && <p style={{ color: "var(--danger)", fontSize: "0.8125rem", marginBottom: 8 }}>{saveError}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginTop: 12 }}>
              {caseDocuments.map((doc) => {
                const key = `${selectedCase.id}:${doc.code}`;
                const displayName = renames[key] ?? doc.name ?? doc.sourceFilename;
                const isEditing = editingKey === key;
                const isSaving = savingKey === key;
                return (
                  <div key={doc.code ?? doc.sourceFilename} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setLightboxDoc(doc)}
                      style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#f9fafb", padding: 0, cursor: "zoom-in", display: "block", width: "100%" }}
                    >
                      <AuthenticatedImage
                        batchId={selectedBatch.id}
                        filename={doc.sourceFilename}
                        imgStyle={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                      />
                    </button>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmEdit(doc);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          onBlur={() => confirmEdit(doc)}
                          disabled={isSaving}
                          style={{ flex: 1, fontSize: "0.75rem", padding: "2px 6px", border: "1px solid var(--primary)", borderRadius: 4, outline: "none" }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0, wordBreak: "break-all", flex: 1 }}>
                          {displayName}
                        </p>
                        <button
                          type="button"
                          onClick={() => startEdit(doc)}
                          title="파일명 변경"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: "0.75rem", color: "var(--text-muted)", flexShrink: 0, lineHeight: 1 }}
                        >
                          ✏️
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </>
          )}
        </section>
      )}

      {lightboxDoc && (
        <div
          onClick={() => setLightboxDoc(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.82)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => setLightboxDoc(null)}
              style={{
                position: "absolute", top: -36, right: 0,
                background: "none", border: "none", color: "#fff", fontSize: "1.5rem", cursor: "pointer", lineHeight: 1,
              }}
            >
              ✕
            </button>
            <AuthenticatedImage
              batchId={selectedBatch.id}
              filename={lightboxDoc.sourceFilename}
              imgStyle={{ maxWidth: "88vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 4, display: "block" }}
            />
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8125rem", margin: 0, textAlign: "center" }}>
              {lightboxDoc.name || lightboxDoc.sourceFilename}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 목록 상단 필터 바 — 학생 목록·보완 접수 공용.
 *
 * DESIGN.md 안티패턴 "표 위에 검색 조건이 흩어져 있는 형태"를 피한다.
 * 예전엔 flex-wrap 에 폭이 제각각인 필드를 늘어놓아 줄바꿈이 들쭉날쭉했고,
 * 필터를 6개까지 걸어도 "지금 뭐가 걸려 있는지" 한눈에 안 보였다.
 *
 * - 검색은 한 줄로 분리(가장 자주 쓰는 입력)
 * - 셀렉트는 균등 그리드 → 어느 폭에서도 열이 어긋나지 않는다
 * - 적용된 조건은 칩으로 보여주고 칩에서 바로 해제한다
 * - 걸려 있는 셀렉트는 파랗게 표시해 훑기만 해도 보인다
 *
 * filters: [{ key, label, value, onChange, options: [{ value, label }] }]
 */
