import { useMemo } from "react";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { PaginationNav } from "../../components/ui/PaginationNav.jsx";
import { SectionMeta } from "../../components/ui/SectionMeta.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { SummaryStrip } from "../../components/ui/SummaryStrip.jsx";
import { receiptDateOf } from "../../lib/agencyFilter.js";
import { useUrlPagination, useUrlState } from "../../lib/useUrlState.js";

export function AgencyDashboardPage({ batches, applications = [], onOpenDetail, onOpenUpload, onOpenDownload }) {
  // 필터·페이지를 URL에 둔다 — 상세를 보고 돌아와도 유지되고, 3초 폴링에 페이지가 1로 튕기지 않는다.
  const [search, setSearch] = useUrlState("q", "");
  // 배치 payload엔 학교명이 없어 케이스(신청) 데이터에서 배치별 학교명을 유추한다.
  const schoolByBatch = useMemo(() => {
    const map = new Map();
    applications.forEach((a) => {
      if (a.intakeBatch && a.schoolName && !map.has(a.intakeBatch)) {
        map.set(a.intakeBatch, a.schoolName);
      }
    });
    return map;
  }, [applications]);
  // 요약 카드 클릭으로 배치 테이블을 상태별 필터링: ""(전체) | "review" | "done" | "failed"
  const [statusFilter, setStatusFilter] = useUrlState("status", "");

  const filtered = useMemo(() => {
    const matchesStatus = (b) => {
      if (statusFilter === "review") return b.status === "보완" || b.status === "부분 완료";
      if (statusFilter === "done") return b.status === "완료";
      if (statusFilter === "failed") return b.status === "실패" || b.status === "반려" || b.status === "중단";
      return true;
    };
    const q = search.trim().toLowerCase();
    const matchesSearch = (b) =>
      !q ||
      b.fileName?.toLowerCase().includes(q) ||
      b.schoolName?.toLowerCase().includes(q) ||
      b.note?.toLowerCase().includes(q);
    return batches.filter((b) => matchesStatus(b) && matchesSearch(b));
  }, [batches, search, statusFilter]);

  const toggleStatusFilter = (key) => {
    setStatusFilter(statusFilter === key ? "" : key);
  };

  const { currentPage, setCurrentPage, totalPages, paginatedItems: pagedBatches } = useUrlPagination(filtered, 10);
  const totalStudents = batches.reduce((s, b) => s + (b.studentCount ?? 0), 0);
  const doneCount = batches.filter((b) => b.status === "완료").length;
  // 처리는 끝났지만 검토/보완이 필요한 배치 (NEEDS_REVIEW → "보완", PARTIAL_SUCCESS → "부분 완료")
  const reviewCount = batches.filter((b) => b.status === "보완" || b.status === "부분 완료").length;
  const failedCount = batches.filter((b) => b.status === "실패" || b.status === "반려" || b.status === "중단").length;

  return (
    <>
      <PageHeader
        title="신청 대시보드"
        description="ZIP 업로드 단위로 케이스를 관리합니다."
        actions={
          <>
            <button type="button" className="secondaryButton" onClick={onOpenUpload}>
              ZIP 업로드
            </button>
            <button type="button" className="primaryButton" onClick={onOpenDownload}>
              엑셀 다운로드
            </button>
          </>
        }
      />

      <SummaryStrip
        variant="agencySummary"
        items={[
          {
            label: "전체 케이스",
            value: `${batches.length}건`,
            hint: "등록된 ZIP 업로드 수",
            tone: "tonePrimary",
            onClick: () => setStatusFilter(""),
          },
          {
            label: "검토 필요",
            value: `${reviewCount}건`,
            hint: "처리 완료, 보완·검토 대기",
            tone: "toneWarning",
            onClick: () => toggleStatusFilter("review"),
            isActive: statusFilter === "review",
          },
          {
            label: "완료",
            value: `${doneCount}건`,
            hint: "전원 검토 통과",
            tone: "toneSuccess",
            onClick: () => toggleStatusFilter("done"),
            isActive: statusFilter === "done",
          },
          {
            // 항상 렌더해 카드 수(5개)를 고정 — 0건이면 중립 톤, 1건 이상이면 위험 톤
            label: "실패",
            value: `${failedCount}건`,
            hint: "처리 실패·반려",
            tone: failedCount > 0 ? "toneDanger" : "toneNeutral",
            onClick: () => toggleStatusFilter("failed"),
            isActive: statusFilter === "failed",
          },
          { label: "전체 학생", value: `${totalStudents}명`, hint: "모든 케이스 학생 합계", tone: "toneNeutral" },
        ]}
      />

      <section className="surfaceCard">
        <div className="toolbarRow">
          <label className="field fieldGrow">
            <span>검색</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="파일명 · 학교명으로 검색"
            />
          </label>
        </div>

        <SectionMeta count={`${filtered.length}건`} helper={totalPages > 1 ? `${currentPage} / ${totalPages} 페이지` : undefined} />

        {filtered.length === 0 ? (
          <EmptyState
            title="케이스가 없습니다."
            description={
              statusFilter || search.trim()
                ? "조건에 맞는 케이스가 없습니다. 요약 카드 필터나 검색어를 확인해 주세요."
                : "ZIP 파일을 업로드하면 케이스가 생성됩니다."
            }
          />
        ) : (
          <div className="tableWrap">
            <table className="dataTable stackedTable">
              <thead>
                {/* 예전엔 날짜가 세 번 나왔다: '접수일'(실은 업로드 일시) + '배치'(displayName 에 또 일시)
                    + '비고'("접수일: yyyy-mm-dd"). 열 이름을 실제 값에 맞추고 중복을 걷어냈다. */}
                <tr>
                  <th>업로드 일시</th>
                  <th>ZIP 파일</th>
                  <th>학교명</th>
                  <th>학생 수</th>
                  <th>상태</th>
                  <th>접수일</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedBatches.map((batch) => (
                  <tr key={batch.id}>
                    <td data-label="업로드 일시">{batch.uploadedAt}</td>
                    <td data-label="ZIP 파일">{batch.fileName || "—"}</td>
                    <td data-label="학교명">{batch.schoolName || schoolByBatch.get(batch.id) || "미지정"}</td>
                    <td data-label="학생 수">{batch.studentCount == null ? "—" : `${batch.studentCount}명`}</td>
                    <td data-label="상태"><StatusBadge value={batch.status} /></td>
                    <td data-label="접수일">{receiptDateOf(batch) || "—"}</td>
                    <td data-label="작업" className="tableActionCell">
                      <button
                        type="button"
                        className="tableLinkButton"
                        onClick={() => onOpenDetail(batch.id)}
                      >
                        케이스 보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationNav currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </section>
    </>
  );
}
