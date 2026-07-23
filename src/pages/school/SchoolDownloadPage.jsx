import { PageHeader } from "../../components/ui/PageHeader.jsx";

export function SchoolDownloadPage({ students }) {
  function downloadCsv() {
    const headers = ["학생명", "국적", "신청 유형", "비자 타입", "상태", "최근 갱신"];
    const esc = (v) => {
      const str = String(v ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [headers, ...students.map((s) => [
      s.name, s.nationality, s.applicationType, s.visaType, s.status, s.lastUpdated,
    ])];
    // 엑셀 한글 깨짐 방지용 BOM(﻿) 포함.
    const csv = "﻿" + lines.map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `학생목록_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="다운로드"
        description="학교에 등록된 학생 목록을 파일로 내려받습니다."
      />
      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>학생 목록 다운로드</h2>
          <p>현재 조회 가능한 학생 {students.length}명의 목록을 CSV(엑셀에서 열림) 파일로 저장합니다.</p>
        </div>
        <button
          type="button"
          className="primaryButton"
          disabled={students.length === 0}
          onClick={downloadCsv}
        >
          학생 목록 CSV 다운로드
        </button>
        {students.length === 0 && (
          <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>
            내려받을 학생이 없습니다.
          </p>
        )}
      </section>
    </>
  );
}
