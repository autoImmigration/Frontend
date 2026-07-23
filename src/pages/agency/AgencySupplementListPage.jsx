import { useMemo } from "react";
import { FilterBar } from "../../components/filters/FilterBar.jsx";
import { EmptyState } from "../../components/ui/EmptyState.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { ALL_FILTER, SUPPLEMENT_FILTER_KEYS } from "../../constants/search.js";
import { buildStudentMap, isExtractionFailed, toDateKey, toOptions } from "../../lib/agencyFilter.js";
import { useUrlReset, useUrlState } from "../../lib/useUrlState.js";

export function AgencySupplementListPage({ applications, onSupplementRequest }) {
  // 다중 독립 필터(모두 AND) — 학생목록과 같은 구조. 상태는 URL query string에 둔다.
  const [nameFilter, setNameFilter] = useUrlState("name", "");
  const [nationalityFilter, setNationalityFilter] = useUrlState("nationality", ALL_FILTER);
  const [visaFilter, setVisaFilter] = useUrlState("visa", ALL_FILTER);
  const [schoolFilter, setSchoolFilter] = useUrlState("school", ALL_FILTER);
  const [dateFilter, setDateFilter] = useUrlState("date", "");
  const [caseFilter, setCaseFilter] = useUrlState("case", ALL_FILTER); // 케이스(ZIP 업로드 배치)
  const resetFilters = useUrlReset(SUPPLEMENT_FILTER_KEYS);

  // 이 화면 대상 = '완료'가 아닌 모든 케이스 + 추출 실패. 옵션은 이 모수에서만 뽑아 빈 옵션을 막는다.
  // (누락 0건이어도 검토 완료 전이면 여기 '검토 대기'에 보인다 — 학생목록/보완접수 어디에도 안 잡히는 사각지대 방지)
  const targetApps = useMemo(
    () => applications.filter(
      (a) => isExtractionFailed(a) || a.status !== "완료",
    ),
    [applications],
  );

  const nationalityOptionsList = [...new Set(targetApps.map((a) => a.nationality).filter(Boolean))];
  const visaOptionsList = [...new Set(targetApps.map((a) => a.visaType).filter(Boolean))];
  const schoolOptionsList = [...new Set(targetApps.map((a) => a.schoolName).filter(Boolean))];
  // 케이스(ZIP 업로드 배치) 옵션 — 라벨은 "비자타입 · 업로드 일시"로 사람이 알아보게, 값은 배치 id
  const caseOptions = useMemo(() => {
    const map = new Map();
    targetApps.forEach((a) => {
      if (a.intakeBatch && !map.has(a.intakeBatch)) {
        map.set(a.intakeBatch, [a.visaType, a.uploadedAt].filter(Boolean).join(" · ") || a.intakeBatch);
      }
    });
    // 선택된 케이스가 대상 모수에 없으면(전부 검토 완료 등) 옵션에 넣어 '보이지 않는 필터'가 되지 않게 한다
    if (caseFilter !== ALL_FILTER && !map.has(caseFilter)) {
      map.set(caseFilter, "선택한 케이스 (현재 대상 없음)");
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [targetApps, caseFilter]);

  const hasActiveFilter =
    nameFilter.trim() !== "" || nationalityFilter !== ALL_FILTER || visaFilter !== ALL_FILTER
    || schoolFilter !== ALL_FILTER || caseFilter !== ALL_FILTER || dateFilter !== "";

  // 세 목록을 한 번의 순회로 분류한다. 예전엔 predicate·filterKey 문자열·failedStudents 복제본을
  // 손으로 4곳 맞춰야 했고 하나라도 빠지면 조용히 낡은 목록이 나왔다. 이제 필터값을 deps에 직접 둔다.
  const { supplementStudents, reviewPendingStudents, failedStudents } = useMemo(() => {
    const nameQuery = nameFilter.trim().toLowerCase();
    const matchesCommon = (a) =>
      (nationalityFilter === ALL_FILTER || a.nationality === nationalityFilter)
      && (visaFilter === ALL_FILTER || a.visaType === visaFilter)
      && (schoolFilter === ALL_FILTER || a.schoolName === schoolFilter)
      && (caseFilter === ALL_FILTER || a.intakeBatch === caseFilter)
      && (!dateFilter || toDateKey(a.uploadedAt) === dateFilter);
    const supplement = [];
    const pending = [];
    const failed = [];
    targetApps.forEach((a) => {
      if (!matchesCommon(a)) return;
      if (isExtractionFailed(a)) {
        failed.push(a); // 추출 실패는 이름이 없을 수 있어 이름 필터는 적용하지 않는다
      } else if (!nameQuery || (a.studentName ?? "").toLowerCase().includes(nameQuery)) {
        // 누락 있으면 '누락 서류', 없으면 '검토 대기'(완비됐지만 검토 완료 전 — 학생목록 사각지대 방지)
        if ((a.missingCount ?? 0) > 0) supplement.push(a);
        else pending.push(a);
      }
    });
    return {
      supplementStudents: buildStudentMap(supplement),
      reviewPendingStudents: buildStudentMap(pending),
      failedStudents: buildStudentMap(failed),
    };
  }, [targetApps, nameFilter, nationalityFilter, visaFilter, schoolFilter, caseFilter, dateFilter]);

  const SupplementTable = ({ rows, isFailed }) => {
    // 이 목록의 순서 = 케이스 상세의 "보완 접수 n/N" 및 이전/다음 이동 기준
    const queueIds = rows.map((s) => s.latestCase?.id).filter(Boolean);
    return (
    <div className="tableWrap">
      <table className="dataTable stackedTable">
        <thead>
          <tr>
            <th>학생명</th>
            <th>국적</th>
            <th>학교명</th>
            <th>업로드 날짜</th>
            <th>누락 서류</th>
            <th>최근 상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.studentName || s.latestCase?.id}>
              <td data-label="학생명" style={{ color: isFailed ? "var(--danger)" : undefined }}>
                {s.studentName || "이름 미추출"}
              </td>
              <td data-label="국적">{s.nationality || "—"}</td>
              <td data-label="학교명">{s.schoolName}</td>
              <td data-label="업로드 날짜">
                {s.latestCase?.uploadedAt || "—"}
              </td>
              <td data-label="누락 서류">
                {isFailed ? "추출 실패" : `${s.latestCase?.missingCount ?? 0}건`}
              </td>
              <td data-label="최근 상태">
                <StatusBadge value={s.latestCase?.status} />
              </td>
              <td data-label="작업" className="tableActionCell">
                {s.latestCase?.intakeBatch && (
                  <button
                    type="button"
                    className="primaryButton"
                    style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                    onClick={() => onSupplementRequest(s.latestCase.intakeBatch, s.latestCase.id, queueIds)}
                  >
                    처리하기
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    );
  };

  return (
    <>
      <PageHeader
        title="보완 접수"
        description="누락 서류 · 추출 실패 · 검토 대기 케이스를 처리합니다. 검토 완료된 학생만 학생 목록에 나타납니다."
      />

      <section className="surfaceCard">
        <FilterBar
          search={{
            label: "학생명",
            value: nameFilter,
            onChange: setNameFilter,
            placeholder: "학생명으로 검색 (추출 실패 건은 이름이 없어 제외됩니다)",
          }}
          resultLabel={`${supplementStudents.length + reviewPendingStudents.length + failedStudents.length}명`}
          onReset={resetFilters}
          filters={[
            { key: "nationality", label: "국적", value: nationalityFilter, onChange: setNationalityFilter, options: toOptions(nationalityOptionsList) },
            { key: "visa", label: "비자 타입", value: visaFilter, onChange: setVisaFilter, options: toOptions(visaOptionsList) },
            { key: "school", label: "학교", value: schoolFilter, onChange: setSchoolFilter, options: toOptions(schoolOptionsList) },
            { key: "case", label: "케이스", value: caseFilter, onChange: setCaseFilter, options: caseOptions },
            { key: "date", label: "업로드 날짜", type: "date", value: dateFilter, onChange: setDateFilter },
          ]}
        />
      </section>

      {supplementStudents.length > 0 && (
        <section className="surfaceCard" style={{ borderLeft: "3px solid var(--warning)" }}>
          <div className="sectionHeading">
            <h2>누락 서류 있음 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--warning)", marginLeft: 6 }}>{supplementStudents.length}명</span></h2>
            <p>"처리하기" 클릭 → 케이스 상세에서 서류 매핑 · 정보 수정 · 보완 요청을 진행하세요.</p>
          </div>
          <SupplementTable rows={supplementStudents} isFailed={false} />
        </section>
      )}

      {reviewPendingStudents.length > 0 && (
        <section className="surfaceCard" style={{ borderLeft: "3px solid var(--primary)" }}>
          <div className="sectionHeading">
            <h2>검토 대기 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--primary)", marginLeft: 6 }}>{reviewPendingStudents.length}명</span></h2>
            <p>서류는 완비됐지만 아직 검토 완료 전인 학생입니다. "처리하기" 클릭 → 내용 확인 후 [검토 완료]를 누르면 학생 목록으로 이동합니다.</p>
          </div>
          <SupplementTable rows={reviewPendingStudents} isFailed={false} />
        </section>
      )}

      {failedStudents.length > 0 && (
        <section className="surfaceCard" style={{ borderLeft: "3px solid var(--danger)" }}>
          <div className="sectionHeading">
            <h2>추출 실패 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--danger)", marginLeft: 6 }}>{failedStudents.length}명</span></h2>
            <p>"처리하기" 클릭 → 학생 정보를 직접 입력하고 서류를 매핑하세요.</p>
          </div>
          <SupplementTable rows={failedStudents} isFailed={true} />
        </section>
      )}

      {supplementStudents.length === 0 && reviewPendingStudents.length === 0 && failedStudents.length === 0 && (
        <section className="surfaceCard">
          {hasActiveFilter ? (
            <EmptyState title="조건에 맞는 케이스가 없습니다." description="필터를 바꾸거나 초기화한 뒤 다시 확인해 주세요." />
          ) : (
            <EmptyState title="처리할 케이스가 없습니다." description="모든 학생이 검토 완료되어 학생 목록에 반영되었습니다." />
          )}
        </section>
      )}
    </>
  );
}
