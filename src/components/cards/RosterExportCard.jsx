import { useState } from "react";
import { downloadStudentRoster } from "../../api.js";
import { useModalA11y } from "../../lib/useModalA11y.js";
import { EmptyState } from "../ui/EmptyState.jsx";

/** 학생명단 및 신청현황표 — 케이스(배치) 선택 모달을 거쳐 내보내는 카드. */
export function RosterExportCard({ title, description, batches }) {
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const modalRef = useModalA11y(showModal, () => setShowModal(false));

  const allSelected = batches.length > 0 && selectedIds.length === batches.length;

  function toggleBatch(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : batches.map((b) => b.id));
  }

  async function handleExport() {
    if (isExporting || selectedIds.length === 0) return;
    setIsExporting(true);
    try {
      // 전달 순서 = 화면 목록 순서 (엑셀 행 순서가 배치 목록 순서를 따라간다)
      const ordered = batches.filter((b) => selectedIds.includes(b.id)).map((b) => b.id);
      await downloadStudentRoster(ordered);
      setShowModal(false);
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="surfaceCard">
      <div className="sectionHeading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="primaryButton"
          onClick={() => { setSelectedIds(batches.map((b) => b.id)); setShowModal(true); }}
        >
          케이스 선택 후 내보내기
        </button>
      </div>

      {showModal && (
        <div className="caseModalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="caseModalBackdrop" />
          <div className="caseModal" ref={modalRef} tabIndex={-1}
            role="dialog" aria-modal="true" aria-labelledby="rosterCaseModalTitle">
            <div className="caseModalHead">
              <div>
                <h2 className="caseModalTitle" id="rosterCaseModalTitle">케이스 선택</h2>
                <p className="caseModalSub">선택한 케이스의 학생들이 목록 순서대로 엑셀에 담깁니다.</p>
              </div>
              <button type="button" className="caseModalClose" onClick={() => setShowModal(false)} aria-label="닫기">✕</button>
            </div>

            {batches.length === 0 ? (
              <EmptyState title="케이스가 없습니다." description="ZIP 파일을 업로드하면 케이스가 생성됩니다." />
            ) : (
              <div className="caseChecklistRows">
                <label className={`caseChecklistRow${allSelected ? " isChecked" : ""}`}>
                  <input
                    type="checkbox"
                    className="caseChecklistCheckbox"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                  <span className="caseChecklistLabel"><strong>모든 케이스</strong></span>
                  <span className="cellMeta">{batches.length}건</span>
                </label>
                {batches.map((batch) => {
                  const checked = selectedIds.includes(batch.id);
                  return (
                    <label key={batch.id} className={`caseChecklistRow${checked ? " isChecked" : ""}`}>
                      <input
                        type="checkbox"
                        className="caseChecklistCheckbox"
                        checked={checked}
                        onChange={() => toggleBatch(batch.id)}
                      />
                      <span className="caseChecklistLabel">
                        {batch.displayName || batch.fileName}
                        {batch.studentCount != null && <span className="cellMeta">{batch.studentCount}명</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="caseModalActions hasTopGap">
              <button type="button" className="secondaryButton" onClick={() => setShowModal(false)}>취소</button>
              <button
                type="button"
                className="primaryButton"
                onClick={handleExport}
                disabled={isExporting || selectedIds.length === 0}
              >
                {isExporting ? "추출 중..." : `선택 ${selectedIds.length}건 내보내기`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
