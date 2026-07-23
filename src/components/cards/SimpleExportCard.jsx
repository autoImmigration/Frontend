import { useState } from "react";

/** 입력 없이 버튼 하나로 내려받는 추출 카드 (단체수납입금표용). */
export function SimpleExportCard({ title, description, onExport }) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await onExport();
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
        <button type="button" className="primaryButton" onClick={handleExport} disabled={isExporting}>
          {isExporting ? "추출 중..." : "엑셀 내보내기"}
        </button>
      </div>
    </section>
  );
}
