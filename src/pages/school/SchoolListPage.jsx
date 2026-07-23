import { useEffect, useState } from "react";
import { fetchAuthedBlob, fetchSchoolStudentDetail, schoolCaseImagePath } from "../../api.js";
import { StudentScanImage } from "../../components/media/StudentScanImage.jsx";
import { StudentScanViewer } from "../../components/media/StudentScanViewer.jsx";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { SectionMeta } from "../../components/ui/SectionMeta.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { SCHOOL_SEARCH_OPTIONS } from "../../constants/search.js";
import { genderLabel } from "../../lib/caseFormat.js";
import { formatAlienRegistrationNumber, formatStudentName } from "../../lib/studentFormat.js";

export function SchoolListPage({
  students,
  allStudents,
  search,
  searchField,
  statusFilter,
  visaFilter,
  onSearchChange,
  onSearchFieldChange,
  onStatusFilterChange,
  onVisaFilterChange,
  onRefresh,
}) {
  const visaOptions = [...new Set(allStudents.map((student) => student.visaType))];
  const searchLabel =
    SCHOOL_SEARCH_OPTIONS.find((option) => option.value === searchField)?.label ?? "학생명";

  // 개인 파일 상세 — 읽기 전용 모달. 학교가 할 수 있는 유일한 쓰기는 상태(보완/완료) 변경뿐.
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [selectedDocCode, setSelectedDocCode] = useState(null);
  const [docFileIndex, setDocFileIndex] = useState(0);

  // 상세가 로드되면 첫 서류를 자동 선택 (유학원 상세와 동일한 흐름).
  useEffect(() => {
    setSelectedDocCode(detail?.documents?.length ? detail.documents[0].code : null);
    setDocFileIndex(0);
  }, [detail]);

  const detailOpen = Boolean(detail || detailLoading || detailError);

  async function openDetail(caseId) {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchSchoolStudentDetail(caseId));
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  // 학교 스캔 이미지 로더(Bearer). StudentScanViewer/Image 재사용.
  const schoolLoadBlob = (cid, fn) => fetchAuthedBlob(schoolCaseImagePath(cid, fn));

  return (
    <>
      <PageHeader
        title="학생 목록"
        description="학교에 등록된 학생과 신청 상태를 조회합니다."
      />

      {!detailOpen && (
      <section className="surfaceCard">
        <div className="toolbarRow">
          <label className="field fieldCompact">
            <span>검색 기준</span>
            <select
              value={searchField}
              onChange={(event) => onSearchFieldChange(event.target.value)}
            >
              {SCHOOL_SEARCH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field fieldGrow">
            <span>검색어</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={`${searchLabel}으로 검색`}
            />
          </label>

          <label className="field fieldCompact">
            <span>상태</span>
            <select
              value={statusFilter}
              onChange={(event) => onStatusFilterChange(event.target.value)}
            >
              <option value="전체">전체</option>
              <option value="보완">보완</option>
              <option value="완료">완료</option>
            </select>
          </label>

          <label className="field fieldCompact">
            <span>비자 타입</span>
            <select
              value={visaFilter}
              onChange={(event) => onVisaFilterChange(event.target.value)}
            >
              <option value="전체">전체</option>
              {visaOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <SectionMeta
          count={`조회 결과 ${students.length}명`}
          helper="검색 조건을 바꾸면 학생 목록이 바로 다시 정렬됩니다."
        />

        {students.length === 0 ? (
          <EmptyState
            title="조건에 맞는 학생이 없습니다."
            description="검색 기준이나 필터를 조정한 뒤 다시 확인해 주세요."
          />
        ) : (
          <div className="tableWrap">
            <table className="dataTable stackedTable">
              <thead>
                <tr>
                  <th>학생명</th>
                  <th>국적</th>
                  <th>신청 유형</th>
                  <th>비자 타입</th>
                  <th>상태</th>
                  <th>최근 갱신</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td data-label="학생명">{student.name}</td>
                    <td data-label="국적">{student.nationality}</td>
                    <td data-label="신청 유형">{student.applicationType}</td>
                    <td data-label="비자 유형">{student.visaType}</td>
                    <td data-label="상태">
                      <StatusBadge value={student.status} />
                    </td>
                    <td data-label="최근 갱신">{student.lastUpdated}</td>
                    <td data-label="작업" className="tableActionCell">
                      <button type="button" className="tableLinkButton" onClick={() => openDetail(student.id)}>
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
      )}

      {detailOpen && (
        <section className="surfaceCard schoolDetailCard">
          <div className="schoolDetailHeader">
            <button
              type="button"
              className="backArrowButton"
              onClick={() => { setDetail(null); setDetailError(null); }}
              aria-label="목록으로 돌아가기"
            >
              ←
            </button>
            <div className="schoolDetailTitle">
              <h2>{detail ? formatStudentName(detail.name) : "학생 상세"}</h2>
              {detail && (
                <span className="schoolDetailMeta">{detail.visaType} · {detail.applicationType}</span>
              )}
            </div>
            {detail && (
              <div className="schoolDetailBadges">
                <span className={`docCountChip${detail.missingCount > 0 ? " hasMissing" : ""}`}>
                  서류 {detail.submittedCount}/{detail.submittedCount + detail.missingCount}
                </span>
                <StatusBadge value={detail.status} />
              </div>
            )}
          </div>

          {detailLoading && <div className="schoolDetailState">학생 정보를 불러오는 중입니다…</div>}
          {detailError && <div className="schoolDetailState isError">⚠ {detailError}</div>}

          {detail && (() => {
            const selDoc = detail.documents.find((d) => d.code === selectedDocCode) ?? null;
            const scans = selDoc?.scans ?? [];
            const fileIdx = Math.min(docFileIndex, Math.max(0, scans.length - 1));
            return (
              <div className="schoolDetailSplit">
                {/* 왼쪽: 제출 서류 체크리스트 */}
                <div className="schoolDocRail">
                  <div className="railLabel">
                    제출 서류
                    <span className={detail.missingCount > 0 ? "isMissing" : "isComplete"}>
                      {detail.submittedCount}/{detail.submittedCount + detail.missingCount}
                    </span>
                  </div>
                  <div className="schoolDocList">
                    {detail.documents.map((doc) => (
                      <button
                        key={doc.code}
                        type="button"
                        className={`documentStatusButton${selectedDocCode === doc.code ? " isActive" : ""}${doc.status === "미제출" ? " isMissing" : ""}`}
                        onClick={() => { setSelectedDocCode(doc.code); setDocFileIndex(0); }}
                      >
                        <strong className="docName">
                          {doc.name}
                          {(doc.scans?.length ?? 0) > 1 && (
                            <span className="docPageCount">· {doc.scans.length}장</span>
                          )}
                        </strong>
                        <StatusBadge value={doc.status} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* 가운데: 스캔 미리보기 */}
                <div className="schoolScanPane">
                  <div className="scanToolbar">
                    <strong>{selDoc?.name ?? "서류 미선택"}</strong>
                    {selDoc && <StatusBadge value={selDoc.status} />}
                    {selDoc?.note && <span className="scanNote">{selDoc.note}</span>}
                    {scans.length > 1 && (
                      <span className="scanPageMeta">{fileIdx + 1} / {scans.length}장</span>
                    )}
                  </div>
                  {scans.length > 1 && (
                    <div className="scanPageChips">
                      {scans.map((fn, idx) => (
                        <button
                          key={fn}
                          type="button"
                          className={`scanPageChip${idx === fileIdx ? " isActive" : ""}`}
                          onClick={() => setDocFileIndex(idx)}
                        >
                          {idx + 1}장
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="scanStage">
                    {scans.length > 0 ? (
                      <div
                        className="schoolScanFrame"
                        onClick={() => setViewerDoc(selDoc)}
                        title="클릭하면 크게 보기"
                      >
                        <StudentScanImage caseId={detail.id} filename={scans[fileIdx]} alt={selDoc?.name} loadBlob={schoolLoadBlob} />
                      </div>
                    ) : (
                      <div className="scanEmpty">
                        {selDoc ? (
                          <>
                            <StatusBadge value={selDoc.status} />
                            <strong>{selDoc.name}</strong>
                            <p>{selDoc.status === "미제출" ? "아직 제출되지 않은 서류입니다." : "이미지 파일이 없습니다."}</p>
                          </>
                        ) : (
                          <p>왼쪽에서 서류를 선택하세요</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 오른쪽: 학생 정보 */}
                <div className="schoolInfoRail">
                  <div className="railLabel">학생 정보</div>
                  <div className="infoList">
                    {[
                      ["국적", detail.nationality],
                      ["여권번호", detail.passportNumber],
                      ["성별", genderLabel(detail.gender)],
                      ["생년월일", detail.birthDate],
                      ["외국인등록번호", formatAlienRegistrationNumber(detail.alienRegistrationNumber) || detail.alienRegistrationNumber],
                    ].map(([label, value]) => (
                      <div className="infoItem" key={label}>
                        <span className="infoLabel">{label}</span>
                        <span className="infoValue">{value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {viewerDoc && (
        <StudentScanViewer
          caseId={detail?.id}
          doc={viewerDoc}
          onClose={() => setViewerDoc(null)}
          loadBlob={schoolLoadBlob}
        />
      )}
    </>
  );
}
