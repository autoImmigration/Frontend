import { useMemo, useState } from "react";
import { FilterBar } from "../../components/filters/FilterBar.jsx";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { PaginationNav } from "../../components/ui/PaginationNav.jsx";
import { SectionMeta } from "../../components/ui/SectionMeta.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { ALL_FILTER, STUDENT_FILTER_KEYS } from "../../constants/search.js";
import { isExtractionFailed, toDateKey, toOptions } from "../../lib/agencyFilter.js";
import { formatAlienRegistrationNumber, formatStudentName } from "../../lib/studentFormat.js";
import { useUrlPagination, useUrlReset, useUrlState } from "../../lib/useUrlState.js";

export function AgencyStudentListPage({ applications, onOpenDetail, onExclude }) {
  // 필터·페이지는 URL(?name=..&batch=..&page=2)에 — 새로고침·뒤로가기·링크 공유에서 살아남는다.
  const [nameFilter, setNameFilter] = useUrlState("name", "");
  const [nationalityFilter, setNationalityFilter] = useUrlState("nationality", ALL_FILTER);
  const [visaFilter, setVisaFilter] = useUrlState("visa", ALL_FILTER);
  const [schoolFilter, setSchoolFilter] = useUrlState("school", ALL_FILTER);
  const [dateFilter, setDateFilter] = useUrlState("date", "");
  const resetFilters = useUrlReset(STUDENT_FILTER_KEYS);
  const [excludingId, setExcludingId] = useState(null);

  // 학생 목록 = 검토 완료('완료')된 학생만. 검토 필요/보완 중인 케이스는 업로드 상세·보완접수에서
  // 처리 후 [검토 완료]를 눌러야 여기에 나타난다. (제외 케이스는 백엔드에서 이미 빠짐)
  const normalApps = applications.filter(
    (a) => !isExtractionFailed(a) && a.status === "완료",
  );

  // 드롭다운 옵션은 현재 데이터에서 동적으로 도출
  const nationalityOptionsList = [...new Set(normalApps.map((a) => a.nationality).filter(Boolean))];
  const visaOptionsList = [...new Set(normalApps.map((a) => a.visaType).filter(Boolean))];
  const schoolOptionsList = [...new Set(normalApps.map((a) => a.schoolName).filter(Boolean))];
  // 배치 id 대신 업로드 날짜로 고른다 — 운영자가 배치를 떠올리는 기준은 "언제 올렸는지"다.
  // 다중 독립 필터 — 모두 AND. 백엔드 정렬(배치 순서 + 배치 내 순서)을 보존한다.
  const rows = useMemo(() => {
    const nameQuery = nameFilter.trim().toLowerCase();
    return normalApps.filter((a) => {
      const matchesName = !nameQuery || (a.studentName ?? "").toLowerCase().includes(nameQuery);
      const matchesNationality =
        nationalityFilter === ALL_FILTER || a.nationality === nationalityFilter;
      const matchesVisa = visaFilter === ALL_FILTER || a.visaType === visaFilter;
      const matchesSchool = schoolFilter === ALL_FILTER || a.schoolName === schoolFilter;
      const matchesDate = !dateFilter || toDateKey(a.uploadedAt) === dateFilter;
      return matchesName && matchesNationality && matchesVisa && matchesSchool && matchesDate;
    });
  }, [applications, nameFilter, nationalityFilter, visaFilter, schoolFilter, dateFilter]);

  const { currentPage, setCurrentPage, totalPages, paginatedItems: pagedRows } =
    useUrlPagination(rows, 15);

  async function handleExclude(application) {
    if (excludingId) return;
    const ok = window.confirm(
      `${formatStudentName(application.studentName)} 학생을 환불 제외 처리할까요?\n제외하면 학생 목록과 집계에서 빠집니다.`,
    );
    if (!ok) return;
    setExcludingId(application.id);
    try {
      await onExclude(application.id);
    } finally {
      setExcludingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="학생 목록"
        description="검토 완료된 학생만 표시됩니다. 검토 대기·보완 필요 학생은 '보완 접수'에서 처리한 뒤 [검토 완료]를 누르면 이 목록에 나타납니다."
      />

      <section className="surfaceCard">
        <FilterBar
          search={{
            label: "학생명",
            value: nameFilter,
            onChange: setNameFilter,
            placeholder: "학생명으로 검색",
          }}
          resultLabel={`${rows.length}명`}
          onReset={resetFilters}
          filters={[
            { key: "nationality", label: "국적", value: nationalityFilter, onChange: setNationalityFilter, options: toOptions(nationalityOptionsList) },
            { key: "visa", label: "비자 타입", value: visaFilter, onChange: setVisaFilter, options: toOptions(visaOptionsList) },
            { key: "school", label: "학교", value: schoolFilter, onChange: setSchoolFilter, options: toOptions(schoolOptionsList) },
            { key: "date", label: "업로드 날짜", type: "date", value: dateFilter, onChange: setDateFilter },
          ]}
        />

        <SectionMeta count={`${rows.length}명`} helper={totalPages > 1 ? `${currentPage} / ${totalPages} 페이지` : undefined} />

        {rows.length === 0 ? (
          <EmptyState title="조건에 맞는 학생이 없습니다." description="필터를 변경해 주세요." />
        ) : (
          <div className="tableWrap">
            <table className="dataTable stackedTable">
              <thead>
                <tr>
                  <th>학생명</th>
                  <th>국적</th>
                  <th>외국인등록번호</th>
                  <th>학교명</th>
                  <th>비자 타입</th>
                  <th>업로드 날짜</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((a) => (
                  <tr key={a.id}>
                    <td data-label="학생명">{formatStudentName(a.studentName)}</td>
                    <td data-label="국적">{a.nationality}</td>
                    <td data-label="외국인등록번호">
                      {formatAlienRegistrationNumber(a.alienRegistrationNumber) || "—"}
                    </td>
                    <td data-label="학교명">{a.schoolName}</td>
                    <td data-label="비자 타입">{a.visaType}</td>
                    {/* 배치명(비자타입 · 일시)은 옆 '비자 타입' 열과 겹쳐 중복이었다 → 업로드 일시 + 배치 내 순번만 */}
                    <td data-label="업로드 날짜">
                      {a.uploadedAt || a.applicationDate || "—"}
                    </td>
                    <td data-label="상태">
                      <StatusBadge value={a.status} />
                    </td>
                    <td data-label="작업" className="tableActionCell">
                      <button
                        type="button"
                        className="tableLinkButton"
                        onClick={() => onOpenDetail(a.id)}
                      >
                        케이스 보기
                      </button>
                      <button
                        type="button"
                        className="tableLinkButton isDanger"
                        disabled={excludingId === a.id}
                        onClick={() => handleExclude(a)}
                      >
                        {excludingId === a.id ? "처리 중…" : "학생 제외"}
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
