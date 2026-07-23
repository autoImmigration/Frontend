import { useState } from "react";

export function ExcelExportCard({ title, description, schools, onExport }) {
  const [selectedSchool, setSelectedSchool] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await onExport(selectedSchool || undefined);
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
      <div className="downloadFormStack">
        <label className="field">
          <span>학교 선택</span>
          <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}>
            <option value="">전체 학교</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="primaryButton"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "추출 중..." : "엑셀 내보내기"}
          </button>
        </div>
      </div>
    </section>
  );
}
