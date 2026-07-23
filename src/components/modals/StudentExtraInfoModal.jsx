import { formatStudentName } from "../../lib/studentFormat.js";
import {
  formatExtraDate,
  formatExtraAmount,
  formatExtraGpa,
  formatExtraRate,
  formatExtraText,
  formatExtraCount,
  EMPTY_CELL,
} from "../../lib/caseFormat.js";

function ExtraInfoSection({ title, rows }) {
  const filled = rows.filter(([, value]) => !EMPTY_CELL.has(value));
  if (filled.length === 0) return null; // 전부 비었으면 섹션 자체를 숨긴다
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filled.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: "var(--text-main)", flexShrink: 0 }}>{label}</span>
            <span style={{ textAlign: "right", wordBreak: "break-all", fontVariantNumeric: "tabular-nums" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 신청 상세보기 모달.
 * - 기본 정보(이름·국적·여권·주소 등)를 먼저 보여준다 — 추출 부가정보만이 아니라 전체를 한눈에.
 * - 추출된 값만 노출한다. 값이 없는 행·섹션은 숨긴다(빈 "—" 나열 제거).
 *
 * basic: [label, value][] — 각 상세 페이지에서 학생 기본 필드를 넘긴다.
 */
export function StudentExtraInfoModal({ extraInfo, basic = [], studentName, onClose }) {
  const info = extraInfo ?? {};
  const basicRows = basic.filter(([, value]) => !EMPTY_CELL.has(value));

  const extraSections = [
    { title: "학사", rows: [
      ["직전 학기 성적", formatExtraGpa(info.prevSemesterGpa, info.gpaScale)],
      ["누적 성적", formatExtraGpa(info.cumulativeGpa, info.gpaScale)],
      ["학기 수", formatExtraCount(info.semesterCount, "학기")],
      ["졸업 예정일", formatExtraDate(info.expectedGraduationDate)],
    ] },
    { title: "증명서 발급일", rows: [
      ["재학증명서", formatExtraDate(info.enrollmentIssuedDate)],
      ["출석증명서", formatExtraDate(info.attendanceIssuedDate)],
      ["성적증명서", formatExtraDate(info.transcriptIssuedDate)],
    ] },
    { title: "은행 잔고", rows: [
      ["잔고 금액", formatExtraAmount(info.bankBalanceAmount, info.bankBalanceCurrency)],
      ["발급일", formatExtraDate(info.bankBalanceIssuedDate)],
      ["예금주", formatExtraText(info.bankAccountHolder)],
    ] },
    { title: "부동산 계약", rows: [
      ["계약 시작일", formatExtraDate(info.leaseStartDate)],
      ["계약 종료일", formatExtraDate(info.leaseEndDate)],
      ["임차인", formatExtraText(info.lesseeName)],
    ] },
    { title: "출석", rows: [["출석률", formatExtraRate(info.attendanceRate)]] },
    { title: "외국인등록증", rows: [["뒷면 주소", formatExtraText(info.arcBackAddress)]] },
  ];
  // 값이 있는 섹션이 하나라도 있는지 (없으면 안내 문구)
  const hasExtra = extraSections.some((s) => s.rows.some(([, v]) => !EMPTY_CELL.has(v)));

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 14, padding: 28, width: "min(560px, 95vw)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>신청 상세 정보</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-muted)" }}>
          {studentName ? `${formatStudentName(studentName)} · ` : ""}추출된 정보만 표시합니다.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ExtraInfoSection title="기본 정보" rows={basicRows} />
          {extraSections.map((section) => (
            <ExtraInfoSection key={section.title} title={section.title} rows={section.rows} />
          ))}
          {!hasExtra && basicRows.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "8px 0" }}>추출된 정보가 없습니다.</p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <button type="button" className="secondaryButton" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
