import { useMemo, useState } from "react";
import {
  agencyApplications,
  agencyUploadBatches,
  loginDefaults,
  nationalityOptions,
  schoolStudents,
  studentApplications,
  studentProfile,
  uploadFlowSteps,
  zipRules,
} from "./mockData.js";

const ROLE_LABELS = {
  student: "학생",
  school: "학교",
  agency: "유학원",
};

const ROLE_HELP = {
  student: "국적, 여권번호, 생년월일로 본인 신청 건을 확인합니다.",
  school: "학교 담당자 계정으로 학생 목록과 신청 상태를 조회합니다.",
  agency: "유학원 운영 계정으로 신청 건, 문서 상태, ZIP 업로드를 관리합니다.",
};

const STATUS_CLASS_MAP = {
  보완: "status statusWarning",
  완료: "status statusSuccess",
  제출: "status statusSuccess",
  미제출: "status statusNeutral",
};

const NAV_ITEMS = {
  student: [{ page: "student-list", label: "신청 현황" }],
  school: [{ page: "school-list", label: "학생 목록" }],
  agency: [
    { page: "agency-dashboard", label: "신청 대시보드" },
    { page: "agency-upload", label: "ZIP 업로드" },
    { page: "agency-upload-history", label: "업로드 내역" },
  ],
};

const SCHOOL_SEARCH_OPTIONS = [
  { value: "name", label: "학생명" },
  { value: "nationality", label: "국적" },
  { value: "agencyName", label: "유학원명" },
];

const AGENCY_SEARCH_OPTIONS = [
  { value: "studentName", label: "학생명" },
  { value: "schoolName", label: "학교명" },
  { value: "applicationType", label: "신청 유형" },
  { value: "visaType", label: "비자 타입" },
  { value: "coordinator", label: "담당자" },
];

const emptyOrgForms = {
  school: { ...loginDefaults.school },
  agency: { ...loginDefaults.agency },
};

function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}

function pageToActiveKey(page) {
  if (page === "student-detail") {
    return "student-list";
  }

  if (page === "agency-detail") {
    return "agency-dashboard";
  }

  if (page === "agency-upload-history-detail") {
    return "agency-upload-history";
  }

  return page;
}

function buildSession(role, form) {
  if (role === "student") {
    return {
      role,
      title: `${studentProfile.name} 학생`,
      subtitle: `${studentProfile.schoolName} · ${studentProfile.term}`,
    };
  }

  return {
    role,
    title: `${ROLE_LABELS[role]} 운영 계정`,
    subtitle: form.username,
  };
}

function StatusBadge({ value }) {
  return <span className={STATUS_CLASS_MAP[value] ?? "status"}>{value}</span>;
}

function PageHeader({ breadcrumb, title, description, actions }) {
  return (
    <header className="pageHeader">
      <div className="pageHeaderText">
        {breadcrumb ? <div className="breadcrumb">{breadcrumb}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="pageDescription">{description}</p> : null}
      </div>
      {actions ? <div className="headerActions">{actions}</div> : null}
    </header>
  );
}

function SummaryStrip({ items, variant = "" }) {
  return (
    <section className={`summaryStrip${variant ? ` ${variant}` : ""}`}>
      {items.map((item) => (
        <article
          key={item.label}
          className={`summaryItem${item.tone ? ` ${item.tone}` : ""}${
            item.featured ? " isFeatured" : ""
          }`}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.hint}</p>
        </article>
      ))}
    </section>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="emptyState">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function SectionMeta({ count, helper }) {
  return (
    <div className="sectionMeta">
      <strong>{count}</strong>
      <span>{helper}</span>
    </div>
  );
}

function LoginPage({
  loginType,
  studentForm,
  orgForms,
  onRoleSelect,
  onStudentFieldChange,
  onOrgFieldChange,
  onSubmit,
  error,
}) {
  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginCardHeader">
          <div className="loginBrand">Immigration Ops</div>
          <h1>로그인</h1>
          <p>{ROLE_HELP[loginType]}</p>
        </div>

        <div className="roleTabs" role="tablist" aria-label="로그인 역할">
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <button
              key={role}
              type="button"
              className={`roleTab${loginType === role ? " isActive" : ""}`}
              onClick={() => onRoleSelect(role)}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="formStack" onSubmit={onSubmit}>
          {loginType === "student" ? (
            <>
              <label className="field">
                <span>국적</span>
                <select
                  value={studentForm.nationality}
                  onChange={(event) =>
                    onStudentFieldChange("nationality", event.target.value)
                  }
                >
                  {nationalityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>여권번호</span>
                <input
                  value={studentForm.passportNumber}
                  onChange={(event) =>
                    onStudentFieldChange("passportNumber", event.target.value)
                  }
                  placeholder="여권번호를 입력하세요"
                />
              </label>

              <label className="field">
                <span>생년월일</span>
                <input
                  type="date"
                  value={studentForm.birthDate}
                  onChange={(event) =>
                    onStudentFieldChange("birthDate", event.target.value)
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span>아이디</span>
                <input
                  value={orgForms[loginType].username}
                  onChange={(event) =>
                    onOrgFieldChange(loginType, "username", event.target.value)
                  }
                  placeholder={`${ROLE_LABELS[loginType]} 계정 아이디`}
                />
              </label>

              <label className="field">
                <span>비밀번호</span>
                <input
                  type="password"
                  value={orgForms[loginType].password}
                  onChange={(event) =>
                    onOrgFieldChange(loginType, "password", event.target.value)
                  }
                  placeholder="비밀번호를 입력하세요"
                />
              </label>
            </>
          )}

          <button type="submit" className="primaryButton loginButton">
            로그인
          </button>
        </form>

        {error ? <div className="errorBox">{error}</div> : null}
      </section>
    </main>
  );
}

function AppShell({ session, page, onNavigate, onLogout, children }) {
  const activeKey = pageToActiveKey(page);

  return (
    <main className="workspaceShell">
      <aside className="sidebar">
        <div className="sidebarBrand">
          <strong>Immigration Ops</strong>
          <span>{ROLE_LABELS[session.role]} 업무 화면</span>
        </div>

        <nav className="sidebarNav">
          {NAV_ITEMS[session.role].map((item) => (
            <button
              key={item.page}
              type="button"
              className={`sidebarLink${activeKey === item.page ? " isActive" : ""}`}
              onClick={() => onNavigate(item.page)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebarFooter">
          <div className="sidebarAccount">
            <strong>{session.title}</strong>
            <span>{session.subtitle}</span>
          </div>
          <button type="button" className="secondaryButton sidebarLogout" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </aside>

      <section className="contentArea">
        <div className="pageStack">{children}</div>
      </section>
    </main>
  );
}

function StudentListPage({ applications, onOpenDetail }) {
  return (
    <>
      <PageHeader
        title="신청 현황"
        description="학생 본인이 제출한 신청 건과 현재 상태를 확인합니다."
        actions={
          <button type="button" className="secondaryButton">
            파일 추가
          </button>
        }
      />

      <section className="surfaceCard">
        <div className="tableWrap">
          <table className="dataTable stackedTable">
            <thead>
              <tr>
                <th>신청 유형</th>
                <th>비자 타입</th>
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
      </section>
    </>
  );
}

function StudentDetailPage({ application, onBack }) {
  const submittedCount = application.documents.filter(
    (document) => document.status === "제출",
  ).length;

  return (
    <>
      <PageHeader
        breadcrumb="학생 / 신청 상세"
        title={`${application.applicationType} · ${application.visaType}`}
        description={application.note}
        actions={
          <button type="button" className="secondaryButton" onClick={onBack}>
            목록으로 돌아가기
          </button>
        }
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

      <section className="surfaceCard">
        <div className="tableWrap">
          <table className="dataTable stackedTable">
            <thead>
              <tr>
                <th>문서명</th>
                <th>분류</th>
                <th>제출 상태</th>
                <th>최근 제출일</th>
                <th>검토 기준</th>
              </tr>
            </thead>
            <tbody>
              {application.documents.map((document) => (
                <tr key={document.code}>
                  <td data-label="문서명">{document.name}</td>
                  <td data-label="분류">{document.category}</td>
                  <td data-label="상태">
                    <StatusBadge value={document.status} />
                  </td>
                  <td data-label="최근 제출">{document.submittedAt}</td>
                  <td data-label="검토 기준">{document.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SchoolListPage({
  students,
  search,
  searchField,
  statusFilter,
  visaFilter,
  onSearchChange,
  onSearchFieldChange,
  onStatusFilterChange,
  onVisaFilterChange,
}) {
  const visaOptions = [...new Set(schoolStudents.map((student) => student.visaType))];
  const searchLabel =
    SCHOOL_SEARCH_OPTIONS.find((option) => option.value === searchField)?.label ?? "학생명";

  return (
    <>
      <PageHeader
        title="학생 목록"
        description="학생 검색과 필터링, 명단표 추출을 위한 조회 화면입니다."
        actions={
          <button type="button" className="primaryButton">
            학생 명단표 추출
          </button>
        }
      />

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
                  <th>소속</th>
                  <th>유학원</th>
                  <th>최근 갱신</th>
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
                    <td data-label="학과">{student.schoolDepartment}</td>
                    <td data-label="유학원">{student.agencyName}</td>
                    <td data-label="최근 갱신">{student.lastUpdated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function AgencyDashboardPage({
  applications,
  search,
  searchField,
  statusFilter,
  onSearchChange,
  onSearchFieldChange,
  onStatusFilterChange,
  onOpenDetail,
  onOpenUpload,
}) {
  const totalMissing = applications.reduce(
    (sum, application) => sum + application.missingCount,
    0,
  );
  const searchLabel =
    AGENCY_SEARCH_OPTIONS.find((option) => option.value === searchField)?.label ?? "학생명";

  return (
    <>
      <PageHeader
        title="신청 대시보드"
        description="유학원 접수 건을 기준으로 문서 상태와 보완 현황을 관리합니다."
        actions={
          <>
            <button type="button" className="secondaryButton" onClick={onOpenUpload}>
              ZIP 업로드
            </button>
            <button type="button" className="primaryButton">
              단체수납표 추출
            </button>
          </>
        }
      />

      <SummaryStrip
        variant="agencySummary"
        items={[
          {
            label: "신청 건",
            value: `${applications.length}건`,
            hint: "현재 조회 대상 케이스",
            tone: "tonePrimary",
          },
          {
            label: "보완",
            value: `${countByStatus(applications, "보완")}건`,
            hint: "추가 확인이 필요한 건",
            tone: "toneWarning",
          },
          {
            label: "완료",
            value: `${countByStatus(applications, "완료")}건`,
            hint: "검토가 끝난 건",
            tone: "toneSuccess",
          },
          {
            label: "미제출 문서",
            value: `${totalMissing}건`,
            hint: "서류 누락 합계",
            tone: "toneNeutral",
          },
        ]}
      />

      <section className="surfaceCard">
        <div className="toolbarRow">
          <label className="field fieldCompact">
            <span>검색 기준</span>
            <select
              value={searchField}
              onChange={(event) => onSearchFieldChange(event.target.value)}
            >
              {AGENCY_SEARCH_OPTIONS.map((option) => (
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
        </div>

        <SectionMeta
          count={`조회 결과 ${applications.length}건`}
          helper="학생명, 학교명, 신청 유형 기준으로 바로 필터링됩니다."
        />

        {applications.length === 0 ? (
          <EmptyState
            title="조건에 맞는 신청 건이 없습니다."
            description="검색 기준이나 상태 필터를 조정한 뒤 다시 확인해 주세요."
          />
        ) : (
          <div className="tableWrap">
            <table className="dataTable stackedTable">
              <thead>
                <tr>
                  <th>학생명</th>
                  <th>학교명</th>
                  <th>신청 유형</th>
                  <th>비자 타입</th>
                  <th>신청 날짜</th>
                  <th>상태</th>
                  <th>미제출</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id}>
                    <td data-label="학생명">{application.studentName}</td>
                    <td data-label="학교명">{application.schoolName}</td>
                    <td data-label="신청 유형">{application.applicationType}</td>
                    <td data-label="비자 유형">{application.visaType}</td>
                    <td data-label="신청일">{application.applicationDate}</td>
                    <td data-label="상태">
                      <StatusBadge value={application.status} />
                    </td>
                    <td data-label="미제출">{application.missingCount}건</td>
                    <td data-label="작업" className="tableActionCell">
                      <button
                        type="button"
                        className="tableLinkButton"
                        onClick={() => onOpenDetail(application.id)}
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
      </section>
    </>
  );
}

function AgencyDetailPage({ application, selectedDocument, onSelectDocument, onBack }) {
  return (
    <>
      <PageHeader
        breadcrumb="유학원 / 신청 상세"
        title={`${application.studentName} · ${application.visaType}`}
        description={`${application.schoolName} · 담당 ${application.coordinator}`}
        actions={
          <button type="button" className="secondaryButton" onClick={onBack}>
            대시보드로 돌아가기
          </button>
        }
      />

      <SummaryStrip
        items={[
          {
            label: "신청 번호",
            value: application.id,
            hint: "케이스 식별값",
            tone: "toneNeutral",
          },
          {
            label: "신청일",
            value: application.applicationDate,
            hint: "비자 신청 기준일",
            tone: "tonePrimarySoft",
          },
          {
            label: "국적",
            value: application.nationality,
            hint: "여권 우선 추출 필드",
            tone: "toneNeutral",
          },
          {
            label: "상태",
            value: application.status,
            hint: `미제출 ${application.missingCount}건`,
            tone:
              application.status === "보완" ? "toneWarning" : "toneSuccess",
          },
        ]}
      />

      <section className="agencyDetailSplit">
        <div className="surfaceCard">
          <div className="detailInfoGrid">
            <div>
              <span>학생명</span>
              <strong>{application.studentName}</strong>
            </div>
            <div>
              <span>학교명</span>
              <strong>{application.schoolName}</strong>
            </div>
            <div>
              <span>담당자</span>
              <strong>{application.coordinator}</strong>
            </div>
            <div>
              <span>배치</span>
              <strong>{application.intakeBatch}</strong>
            </div>
          </div>

          <div className="sectionBlock">
            <div className="sectionHeading">
              <h2>필요 문서 목록</h2>
              <p>문서를 선택하면 우측에서 제출본과 상태를 확인할 수 있습니다.</p>
            </div>

            <div className="documentStatusList">
              {application.documents.map((document) => (
                <button
                  key={document.code}
                  type="button"
                  className={`documentStatusButton${
                    selectedDocument.code === document.code ? " isActive" : ""
                  }`}
                  onClick={() => onSelectDocument(document.code)}
                >
                  <div>
                    <strong>{document.name}</strong>
                    <p>{document.note}</p>
                  </div>
                  <StatusBadge value={document.status} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="surfaceCard">
          <div className="sectionHeading">
            <h2>제출 문서 미리보기</h2>
            <p>선택한 문서의 OCR 요약과 제출 상태를 확인합니다.</p>
          </div>

          <div className="previewSurface">
            <span className="previewTag">문서 미리보기</span>
            <strong>{selectedDocument.name}</strong>
            <p>{selectedDocument.preview}</p>
          </div>

          <div className="detailInfoGrid previewMetaGrid">
            <div>
              <span>제출 상태</span>
              <strong>{selectedDocument.status}</strong>
            </div>
            <div>
              <span>최근 제출일</span>
              <strong>{selectedDocument.submittedAt}</strong>
            </div>
            <div className="spanAll">
              <span>검토 기준</span>
              <strong>{selectedDocument.rule}</strong>
            </div>
            <div className="spanAll">
              <span>검토 메모</span>
              <strong>{selectedDocument.note}</strong>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function AgencyUploadPage({ onBack, onOpenHistory }) {
  return (
    <>
      <PageHeader
        title="ZIP 업로드"
        description="스캔본 ZIP 업로드와 학생 구역 분리 규칙을 관리합니다."
        actions={
          <>
            <button type="button" className="secondaryButton" onClick={onOpenHistory}>
              업로드 내역 보기
            </button>
            <button type="button" className="secondaryButton" onClick={onBack}>
              대시보드로 돌아가기
            </button>
          </>
        }
      />

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>업로드 영역</h2>
          <p>실제 업로드 기능 연결 전까지는 화면 구조와 처리 규칙만 제공합니다.</p>
        </div>

        <div className="uploadDropzone">
          <strong>ZIP 파일 업로드 영역</strong>
          <p>통합신청서를 기준으로 학생 구간을 분리하고, 각 학생 문서를 묶어 OCR 대상으로 전달합니다.</p>
          <button type="button" className="primaryButton">
            ZIP 파일 선택
          </button>
        </div>
      </section>

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>처리 순서</h2>
          <p>ZIP 업로드 후 학생 분리와 필드 추출이 진행되는 기본 순서입니다.</p>
        </div>

        <div className="flowList">
          {uploadFlowSteps.map((step, index) => (
            <article key={step} className="flowItem">
              <span className="flowIndex">{index + 1}</span>
              <div>
                <strong>{step}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>학생 구역 분리 규칙</h2>
          <p>통합신청서를 기준으로 스캔 묶음을 학생 단위로 나누는 운영 규칙입니다.</p>
        </div>

        <div className="ruleGrid">
          {zipRules.map((rule) => (
            <article key={rule.title} className="ruleCard">
              <strong>{rule.title}</strong>
              <p>{rule.description}</p>
              <ul>
                {rule.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function AgencyUploadHistoryPage({ batches, onOpenDetail, onBack }) {
  return (
    <>
      <PageHeader
        title="업로드 내역"
        description="ZIP 업로드 배치 이력과 상태를 확인하고, 상세 보기에서 스캔본 미리보기를 확인합니다."
        actions={
          <button type="button" className="secondaryButton" onClick={onBack}>
            ZIP 업로드로 돌아가기
          </button>
        }
      />

      <section className="surfaceCard">
        <SectionMeta
          count={`업로드 배치 ${batches.length}건`}
          helper="배치 상세 보기에서 스캔본 미리보기와 학생 구간 분리 결과를 확인합니다."
        />

        <div className="tableWrap">
          <table className="dataTable stackedTable">
            <thead>
              <tr>
                <th>배치 ID</th>
                <th>파일명</th>
                <th>업로드 시각</th>
                <th>학생 수</th>
                <th>상태</th>
                <th>비고</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td data-label="배치 ID">{batch.id}</td>
                  <td data-label="파일명">{batch.fileName}</td>
                  <td data-label="업로드 시각">{batch.uploadedAt}</td>
                  <td data-label="학생 수">{batch.studentCount}명</td>
                  <td data-label="상태">
                    <StatusBadge value={batch.status} />
                  </td>
                  <td data-label="비고">{batch.note}</td>
                  <td data-label="작업" className="tableActionCell">
                    <button
                      type="button"
                      className="tableLinkButton"
                      onClick={() => onOpenDetail(batch.id)}
                    >
                      상세 보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AgencyUploadHistoryDetailPage({ batch, onBack }) {
  return (
    <>
      <PageHeader
        breadcrumb="유학원 / 업로드 내역 상세"
        title={batch.fileName}
        description="더미 스캔본 미리보기와 학생 구간 분리 결과를 확인합니다."
        actions={
          <button type="button" className="secondaryButton" onClick={onBack}>
            업로드 내역으로 돌아가기
          </button>
        }
      />

      <SummaryStrip
        items={[
          {
            label: "배치 ID",
            value: batch.id,
            hint: "업로드 이력 식별값",
            tone: "toneNeutral",
          },
          {
            label: "업로드 시각",
            value: batch.uploadedAt,
            hint: "배치 등록 시각",
            tone: "tonePrimarySoft",
          },
          {
            label: "학생 수",
            value: `${batch.studentCount}명`,
            hint: "분리된 학생 케이스 수",
            tone: "toneNeutral",
          },
          {
            label: "현재 상태",
            value: batch.status,
            hint: batch.note,
            tone: batch.status === "보완" ? "toneWarning" : "toneSuccess",
          },
        ]}
      />

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>스캔본 미리보기</h2>
          <p>실제 파일 연결 전까지는 더미 스캔 카드로 업로드 상세 화면 구조를 확인합니다.</p>
        </div>

        <div className="scanGrid">
          {batch.previewFiles.map((file) => (
            <article key={file.id} className="scanCard">
              <div className="scanFrame">
                <div className="scanPaper">
                  <span>{file.documentName}</span>
                  <strong>{file.studentName}</strong>
                  <div className="scanLines">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <small>{file.pageRange}</small>
                </div>
              </div>

              <div className="scanMeta">
                <strong>{file.documentName}</strong>
                <span>
                  {file.studentName} · {file.pageRange}
                </span>
                <p>{file.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export default function App() {
  const [loginType, setLoginType] = useState("student");
  const [studentForm, setStudentForm] = useState(loginDefaults.student);
  const [orgForms, setOrgForms] = useState(emptyOrgForms);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("login");
  const [error, setError] = useState("");
  const [studentApplicationId, setStudentApplicationId] = useState(
    studentApplications[0].id,
  );
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolSearchField, setSchoolSearchField] = useState("name");
  const [schoolStatusFilter, setSchoolStatusFilter] = useState("전체");
  const [schoolVisaFilter, setSchoolVisaFilter] = useState("전체");
  const [agencySearch, setAgencySearch] = useState("");
  const [agencySearchField, setAgencySearchField] = useState("studentName");
  const [agencyStatusFilter, setAgencyStatusFilter] = useState("전체");
  const [agencyApplicationId, setAgencyApplicationId] = useState(
    agencyApplications[0].id,
  );
  const [agencyPreviewId, setAgencyPreviewId] = useState(
    agencyApplications[0].documents[0].code,
  );
  const [agencyBatchId, setAgencyBatchId] = useState(agencyUploadBatches[0].id);

  const selectedStudentApplication =
    studentApplications.find((application) => application.id === studentApplicationId) ??
    studentApplications[0];

  const filteredSchoolStudents = useMemo(() => {
    const query = schoolSearch.trim().toLowerCase();

    return schoolStudents.filter((student) => {
      const matchesSearch =
        !query ||
        String(student[schoolSearchField] ?? "")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        schoolStatusFilter === "전체" || student.status === schoolStatusFilter;
      const matchesVisa =
        schoolVisaFilter === "전체" || student.visaType === schoolVisaFilter;

      return matchesSearch && matchesStatus && matchesVisa;
    });
  }, [schoolSearch, schoolSearchField, schoolStatusFilter, schoolVisaFilter]);

  const filteredAgencyApplications = useMemo(() => {
    const query = agencySearch.trim().toLowerCase();

    return agencyApplications.filter((application) => {
      const matchesSearch =
        !query ||
        String(application[agencySearchField] ?? "")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        agencyStatusFilter === "전체" || application.status === agencyStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [agencySearch, agencySearchField, agencyStatusFilter]);

  const selectedAgencyApplication =
    agencyApplications.find((application) => application.id === agencyApplicationId) ??
    agencyApplications[0];

  const selectedAgencyDocument =
    selectedAgencyApplication.documents.find(
      (document) => document.code === agencyPreviewId,
    ) ?? selectedAgencyApplication.documents[0];

  const selectedAgencyBatch =
    agencyUploadBatches.find((batch) => batch.id === agencyBatchId) ??
    agencyUploadBatches[0];

  function handleStudentFieldChange(field, value) {
    setStudentForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleOrgFieldChange(role, field, value) {
    setOrgForms((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [field]: value,
      },
    }));
  }

  function handleLogin(event) {
    event.preventDefault();
    setError("");

    if (loginType === "student") {
      const hasEmptyField = Object.values(studentForm).some((value) => !value);
      if (hasEmptyField) {
        setError("학생 로그인 정보 3가지를 모두 입력해 주세요.");
        return;
      }

      setSession(buildSession("student", studentForm));
      setPage("student-list");
      return;
    }

    const currentForm = orgForms[loginType];
    if (!currentForm.username || !currentForm.password) {
      setError(`${ROLE_LABELS[loginType]} 로그인 정보를 입력해 주세요.`);
      return;
    }

    setSession(buildSession(loginType, currentForm));
    setPage(loginType === "school" ? "school-list" : "agency-dashboard");
  }

  function handleLogout() {
    setSession(null);
    setPage("login");
    setError("");
  }

  function renderPage() {
    if (page === "student-list") {
      return (
        <StudentListPage
          applications={studentApplications}
          onOpenDetail={(applicationId) => {
            setStudentApplicationId(applicationId);
            setPage("student-detail");
          }}
        />
      );
    }

    if (page === "student-detail") {
      return (
        <StudentDetailPage
          application={selectedStudentApplication}
          onBack={() => setPage("student-list")}
        />
      );
    }

    if (page === "school-list") {
      return (
        <SchoolListPage
          students={filteredSchoolStudents}
          search={schoolSearch}
          searchField={schoolSearchField}
          statusFilter={schoolStatusFilter}
          visaFilter={schoolVisaFilter}
          onSearchChange={setSchoolSearch}
          onSearchFieldChange={setSchoolSearchField}
          onStatusFilterChange={setSchoolStatusFilter}
          onVisaFilterChange={setSchoolVisaFilter}
        />
      );
    }

    if (page === "agency-dashboard") {
      return (
        <AgencyDashboardPage
          applications={filteredAgencyApplications}
          search={agencySearch}
          searchField={agencySearchField}
          statusFilter={agencyStatusFilter}
          onSearchChange={setAgencySearch}
          onSearchFieldChange={setAgencySearchField}
          onStatusFilterChange={setAgencyStatusFilter}
          onOpenDetail={(applicationId) => {
            const nextApplication =
              agencyApplications.find((application) => application.id === applicationId) ??
              agencyApplications[0];

            setAgencyApplicationId(applicationId);
            setAgencyPreviewId(nextApplication.documents[0].code);
            setPage("agency-detail");
          }}
          onOpenUpload={() => setPage("agency-upload")}
        />
      );
    }

    if (page === "agency-detail") {
      return (
        <AgencyDetailPage
          application={selectedAgencyApplication}
          selectedDocument={selectedAgencyDocument}
          onSelectDocument={setAgencyPreviewId}
          onBack={() => setPage("agency-dashboard")}
        />
      );
    }

    if (page === "agency-upload") {
      return (
        <AgencyUploadPage
          onBack={() => setPage("agency-dashboard")}
          onOpenHistory={() => setPage("agency-upload-history")}
        />
      );
    }

    if (page === "agency-upload-history") {
      return (
        <AgencyUploadHistoryPage
          batches={agencyUploadBatches}
          onOpenDetail={(batchId) => {
            setAgencyBatchId(batchId);
            setPage("agency-upload-history-detail");
          }}
          onBack={() => setPage("agency-upload")}
        />
      );
    }

    return (
      <AgencyUploadHistoryDetailPage
        batch={selectedAgencyBatch}
        onBack={() => setPage("agency-upload-history")}
      />
    );
  }

  if (!session) {
    return (
      <LoginPage
        loginType={loginType}
        studentForm={studentForm}
        orgForms={orgForms}
        onRoleSelect={(role) => {
          setLoginType(role);
          setError("");
        }}
        onStudentFieldChange={handleStudentFieldChange}
        onOrgFieldChange={handleOrgFieldChange}
        onSubmit={handleLogin}
        error={error}
      />
    );
  }

  return (
    <AppShell
      session={session}
      page={page}
      onNavigate={setPage}
      onLogout={handleLogout}
    >
      {renderPage()}
    </AppShell>
  );
}
