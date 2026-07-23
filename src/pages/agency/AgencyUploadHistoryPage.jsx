import { Fragment } from "react";
import { UploadProcessingSteps } from "../../components/batch/UploadProcessingSteps.jsx";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { PaginationNav } from "../../components/ui/PaginationNav.jsx";
import { SectionMeta } from "../../components/ui/SectionMeta.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { TERMINAL_BATCH_STATUSES_SET } from "../../constants/status.js";
import { deriveUploadOnlyStatus } from "../../lib/batchNormalize.js";
import { formatProcessingDuration } from "../../lib/datetime.js";
import { usePagination } from "../../lib/usePagination.js";

export function AgencyUploadHistoryPage({ batches, showProcessingSteps = true, onOpenDetail, onBack, backLabel = "대시보드" }) {
  const { currentPage, setCurrentPage, totalPages, paginatedItems: pagedBatches } = usePagination(batches, 10);

  return (
    <>
      <PageHeader
        onBack={onBack}
        title="업로드 내역"
        description="ZIP 업로드 배치 이력을 확인합니다. 상태는 업로드 자체의 성패(완료/실패)만 표시합니다."
      />

      <section className="surfaceCard">
        <SectionMeta
          count={`업로드 배치 ${batches.length}건`}
          helper={`완료: 업로드 정상 접수 · 실패: 업로드 오류${totalPages > 1 ? ` · ${currentPage}/${totalPages} 페이지` : ""}`}
        />

        {batches.length === 0 ? (
          <EmptyState
            title="아직 업로드된 배치가 없습니다."
            description="ZIP 파일을 업로드하면 생성된 배치가 이 목록에 바로 추가됩니다."
          />
        ) : (
          <div className="tableWrap">
            <table className="dataTable stackedTable">
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>업로드 시각</th>
                  <th>학생 수</th>
                  <th>처리 시간</th>
                  <th>상태</th>
                  <th>비고</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedBatches.map((batch) => {
                  const isActiveRow = showProcessingSteps
                    && !TERMINAL_BATCH_STATUSES_SET.has(
                      (batch.uploadBatchStatusRaw ?? "").toUpperCase()
                    ) && batch.uploadBatchStatusRaw !== "";
                  return (
                    <Fragment key={batch.id}>
                      <tr>
                        <td data-label="파일명">
                          {batch.fileName}
                          <div className="cellMeta">{batch.id}</div>
                        </td>
                        <td data-label="업로드 시각">{batch.uploadedAt}</td>
                        <td data-label="학생 수">
                          {batch.studentCount == null ? "-" : `${batch.studentCount}명`}
                        </td>
                        <td data-label="처리 시간">
                          {formatProcessingDuration(batch.processingDurationSeconds) ?? "-"}
                        </td>
                        <td data-label="상태">
                          <StatusBadge value={deriveUploadOnlyStatus(batch)} />
                        </td>
                        <td data-label="비고">{batch.note}</td>
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
                      {isActiveRow && (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              padding: "4px 20px 16px",
                              background: "var(--surface-muted)",
                              borderTop: "none",
                            }}
                          >
                            <UploadProcessingSteps batch={batch} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationNav currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </section>
    </>
  );
}
