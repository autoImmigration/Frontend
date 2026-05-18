import { useEffect, useMemo, useRef, useState } from "react";
import {
  loginDefaults,
  nationalityOptions,
  uploadFlowSteps,
  zipRules,
} from "./mockData.js";
import {
  fetchAgencyApplicationDetail,
  fetchAgencyApplications,
  fetchAgencyUploadBatchDetail,
  fetchAgencyUploadBatches,
  fetchMe,
  fetchOcrProgress,
  fetchSchoolStudents,
  fetchSchools,
  lookupStudentAccess,
  uploadAgencyBatchFile,
} from "./api.js";

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
  "준비 완료": "status statusNeutral",
  "접수 완료": "status statusNeutral",
  "업로드 완료": "status statusSuccess",
  대기: "status statusNeutral",
  "처리 중": "status statusNeutral",
  "부분 완료": "status statusWarning",
  실패: "status statusError",
  중단: "status statusError",
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

const ALL_FILTER = "전체";

const emptyOrgForms = {
  school: { ...loginDefaults.school },
  agency: { ...loginDefaults.agency },
};

const EMPTY_UPLOAD_FEEDBACK = {
  phase: "idle",
  fileName: "",
  message: "",
  batch: null,
};

const VISA_TYPE_OPTIONS = [
  { code: "ALIEN_REGISTRATION", label: "외국인등록" },
  { code: "D2_EXTENSION", label: "D2연장" },
  { code: "D4_EXTENSION", label: "D4연장" },
  { code: "STATUS_CHANGE_AND_EXTENSION", label: "세부체류자격 변경 및 연장" },
  { code: "D2_CHANGE", label: "D2변경" },
];

const EMPTY_UPLOAD_FORM = {
  receiptDate: new Date().toISOString().split("T")[0],
  schoolId: "",
  visaTypeCode: "",
};

const BATCH_STATUS_LABELS = {
  READY: "준비 완료",
  RECEIVED: "접수 완료",
  UPLOADED: "업로드 완료",
  QUEUED: "대기",
  PENDING: "대기",
  PROCESSING: "처리 중",
  RUNNING: "처리 중",
  IN_PROGRESS: "처리 중",
  COMPLETED: "완료",
  SUCCESS: "완료",
  SUCCEEDED: "완료",
  PARTIAL_SUCCESS: "부분 완료",
  FAILED: "실패",
  ERROR: "실패",
  CANCELED: "중단",
  CANCELLED: "중단",
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

function buildSession(role, payload) {
  if (role === "student") {
    return {
      role,
      title: `${payload.name} 학생`,
      subtitle: `${payload.schoolName} · ${payload.term}`,
    };
  }

  return {
    role,
      title: `${ROLE_LABELS[role]} 운영 계정`,
    subtitle: payload.username,
    username: payload.username,
    password: payload.password,
  };
}

function normalizeBatchStatusLabel(status) {
  if (!status) {
    return "";
  }

  const normalizedStatus = String(status).trim();
  const mappedStatus = BATCH_STATUS_LABELS[normalizedStatus.toUpperCase()];

  return mappedStatus ?? normalizedStatus;
}

function buildBatchNote(batch, fallbackNote = "") {
  if (typeof batch?.note === "string" && batch.note.trim()) {
    return batch.note;
  }

  const uploadBatchStatus = normalizeBatchStatusLabel(
    batch?.uploadBatchStatus ?? batch?.status,
  );
  const processingJobStatus = normalizeBatchStatusLabel(
    batch?.processingJobStatus ?? batch?.jobStatus,
  );

  if (uploadBatchStatus && processingJobStatus) {
    return `배치 ${uploadBatchStatus} · 작업 ${processingJobStatus}`;
  }

  if (processingJobStatus) {
    return `처리 작업 ${processingJobStatus}`;
  }

  if (uploadBatchStatus) {
    return `배치 상태 ${uploadBatchStatus}`;
  }

  return fallbackNote || "업로드가 접수되었습니다.";
}

function formatDisplayDateTime(value) {
  if (!value) {
    return "";
  }

  const normalizedValue = String(value).trim();
  const match = normalizedValue.match(
    /^(\d{4})[-.](\d{2})[-.](\d{2})(?:[T ](\d{2}):(\d{2}))?/,
  );

  if (!match) {
    return normalizedValue;
  }

  const [, year, month, day, hour, minute] = match;

  if (!hour || !minute) {
    return `${year}.${month}.${day}`;
  }

  return `${year}.${month}.${day} ${hour}:${minute}`;
}

function hasTerminalProcessingStatus(status) {
  return ["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"].includes(status);
}

function hasTerminalBatchStatus(status) {
  return ["COMPLETED", "NEEDS_REVIEW", "FAILED"].includes(status);
}

function buildBatchTimeline(batch) {
  const hasJob = Boolean(batch.processingJobId);
  const processingStatus = batch.processingJobStatusRaw;
  const batchStatus = batch.uploadBatchStatusRaw;
  const hasStarted = Boolean(batch.processingJobStartedAt);
  const hasFinished =
    Boolean(batch.processingJobFinishedAt) ||
    hasTerminalProcessingStatus(processingStatus) ||
    hasTerminalBatchStatus(batchStatus);
  const isRunning =
    processingStatus === "RUNNING" ||
    batchStatus === "RUNNING" ||
    batchStatus === "VALIDATING" ||
    batchStatus === "FINALIZING";
  const finalLabel =
    processingStatus === "FAILED" || batchStatus === "FAILED"
      ? "실패"
      : processingStatus === "PARTIAL_SUCCESS" || batchStatus === "NEEDS_REVIEW"
        ? "보완 필요"
        : processingStatus === "SUCCEEDED" || batchStatus === "COMPLETED"
          ? "완료"
          : "대기";

  return [
    {
      key: "upload",
      title: "ZIP 업로드",
      state: batch.uploadedAt ? "done" : "upcoming",
      detail: batch.uploadedAt
        ? `${batch.uploadedAt} 접수`
        : "배치 업로드를 기다리는 단계입니다.",
    },
    {
      key: "queue",
      title: "처리 대기",
      state: !hasJob ? "upcoming" : hasStarted || hasFinished ? "done" : "current",
      detail: hasJob
        ? `작업 ID ${batch.processingJobId}`
        : "처리 작업이 아직 생성되지 않았습니다.",
    },
    {
      key: "run",
      title: "OCR / 문서 분리",
      state: hasFinished ? "done" : isRunning ? "current" : "upcoming",
      detail: hasStarted
        ? `${batch.processingJobStartedAt} 시작`
        : isRunning
          ? "현재 문서 분리와 OCR 단계가 진행 중입니다."
          : "Python 실행 전이라 아직 시작되지 않았습니다.",
    },
    {
      key: "finish",
      title: "최종 상태",
      state: hasFinished ? "done" : "upcoming",
      detail: hasFinished
        ? `${finalLabel} · ${batch.note || batch.status}`
        : "결과 수신 후 완료 / 보완 / 실패로 확정됩니다.",
    },
  ];
}

function buildBatchEvents(batch) {
  const events = [];
  const eventMeta = [];

  if (batch.processingJobId) {
    eventMeta.push(`작업 ID ${batch.processingJobId}`);
  }
  if (batch.processingJobAttemptNo) {
    eventMeta.push(`시도 ${batch.processingJobAttemptNo}회`);
  }

  if (batch.uploadedAt) {
    events.push({
      key: "uploaded",
      tone: "neutral",
      time: batch.uploadedAt,
      title: "ZIP 업로드 접수",
      description: `${batch.fileName} 업로드가 접수되어 배치 ${batch.id}가 생성되었습니다.`,
      meta: eventMeta,
    });
  }

  if (batch.processingJobId) {
    events.push({
      key: "queued",
      tone: "neutral",
      time: batch.processingJobCreatedAt || batch.uploadedAt,
      title: "처리 작업 생성",
      description:
        batch.processingJobStatusRaw === "QUEUED"
          ? "현재 구현 범위에서는 업로드 후 작업 대기 상태까지 자동 반영됩니다."
          : "배치에 연결된 처리 작업 메타데이터가 준비되었습니다.",
      meta: [
        batch.processingJobType || "OCR_BATCH",
        batch.processingJobStatus ? `상태 ${batch.processingJobStatus}` : "",
      ].filter(Boolean),
    });
  }

  if (batch.processingJobStartedAt) {
    events.push({
      key: "started",
      tone: "primary",
      time: batch.processingJobStartedAt,
      title: "OCR 처리 시작",
      description: batch.processingProvider
        ? `${batch.processingProvider} provider에서 배치 처리를 시작했습니다.`
        : "문서 분리와 OCR 처리 단계가 시작되었습니다.",
      meta: [
        batch.processingFileCount != null ? `파일 ${batch.processingFileCount}건` : "",
        batch.processingCaseCount != null ? `학생 케이스 ${batch.processingCaseCount}건` : "",
      ].filter(Boolean),
    });
  }

  if (batch.processingJobStatusRaw === "RUNNING") {
    events.push({
      key: "running",
      tone: "primary",
      time: batch.processingJobStartedAt || batch.processingJobCreatedAt || batch.uploadedAt,
      title: "처리 진행 중",
      description: "Python 결과 수신 전 단계이며, 배치 상태는 계속 갱신될 예정입니다.",
      meta: [
        batch.processingFileCount != null ? `파일 ${batch.processingFileCount}건` : "",
        batch.processingCaseCount != null ? `학생 케이스 ${batch.processingCaseCount}건` : "",
      ].filter(Boolean),
    });
  }

  if (hasTerminalProcessingStatus(batch.processingJobStatusRaw)) {
    const isFailure = batch.processingJobStatusRaw === "FAILED";
    const isPartial = batch.processingJobStatusRaw === "PARTIAL_SUCCESS";

    events.push({
      key: "finished",
      tone: isFailure ? "error" : isPartial ? "warning" : "success",
      time: batch.processingJobFinishedAt || batch.uploadedAt,
      title: isFailure
        ? "처리 실패"
        : isPartial
          ? "Python 결과 수신 · 보완 필요"
          : "Python 결과 수신 완료",
      description: batch.processingErrorMessage || batch.note || "배치 처리가 종료되었습니다.",
      meta: [
        batch.processingFileCount != null ? `파일 ${batch.processingFileCount}건` : "",
        batch.processingCaseCount != null ? `학생 케이스 ${batch.processingCaseCount}건` : "",
        batch.processingErrorCount != null ? `오류 ${batch.processingErrorCount}건` : "",
        batch.processingErrorCode ? `코드 ${batch.processingErrorCode}` : "",
      ].filter(Boolean),
    });
  }

  if (batch.previewFiles.length > 0) {
    events.push({
      key: "preview",
      tone: "success",
      time:
        batch.processingJobFinishedAt ||
        batch.processingJobStartedAt ||
        batch.processingJobCreatedAt ||
        batch.uploadedAt,
      title: "배치 미리보기 준비",
      description: `${batch.previewFiles.length}건의 미리보기 카드가 배치 상세 화면에 연결되었습니다.`,
      meta: [batch.studentCount != null ? `학생 ${batch.studentCount}명` : ""].filter(
        Boolean,
      ),
    });
  }

  return events.filter((event) => event.time || event.title);
}

function normalizeAgencyUploadBatch(batch, fallback = {}) {
  const mergedBatch = {
    ...fallback,
    ...batch,
  };

  const mergedProcessingJob = mergedBatch.processingJob ?? fallback.processingJob ?? null;
  const rawUploadBatchStatus =
    mergedBatch.uploadBatchStatus ??
    mergedBatch.uploadBatchStatusRaw ??
    fallback.uploadBatchStatusRaw ??
    "";
  const rawProcessingJobStatus =
    mergedProcessingJob?.status ??
    mergedBatch.processingJobStatus ??
    mergedBatch.processingJobStatusRaw ??
    mergedBatch.jobStatus ??
    fallback.processingJobStatusRaw ??
    "";
  const uploadBatchStatus = normalizeBatchStatusLabel(
    rawUploadBatchStatus || mergedBatch.status,
  );
  const processingJobStatus = normalizeBatchStatusLabel(rawProcessingJobStatus);
  const processingJobId =
    mergedProcessingJob?.id ??
    mergedBatch.processingJobId ??
    mergedBatch.jobId ??
    fallback.processingJobId ??
    "";
  const processingJobType =
    mergedProcessingJob?.type ??
    mergedBatch.processingJobType ??
    fallback.processingJobType ??
    "";
  const processingJobAttemptNo =
    mergedProcessingJob?.attemptNo ??
    mergedBatch.processingJobAttemptNo ??
    fallback.processingJobAttemptNo ??
    null;
  const processingProvider =
    mergedProcessingJob?.provider ??
    mergedBatch.processingProvider ??
    fallback.processingProvider ??
    "";
  const processingExternalJobId =
    mergedProcessingJob?.externalJobId ??
    mergedBatch.processingExternalJobId ??
    fallback.processingExternalJobId ??
    "";
  const processingFileCount =
    mergedProcessingJob?.fileCount ??
    mergedBatch.processingFileCount ??
    fallback.processingFileCount ??
    null;
  const processingCaseCount =
    mergedProcessingJob?.caseCount ??
    mergedBatch.processingCaseCount ??
    fallback.processingCaseCount ??
    null;
  const processingErrorCount =
    mergedProcessingJob?.errorCount ??
    mergedBatch.processingErrorCount ??
    fallback.processingErrorCount ??
    null;
  const processingErrorCode =
    mergedProcessingJob?.errorCode ??
    mergedBatch.processingErrorCode ??
    fallback.processingErrorCode ??
    "";
  const processingErrorMessage =
    mergedProcessingJob?.errorMessage ??
    mergedBatch.processingErrorMessage ??
    fallback.processingErrorMessage ??
    "";
  const processingJobCreatedAt = formatDisplayDateTime(
    mergedProcessingJob?.createdAt ??
      mergedBatch.processingJobCreatedAt ??
      fallback.processingJobCreatedAt ??
      "",
  );
  const processingJobStartedAt = formatDisplayDateTime(
    mergedProcessingJob?.startedAt ??
      mergedBatch.processingJobStartedAt ??
      fallback.processingJobStartedAt ??
      "",
  );
  const processingJobFinishedAt = formatDisplayDateTime(
    mergedProcessingJob?.finishedAt ??
      mergedBatch.processingJobFinishedAt ??
      fallback.processingJobFinishedAt ??
      "",
  );
  const normalizedProcessingJob =
    processingJobId || rawProcessingJobStatus
      ? {
          id: processingJobId,
          type: processingJobType,
          status: rawProcessingJobStatus,
          attemptNo: processingJobAttemptNo,
          provider: processingProvider,
          externalJobId: processingExternalJobId,
          fileCount: processingFileCount,
          caseCount: processingCaseCount,
          errorCount: processingErrorCount,
          errorCode: processingErrorCode,
          errorMessage: processingErrorMessage,
          createdAt: processingJobCreatedAt,
          startedAt: processingJobStartedAt,
          finishedAt: processingJobFinishedAt,
        }
      : null;

  return {
    ...mergedBatch,
    id: mergedBatch.uploadBatchId ?? mergedBatch.id ?? fallback.id ?? "",
    uploadBatchId:
      mergedBatch.uploadBatchId ?? mergedBatch.id ?? fallback.uploadBatchId ?? "",
    processingJobId,
    fileName:
      mergedBatch.fileName ??
      mergedBatch.originalFileName ??
      mergedBatch.uploadedFileName ??
      fallback.fileName ??
      "업로드 ZIP",
    uploadedAt: formatDisplayDateTime(
      mergedBatch.uploadedAt ??
        mergedBatch.createdAt ??
        mergedBatch.requestedAt ??
        fallback.uploadedAt ??
        "-",
    ),
    studentCount:
      mergedBatch.studentCount ??
      mergedBatch.totalStudentCount ??
      mergedBatch.studentsCount ??
      fallback.studentCount ??
      0,
    status:
      uploadBatchStatus || processingJobStatus || fallback.status || "접수 완료",
    uploadBatchStatus: uploadBatchStatus || fallback.uploadBatchStatus || "",
    processingJobStatus: processingJobStatus || fallback.processingJobStatus || "",
    uploadBatchStatusRaw: rawUploadBatchStatus || fallback.uploadBatchStatusRaw || "",
    processingJobStatusRaw:
      rawProcessingJobStatus || fallback.processingJobStatusRaw || "",
    processingJobType: processingJobType || fallback.processingJobType || "",
    processingJobAttemptNo,
    processingProvider,
    processingExternalJobId,
    processingFileCount,
    processingCaseCount,
    processingErrorCount,
    processingErrorCode,
    processingErrorMessage,
    processingJobCreatedAt,
    processingJobStartedAt,
    processingJobFinishedAt,
    processingJob: normalizedProcessingJob,
    note: buildBatchNote(
      {
        ...mergedBatch,
        uploadBatchStatus: rawUploadBatchStatus || mergedBatch.status,
        processingJobStatus: rawProcessingJobStatus,
      },
      fallback.note,
    ),
    previewFiles: Array.isArray(mergedBatch.previewFiles)
      ? mergedBatch.previewFiles
      : Array.isArray(fallback.previewFiles)
        ? fallback.previewFiles
        : [],
    cases: Array.isArray(mergedBatch.cases)
      ? mergedBatch.cases
      : Array.isArray(fallback.cases)
        ? fallback.cases
        : [],
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

function LoadingState({ title = "불러오는 중입니다.", description = "잠시만 기다려 주세요." }) {
  return <EmptyState title={title} description={description} />;
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
        <div className="sectionHeading">
          <h2>처리 타임라인</h2>
          <p>업로드부터 처리 대기, OCR 실행, 최종 상태까지 현재 위치를 단계별로 보여줍니다.</p>
        </div>

        <div className="timelineList">
          {timeline.map((step, index) => (
            <article
              key={step.key}
              className={`timelineStep${
                step.state === "done"
                  ? " isDone"
                  : step.state === "current"
                    ? " isCurrent"
                    : " isUpcoming"
              }`}
            >
              <div className="timelineMarker">{index + 1}</div>
              <div className="timelineContent">
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>작업 요약</h2>
          <p>현재 배치에 연결된 처리 작업 메타데이터와 처리량 스냅샷입니다.</p>
        </div>

        <div className="jobMetricGrid">
          <article className="jobMetricCard">
            <span>처리 작업</span>
            <strong>{hasProcessingJob ? batch.processingJobId : "생성 전"}</strong>
            <p>
              {batch.processingJobType || "OCR_BATCH"}
              {batch.processingJobAttemptNo ? ` · 시도 ${batch.processingJobAttemptNo}회` : ""}
            </p>
          </article>
          <article className="jobMetricCard">
            <span>현재 단계</span>
            <strong>{batch.processingJobStatus || "대기"}</strong>
            <p>{batch.processingProvider || "Provider 미지정"}</p>
          </article>
          <article className="jobMetricCard">
            <span>처리량</span>
            <strong>{processingLoad}</strong>
            <p>
              {batch.processingJobStartedAt
                ? `시작 ${batch.processingJobStartedAt}`
                : "아직 실행 시작 전"}
            </p>
          </article>
          <article className="jobMetricCard">
            <span>오류</span>
            <strong>{errorSummary}</strong>
            <p>{batch.processingErrorMessage || "추가 오류 메시지 없음"}</p>
          </article>
        </div>
      </section>

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>작업 이벤트</h2>
          <p>현재 저장된 배치/작업 메타데이터를 기반으로 처리 이력을 시간순으로 정리했습니다.</p>
        </div>

        <div className="eventList">
          {events.map((event) => (
            <article
              key={event.key}
              className={`eventCard${
                event.tone === "primary"
                  ? " isPrimary"
                  : event.tone === "warning"
                    ? " isWarning"
                    : event.tone === "error"
                      ? " isError"
                      : event.tone === "success"
                        ? " isSuccess"
                        : ""
              }`}
            >
              <div className="eventHeader">
                <strong>{event.title}</strong>
                <span>{event.time || "시간 미정"}</span>
              </div>
              <p>{event.description}</p>
              {event.meta.length > 0 ? (
                <div className="eventMetaRow">
                  {event.meta.map((meta) => (
                    <span key={`${event.key}-${meta}`} className="eventPill">
                      {meta}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

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
        <div className="sectionHeading">
          <h2>처리 타임라인</h2>
          <p>업로드부터 처리 대기, OCR 실행, 최종 상태까지 현재 위치를 단계별로 보여줍니다.</p>
        </div>

        <div className="timelineList">
          {timeline.map((step, index) => (
            <article
              key={step.key}
              className={`timelineStep${
                step.state === "done"
                  ? " isDone"
                  : step.state === "current"
                    ? " isCurrent"
                    : " isUpcoming"
              }`}
            >
              <div className="timelineMarker">{index + 1}</div>
              <div className="timelineContent">
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>작업 요약</h2>
          <p>현재 배치에 연결된 처리 작업 메타데이터와 처리량 스냅샷입니다.</p>
        </div>

        <div className="jobMetricGrid">
          <article className="jobMetricCard">
            <span>처리 작업</span>
            <strong>{hasProcessingJob ? batch.processingJobId : "생성 전"}</strong>
            <p>
              {batch.processingJobType || "OCR_BATCH"}
              {batch.processingJobAttemptNo ? ` · 시도 ${batch.processingJobAttemptNo}회` : ""}
            </p>
          </article>
          <article className="jobMetricCard">
            <span>현재 단계</span>
            <strong>{batch.processingJobStatus || "대기"}</strong>
            <p>{batch.processingProvider || "Provider 미지정"}</p>
          </article>
          <article className="jobMetricCard">
            <span>처리량</span>
            <strong>{processingLoad}</strong>
            <p>
              {batch.processingJobStartedAt
                ? `시작 ${batch.processingJobStartedAt}`
                : "아직 실행 시작 전"}
            </p>
          </article>
          <article className="jobMetricCard">
            <span>오류</span>
            <strong>{errorSummary}</strong>
            <p>{batch.processingErrorMessage || "추가 오류 메시지 없음"}</p>
          </article>
        </div>
      </section>

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>작업 이벤트</h2>
          <p>현재 저장된 배치/작업 메타데이터를 기반으로 처리 이력을 시간순으로 정리했습니다.</p>
        </div>

        <div className="eventList">
          {events.map((event) => (
            <article
              key={event.key}
              className={`eventCard${
                event.tone === "primary"
                  ? " isPrimary"
                  : event.tone === "warning"
                    ? " isWarning"
                    : event.tone === "error"
                      ? " isError"
                      : event.tone === "success"
                        ? " isSuccess"
                        : ""
              }`}
            >
              <div className="eventHeader">
                <strong>{event.title}</strong>
                <span>{event.time || "시간 미정"}</span>
              </div>
              <p>{event.description}</p>
              {event.meta.length > 0 ? (
                <div className="eventMetaRow">
                  {event.meta.map((meta) => (
                    <span key={`${event.key}-${meta}`} className="eventPill">
                      {meta}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

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
  allStudents,
  search,
  searchField,
  statusFilter,
  visaFilter,
  onSearchChange,
  onSearchFieldChange,
  onStatusFilterChange,
  onVisaFilterChange,
}) {
  const visaOptions = [...new Set(allStudents.map((student) => student.visaType))];
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

function AgencyUploadPage({
  onBack,
  onZipFileSelect,
  onSubmit,
  onOpenHistory,
  onOpenUploadedBatch,
  uploadFeedback,
  uploadForm,
  onUploadFormChange,
  selectedZipFile,
  schools,
}) {
  const isUploading = uploadFeedback.phase === "uploading";
  const hasUploadedBatch = Boolean(uploadFeedback.batch?.id);
  const missingSchool = !uploadForm.schoolId;
  const missingVisaType = !uploadForm.visaTypeCode;
  const canSubmit = Boolean(selectedZipFile) && !isUploading && !missingSchool && !missingVisaType;

  return (
    <>
      <PageHeader
        title="ZIP 업로드"
        description="접수 정보를 입력하고 스캔본 ZIP 파일을 업로드합니다."
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
          <h2>접수 정보</h2>
          <p>배치에 적용할 접수 일자, 대학교, 분류를 입력합니다.</p>
        </div>

        <div className="formGrid">
          <label className="field">
            <span>접수일</span>
            <input
              type="date"
              value={uploadForm.receiptDate}
              onChange={(e) => onUploadFormChange("receiptDate", e.target.value)}
            />
          </label>

          <label className="field">
            <span>대학교 <span style={{ color: "var(--color-error, #dc2626)" }}>*</span></span>
            <select
              value={uploadForm.schoolId}
              onChange={(e) => onUploadFormChange("schoolId", e.target.value)}
              style={missingSchool ? { borderColor: "var(--color-error, #dc2626)" } : undefined}
            >
              <option value="">학교 선택 (필수)</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>신청 타입 <span style={{ color: "var(--color-error, #dc2626)" }}>*</span></span>
            <select
              value={uploadForm.visaTypeCode}
              onChange={(e) => onUploadFormChange("visaTypeCode", e.target.value)}
              style={missingVisaType ? { borderColor: "var(--color-error, #dc2626)" } : undefined}
            >
              <option value="">신청 타입 선택 (필수)</option>
              {VISA_TYPE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>ZIP 파일</h2>
          <p>통합신청서를 기준으로 학생 구간을 분리하고, 각 학생 문서를 묶어 OCR 대상으로 전달합니다.</p>
        </div>

        <div
          className={`uploadDropzone${isUploading ? " isUploading" : selectedZipFile ? " hasFile" : ""}`}
        >
          {selectedZipFile ? (
            <div className="selectedFileInfo">
              <strong>{selectedZipFile.name}</strong>
              <span>{(selectedZipFile.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          ) : (
            <>
              <strong>ZIP 파일 선택</strong>
              <p>업로드할 스캔본 ZIP 파일을 선택합니다.</p>
            </>
          )}

          <label className="filePicker">
            <span className="secondaryButton">
              {selectedZipFile ? "다른 파일 선택" : "ZIP 파일 선택"}
            </span>
            <input
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={onZipFileSelect}
              disabled={isUploading}
            />
          </label>

          {!selectedZipFile ? (
            <span className="uploadHint">허용 형식: `.zip` 한 개씩 업로드.</span>
          ) : null}
        </div>

        <div className="uploadActions">
          <button
            type="button"
            className="primaryButton"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {isUploading ? "업로드 중..." : "업로드"}
          </button>
          {selectedZipFile && (missingSchool || missingVisaType) && (
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--color-error, #dc2626)" }}>
              {missingSchool && missingVisaType
                ? "대학교와 신청 타입을 선택해야 업로드할 수 있습니다."
                : missingSchool
                  ? "대학교를 선택해야 업로드할 수 있습니다."
                  : "신청 타입을 선택해야 업로드할 수 있습니다."}
            </p>
          )}
        </div>

        {uploadFeedback.phase !== "idle" ? (
          <div
            className={`uploadStatusCard ${
              uploadFeedback.phase === "success"
                ? "isSuccess"
                : uploadFeedback.phase === "error"
                  ? "isError"
                  : "isUploading"
            }`}
          >
            <div className="uploadStatusHeader">
              <strong>
                {uploadFeedback.phase === "uploading"
                  ? "업로드 요청 전송 중"
                  : uploadFeedback.phase === "success"
                    ? "업로드 접수 완료"
                    : "업로드 실패"}
              </strong>
              {uploadFeedback.fileName ? <span>{uploadFeedback.fileName}</span> : null}
            </div>

            <p>{uploadFeedback.message}</p>

            {uploadFeedback.phase === "success" && uploadFeedback.batch ? (
              <div className="uploadStatusMeta">
                <span>배치 ID {uploadFeedback.batch.id}</span>
                <span>처리 작업 {uploadFeedback.batch.processingJobId || "-"}</span>
                <span>상태 {uploadFeedback.batch.status}</span>
              </div>
            ) : null}

            {uploadFeedback.phase === "success" ? (
              <div className="uploadStatusActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onOpenHistory}
                >
                  업로드 내역 보기
                </button>
                <button
                  type="button"
                  className="primaryButton"
                  onClick={onOpenUploadedBatch}
                  disabled={!hasUploadedBatch}
                >
                  생성된 배치 보기
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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
                    <td data-label="학생 수">
                      {batch.studentCount == null ? "-" : `${batch.studentCount}명`}
                    </td>
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
        )}
      </section>
    </>
  );
}

function AgencyUploadHistoryDetailPage({ batch, onBack, ocrProgress }) {
  const timeline = buildBatchTimeline(batch);
  const events = buildBatchEvents(batch);
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
  const progressTotal = ocrProgress?.total || batch.processingFileCount || 0;
  const progressDone = ocrProgress?.processed || 0;
  const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;

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
            value: batch.studentCount == null ? "집계 전" : `${batch.studentCount}명`,
            hint: batch.processingJobId
              ? `처리 작업 ID ${batch.processingJobId}`
              : "분리된 학생 케이스 수",
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

      {isRunning && (
        <section className="surfaceCard">
          <div className="sectionHeading">
            <h2>OCR 처리 중</h2>
            <p>Azure Document Intelligence로 서류를 분석하고 있습니다.</p>
          </div>
          <div style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.875rem" }}>
              <span>{progressTotal > 0 ? `${progressDone} / ${progressTotal}개 파일 처리됨` : `${batch.processingFileCount || 0}개 파일 분석 대기 중`}</span>
              {progressTotal > 0 && <span>{progressPct}%</span>}
            </div>
            <div style={{ height: "8px", background: "var(--color-surface-2, #e5e7eb)", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: "4px",
                  background: "var(--color-primary, #2563eb)",
                  width: progressTotal > 0 ? `${progressPct}%` : "100%",
                  transition: "width 0.5s ease",
                  animation: progressTotal === 0 ? "pulse 1.5s ease-in-out infinite" : "none",
                }}
              />
            </div>
            {progressTotal === 0 && (
              <p style={{ marginTop: "8px", fontSize: "0.8rem", color: "var(--color-text-muted, #6b7280)" }}>
                진행 정보를 가져오는 중입니다. 3초마다 자동 갱신됩니다.
              </p>
            )}
          </div>
        </section>
      )}

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

      {batch.cases && batch.cases.length > 0 && (
        <section className="surfaceCard">
          <div className="sectionHeading">
            <h2>학생별 접수 결과</h2>
            <p>OCR 분석 결과 — 총 {batch.cases.length}명 · 각 학생의 제출 서류 현황을 확인합니다.</p>
          </div>
          <table className="dataTable">
            <thead>
              <tr>
                <th>학생명</th>
                <th>국적</th>
                <th>신청 타입</th>
                <th>제출</th>
                <th>누락</th>
                <th>서류 현황</th>
              </tr>
            </thead>
            <tbody>
              {batch.cases.map((c) => (
                <tr key={c.id}>
                  <td data-label="학생명">{c.studentName}</td>
                  <td data-label="국적">{c.nationality}</td>
                  <td data-label="신청 타입">{c.applicationType}</td>
                  <td data-label="제출">{c.submittedCount}건</td>
                  <td data-label="누락" style={{ color: c.missingCount > 0 ? "var(--color-warning, #d97706)" : "inherit" }}>
                    {c.missingCount > 0 ? `${c.missingCount}건 누락` : "완비"}
                  </td>
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
                            background: doc.status === "제출" ? "var(--color-success-soft, #d1fae5)" : "var(--color-warning-soft, #fef3c7)",
                            color: doc.status === "제출" ? "var(--color-success, #065f46)" : "var(--color-warning, #92400e)",
                          }}
                        >
                          {doc.name}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>스캔본 미리보기</h2>
          <p>OCR 처리 중 분류된 파일 목록입니다.</p>
        </div>

        {batch.previewFiles.length === 0 ? (
          <EmptyState
            title="미리보기 데이터가 아직 없습니다."
            description="OCR 결과와 스캔 미리보기는 배치 처리 완료 후 표시됩니다."
          />
        ) : (
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
        )}
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
  const [runtimeError, setRuntimeError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [studentApplications, setStudentApplications] = useState([]);
  const [schoolStudents, setSchoolStudents] = useState([]);
  const [agencyApplications, setAgencyApplications] = useState([]);
  const [agencyApplicationDetail, setAgencyApplicationDetail] = useState(null);
  const [agencyUploadBatches, setAgencyUploadBatches] = useState([]);
  const [agencyUploadBatchDetail, setAgencyUploadBatchDetail] = useState(null);
  const [studentApplicationId, setStudentApplicationId] = useState(null);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolSearchField, setSchoolSearchField] = useState("name");
  const [schoolStatusFilter, setSchoolStatusFilter] = useState(ALL_FILTER);
  const [schoolVisaFilter, setSchoolVisaFilter] = useState(ALL_FILTER);
  const [agencySearch, setAgencySearch] = useState("");
  const [agencySearchField, setAgencySearchField] = useState("studentName");
  const [agencyStatusFilter, setAgencyStatusFilter] = useState(ALL_FILTER);
  const [agencyApplicationId, setAgencyApplicationId] = useState(null);
  const [agencyPreviewId, setAgencyPreviewId] = useState(null);
  const [agencyBatchId, setAgencyBatchId] = useState(null);
  const [uploadFeedback, setUploadFeedback] = useState(EMPTY_UPLOAD_FEEDBACK);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM);
  const [selectedZipFile, setSelectedZipFile] = useState(null);
  const [schools, setSchools] = useState([]);
  const [ocrProgress, setOcrProgress] = useState(null);

  useEffect(() => {
    if (!session?.username || !session?.password) {
      return;
    }
    fetchSchools(session.username, session.password)
      .then(setSchools)
      .catch(() => {});
  }, [session?.username, session?.password]);

  const BATCH_TERMINAL_STATUSES = new Set([
    "COMPLETED",
    "RESULT_UPLOADED",
    "NEEDS_REVIEW",
    "FAILED",
    "CANCELED",
    "CANCELLED",
  ]);

  const pollingBatchIdRef = useRef(null);

  useEffect(() => {
    if (!agencyBatchId || !session?.username || !session?.password) {
      return;
    }

    const currentBatch =
      agencyUploadBatchDetail ??
      agencyUploadBatches.find((batch) => batch.id === agencyBatchId) ??
      null;

    const rawStatus = currentBatch?.uploadBatchStatusRaw ?? "";
    if (rawStatus && BATCH_TERMINAL_STATUSES.has(rawStatus.toUpperCase())) {
      return;
    }

    pollingBatchIdRef.current = agencyBatchId;

    const intervalId = setInterval(async () => {
      if (pollingBatchIdRef.current !== agencyBatchId) {
        clearInterval(intervalId);
        return;
      }

      try {
        const [detail, progress] = await Promise.all([
          fetchAgencyUploadBatchDetail(session.username, session.password, agencyBatchId),
          fetchOcrProgress(session.username, session.password, agencyBatchId).catch(() => null),
        ]);
        const fallback =
          agencyUploadBatchDetail?.id === agencyBatchId ? agencyUploadBatchDetail : null;
        const normalizedDetail = normalizeAgencyUploadBatch(detail, fallback ?? {});

        setAgencyUploadBatchDetail((current) =>
          current?.id === agencyBatchId ? normalizedDetail : current,
        );
        upsertAgencyUploadBatch(normalizedDetail);
        if (progress) setOcrProgress(progress);

        const updatedRawStatus = normalizedDetail.uploadBatchStatusRaw ?? "";
        if (updatedRawStatus && BATCH_TERMINAL_STATUSES.has(updatedRawStatus.toUpperCase())) {
          clearInterval(intervalId);
          setOcrProgress(null);
        }
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 재시도
      }
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyBatchId, session]);

  const selectedStudentApplication =
    studentApplications.find((application) => application.id === studentApplicationId) ??
    studentApplications[0] ??
    null;

  const filteredSchoolStudents = useMemo(() => {
    const query = schoolSearch.trim().toLowerCase();

    return schoolStudents.filter((student) => {
      const matchesSearch =
        !query ||
        String(student[schoolSearchField] ?? "")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        schoolStatusFilter === ALL_FILTER || student.status === schoolStatusFilter;
      const matchesVisa =
        schoolVisaFilter === ALL_FILTER || student.visaType === schoolVisaFilter;

      return matchesSearch && matchesStatus && matchesVisa;
    });
  }, [schoolStudents, schoolSearch, schoolSearchField, schoolStatusFilter, schoolVisaFilter]);

  const filteredAgencyApplications = useMemo(() => {
    const query = agencySearch.trim().toLowerCase();

    return agencyApplications.filter((application) => {
      const matchesSearch =
        !query ||
        String(application[agencySearchField] ?? "")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        agencyStatusFilter === ALL_FILTER || application.status === agencyStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [agencyApplications, agencySearch, agencySearchField, agencyStatusFilter]);

  const selectedAgencyApplication = agencyApplicationDetail;
  const selectedAgencyDocument =
    selectedAgencyApplication?.documents.find(
      (document) => document.code === agencyPreviewId,
    ) ??
    selectedAgencyApplication?.documents[0] ??
    null;

  const selectedAgencyBatch =
    agencyUploadBatchDetail ??
    agencyUploadBatches.find((batch) => batch.id === agencyBatchId) ??
    agencyUploadBatches[0] ??
    null;

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

  function resetRoleData() {
    setStudentApplications([]);
    setSchoolStudents([]);
    setAgencyApplications([]);
    setAgencyApplicationDetail(null);
    setAgencyUploadBatches([]);
    setAgencyUploadBatchDetail(null);
    setStudentApplicationId(null);
    setAgencyApplicationId(null);
    setAgencyPreviewId(null);
    setAgencyBatchId(null);
    setUploadFeedback(EMPTY_UPLOAD_FEEDBACK);
    setUploadForm({ ...EMPTY_UPLOAD_FORM, receiptDate: new Date().toISOString().split("T")[0] });
    setSelectedZipFile(null);
  }

  function upsertAgencyUploadBatch(batch) {
    setAgencyUploadBatches((current) => {
      const nextBatch = normalizeAgencyUploadBatch(batch);

      return [
        nextBatch,
        ...current.filter((currentBatch) => currentBatch.id !== nextBatch.id),
      ];
    });
  }

  async function openAgencyApplicationDetail(applicationId, nextSession = session) {
    if (!nextSession?.username || !nextSession?.password) {
      return;
    }

    setIsLoading(true);
    setRuntimeError("");

    try {
      const detail = await fetchAgencyApplicationDetail(
        nextSession.username,
        nextSession.password,
        applicationId,
      );

      setAgencyApplicationId(applicationId);
      setAgencyApplicationDetail(detail);
      setAgencyPreviewId(detail.documents[0]?.code ?? null);
      setPage("agency-detail");
    } catch (exception) {
      setRuntimeError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function openAgencyUploadBatchDetail(batchId, nextSession = session) {
    if (!nextSession?.username || !nextSession?.password) {
      return;
    }

    setIsLoading(true);
    setRuntimeError("");

    try {
      const currentBatch =
        agencyUploadBatches.find((batch) => batch.id === batchId) ??
        (uploadFeedback.batch?.id === batchId ? uploadFeedback.batch : null);
      const detail = await fetchAgencyUploadBatchDetail(
        nextSession.username,
        nextSession.password,
        batchId,
      );
      const normalizedDetail = normalizeAgencyUploadBatch(detail, currentBatch);

      setAgencyBatchId(batchId);
      setAgencyUploadBatchDetail(normalizedDetail);
      upsertAgencyUploadBatch(normalizedDetail);
      setPage("agency-upload-history-detail");
    } catch (exception) {
      setRuntimeError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleUploadFormChange(field, value) {
    setUploadForm((current) => ({ ...current, [field]: value }));
  }

  function handleZipFileSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setUploadFeedback({
        phase: "error",
        fileName: file.name,
        message: "ZIP 파일만 업로드할 수 있습니다.",
        batch: null,
      });
      return;
    }

    setSelectedZipFile(file);
    setUploadFeedback(EMPTY_UPLOAD_FEEDBACK);
  }

  function buildUploadNote(form) {
    const parts = [
      form.receiptDate && `접수일: ${form.receiptDate}`,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : null;
  }

  async function handleAgencyUploadSubmit() {
    if (!selectedZipFile) return;

    if (!session?.username || !session?.password) {
      setUploadFeedback({
        phase: "error",
        fileName: selectedZipFile.name,
        message: "유학원 계정 인증 정보가 없습니다. 다시 로그인해 주세요.",
        batch: null,
      });
      return;
    }

    const schoolId = uploadForm.schoolId.trim() || undefined;
    const visaTypeCode = uploadForm.visaTypeCode.trim() || undefined;
    const note = buildUploadNote(uploadForm) || undefined;

    setRuntimeError("");
    setUploadFeedback({
      phase: "uploading",
      fileName: selectedZipFile.name,
      message: "ZIP 파일을 업로드하고 배치를 생성하고 있습니다.",
      batch: null,
    });

    try {
      const createdBatch = normalizeAgencyUploadBatch(
        await uploadAgencyBatchFile(session.username, session.password, selectedZipFile, {
          schoolId,
          note,
          visaTypeCode,
        }),
        { fileName: selectedZipFile.name },
      );

      upsertAgencyUploadBatch(createdBatch);
      setAgencyBatchId(createdBatch.id);
      setAgencyUploadBatchDetail(createdBatch);
      setSelectedZipFile(null);
      setUploadFeedback({
        phase: "success",
        fileName: createdBatch.fileName || selectedZipFile.name,
        message: "업로드가 접수되었습니다. 생성된 배치를 업로드 이력에서 바로 확인할 수 있습니다.",
        batch: createdBatch,
      });
    } catch (exception) {
      setUploadFeedback({
        phase: "error",
        fileName: selectedZipFile.name,
        message: exception.message,
        batch: null,
      });
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setRuntimeError("");

    if (loginType === "student") {
      const hasEmptyField = Object.values(studentForm).some((value) => !value);
      if (hasEmptyField) {
        setError("학생 로그인 정보 3가지를 모두 입력해 주세요.");
        return;
      }
    }

    setIsLoading(true);

    try {
      resetRoleData();

      if (loginType === "student") {
        const result = await lookupStudentAccess(studentForm);

        setStudentApplications(result.applications);
        setStudentApplicationId(result.applications[0]?.id ?? null);
        setSession(buildSession("student", result.student));
        setPage("student-list");
        return;
      }

      const currentForm = orgForms[loginType];
      if (!currentForm.username || !currentForm.password) {
        setError(`${ROLE_LABELS[loginType]} 로그인 정보를 입력해 주세요.`);
        return;
      }

      await fetchMe(currentForm.username, currentForm.password);

      const nextSession = buildSession(loginType, currentForm);
      setSession(nextSession);

      if (loginType === "school") {
        const rows = await fetchSchoolStudents(currentForm.username, currentForm.password);
        setSchoolStudents(rows);
        setPage("school-list");
        return;
      }

      const [cases, batches] = await Promise.all([
        fetchAgencyApplications(currentForm.username, currentForm.password),
        fetchAgencyUploadBatches(currentForm.username, currentForm.password),
      ]);
      const normalizedBatches = Array.isArray(batches)
        ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
        : [];

      setAgencyApplications(cases);
      setAgencyApplicationId(cases[0]?.id ?? null);
      setAgencyUploadBatches(normalizedBatches);
      setAgencyBatchId(normalizedBatches[0]?.id ?? null);
      setPage("agency-dashboard");
    } catch (exception) {
      setError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    resetRoleData();
    setSession(null);
    setPage("login");
    setError("");
    setRuntimeError("");
  }

  function renderPage() {
    if (page === "student-list") {
      if (isLoading && studentApplications.length === 0) {
        return <LoadingState />;
      }

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
      if (!selectedStudentApplication) {
        return (
          <section className="surfaceCard">
            <LoadingState title="신청 건이 없습니다." description="학생 신청 데이터를 다시 확인해 주세요." />
          </section>
        );
      }

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
          allStudents={schoolStudents}
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
          onOpenDetail={openAgencyApplicationDetail}
          onOpenUpload={() => setPage("agency-upload")}
        />
      );
    }

    if (page === "agency-detail") {
      if (isLoading && !selectedAgencyApplication) {
        return <LoadingState />;
      }

      if (!selectedAgencyApplication || !selectedAgencyDocument) {
        return (
          <section className="surfaceCard">
            <LoadingState title="상세 데이터를 불러오지 못했습니다." description="대시보드에서 다시 선택해 주세요." />
          </section>
        );
      }

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
          onZipFileSelect={handleZipFileSelect}
          onSubmit={handleAgencyUploadSubmit}
          onOpenHistory={() => setPage("agency-upload-history")}
          onOpenUploadedBatch={() => {
            if (!uploadFeedback.batch?.id) {
              return;
            }

            setAgencyBatchId(uploadFeedback.batch.id);
            setAgencyUploadBatchDetail(uploadFeedback.batch);
            setPage("agency-upload-history-detail");
          }}
          uploadFeedback={uploadFeedback}
          uploadForm={uploadForm}
          onUploadFormChange={handleUploadFormChange}
          selectedZipFile={selectedZipFile}
          schools={schools}
        />
      );
    }

    if (page === "agency-upload-history") {
      return (
        <AgencyUploadHistoryPage
          batches={agencyUploadBatches}
          onOpenDetail={openAgencyUploadBatchDetail}
          onBack={() => setPage("agency-upload")}
        />
      );
    }

    if (isLoading && !selectedAgencyBatch) {
      return <LoadingState />;
    }

    if (!selectedAgencyBatch) {
      return (
        <section className="surfaceCard">
          <LoadingState title="업로드 배치가 없습니다." description="업로드 이력 데이터를 다시 확인해 주세요." />
        </section>
      );
    }

    return (
      <AgencyUploadHistoryDetailPage
        batch={selectedAgencyBatch}
        onBack={() => setPage("agency-upload-history")}
        ocrProgress={ocrProgress}
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
        error={isLoading ? "로그인 정보를 확인하는 중입니다." : error}
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
      {runtimeError ? <div className="errorBox">{runtimeError}</div> : null}
      {renderPage()}
    </AppShell>
  );
}
