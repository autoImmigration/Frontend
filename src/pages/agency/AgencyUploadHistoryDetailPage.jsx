import { useState } from "react";
import { reprocessBatch, updateCaseStatus } from "../../api.js";
import { UploadProcessingSteps } from "../../components/batch/UploadProcessingSteps.jsx";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { SummaryStrip } from "../../components/ui/SummaryStrip.jsx";
import { REPROCESSABLE_STATUSES } from "../../constants/status.js";
import { isExtractionFailed } from "../../lib/agencyFilter.js";
import { buildBatchEvents, buildBatchTimeline, caseReviewTier, hasTerminalBatchStatus, hasTerminalProcessingStatus } from "../../lib/batchNormalize.js";
import { formatProcessingDuration } from "../../lib/datetime.js";

export function AgencyUploadHistoryDetailPage({ batch, onBack, backLabel = "업로드 내역", ocrProgress, session, onOpenCaseDetail, onReprocessDone, onToggleExclude }) {
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const timeline = buildBatchTimeline(batch);
  const events = buildBatchEvents(batch);

  const canReprocess = REPROCESSABLE_STATUSES.has((batch.uploadBatchStatusRaw ?? "").toUpperCase());

  /**
   * 검토 필요 케이스 일괄 승인 — 이슈 유무와 무관하게 전부 완료 처리(관리자 판단, 2026-07-13 사용자 결정).
   * 실패한 건은 그대로 남겨두고 몇 건이 실패했는지 알린다(조용히 삼키지 않음).
   */
  async function handleApproveAll(cases) {
    if (bulkApproving || cases.length === 0) return;
    const withIssues = cases.filter((c) => (c.missingCount ?? 0) > 0).length;
    const warning = withIssues > 0
      ? `\n\n※ 이 중 ${withIssues}명은 누락·검수 이슈가 남아 있습니다. 이슈가 해결되지 않은 채로 승인됩니다.`
      : "";
    if (!window.confirm(`검토 필요 ${cases.length}명을 모두 검토 완료 처리하고 학생 목록에 추가할까요?${warning}`)) {
      return;
    }
    setBulkApproving(true);
    const failed = [];
    try {
      for (const c of cases) {
        try {
          await updateCaseStatus(c.id, "COMPLETED");
        } catch {
          failed.push(c.studentName || c.id);
        }
      }
      await onReprocessDone?.(batch.id);
      if (failed.length > 0) {
        alert(`${cases.length - failed.length}명 승인 완료. ${failed.length}명 실패: ${failed.join(", ")}`);
      }
    } finally {
      setBulkApproving(false);
    }
  }

  async function handleReprocess() {
    if (!canReprocess || isReprocessing) return;
    setIsReprocessing(true);
    try {
      await reprocessBatch(batch.id);
      if (onReprocessDone) {
        await onReprocessDone(batch.id);
      } else {
        onBack();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsReprocessing(false);
    }
  }
  const hasProcessingJob = Boolean(batch.processingJobId);
  const processingLoad =
    batch.processingFileCount != null || batch.processingCaseCount != null
      ? `${batch.processingFileCount ?? 0}개 파일 · ${batch.processingCaseCount ?? 0}개 케이스`
      : "집계 전";
  const errorSummary =
    batch.processingErrorCount && batch.processingErrorCount > 0
      ? `${batch.processingErrorCount}건`
      : "없음";
  const isRunning = batch.processingJobStatusRaw === "RUNNING" || batch.processingJobStatus === "처리 중";
  const isTerminal = hasTerminalProcessingStatus(batch.processingJobStatusRaw) || hasTerminalBatchStatus(batch.uploadBatchStatusRaw);
  // 분모는 배치 생성 시 확정된 파일 수를 우선 사용 — ocrProgress.total은 폴링마다 바뀔 수 있음
  const progressTotal = batch.processingFileCount || ocrProgress?.total || 0;
  const progressDone = ocrProgress?.processed || 0;
  const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;

  return (
    <>
      <PageHeader
        breadcrumb="유학원 / 업로드 내역 상세"
        title={
          <>
            {batch.fileName}
            <span
              style={{
                marginLeft: 10,
                fontSize: "0.8rem",
                fontWeight: 400,
                color: "var(--text-muted)",
                verticalAlign: "middle",
              }}
            >
              배치 ID {batch.id}
            </span>
          </>
        }
        description="학생별 OCR 분석 결과와 제출 서류 이미지를 확인합니다."
        actions={
          <>
            {canReprocess && (
              <button
                type="button"
                className="primaryButton"
                onClick={handleReprocess}
                disabled={isReprocessing}
              >
                {isReprocessing ? "처리 중..." : "재처리"}
              </button>
            )}
            <button type="button" className="secondaryButton" onClick={onBack}>
              ← {backLabel}(으)로 돌아가기
            </button>
          </>
        }
      />

      <SummaryStrip
        items={[
          {
            label: "업로드 시각",
            value: batch.uploadedAt,
            hint: "배치 등록 시각",
            tone: "tonePrimarySoft",
          },
          {
            label: "학생 수",
            value: batch.studentCount == null ? "집계 전" : `${batch.studentCount}명`,
            hint: batch.processingJobId
              ? `처리 작업 ID ${batch.processingJobId}`
              : "분리된 학생 케이스 수",
            tone: "toneNeutral",
          },
          {
            label: "처리 시간",
            value: formatProcessingDuration(batch.processingDurationSeconds) ?? (isTerminal ? "—" : "처리 중"),
            hint: "업로드 ~ 처리 완료까지 소요 시간",
            tone: "toneNeutral",
          },
          {
            label: "현재 상태",
            value: batch.status,
            hint:
              batch.processingJobStatus && batch.note
                ? `${batch.note} · 작업 ${batch.processingJobStatus}`
                : batch.processingJobStatus
                  ? `처리 작업 ${batch.processingJobStatus}`
                  : batch.note,
            tone:
              batch.status === "보완" || batch.status === "부분 완료"
                ? "toneWarning"
                : batch.status === "실패" || batch.status === "중단"
                  ? "toneNeutral"
                  : "toneSuccess",
          },
        ]}
      />

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>처리 단계</h2>
          <p>ZIP 해제부터 텍스트 추출까지 현재 단계를 실시간으로 표시합니다. 3초마다 자동 갱신됩니다.</p>
        </div>
        <UploadProcessingSteps batch={batch} />
        {isRunning && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.8125rem", color: "var(--text-main)" }}>
              <span>{progressTotal > 0 ? `파일 ${progressDone} / ${progressTotal}개 처리됨` : `${batch.processingFileCount || 0}개 파일 분석 대기 중`}</span>
              {progressTotal > 0 && <span>{progressPct}%</span>}
            </div>
            <div style={{ height: "6px", background: "var(--surface-muted)", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: "4px",
                  background: "var(--primary)",
                  width: progressTotal > 0 ? `${progressPct}%` : "100%",
                  transition: "width 0.5s ease",
                  animation: progressTotal === 0 ? "pulse 1.5s ease-in-out infinite" : "none",
                }}
              />
            </div>
          </div>
        )}
      </section>

      {isTerminal && (!batch.cases || batch.cases.length === 0) && (
        <section className="surfaceCard">
          <div className="sectionHeading">
            <h2>학생별 접수 결과</h2>
            <p>OCR 처리가 완료되었습니다.</p>
          </div>
          <EmptyState
            title="학생 케이스가 생성되지 않았습니다."
            description="업로드 시 대학교와 신청 타입이 선택되어 있어야 케이스가 자동 생성됩니다. 해당 배치를 다시 올리거나, 새 ZIP 업로드 시 대학교와 신청 타입을 반드시 선택해 주세요."
          />
        </section>
      )}

      {isTerminal && batch.cases && batch.cases.length > 0 && (() => {
        const isExtractionFailed = (c) => !c.studentName || c.studentName.toUpperCase() === "UNKNOWN";
        const excludedCases  = batch.cases.filter((c) => c.excluded);
        const failedCases    = batch.cases.filter((c) => !c.excluded && isExtractionFailed(c));
        // 반영됨(학생목록): 검토가 끝나 완료(COMPLETED)된 케이스만 학생 목록에 나타난다.
        const reflectedCases = batch.cases.filter((c) => !c.excluded && !isExtractionFailed(c) && c.status === "COMPLETED");
        // 검토 필요: 완료 전(추출 이슈·서류 검수·누락 등). 추출 검토와 양식 검수를 하나로 통합한다.
        const reviewCasesRaw = batch.cases.filter((c) => !c.excluded && !isExtractionFailed(c) && c.status !== "COMPLETED");

        const REVIEW_FIELD_LABEL = {
          nationality: "국적", date_of_birth: "생년월일", passport_number: "여권번호",
          student_name: "이름", alien_registration_number: "외국인등록번호",
          address: "주소", phone_number: "전화번호", gender: "성별",
          enrollment_passport_number: "재학증명서 여권번호",
          enrollment_birth_date: "재학증명서 생년월일",
        };
        // 우선순위 등급: 필수 신원(1) > 누락(1.5) > 전화(2) > 주소(3) > 기타 서류검수(5)
        const FIELD_TIER = {
          date_of_birth: 1, passport_number: 1, nationality: 1, alien_registration_number: 1, student_name: 1,
          phone_number: 2, address: 3,
        };
        const extractionItems = (c) => {
          let v = {};
          try { v = c.fieldValidations ? JSON.parse(c.fieldValidations) : {}; } catch { v = {}; }
          return Object.entries(v)
            .filter(([, x]) => x && (x.status === "invalid" || x.status === "review"))
            .map(([f, x]) => ({ label: REVIEW_FIELD_LABEL[f] || f, status: x.status, detail: x.detail || "", tier: FIELD_TIER[f] ?? 3 }));
        };
        // 통합 이슈 칩: 추출(신원값) + 누락 + 기타 서류검수를 한 곳에 모아 보여준다.
        const toneByTier = (tier) => tier <= 1
          ? { bg: "var(--danger-soft)", fg: "var(--danger)", bold: true }
          : tier < 2
            ? { bg: "#ffedd5", fg: "#9a3412", bold: true }
            : tier === 2
              ? { bg: "#ffedd5", fg: "#9a3412", bold: false }
              : { bg: "var(--warning-soft)", fg: "var(--warning)", bold: false };
        const caseIssues = (c) => {
          const items = extractionItems(c).map((it) => ({
            label: `${it.label}${it.status === "invalid" ? " ⚠" : " ?"}`, detail: it.detail, tier: it.tier,
          }));
          if (c.missingCount > 0) items.push({ label: `누락 ${c.missingCount}건`, detail: "필수 서류 누락", tier: 1.5 });
          if (items.length === 0) items.push({ label: "서류 검수", detail: "서류 검수 필요", tier: 5 });
          return items.sort((a, b) => a.tier - b.tier);
        };
        // 정렬은 공용 caseReviewTier 사용 — 케이스 상세의 "검토 n/N" 큐와 순서 일치 보장
        const reviewCases = [...reviewCasesRaw].sort((a, b) => caseReviewTier(a) - caseReviewTier(b));

        const CaseTable = ({ cases, showExclude }) => (
          <table className="dataTable">
            <thead>
              <tr>
                <th>학생명</th>
                <th>국적</th>
                <th>신청 타입</th>
                <th>제출</th>
                <th>서류 현황</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td data-label="학생명">{c.studentName}</td>
                  <td data-label="국적">{c.nationality}</td>
                  <td data-label="신청 타입" style={{ whiteSpace: "nowrap", verticalAlign: "middle" }}>{c.applicationType}</td>
                  <td data-label="제출" style={{ whiteSpace: "nowrap", verticalAlign: "middle" }}>{c.submittedCount}건</td>
                  <td data-label="서류 현황">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {c.documents.map((doc) => (
                        <span
                          key={doc.code}
                          title={doc.rule}
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            background: doc.status === "제출" ? "var(--success-soft)" : "var(--warning-soft)",
                            color: doc.status === "제출" ? "var(--success)" : "var(--warning)",
                          }}
                        >
                          {doc.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                      <button type="button" className="secondaryButton" style={{ fontSize: "0.8rem", padding: "4px 10px", whiteSpace: "nowrap" }} onClick={() => onOpenCaseDetail(c.id)}>
                        상세보기
                      </button>
                      {showExclude && onToggleExclude && (
                        <button
                          type="button"
                          className="secondaryButton"
                          style={{ fontSize: "0.8rem", padding: "4px 10px", color: "var(--danger)", whiteSpace: "nowrap" }}
                          onClick={() => onToggleExclude(c.id, false, batch.id)}
                        >
                          제외
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

        return (
          <>
            {reviewCases.length > 0 && (
              <section className="surfaceCard" style={{ borderLeft: "3px solid var(--primary)" }}>
                <div className="sectionHeading" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h2>검토 필요 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--primary)", marginLeft: 6 }}>{reviewCases.length}명</span></h2>
                    <p>추출값(국적·생년월일 등)과 서류를 한 화면에서 확인·수정한 뒤 <b>[검토 완료]</b>를 누르면 학생 목록에 추가됩니다. 검토 전에는 목록에 나타나지 않습니다.</p>
                  </div>
                  <button
                    type="button"
                    className="secondaryButton"
                    style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                    disabled={bulkApproving}
                    onClick={() => handleApproveAll(reviewCases)}
                  >
                    {bulkApproving ? "승인 중..." : `전체 승인 (${reviewCases.length}명)`}
                  </button>
                </div>
                <table className="dataTable">
                  <thead>
                    <tr><th>학생명</th><th>국적</th><th>검토 항목</th><th></th></tr>
                  </thead>
                  <tbody>
                    {reviewCases.map((c) => (
                      <tr key={c.id}>
                        <td data-label="학생명">{c.studentName}</td>
                        <td data-label="국적">{c.nationality}</td>
                        <td data-label="검토 항목">
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {caseIssues(c).map((it, i) => {
                              const tone = toneByTier(it.tier);
                              return (
                                <span key={i} title={it.detail}
                                  style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem", cursor: "help",
                                    fontWeight: tone.bold ? 700 : 500, background: tone.bg, color: tone.fg }}>
                                  {it.label}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <button type="button" className="primaryButton" style={{ fontSize: "0.8rem", padding: "4px 10px" }} onClick={() => onOpenCaseDetail(c.id)}>검토하기</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {reflectedCases.length > 0 && (
              <section className="surfaceCard" style={{ borderLeft: "3px solid var(--success)" }}>
                <div className="sectionHeading">
                  <h2>학생 목록 반영됨 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--success)", marginLeft: 6 }}>{reflectedCases.length}명</span></h2>
                  <p>검토가 끝나 학생 목록(대시보드)에 반영된 학생입니다. 잘못 들어갔으면 <b>[제외]</b>로 목록에서 뺄 수 있습니다.</p>
                </div>
                <CaseTable cases={reflectedCases} showExclude />
              </section>
            )}
            {failedCases.length > 0 && (
              <section className="surfaceCard" style={{ borderLeft: "3px solid var(--danger)" }}>
                <div className="sectionHeading">
                  <h2>추출 실패 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--danger)", marginLeft: 6 }}>{failedCases.length}명</span></h2>
                  <p>텍스트 추출에 실패했습니다. 재처리하거나 상세에서 수동으로 정보를 확인하세요.</p>
                </div>
                <CaseTable cases={failedCases} showExclude={false} />
              </section>
            )}
            {excludedCases.length > 0 && (
              <section className="surfaceCard" style={{ borderLeft: "3px solid var(--text-muted)" }}>
                <div className="sectionHeading">
                  <h2>제외된 케이스 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-muted)", marginLeft: 6 }}>{excludedCases.length}명</span></h2>
                  <p>학생 목록(대시보드)에서 제외된 케이스입니다. <b>[추가]</b>를 누르면 다시 학생 목록에 포함됩니다.</p>
                </div>
                <table className="dataTable">
                  <thead>
                    <tr><th>학생명</th><th>국적</th><th>신청 타입</th><th></th></tr>
                  </thead>
                  <tbody>
                    {excludedCases.map((c) => (
                      <tr key={c.id} style={{ opacity: 0.6 }}>
                        <td data-label="학생명">{c.studentName}</td>
                        <td data-label="국적">{c.nationality}</td>
                        <td data-label="신청 타입" style={{ whiteSpace: "nowrap", verticalAlign: "middle" }}>{c.applicationType}</td>
                        <td style={{ verticalAlign: "middle" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                            <button type="button" className="secondaryButton" style={{ fontSize: "0.8rem", padding: "4px 10px", whiteSpace: "nowrap" }} onClick={() => onOpenCaseDetail(c.id)}>
                              상세보기
                            </button>
                            {onToggleExclude && (
                              <button
                                type="button"
                                className="primaryButton"
                                style={{ fontSize: "0.8rem", padding: "4px 10px", whiteSpace: "nowrap" }}
                                onClick={() => onToggleExclude(c.id, true, batch.id)}
                              >
                                추가
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        );
      })()}

    </>
  );
}
