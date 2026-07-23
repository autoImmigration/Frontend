import { useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { genderLabel } from "../../lib/caseFormat.js";
import { formatStudentName } from "../../lib/studentFormat.js";

export function StudentListPage({ applications, onOpenDetail, session, onSaveProfile }) {
  // 내 정보 수정 — 연락처류(전화번호·주소·외국인등록번호)만. 신원 필드는 로그인 키라 읽기 전용.
  const [profileForm, setProfileForm] = useState({
    phoneNumber: session?.phoneNumber ?? "",
    address: session?.address ?? "",
    alienRegistrationNumber: session?.alienRegistrationNumber ?? "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  async function handleProfileSave() {
    if (profileSaving || !onSaveProfile) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await onSaveProfile(profileForm);
      setProfileMsg({ type: "ok", text: "저장되었습니다." });
      setEditOpen(false);
    } catch (err) {
      setProfileMsg({ type: "err", text: err.message });
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="studentPortal">
      <PageHeader
        title="신청 현황"
        description="학생 본인이 제출한 신청 건과 현재 상태를 확인합니다."
      />

      {session && (
        <section className="surfaceCard myInfoSection">
          <div className="sectionHeading myInfoHeading">
            <div>
              <h2>내 정보</h2>
              <p>전화번호·주소·외국인등록번호는 직접 수정할 수 있습니다. 이름·국적·여권번호·생년월일 변경은 유학원에 문의하세요.</p>
            </div>
            <button type="button" className="secondaryButton myInfoEditButton" onClick={() => { setProfileMsg(null); setEditOpen(true); }}>
              수정하기
            </button>
          </div>
          <div className="studentInfoGrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: 13 }}>
            {[
              ["이름", formatStudentName(session.name)],
              ["국적", session.nationality],
              ["여권번호", session.passportNumber],
              ["성별", genderLabel(session.gender)],
              ["생년월일", session.birthDate],
              ["학교", session.schoolName],
              ["전화번호", profileForm.phoneNumber],
              ["외국인등록번호", profileForm.alienRegistrationNumber],
              ["주소", profileForm.address],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
                <div>{value || "—"}</div>
              </div>
            ))}
          </div>
          {profileMsg && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: profileMsg.type === "ok" ? "var(--success)" : "var(--danger)" }}>
              {profileMsg.type === "ok" ? "✓ " : "⚠ "}{profileMsg.text}
            </p>
          )}
        </section>
      )}

      {editOpen && (
        <div className="modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }}>
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="내 정보 수정">
            <div className="modalHeader">
              <h2>내 정보 수정</h2>
              <button type="button" className="modalClose" onClick={() => setEditOpen(false)} aria-label="닫기">✕</button>
            </div>
            <div className="profileEditGrid">
              {[
                ["전화번호", "phoneNumber", "010-0000-0000"],
                ["외국인등록번호", "alienRegistrationNumber", "000000-0000000"],
              ].map(([label, field, placeholder]) => (
                <label key={field} className="field">
                  <span>{label}</span>
                  <input
                    type="text"
                    value={profileForm[field]}
                    placeholder={placeholder}
                    onChange={(e) => setProfileForm((f) => ({ ...f, [field]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="field profileAddressField">
                <span>주소</span>
                <input
                  type="text"
                  value={profileForm.address}
                  placeholder="현재 거주지 주소"
                  onChange={(e) => setProfileForm((f) => ({ ...f, address: e.target.value }))}
                />
              </label>
            </div>
            {profileMsg?.type === "err" && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--danger)" }}>⚠ {profileMsg.text}</p>
            )}
            <div className="modalActions">
              <button type="button" className="secondaryButton" onClick={() => setEditOpen(false)} disabled={profileSaving}>취소</button>
              <button type="button" className="primaryButton" onClick={handleProfileSave} disabled={profileSaving}>
                {profileSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="surfaceCard myAppsSection">
        <div className="sectionHeading">
          <h2>내 신청 목록</h2>
          <p>본인 명의로 접수된 신청 건과 현재 처리 상태입니다. 상세 보기에서 보완 서류를 업로드할 수 있습니다.</p>
        </div>

        {applications.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            표시할 신청 건이 없습니다.
          </p>
        ) : (
        <div className="tableWrap">
          <table className="dataTable studentAppTable">
            <thead>
              <tr>
                <th>신청 유형</th>
                <th>비자 타입</th>
                <th>신청 방식</th>
                <th>신청 날짜</th>
                <th>상태</th>
                <th>비고</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id}>
                  <td data-label="신청 유형">{application.applicationType}</td>
                  <td data-label="비자 유형">{application.visaType}</td>
                  <td data-label="신청 방식">{application.lane || "—"}</td>
                  <td data-label="신청일">{application.submittedAt}</td>
                  <td data-label="상태">
                    <StatusBadge value={application.status} />
                  </td>
                  <td data-label="비고">{application.note}</td>
                  <td data-label="작업" className="tableActionCell">
                    <button
                      type="button"
                      className="tableLinkButton"
                      onClick={() => onOpenDetail(application.id)}
                    >
                      상세 보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </div>
  );
}

/** 학생 본인 스캔 이미지 — 학생 토큰으로 인증해 blob 로 로드. */
