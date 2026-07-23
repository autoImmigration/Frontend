import { Fragment, useState } from "react";
import { uploadStudentSupplement } from "../../api.js";
import { StudentScanViewer } from "../../components/media/StudentScanViewer.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { SummaryStrip } from "../../components/ui/SummaryStrip.jsx";

export function StudentDetailPage({ application, session, onBack, onRefreshApplications }) {
  const [viewerDoc, setViewerDoc] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  // 모바일 간편 필터 — 데스크톱에서는 CSS로 숨김(전체 목록 노출). 제출/미제출만 빠르게 추린다.
  const [docFilter, setDocFilter] = useState("all");

  async function handleStudentUpload(docCode, file) {
    if (!file || !session?.passportNumber) return;
    setUploadingDoc(docCode);
    setUploadError("");
    setUploadSuccess("");
    try {
      await uploadStudentSupplement(session.passportNumber, session.birthDate, application.id, docCode, file);
      // 업로드 직후 목록 재조회 — 갱신 없이는 서류가 계속 '미제출'로 보여 실패로 오인된다.
      await onRefreshApplications?.();
      setUploadSuccess("서류가 업로드되었습니다.");
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadingDoc(null);
    }
  }
  const submittedCount = application.documents.filter(
    (document) => document.status === "제출",
  ).length;
  const isSubmitted = (document) => document.status === "제출";
  const visibleDocuments = application.documents.filter((document) => {
    if (docFilter === "submitted") return isSubmitted(document);
    if (docFilter === "needed") return !isSubmitted(document);
    return true;
  });

  return (
    <div className="studentPortal">
      <PageHeader
        breadcrumb="학생 / 신청 상세"
        title={`${application.applicationType} · ${application.visaType}${application.lane ? ` · ${application.lane}` : ""}`}
        description={application.note}
        onBack={onBack}
      />

      <SummaryStrip
        items={[
          {
            label: "신청 번호",
            value: application.id,
            hint: "학생 신청 건 식별값",
            tone: "toneNeutral",
          },
          {
            label: "신청일",
            value: application.submittedAt,
            hint: "접수 기준 날짜",
            tone: "toneNeutral",
          },
          {
            label: "문서 제출",
            value: `${submittedCount}/${application.documents.length}`,
            hint: "필요 문서 제출 현황",
            tone: "tonePrimarySoft",
          },
          {
            label: "현재 상태",
            value: application.status,
            hint: "보완 또는 완료 상태",
            tone:
              application.status === "보완" ? "toneWarning" : "toneSuccess",
          },
        ]}
      />

      {application.supplementMessage && (
        <section className="surfaceCard" style={{ borderLeft: "3px solid var(--primary)", padding: "12px 16px", background: "var(--primary-soft)" }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>📢 유학원 안내</strong> — {application.supplementMessage}
          </p>
        </section>
      )}

      {(uploadError || uploadSuccess) && (
        <section className="surfaceCard" style={{ borderLeft: `3px solid ${uploadSuccess ? "var(--success)" : "var(--danger)"}`, padding: "12px 16px" }}>
          <p style={{ margin: 0, fontSize: 14, color: uploadSuccess ? "var(--success)" : "var(--danger)" }}>
            {uploadSuccess || uploadError}
          </p>
        </section>
      )}

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>서류 목록</h2>
          {application.documents.some((d) => d.status === "미제출") && (
            <p style={{ color: "var(--warning)" }}>미제출 서류가 있습니다. 아래에서 직접 업로드할 수 있습니다.</p>
          )}
        </div>
        <div className="docFilterBar">
          {[
            ["all", "전체", application.documents.length],
            ["submitted", "제출됨", submittedCount],
            ["needed", "제출필요", application.documents.length - submittedCount],
          ].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={`docFilterChip${docFilter === key ? " isActive" : ""}`}
              onClick={() => setDocFilter(key)}
            >
              {label} <span className="docFilterCount">{count}</span>
            </button>
          ))}
        </div>
        <div className="tableWrap">
          <table className="dataTable studentDocTable">
            <thead>
              <tr>
                <th>문서명</th>
                <th>분류</th>
                <th>제출 상태</th>
                <th>마지막 업로드</th>
                <th>제출본</th>
                <th>업로드</th>
              </tr>
            </thead>
            <tbody>
              {visibleDocuments.map((document) => {
                // 검수 필요면 사유(note 우선, 없으면 확인 항목 rule)를 아래 한 줄로 노출.
                // 보완 요청 note는 상태와 무관하게 항상 노출.
                // 검수 사유는 관리자(유학원)가 보는 document.note를 그대로 노출 — 양쪽 메시지 통일.
                // (일반 reviewRule 폴백 제거: 학생·관리자가 동일한 검수 메시지를 보게 한다.)
                const reviewReason = document.note || null;
                return (
                <Fragment key={document.code}>
                <tr className={reviewReason ? "hasReason" : undefined} style={{ background: (document.status === "미제출" || document.status === "검수 필요") ? "var(--warning-soft)" : undefined }}>
                  <td data-label="문서명">
                    <strong>{document.name}</strong>
                  </td>
                  <td data-label="분류">{document.category}</td>
                  <td data-label="상태">
                    <StatusBadge value={document.status} />
                  </td>
                  <td data-label="마지막 업로드">{document.submittedAt && document.submittedAt !== "-" ? document.submittedAt : "-"}</td>
                  <td data-label="제출본">
                    {document.scans && document.scans.length > 0 ? (
                      <button
                        type="button"
                        className="tableLinkButton"
                        onClick={() => setViewerDoc(document)}
                      >
                        보기{document.scans.length > 1 ? ` (${document.scans.length})` : ""}
                      </button>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>-</span>
                    )}
                  </td>
                  <td data-label="업로드">
                    {/* 상태와 무관하게 항상 업로드 허용 — 학생이 다른 스캔으로 바꿔 올릴 수 있게.
                        업로드하면 마지막 업로드 날짜가 오늘로 갱신되고, 기존 스캔은 삭제되지 않고 뒤에 추가된다. */}
                    {session?.passportNumber ? (
                      <label style={{ cursor: "pointer", display: "inline-block" }}>
                        <input
                          type="file"
                          style={{ display: "none" }}
                          accept="image/*,.pdf"
                          disabled={uploadingDoc === document.code}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleStudentUpload(document.code, f);
                            e.target.value = "";
                          }}
                        />
                        <span className={`uploadLink${document.status === "미제출" ? " isNeeded" : ""}`}>
                          {uploadingDoc === document.code ? "업로드 중..." : (document.status === "미제출" ? "파일 업로드" : "다시 업로드")}
                        </span>
                      </label>
                    ) : "-"}
                  </td>
                </tr>
                {reviewReason && (
                  <tr className="docReasonRow">
                    <td colSpan={6} data-label="검수 사유">
                      <span className="docReasonText">⚠ {reviewReason}</span>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {viewerDoc && (
        <StudentScanViewer
          caseId={application.id}
          doc={viewerDoc}
          onClose={() => setViewerDoc(null)}
        />
      )}
    </div>
  );
}
