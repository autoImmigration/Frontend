import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  homePathForRole,
  matchRoute,
  pageAllowedForRole,
  pathForPage,
} from "./routes.js";
import {
  loginDefaults,
  nationalityOptions,
  uploadFlowSteps,
  zipRules,
} from "./mockData.js";
import {
  downloadBatchFiles,
  downloadGroupPayment,
  downloadOcrResults,
  excludeAgencyCase,
  includeAgencyCase,
  fetchAgencyApplicationDetail,
  fetchAgencyApplications,
  fetchAgencyUploadBatchDetail,
  fetchAgencyUploadBatches,
  fetchAuthedBlob,
  fetchCaseActivities,
  fetchMe,
  fetchOcrProgress,
  fetchSchoolStudents,
  fetchSchools,
  bulkAssignDocumentFiles,
  moveDocumentScan,
  login,
  logout,
  lookupStudentAccess,
  refreshAccessToken,
  reprocessBatch,
  renameUploadBatchDocument,
  requestSupplement,
  setOnAuthExpired,
  updateCaseStatus,
  updateStudentProfile,
  updateDocumentNote,
  updateStudentInfo,
  uploadAgencyBatchFile,
  uploadStudentSupplement,
  uploadSupplementDocument,
} from "./api.js";
import { getRefreshToken } from "./auth/tokenStore.js";
import { formatStudentName, formatAlienRegistrationNumber } from "./lib/studentFormat.js";
import { useUrlPagination, useUrlReset, useUrlState } from "./lib/useUrlState.js";

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
  반려: "status statusError",
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
    { page: "agency-student-list", label: "학생 목록" },
    { page: "agency-supplement-list", label: "보완 접수" },
    { page: "agency-file-list", label: "파일 목록" },
    { page: "agency-upload", label: "ZIP 업로드" },
    { page: "agency-upload-history", label: "업로드 내역" },
    { page: "agency-download", label: "다운로드" },
  ],
};

/** 페이지 id → 사람이 읽는 화면 이름. "돌아가기" 버튼 문구를 출발지에 맞추는 데 쓴다. */
const PAGE_LABELS = Object.fromEntries(
  Object.values(NAV_ITEMS).flat().map((item) => [item.page, item.label]),
);

export function pageLabel(page, fallback = "목록") {
  return PAGE_LABELS[page] ?? fallback;
}

const SCHOOL_SEARCH_OPTIONS = [
  { value: "name", label: "학생명" },
  { value: "nationality", label: "국적" },
  { value: "agencyName", label: "유학원명" },
];

const AGENCY_SEARCH_OPTIONS = [
  { value: "applicationType", label: "신청 유형" },
  { value: "visaType", label: "비자 타입" },
  { value: "schoolName", label: "학교명" },
  { value: "coordinator", label: "담당자" },
  { value: "studentName", label: "학생명" },
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
  EXTRACTING: "텍스트 추출 중",
  VALIDATING: "검증 중",
  COMPLETED: "완료",
  SUCCESS: "완료",
  SUCCEEDED: "완료",
  PARTIAL_SUCCESS: "부분 완료",
  NEEDS_REVIEW: "보완",
  REJECTED: "반려",
  FAILED: "실패",
  ERROR: "실패",
  CANCELED: "중단",
  CANCELLED: "중단",
  RESULT_UPLOADED: "완료",
};

function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}

/** 상세 화면들 — 사이드바에 자기 항목이 없어서, 어느 메뉴를 강조할지 정해줘야 한다. */
const DETAIL_PAGES = new Set([
  "student-detail",
  "agency-detail",
  "agency-upload-history-detail",
  "agency-batch-case-detail",
]);

/**
 * 상세 화면에서 강조할 사이드바 메뉴.
 *
 * 출발한 메뉴(originPage)가 있으면 그걸 쓴다 — 보완 접수에서 케이스로 들어갔는데
 * 업로드 내역이 강조되면 자기가 어디 있는지 알 수 없다. 출발지를 모를 때만(딥링크·
 * 새로고침) 아래 기본값으로 떨어진다.
 */
function pageToActiveKey(page, originPage = null) {
  if (DETAIL_PAGES.has(page) && originPage && PAGE_LABELS[originPage]) {
    return originPage;
  }

  if (page === "student-detail") {
    return "student-list";
  }

  if (page === "agency-detail") {
    // 케이스 상세는 학생 목록에서만 열린다 (대시보드의 '케이스 보기'는 배치 상세로 간다)
    return "agency-student-list";
  }

  if (page === "agency-upload-history-detail") {
    return "agency-upload-history";
  }

  if (page === "agency-batch-case-detail") {
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
      passportNumber: payload.passportNumber ?? "",
      birthDate: payload.birthDate ? String(payload.birthDate) : "",
      nationality: payload.nationality ?? "",
      // 내 정보 카드 표시/수정용 — 프로필 응답에서 전달
      name: payload.name ?? "",
      schoolName: payload.schoolName ?? "",
      phoneNumber: payload.phoneNumber ?? "",
      address: payload.address ?? "",
      alienRegistrationNumber: payload.alienRegistrationNumber ?? "",
    };
  }

  return {
    role,
    title: `${ROLE_LABELS[role]} 운영 계정`,
    subtitle: payload.displayName || payload.username,
    username: payload.username,
    displayName: payload.displayName || payload.username,
    backendRole: payload.backendRole || "",
    isAuthenticated: true,
  };
}

// 백엔드 role(ROLE_SCHOOL_ADMIN / ROLE_AGENCY_ADMIN / ROLE_SYSTEM_ADMIN)을
// 프론트 화면(school / agency)으로 매핑. SYSTEM_ADMIN은 전체 운영 화면(agency)으로.
function viewForBackendRole(backendRole) {
  const normalized = String(backendRole ?? "").toUpperCase();
  if (normalized.includes("SCHOOL")) {
    return "school";
  }
  return "agency";
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
  return ["COMPLETED", "NEEDS_REVIEW", "FAILED", "RESULT_UPLOADED", "REJECTED"].includes(status);
}

function deriveUploadBatchDisplayStatus(batch) {
  const raw = (batch.uploadBatchStatusRaw ?? "").toUpperCase();
  const jobRaw = (batch.processingJobStatusRaw ?? "").toUpperCase();

  if (raw === "FAILED" || jobRaw === "FAILED") return "실패";
  if (raw === "REJECTED") return "반려";
  if (raw === "NEEDS_REVIEW" || jobRaw === "PARTIAL_SUCCESS") return "보완";
  if (raw === "COMPLETED" || raw === "RESULT_UPLOADED" || jobRaw === "SUCCEEDED") return "완료";
  return batch.status;
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
    // 화면에 보여줄 배치 이름 — "D4연장 · 2026-07-11 14:02". 백엔드가 안 주면 파일명으로 폴백.
    displayName:
      mergedBatch.displayName ??
      fallback.displayName ??
      mergedBatch.fileName ??
      fallback.fileName ??
      "",
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

const ACTIVE_PROCESSING_STATUSES = new Set(["처리 중", "대기", "텍스트 추출 중", "검증 중"]);

function StatusBadge({ value }) {
  const isActive = ACTIVE_PROCESSING_STATUSES.has(value);
  return (
    <span className={`${STATUS_CLASS_MAP[value] ?? "status"}${isActive ? " isProcessing" : ""}`}>
      {isActive && <span className="processingDot" aria-hidden="true" />}
      {value}
    </span>
  );
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

function usePagination(items, pageSize, resetKey) {
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey, items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { currentPage: safePage, setCurrentPage, totalPages, paginatedItems, totalItems: items.length };
}

function PaginationNav({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const delta = 2;
  const left = Math.max(1, currentPage - delta);
  const right = Math.min(totalPages, currentPage + delta);
  const pageNumbers = [];
  for (let i = left; i <= right; i++) pageNumbers.push(i);

  return (
    <div className="paginationNav" role="navigation" aria-label="페이지 내비게이션">
      <button
        type="button"
        className="pageBtn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="이전 페이지"
      >
        ‹
      </button>

      {left > 1 && (
        <>
          <button type="button" className="pageBtn" onClick={() => onPageChange(1)}>1</button>
          {left > 2 && <span className="pageDots">…</span>}
        </>
      )}

      {pageNumbers.map((p) => (
        <button
          key={p}
          type="button"
          className={`pageBtn${p === currentPage ? " isActive" : ""}`}
          onClick={() => onPageChange(p)}
          aria-current={p === currentPage ? "page" : undefined}
        >
          {p}
        </button>
      ))}

      {right < totalPages && (
        <>
          {right < totalPages - 1 && <span className="pageDots">…</span>}
          <button type="button" className="pageBtn" onClick={() => onPageChange(totalPages)}>
            {totalPages}
          </button>
        </>
      )}

      <button
        type="button"
        className="pageBtn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="다음 페이지"
      >
        ›
      </button>
    </div>
  );
}

// 국적 선택 콤보박스 — 클릭하면 전체 목록, 타이핑하면 필터. (네이티브 datalist는
// 값이 미리 채워져 있으면 목록을 안 펼쳐주는 브라우저 동작 때문에 커스텀으로 대체)
function NationalityCombobox({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const query = (value ?? "").trim().toLowerCase();
  const isExactOption = options.some((option) => option.toLowerCase() === query);
  // 이미 선택된 값과 정확히 같으면 전체 목록을 보여줘 다른 국가로 바꾸기 쉽게 한다
  const filtered = !query || isExactOption
    ? options
    : options.filter((option) => option.toLowerCase().includes(query));
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="국적 검색 또는 선택 (예: 베트남)"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30,
          margin: "4px 0 0", padding: 4, listStyle: "none",
          background: "#fff", border: "1px solid var(--line,#e5e7eb)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map((option) => (
            <li key={option}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { onChange(option); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "7px 10px",
                  border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14,
                  background: value === option ? "var(--primary-tint,#eff6ff)" : "transparent",
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
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
                {/* 목록 밖 표기(영문명/ISO코드)를 직접 입력해도 서버 정규화로 매칭됨 */}
                <NationalityCombobox
                  value={studentForm.nationality}
                  onChange={(value) => onStudentFieldChange("nationality", value)}
                  options={nationalityOptions}
                />
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

function LoginErrorModal({ message, onClose }) {
  if (!message) return null;
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="loginErrorTitle"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--color-surface, #ffffff)",
          borderRadius: 12,
          padding: "1.5rem 1.5rem 1.25rem",
          maxWidth: 360,
          width: "100%",
          boxShadow: "0 20px 50px rgba(15,23,42,0.25)",
        }}
      >
        <h2 id="loginErrorTitle" style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
          로그인 실패
        </h2>
        <p
          style={{
            margin: "0 0 1.25rem",
            color: "var(--color-text-muted, #475569)",
            fontSize: "0.92rem",
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
        <button type="button" className="primaryButton" style={{ width: "100%" }} onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  );
}

function AppBar({ session, currentSection, onLogout }) {
  return (
    <header className="appBar">
      <div className="appBarLogo">
        <span>✦</span>
        <span>비자자동화</span>
      </div>
      <div className="appBarSection">{currentSection}</div>
      <div className="appBarRight">
        <span className="appBarRoleChip">{ROLE_LABELS[session.role]}</span>
        <span className="appBarUser">{session.subtitle}</span>
        <button
          type="button"
          className="secondaryButton"
          style={{ minHeight: 32, padding: "0 12px", fontSize: 13 }}
          onClick={onLogout}
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}

function AppShell({ session, page, originPage = null, onNavigate, onLogout, navBadges = {}, children }) {
  const activeKey = pageToActiveKey(page, originPage);
  const currentNav = NAV_ITEMS[session.role].find((item) => item.page === activeKey);

  return (
    <div className="appLayout">
      <AppBar
        session={session}
        currentSection={currentNav?.label ?? ""}
        onLogout={onLogout}
      />
      <div className="workspaceShell">
        <aside className="sidebar">
          <nav className="sidebarNav">
            {NAV_ITEMS[session.role].map((item) => (
              <button
                key={item.page}
                type="button"
                className={`sidebarLink${activeKey === item.page ? " isActive" : ""}`}
                onClick={() => onNavigate(item.page)}
              >
                {item.label}
                {navBadges[item.page] ? (
                  <span className="navBadge">{navBadges[item.page]}</span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <section className="contentArea">
          <div className="pageStack">{children}</div>
        </section>
      </div>
    </div>
  );
}

// ─── 추가 추출 정보 상세보기 모달 ────────────────────────────────────────────
// 백엔드 extraInfo(StudentExtraInfo) 를 그대로 받아 학사/발급일/은행/부동산/출석/ARC 를 보여준다.
// 값이 없는 필드는 "—". 두 상세 페이지(유학원 상세 / 배치 케이스 상세)에서 공용으로 재사용.

function formatExtraDate(value) {
  if (!value) return "—";
  // 서버에서 ISO(YYYY-MM-DD) 로 직렬화됨. 운영 화면 표기(YYYY.MM.DD)로 변환.
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : String(value);
}

function formatExtraNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isNaN(num) ? String(value) : num;
}

function formatExtraAmount(amount, currency) {
  const num = formatExtraNumber(amount);
  if (num === null) return "—";
  const formatted = typeof num === "number" ? num.toLocaleString("ko-KR") : num;
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatExtraGpa(value, scale) {
  const num = formatExtraNumber(value);
  if (num === null) return "—";
  return scale ? `${num} / ${scale}` : String(num);
}

function formatExtraRate(value) {
  const num = formatExtraNumber(value);
  if (num === null) return "—";
  return `${num}%`;
}

function formatExtraText(value) {
  if (value === null || value === undefined || value === "" || value === "UNKNOWN") return "—";
  return String(value);
}

function formatExtraCount(value, suffix) {
  const num = formatExtraNumber(value);
  if (num === null) return "—";
  return suffix ? `${num}${suffix}` : String(num);
}

function ExtraInfoSection({ title, rows }) {
  // 모든 값이 비어있는 섹션은 헤더만 흐리게, 값은 "—"로 노출(레이아웃 일관성 유지).
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted,#9ca3af)", letterSpacing: "0.08em" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: "var(--text-secondary,#6b7280)", flexShrink: 0 }}>{label}</span>
            <span style={{ textAlign: "right", wordBreak: "break-all", fontVariantNumeric: "tabular-nums" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentExtraInfoModal({ extraInfo, studentName, onClose }) {
  const info = extraInfo ?? {};
  const hasAny = extraInfo && Object.values(extraInfo).some((v) => v !== null && v !== undefined && v !== "");

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 14, padding: 28, width: "min(560px, 95vw)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>추가 추출 정보</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted,#9ca3af)", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-muted,#6b7280)" }}>
          {studentName ? `${formatStudentName(studentName)} · ` : ""}OCR 부가 추출 정보
        </p>

        {!hasAny ? (
          <p style={{ fontSize: 13, color: "var(--text-muted,#9ca3af)", margin: "8px 0" }}>추출된 부가 정보가 없습니다.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <ExtraInfoSection
              title="학사"
              rows={[
                ["직전 학기 성적", formatExtraGpa(info.prevSemesterGpa, info.gpaScale)],
                ["누적 성적", formatExtraGpa(info.cumulativeGpa, info.gpaScale)],
                ["학기 수", formatExtraCount(info.semesterCount, "학기")],
                ["졸업 예정일", formatExtraDate(info.expectedGraduationDate)],
              ]}
            />
            <ExtraInfoSection
              title="증명서 발급일"
              rows={[
                ["재학증명서", formatExtraDate(info.enrollmentIssuedDate)],
                ["출석증명서", formatExtraDate(info.attendanceIssuedDate)],
                ["성적증명서", formatExtraDate(info.transcriptIssuedDate)],
              ]}
            />
            <ExtraInfoSection
              title="은행 잔고"
              rows={[
                ["잔고 금액", formatExtraAmount(info.bankBalanceAmount, info.bankBalanceCurrency)],
                ["발급일", formatExtraDate(info.bankBalanceIssuedDate)],
                ["예금주", formatExtraText(info.bankAccountHolder)],
              ]}
            />
            <ExtraInfoSection
              title="부동산 계약"
              rows={[
                ["계약 시작일", formatExtraDate(info.leaseStartDate)],
                ["계약 종료일", formatExtraDate(info.leaseEndDate)],
                ["임차인", formatExtraText(info.lesseeName)],
              ]}
            />
            <ExtraInfoSection
              title="출석"
              rows={[["출석률", formatExtraRate(info.attendanceRate)]]}
            />
            <ExtraInfoSection
              title="외국인등록증"
              rows={[["뒷면 주소", formatExtraText(info.arcBackAddress)]]}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <button type="button" className="secondaryButton" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function StudentListPage({ applications, onOpenDetail, session, onSaveProfile }) {
  // 내 정보 수정 — 연락처류(전화번호·주소·외국인등록번호)만. 신원 필드는 로그인 키라 읽기 전용.
  const [profileForm, setProfileForm] = useState({
    phoneNumber: session?.phoneNumber ?? "",
    address: session?.address ?? "",
    alienRegistrationNumber: session?.alienRegistrationNumber ?? "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  async function handleProfileSave() {
    if (profileSaving || !onSaveProfile) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await onSaveProfile(profileForm);
      setProfileMsg({ type: "ok", text: "저장되었습니다." });
    } catch (err) {
      setProfileMsg({ type: "err", text: err.message });
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="신청 현황"
        description="학생 본인이 제출한 신청 건과 현재 상태를 확인합니다."
      />

      {session && (
        <section className="surfaceCard">
          <div className="sectionHeading">
            <h2>내 정보</h2>
            <p>전화번호·주소·외국인등록번호는 직접 수정할 수 있습니다. 이름·국적·여권번호·생년월일 변경은 유학원에 문의하세요.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14, fontSize: 13 }}>
            {[
              ["이름", formatStudentName(session.name)],
              ["국적", session.nationality],
              ["여권번호", session.passportNumber],
              ["생년월일", session.birthDate],
              ["학교", session.schoolName],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "var(--text-muted,#9ca3af)", marginBottom: 2 }}>{label}</div>
                <div>{value || "—"}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "end" }}>
            {[
              ["전화번호", "phoneNumber", "010-0000-0000"],
              ["주소", "address", "현재 거주지 주소"],
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
            <div>
              <button type="button" className="primaryButton" onClick={handleProfileSave} disabled={profileSaving}>
                {profileSaving ? "저장 중..." : "내 정보 저장"}
              </button>
            </div>
          </div>
          {profileMsg && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: profileMsg.type === "ok" ? "var(--color-success,#059669)" : "var(--color-error,#dc2626)" }}>
              {profileMsg.type === "ok" ? "✓ " : "⚠ "}{profileMsg.text}
            </p>
          )}
        </section>
      )}

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>내 신청 건</h2>
          <p>본인 명의로 접수된 신청 건과 현재 처리 상태입니다. 상세 보기에서 보완 서류를 업로드할 수 있습니다.</p>
        </div>

        {applications.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted,#9ca3af)", margin: 0 }}>
            표시할 신청 건이 없습니다.
          </p>
        ) : (
        <div className="tableWrap">
          <table className="dataTable stackedTable">
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
    </>
  );
}

function StudentDetailPage({ application, session, onBack, onRefreshApplications }) {
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

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

  return (
    <>
      <PageHeader
        breadcrumb="학생 / 신청 상세"
        title={`${application.applicationType} · ${application.visaType}${application.lane ? ` · ${application.lane}` : ""}`}
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

      {application.supplementMessage && (
        <section className="surfaceCard" style={{ borderLeft: "3px solid var(--primary,#2563eb)", padding: "12px 16px", background: "var(--primary-tint,#eff6ff)" }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>📢 유학원 안내</strong> — {application.supplementMessage}
          </p>
        </section>
      )}

      {(uploadError || uploadSuccess) && (
        <section className="surfaceCard" style={{ borderLeft: `3px solid ${uploadSuccess ? "var(--color-success,#059669)" : "var(--color-error,#dc2626)"}`, padding: "12px 16px" }}>
          <p style={{ margin: 0, fontSize: 14, color: uploadSuccess ? "var(--color-success,#059669)" : "var(--color-error,#dc2626)" }}>
            {uploadSuccess || uploadError}
          </p>
        </section>
      )}

      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>서류 목록</h2>
          {application.documents.some((d) => d.status === "미제출") && (
            <p style={{ color: "var(--color-warning,#d97706)" }}>미제출 서류가 있습니다. 아래에서 직접 업로드할 수 있습니다.</p>
          )}
        </div>
        <div className="tableWrap">
          <table className="dataTable stackedTable">
            <thead>
              <tr>
                <th>문서명</th>
                <th>분류</th>
                <th>제출 상태</th>
                <th>마지막 업로드</th>
                <th>업로드</th>
              </tr>
            </thead>
            <tbody>
              {application.documents.map((document) => (
                <tr key={document.code} style={{ background: document.status === "미제출" ? "var(--color-warning-soft,#fef3c7)" : undefined }}>
                  <td data-label="문서명">
                    <strong>{document.name}</strong>
                    {document.note && (
                      <span style={{ display: "block", fontSize: 12, color: "var(--color-error,#dc2626)", marginTop: 2 }}>
                        {document.note}
                      </span>
                    )}
                  </td>
                  <td data-label="분류">{document.category}</td>
                  <td data-label="상태">
                    <StatusBadge value={document.status} />
                  </td>
                  <td data-label="마지막 업로드">{document.submittedAt && document.submittedAt !== "-" ? document.submittedAt : "-"}</td>
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
                        <span
                          className={document.status === "미제출" ? "primaryButton" : "secondaryButton"}
                          style={{ fontSize: "0.8rem", padding: "4px 12px", display: "inline-block" }}
                        >
                          {uploadingDoc === document.code ? "업로드 중..." : (document.status === "미제출" ? "파일 업로드" : "다시 업로드")}
                        </span>
                      </label>
                    ) : "-"}
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

function AgencyDashboardPage({ batches, onOpenDetail, onOpenUpload, onOpenDownload }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return batches;
    const q = search.trim().toLowerCase();
    return batches.filter(
      (b) =>
        b.fileName?.toLowerCase().includes(q) ||
        b.schoolName?.toLowerCase().includes(q) ||
        b.note?.toLowerCase().includes(q),
    );
  }, [batches, search]);

  const { currentPage, setCurrentPage, totalPages, paginatedItems: pagedBatches } = usePagination(filtered, 10, search);
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
              단체수납표 추출
            </button>
          </>
        }
      />

      <SummaryStrip
        variant="agencySummary"
        items={[
          { label: "전체 케이스", value: `${batches.length}건`, hint: "등록된 ZIP 업로드 수", tone: "tonePrimary" },
          { label: "검토 필요", value: `${reviewCount}건`, hint: "처리 완료, 보완·검토 대기", tone: "toneWarning" },
          { label: "완료", value: `${doneCount}건`, hint: "전원 검토 통과", tone: "toneSuccess" },
          ...(failedCount > 0 ? [{ label: "실패", value: `${failedCount}건`, hint: "처리 실패·반려", tone: "toneNeutral" }] : []),
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
          <EmptyState title="케이스가 없습니다." description="ZIP 파일을 업로드하면 케이스가 생성됩니다." />
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
                    <td data-label="학교명">{batch.schoolName ?? "—"}</td>
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

function AgencySupplementPage({ applications, onOpenDetail }) {
  const supplementCases = applications.filter((a) => a.missingCount > 0);
  const totalMissing = supplementCases.reduce((s, a) => s + a.missingCount, 0);
  const completionRate =
    applications.length > 0
      ? Math.round(((applications.length - supplementCases.length) / applications.length) * 100)
      : null;

  return (
    <>
      <PageHeader
        title="보완 알림"
        description="서류가 미제출되었거나 확인이 필요한 케이스 목록입니다."
      />
      <SummaryStrip
        items={[
          {
            label: "보완 필요 케이스",
            value: `${supplementCases.length}건`,
            hint: "미제출 서류가 있는 케이스",
            tone: "toneWarning",
          },
          {
            label: "누락 서류 합계",
            value: `${totalMissing}건`,
            hint: "전체 미제출 서류 수",
            tone: "toneNeutral",
          },
          {
            label: "전체 케이스",
            value: `${applications.length}건`,
            hint: "등록된 전체 케이스",
            tone: "tonePrimarySoft",
          },
          {
            label: "완료 비율",
            value: completionRate !== null ? `${completionRate}%` : "—",
            hint: "서류 누락 없는 케이스",
            tone: "toneSuccess",
          },
        ]}
      />
      <section className="surfaceCard">
        <SectionMeta
          count={`보완 필요 ${supplementCases.length}건`}
          helper="미제출 서류가 있는 케이스를 표시합니다."
        />
        {supplementCases.length === 0 ? (
          <EmptyState
            title="보완이 필요한 케이스가 없습니다."
            description="모든 케이스의 서류가 정상적으로 제출되었습니다."
          />
        ) : (
          <div className="tableWrap">
            <table className="dataTable stackedTable">
              <thead>
                <tr>
                  <th>학생명</th>
                  <th>학교명</th>
                  <th>비자 타입</th>
                  <th>신청 유형</th>
                  <th>상태</th>
                  <th>미제출 서류</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {supplementCases.map((application) => (
                  <tr key={application.id}>
                    <td data-label="학생명">{application.studentName}</td>
                    <td data-label="학교명">{application.schoolName}</td>
                    <td data-label="비자 타입">{application.visaType}</td>
                    <td data-label="신청 유형">{application.applicationType}</td>
                    <td data-label="상태">
                      <StatusBadge value={application.status} />
                    </td>
                    <td data-label="미제출 서류">{application.missingCount}건</td>
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

function AgencyDownloadPage({ session, schools, batches }) {
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [isGroupExporting, setIsGroupExporting] = useState(false);
  const [isOcrExporting, setIsOcrExporting] = useState(false);

  async function handleGroupPaymentExport() {
    if (isGroupExporting) return;
    setIsGroupExporting(true);
    try {
      await downloadGroupPayment(selectedSchool || undefined);
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`);
    } finally {
      setIsGroupExporting(false);
    }
  }

  async function handleOcrExport() {
    if (isOcrExporting) return;
    setIsOcrExporting(true);
    try {
      await downloadOcrResults(selectedBatch || undefined);
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`);
    } finally {
      setIsOcrExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="다운로드"
        description="단체수납표 및 OCR 결과를 일괄 추출합니다."
      />
      <div className="downloadPageGrid">
        <section className="surfaceCard">
          <div className="sectionHeading">
            <h2>단체수납표 추출</h2>
            <p>학교별 신청 케이스를 단체수납표 형식으로 내보냅니다.</p>
          </div>
          <div className="downloadFormStack">
            <label className="field">
              <span>학교 선택</span>
              <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}>
                <option value="">전체 학교</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="primaryButton"
                onClick={handleGroupPaymentExport}
                disabled={isGroupExporting}
              >
                {isGroupExporting ? "추출 중..." : "CSV 내보내기"}
              </button>
            </div>
          </div>
        </section>

        <section className="surfaceCard">
          <div className="sectionHeading">
            <h2>OCR 결과 내보내기</h2>
            <p>배치별 문서 분류 및 OCR 처리 결과를 CSV로 내보냅니다.</p>
          </div>
          <div className="downloadFormStack">
            <label className="field">
              <span>배치 선택</span>
              <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
                <option value="">전체 배치</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.displayName || batch.fileName}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="primaryButton"
                onClick={handleOcrExport}
                disabled={isOcrExporting}
              >
                {isOcrExporting ? "추출 중..." : "CSV 내보내기"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

const CASE_STATUS_OPTIONS = [
  { key: "DRAFT", label: "임시" },
  { key: "SUBMITTED", label: "접수" },
  { key: "RECEIVED", label: "접수 확인" },
  { key: "NEEDS_REVIEW", label: "검수 필요" },
  { key: "NEEDS_SUPPLEMENT", label: "보완" },
  { key: "COMPLETED", label: "완료" },
  { key: "REJECTED", label: "반려" },
];

function AgencyDetailPage({ application, selectedDocument, onSelectDocument, onBack, backLabel = "목록", session, onStatusChange, onNoteChange }) {
  const [selectedStatusKey, setSelectedStatusKey] = useState(application.statusKey ?? CASE_STATUS_OPTIONS[0].key);
  const [statusChanging, setStatusChanging] = useState(false);
  const [noteText, setNoteText] = useState(selectedDocument.note ?? "");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showExtraInfo, setShowExtraInfo] = useState(false);

  // 이미지 보기 — 업로드 내역 학생 상세와 동일: 클릭 → 모달, 휠 줌, 드래그 이동
  const [zoomedImage, setZoomedImage] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const zoomDrag = useRef(null);

  function openZoom(filename) {
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
    setZoomedImage(filename);
  }

  // 한 양식에 스캔이 여러 장일 수 있다(1:N). 레거시 단일 sourceFilename 도 1장으로 취급.
  const docFiles = selectedDocument.sourceFilenames?.length
    ? selectedDocument.sourceFilenames
    : (selectedDocument.sourceFilename ? [selectedDocument.sourceFilename] : []);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  useEffect(() => { setActiveFileIndex(0); }, [selectedDocument.code]);
  const safeFileIndex = Math.min(activeFileIndex, Math.max(docFiles.length - 1, 0));
  const imageFilename = docFiles[safeFileIndex] ?? null;

  // Sync note textarea when selected document changes
  useEffect(() => {
    setNoteText(selectedDocument.note ?? "");
  }, [selectedDocument.code, selectedDocument.note]);

  const timelineEntries = useMemo(() => {
    const entries = [];
    if (application.applicationDate) {
      entries.push({
        date: application.applicationDate,
        action: "케이스 생성",
        detail: `${application.applicationType} · ${application.visaType}`,
        type: "system",
      });
    }
    // Group documents by submittedAt date
    const byDate = new Map();
    application.documents
      .filter((d) => d.submittedAt)
      .forEach((d) => {
        if (!byDate.has(d.submittedAt)) byDate.set(d.submittedAt, []);
        byDate.get(d.submittedAt).push(d.name);
      });
    byDate.forEach((names, date) => {
      entries.push({
        date,
        action: names.length === 1 ? "서류 업로드" : `서류 업로드 ${names.length}건`,
        detail: names.slice(0, 2).join(", ") + (names.length > 2 ? ` 외 ${names.length - 2}건` : ""),
        type: "upload",
      });
    });
    if (application.status && application.status !== "접수대기") {
      entries.push({
        date: application.applicationDate ?? "",
        action: `상태 변경 · ${application.status}`,
        detail: "",
        type: "status",
      });
    }
    return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [application]);

  async function handleStatusChange() {
    if (statusChanging) return;
    setStatusChanging(true);
    try {
      const result = await updateCaseStatus(application.id, selectedStatusKey);
      if (onStatusChange) onStatusChange(result);
    } catch (err) {
      alert(`상태 변경 실패: ${err.message}`);
    } finally {
      setStatusChanging(false);
    }
  }

  async function handleNoteSave() {
    if (noteSaving) return;
    setNoteSaving(true);
    try {
      await updateDocumentNote(application.id, selectedDocument.code, noteText);
      if (onNoteChange) onNoteChange(selectedDocument.code, noteText);
    } catch (err) {
      alert(err.message);
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={`유학원 / ${backLabel} / 신청 상세`}
        title={`${formatStudentName(application.studentName)} · ${application.visaType}`}
        description={`${application.schoolName} · ${application.applicationType} · 담당 ${application.coordinator} · 최근 제출일 ${selectedDocument.submittedAt || "—"}`}
        actions={
          <button type="button" className="secondaryButton" onClick={onBack}>
            ← {backLabel}(으)로 돌아가기
          </button>
        }
      />

      {/* 확대 모달 — 업로드 내역 학생 상세와 동일: 휠 줌, 드래그 이동, 더블클릭 리셋 */}
      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)}
          onWheel={(e) => setZoomScale((s) => Math.min(8, Math.max(1, s - e.deltaY * 0.0015)))}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out", overflow: "hidden" }}>
          <button type="button" onClick={() => setZoomedImage(null)}
            style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#fff", fontSize: "1.8rem", cursor: "pointer", lineHeight: 1, zIndex: 1 }}>✕</button>
          <div style={{ position: "absolute", top: 18, left: 20, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
            휠: 확대/축소 · 드래그: 이동 · 더블클릭: 원래대로 · {Math.round(zoomScale * 100)}%
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => { zoomDrag.current = { x: e.clientX - zoomOffset.x, y: e.clientY - zoomOffset.y }; }}
            onMouseMove={(e) => { if (zoomDrag.current) setZoomOffset({ x: e.clientX - zoomDrag.current.x, y: e.clientY - zoomDrag.current.y }); }}
            onMouseUp={() => { zoomDrag.current = null; }}
            onMouseLeave={() => { zoomDrag.current = null; }}
            onDoubleClick={() => { setZoomScale(1); setZoomOffset({ x: 0, y: 0 }); }}
            style={{
              maxWidth: "94vw", maxHeight: "92vh",
              cursor: zoomScale > 1 ? "grab" : "default",
              transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
              transition: zoomDrag.current ? "none" : "transform 0.08s ease-out",
            }}>
            <AuthenticatedImage batchId={application.intakeBatch} filename={zoomedImage}
              imgStyle={{ maxWidth: "94vw", maxHeight: "92vh", objectFit: "contain", display: "block", pointerEvents: "none" }} />
          </div>
        </div>
      )}

      <div className="agencyDetailThreeSplit">
        {/* LEFT: 문서 체크리스트 */}
        <div className="surfaceCard" style={{ padding: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="sectionHeading" style={{ marginBottom: 12 }}>
            <h2>문서 체크리스트</h2>
            <p>
              제출 {application.submittedCount}건 ·{" "}
              <span style={{ color: application.missingCount > 0 ? "var(--warning)" : "var(--success)" }}>
                미제출 {application.missingCount}건
              </span>
            </p>
          </div>
          <div className="documentStatusList">
            {application.documents.map((document) => (
              <button
                key={document.code}
                type="button"
                className={`documentStatusButton${selectedDocument.code === document.code ? " isActive" : ""}`}
                onClick={() => onSelectDocument(document.code)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong>{document.name}</strong>
                  {document.note && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--primary)", flexShrink: 0, display: "inline-block" }} />
                  )}
                </div>
                <StatusBadge value={document.status} />
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: 이미지 뷰어 */}
        <div className="surfaceCard">
          <div className="sectionHeading">
            <h2 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {selectedDocument.name}
              {selectedDocument.note && (
                <span style={{ color: "var(--danger)", fontSize: 14, fontWeight: 600 }}>
                  {selectedDocument.note}
                </span>
              )}
            </h2>
            <p>{selectedDocument.category}</p>
          </div>
          {imageFilename && session?.isAuthenticated && application.intakeBatch ? (
            <div>
              {/* 한 양식에 스캔이 여러 장이면 장 선택 탭 */}
              {docFiles.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {docFiles.map((fn, idx) => {
                    const active = idx === safeFileIndex;
                    return (
                      <button
                        key={fn}
                        type="button"
                        onClick={() => setActiveFileIndex(idx)}
                        title={fn}
                        style={{
                          fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                          border: `1px solid ${active ? "var(--primary,#2563eb)" : "var(--line,#e5e7eb)"}`,
                          background: active ? "var(--primary-tint,#eff6ff)" : "#fff",
                          color: active ? "var(--primary,#2563eb)" : "var(--text-secondary,#374151)",
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {idx + 1}장
                      </button>
                    );
                  })}
                </div>
              )}
              <div
                onClick={() => openZoom(imageFilename)}
                title="클릭하면 확대 (확대 후 휠로 줌, 드래그로 이동)"
                style={{
                  width: "100%", height: 540, overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid var(--line)", background: "#fff", borderRadius: 4,
                  cursor: "zoom-in",
                }}
              >
                <AuthenticatedImage
                  batchId={application.intakeBatch}
                  filename={imageFilename}
                  imgStyle={{ maxWidth: "100%", maxHeight: "540px", objectFit: "contain", display: "block" }}
                />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", textAlign: "center" }}>
                클릭하면 확대 · 확대 후 휠로 줌, 드래그로 이동
              </p>
            </div>
          ) : (
            <div className="previewSurface">
              <span className="previewTag">문서 미리보기</span>
              <strong>{selectedDocument.name}</strong>
              <p>{selectedDocument.preview}</p>
            </div>
          )}

          <div className="sectionBlock">
            <div className="sectionHeading" style={{ marginBottom: 8 }}>
              <h2>검토 메모</h2>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: 13,
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                className="primaryButton"
                onClick={handleNoteSave}
                disabled={noteSaving}
                style={{ fontSize: 13, minHeight: 36 }}
              >
                {noteSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: 학생 정보 + 케이스 상태 + 타임라인 */}
        <div className="surfaceCard" style={{ display: "flex", flexDirection: "column" }}>
          <div className="sectionHeading" style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2>학생 정보</h2>
            <button
              type="button"
              onClick={() => setShowExtraInfo(true)}
              style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--primary,#2563eb)", padding: 0 }}
            >
              상세보기
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-primary)" }}>
            {[
              ["성명", formatStudentName(application.studentName), false],
              ["국적", application.nationality, true],
              ["생년월일", application.birthDate, true],
              ["여권번호", application.passportNumber, true],
              ["외국인등록번호", formatAlienRegistrationNumber(application.alienRegistrationNumber), false],
              ["학교명", application.schoolName, false],
              ["배치", application.intakeBatch, false],
            ].map(([label, value, required]) => {
              const isMissing = required && (!value || value === "UNKNOWN");
              return (
                <div key={label} style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--text-secondary)", minWidth: 100, flexShrink: 0 }}>{label}</span>
                  <span style={{ color: isMissing ? "var(--color-error,#dc2626)" : undefined, fontWeight: isMissing ? 600 : undefined }}>
                    : {value ?? "—"} {isMissing && "⚠ 미입력"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="sectionBlock">
            <div className="sectionHeading" style={{ marginBottom: 10 }}>
              <h2>케이스 상태</h2>
              <p>현재: <strong>{application.status}</strong></p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={selectedStatusKey}
                onChange={(e) => setSelectedStatusKey(e.target.value)}
                style={{ flex: 1, minHeight: 38, padding: "0 8px", fontSize: 13 }}
              >
                {CASE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="primaryButton"
                onClick={handleStatusChange}
                disabled={statusChanging}
                style={{ whiteSpace: "nowrap", minHeight: 38 }}
              >
                {statusChanging ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>

          <div className="sectionBlock">
            <div className="sectionHeading" style={{ marginBottom: 10, flexShrink: 0 }}>
              <h2>ACTIVITY · 타임라인</h2>
            </div>
            {timelineEntries.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>—</p>
            ) : (
              <div>
                {timelineEntries.map((entry, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      paddingBottom: 14,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
                      <div style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: entry.type === "system" ? "var(--text-muted)" : entry.type === "status" ? "var(--primary)" : "var(--text)",
                        flexShrink: 0,
                        marginTop: 3,
                      }} />
                      <div style={{ width: 1, flex: 1, background: "var(--line)", marginTop: 3 }} />
                    </div>
                    <div style={{ flex: 1, paddingBottom: 2 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{entry.date}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{entry.action}</div>
                      {entry.detail && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{entry.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {showExtraInfo && (
        <StudentExtraInfoModal
          extraInfo={application.extraInfo}
          studentName={application.studentName}
          onClose={() => setShowExtraInfo(false)}
        />
      )}
    </>
  );
}

function FolderCard({ icon, name, meta, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--surface, #fff)",
        border: "1px solid var(--color-border, #e5e7eb)",
        borderRadius: 8,
        padding: "14px 12px",
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <span style={{ fontSize: "1.75rem", lineHeight: 1 }}>{icon}</span>
      <strong style={{ fontSize: "0.8125rem", wordBreak: "break-all", color: "var(--color-text, #111827)" }}>{name}</strong>
      {meta.map((m, i) => m ? (
        <span key={i} style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)" }}>{m}</span>
      ) : null)}
    </button>
  );
}

function AgencyFileListPage({ batches, session }) {
  const [level, setLevel] = useState(0);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lightboxDoc, setLightboxDoc] = useState(null);
  const [renames, setRenames] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingKey, setSavingKey] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [downloadingZip, setDownloadingZip] = useState(false);

  const { currentPage: batchPage, setCurrentPage: setBatchPage, totalPages: batchTotalPages, paginatedItems: pagedBatchFolders } = usePagination(batches, 20);

  async function handleDownloadBatchZip() {
    if (downloadingZip || !selectedBatch) return;
    setLoadError("");
    setDownloadingZip(true);
    try {
      const label = selectedBatch.displayName || selectedBatch.fileName || selectedBatch.id;
      const ok = await downloadBatchFiles(selectedBatch.id, `${label}.zip`);
      if (!ok) setLoadError("다운로드할 스캔 파일이 없습니다.");
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setDownloadingZip(false);
    }
  }

  useEffect(() => {
    if (!lightboxDoc) return;
    function onKey(e) { if (e.key === "Escape") setLightboxDoc(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxDoc]);

  function startEdit(doc) {
    const key = `${selectedCase.id}:${doc.code}`;
    setEditingKey(key);
    setEditValue(renames[key] ?? doc.name ?? doc.sourceFilename);
    setSaveError("");
  }

  async function confirmEdit(doc) {
    const key = `${selectedCase.id}:${doc.code}`;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === (renames[key] ?? doc.name)) {
      setEditingKey(null);
      return;
    }
    setRenames((prev) => ({ ...prev, [key]: trimmed }));
    setEditingKey(null);
    setSavingKey(key);
    setSaveError("");
    try {
      await renameUploadBatchDocument(selectedBatch.id, selectedCase.id, doc.code, trimmed);
    } catch {
      setSaveError("저장 실패 (서버 미지원) — 현재 세션에서만 유지됩니다.");
    } finally {
      setSavingKey(null);
    }
  }

  function cancelEdit() {
    setEditingKey(null);
    setSaveError("");
  }

  async function handleOpenBatch(batch) {
    setLoadError("");
    if (Array.isArray(batch.cases) && batch.cases.length > 0) {
      setSelectedBatch(batch);
      setLevel(1);
      return;
    }
    setLoadingBatch(true);
    try {
      const detail = normalizeAgencyUploadBatch(
        await fetchAgencyUploadBatchDetail(batch.id),
        batch,
      );
      setSelectedBatch(detail);
      setLevel(1);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoadingBatch(false);
    }
  }

  function handleOpenCase(caseData) {
    setSelectedCase(caseData);
    setLevel(2);
  }

  function handleBack() {
    if (level === 2) { setLevel(1); setSelectedCase(null); }
    else if (level === 1) { setLevel(0); setSelectedBatch(null); }
  }

  const breadcrumbParts = ["파일 목록"];
  if (level >= 1 && selectedBatch) breadcrumbParts.push(selectedBatch.displayName || selectedBatch.fileName);
  if (level >= 2 && selectedCase) breadcrumbParts.push(selectedCase.studentName);

  const caseDocuments = level === 2 && selectedCase
    ? [
        ...(selectedCase.documents ?? []).filter((d) => d.sourceFilename),
        ...(selectedCase.otherDocuments ?? []).map((filename) => ({
          code: `other:${filename}`,
          name: "기타",
          sourceFilename: filename,
        })),
      ]
    : [];

  return (
    <>
      <PageHeader
        title="파일 목록"
        description="케이스 · 학생 · 문서 이미지를 폴더 구조로 탐색합니다."
      />

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12, fontSize: "0.875rem" }}>
        {breadcrumbParts.map((part, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ color: "var(--color-border, #d1d5db)", margin: "0 2px" }}>›</span>}
            {i < breadcrumbParts.length - 1 ? (
              <button
                type="button"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--primary, #2563eb)", fontSize: "inherit" }}
                onClick={() => {
                  if (i === 0) { setLevel(0); setSelectedBatch(null); setSelectedCase(null); }
                  else if (i === 1) { setLevel(1); setSelectedCase(null); }
                }}
              >
                {part}
              </button>
            ) : (
              <span style={{ color: "var(--color-text, #111827)", fontWeight: 500 }}>{part}</span>
            )}
          </span>
        ))}
      </div>

      {loadError && <div className="errorBox" style={{ marginBottom: 12 }}>{loadError}</div>}

      {level === 0 && (
        <section className="surfaceCard">
          <div className="sectionHeading">
            <h2>케이스 폴더</h2>
            <p>ZIP 업로드 단위로 생성된 케이스입니다. 폴더를 클릭하면 학생 목록으로 이동합니다.</p>
          </div>
          {batches.length === 0 ? (
            <EmptyState title="케이스가 없습니다." description="ZIP 파일을 업로드하면 케이스가 생성됩니다." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, marginTop: 12 }}>
              {pagedBatchFolders.map((batch) => (
                <FolderCard
                  key={batch.id}
                  icon="📁"
                  name={batch.displayName || batch.fileName}
                  meta={[batch.fileName, batch.studentCount != null ? `${batch.studentCount}명` : null]}
                  onClick={() => handleOpenBatch(batch)}
                  disabled={loadingBatch}
                />
              ))}
            </div>
          )}
          <PaginationNav currentPage={batchPage} totalPages={batchTotalPages} onPageChange={setBatchPage} />
          {loadingBatch && (
            <p style={{ marginTop: 12, fontSize: "0.875rem", color: "var(--color-text-muted, #6b7280)" }}>불러오는 중...</p>
          )}
        </section>
      )}

      {level === 1 && selectedBatch && (
        <section className="surfaceCard">
          <div className="sectionHeading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" className="secondaryButton" onClick={handleBack} style={{ fontSize: "0.8rem", padding: "4px 10px" }}>← 뒤로</button>
                <h2>학생 폴더</h2>
              </div>
              <p>{selectedBatch.displayName || selectedBatch.fileName} 케이스의 학생 목록입니다.</p>
            </div>
            <button
              type="button"
              className="primaryButton"
              onClick={handleDownloadBatchZip}
              disabled={downloadingZip || !selectedBatch.cases || selectedBatch.cases.length === 0}
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {downloadingZip ? "압축 중…" : "⬇ 학생별 ZIP 다운로드"}
            </button>
          </div>
          {!selectedBatch.cases || selectedBatch.cases.length === 0 ? (
            <EmptyState title="학생 케이스가 없습니다." description="배치 처리가 완료되면 학생 폴더가 표시됩니다." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
              {selectedBatch.cases.map((c) => (
                <FolderCard
                  key={c.id}
                  icon="📂"
                  name={c.studentName}
                  meta={[
                    c.nationality,
                    c.documents ? `${c.documents.filter((d) => d.sourceFilename).length}개 파일` : null,
                  ]}
                  onClick={() => handleOpenCase(c)}
                  disabled={false}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {level === 2 && selectedCase && (
        <section className="surfaceCard">
          <div className="sectionHeading">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" className="secondaryButton" onClick={handleBack} style={{ fontSize: "0.8rem", padding: "4px 10px" }}>← 뒤로</button>
              <h2>{selectedCase.studentName}</h2>
            </div>
            <p>업로드된 스캔 이미지 목록입니다.</p>
          </div>
          {caseDocuments.length === 0 ? (
            <EmptyState title="이미지가 없습니다." description="배치 처리 완료 후 스캔 이미지가 연결됩니다." />
          ) : (
            <>
            {saveError && <p style={{ color: "var(--color-error, #dc2626)", fontSize: "0.8125rem", marginBottom: 8 }}>{saveError}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginTop: 12 }}>
              {caseDocuments.map((doc) => {
                const key = `${selectedCase.id}:${doc.code}`;
                const displayName = renames[key] ?? doc.name ?? doc.sourceFilename;
                const isEditing = editingKey === key;
                const isSaving = savingKey === key;
                return (
                  <div key={doc.code ?? doc.sourceFilename} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setLightboxDoc(doc)}
                      style={{ border: "1px solid var(--color-border, #e5e7eb)", borderRadius: 6, overflow: "hidden", background: "#f9fafb", padding: 0, cursor: "zoom-in", display: "block", width: "100%" }}
                    >
                      <AuthenticatedImage
                        batchId={selectedBatch.id}
                        filename={doc.sourceFilename}
                        imgStyle={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                      />
                    </button>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmEdit(doc);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          onBlur={() => confirmEdit(doc)}
                          disabled={isSaving}
                          style={{ flex: 1, fontSize: "0.75rem", padding: "2px 6px", border: "1px solid var(--primary, #2563eb)", borderRadius: 4, outline: "none" }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)", margin: 0, wordBreak: "break-all", flex: 1 }}>
                          {displayName}
                        </p>
                        <button
                          type="button"
                          onClick={() => startEdit(doc)}
                          title="파일명 변경"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: "0.75rem", color: "var(--color-text-muted, #9ca3af)", flexShrink: 0, lineHeight: 1 }}
                        >
                          ✏️
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </>
          )}
        </section>
      )}

      {lightboxDoc && (
        <div
          onClick={() => setLightboxDoc(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.82)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => setLightboxDoc(null)}
              style={{
                position: "absolute", top: -36, right: 0,
                background: "none", border: "none", color: "#fff", fontSize: "1.5rem", cursor: "pointer", lineHeight: 1,
              }}
            >
              ✕
            </button>
            <AuthenticatedImage
              batchId={selectedBatch.id}
              filename={lightboxDoc.sourceFilename}
              imgStyle={{ maxWidth: "88vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 4, display: "block" }}
            />
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8125rem", margin: 0, textAlign: "center" }}>
              {lightboxDoc.name || lightboxDoc.sourceFilename}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function buildStudentMap(apps) {
  const map = new Map();
  for (const app of apps) {
    const key = app.studentName || app.id;
    if (!map.has(key)) map.set(key, { studentName: app.studentName, nationality: app.nationality, schoolName: app.schoolName, cases: [] });
    map.get(key).cases.push(app);
  }
  return Array.from(map.values()).map((s) => ({
    ...s,
    caseCount: s.cases.length,
    latestCase: s.cases.sort((a, b) => (a.applicationDate < b.applicationDate ? 1 : -1))[0],
  }));
}

function isExtractionFailed(app) {
  return !app.studentName || app.studentName.toUpperCase() === "UNKNOWN";
}

/**
 * 목록 상단 필터 바 — 학생 목록·보완 접수 공용.
 *
 * DESIGN.md 안티패턴 "표 위에 검색 조건이 흩어져 있는 형태"를 피한다.
 * 예전엔 flex-wrap 에 폭이 제각각인 필드를 늘어놓아 줄바꿈이 들쭉날쭉했고,
 * 필터를 6개까지 걸어도 "지금 뭐가 걸려 있는지" 한눈에 안 보였다.
 *
 * - 검색은 한 줄로 분리(가장 자주 쓰는 입력)
 * - 셀렉트는 균등 그리드 → 어느 폭에서도 열이 어긋나지 않는다
 * - 적용된 조건은 칩으로 보여주고 칩에서 바로 해제한다
 * - 걸려 있는 셀렉트는 파랗게 표시해 훑기만 해도 보인다
 *
 * filters: [{ key, label, value, onChange, options: [{ value, label }] }]
 */
function FilterBar({ search, filters = [], onReset, resultLabel }) {
  // 날짜 필터는 "미지정"이 빈 문자열, 셀렉트는 "전체"
  const isActive = (filter) =>
    filter.type === "date" ? Boolean(filter.value) : filter.value !== ALL_FILTER;
  const clearedValue = (filter) => (filter.type === "date" ? "" : ALL_FILTER);

  const activeFilters = filters.filter(isActive);
  const searchText = search?.value?.trim() ?? "";
  const activeCount = activeFilters.length + (searchText ? 1 : 0);

  const optionLabel = (filter) =>
    filter.type === "date"
      ? filter.value
      : filter.options.find((option) => option.value === filter.value)?.label ?? filter.value;

  return (
    <div className="filterBar">
      <div className="filterBarTop">
        {search && (
          <div className="filterSearch">
            <svg className="filterSearchIcon" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13.5 13.5 L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              aria-label={search.label}
            />
          </div>
        )}
        <div className="filterBarMeta">
          {resultLabel && <strong>{resultLabel}</strong>}
          <button
            type="button"
            className="filterReset"
            onClick={onReset}
            disabled={activeCount === 0}
          >
            필터 초기화{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>

      <div className="filterGrid">
        {filters.map((filter) => (
          <label key={filter.key} className="filterField">
            <span>{filter.label}</span>
            {filter.type === "date" ? (
              <input
                type="date"
                className={isActive(filter) ? "isActive" : ""}
                value={filter.value}
                min={filter.min}
                max={filter.max}
                onChange={(event) => filter.onChange(event.target.value)}
              />
            ) : (
              <select
                className={isActive(filter) ? "isActive" : ""}
                value={filter.value}
                onChange={(event) => filter.onChange(event.target.value)}
              >
                <option value={ALL_FILTER}>전체</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
          </label>
        ))}
      </div>

      {activeCount > 0 && (
        <div className="filterChips">
          {searchText && (
            <button type="button" className="filterChip" onClick={() => search.onChange("")}>
              <span>{search.label}: {searchText}</span>
              <span className="filterChipX" aria-hidden="true">×</span>
            </button>
          )}
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="filterChip"
              onClick={() => filter.onChange(clearedValue(filter))}
            >
              <span>{filter.label}: {optionLabel(filter)}</span>
              <span className="filterChipX" aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 값 배열 → FilterBar 가 쓰는 옵션 배열. */
function toOptions(values) {
  return values.map((value) => ({ value, label: value }));
}

/**
 * 화면에 쓰이는 여러 날짜 표기("2026.07.11 15:19", "2026-07-11", ISO)에서 날짜만 뽑아
 * <input type="date"> 와 같은 "YYYY-MM-DD" 로 맞춘다. 못 읽으면 빈 문자열.
 */
function toDateKey(value) {
  if (!value) return "";
  const matched = String(value).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!matched) return "";
  const [, year, month, day] = matched;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * 배치의 접수일. 업로드할 때 운영자가 입력한 값이며 note 에 "접수일: 2026-07-11" 형태로 들어간다.
 * 업로드 일시(uploadedAt)와는 다른 값이다 — 어제 접수분을 오늘 올릴 수 있다.
 */
function receiptDateOf(batch) {
  return toDateKey(batch?.note) || "";
}

// 초기화 시 한 번에 지울 URL 파라미터 (모듈 상수 — 렌더마다 새 배열을 만들지 않는다)
// 학생 목록은 '완료'된 케이스만 보여주므로 상태 필터는 두지 않는다 (선택지가 하나뿐이라 의미가 없다)
const STUDENT_FILTER_KEYS = ["name", "nationality", "visa", "school", "date"];
const SUPPLEMENT_FILTER_KEYS = ["name", "nationality", "visa", "school", "missing", "date"];

function AgencyStudentListPage({ applications, onOpenDetail, onExclude }) {
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
        description="등록된 학생 목록입니다. 여러 필터를 동시에 적용할 수 있습니다."
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
                      {a.batchOrderIndex ? (
                        <span className="cellMeta">{a.batchOrderIndex}번째 스캔</span>
                      ) : null}
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
                        className="tableLinkButton"
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

function AgencySupplementListPage({ applications, onSupplementRequest }) {
  // 다중 독립 필터(모두 AND) — 학생목록과 같은 구조. 상태는 URL query string에 둔다.
  const [nameFilter, setNameFilter] = useUrlState("name", "");
  const [nationalityFilter, setNationalityFilter] = useUrlState("nationality", ALL_FILTER);
  const [visaFilter, setVisaFilter] = useUrlState("visa", ALL_FILTER);
  const [schoolFilter, setSchoolFilter] = useUrlState("school", ALL_FILTER);
  const [dateFilter, setDateFilter] = useUrlState("date", "");
  const [missingFilter, setMissingFilter] = useUrlState("missing", ALL_FILTER); // 누락 서류 건수 구간
  const resetFilters = useUrlReset(SUPPLEMENT_FILTER_KEYS);

  // 이 화면 대상 = 누락 있음(미완료) + 추출 실패. 옵션은 이 모수에서만 뽑아 빈 옵션을 막는다.
  const targetApps = useMemo(
    () => applications.filter(
      (a) => isExtractionFailed(a) || ((a.missingCount ?? 0) > 0 && a.status !== "완료"),
    ),
    [applications],
  );

  const nationalityOptionsList = [...new Set(targetApps.map((a) => a.nationality).filter(Boolean))];
  const visaOptionsList = [...new Set(targetApps.map((a) => a.visaType).filter(Boolean))];
  const schoolOptionsList = [...new Set(targetApps.map((a) => a.schoolName).filter(Boolean))];
  // 학생 목록과 같은 원칙 — 배치를 고르는 기준은 "언제 올린 건지"다.
  const matchesFilters = (a) => {
    const nameQuery = nameFilter.trim().toLowerCase();
    const missing = a.missingCount ?? 0;
    const matchesMissing =
      missingFilter === ALL_FILTER
      || (missingFilter === "1-2" && missing >= 1 && missing <= 2)
      || (missingFilter === "3-5" && missing >= 3 && missing <= 5)
      || (missingFilter === "6+" && missing >= 6);
    return (!nameQuery || (a.studentName ?? "").toLowerCase().includes(nameQuery))
      && (nationalityFilter === ALL_FILTER || a.nationality === nationalityFilter)
      && (visaFilter === ALL_FILTER || a.visaType === visaFilter)
      && (schoolFilter === ALL_FILTER || a.schoolName === schoolFilter)
      && (!dateFilter || toDateKey(a.uploadedAt) === dateFilter)
      && matchesMissing;
  };

  const filterKey = `${nameFilter}|${nationalityFilter}|${visaFilter}|${schoolFilter}|${dateFilter}|${missingFilter}`;

  // 관리자가 '완료' 승인한 건은 학생목록으로 가므로 보완목록에서 제외 (학생은 둘 중 한 곳에만)
  const supplementStudents = useMemo(
    () => buildStudentMap(targetApps.filter(
      (a) => !isExtractionFailed(a) && matchesFilters(a),
    )),
    [targetApps, filterKey],
  );
  // 추출 실패는 학생명·누락건수가 없을 수 있어 이름/누락 필터는 적용하지 않는다
  const failedStudents = useMemo(
    () => buildStudentMap(targetApps.filter(
      (a) => isExtractionFailed(a)
        && (nationalityFilter === ALL_FILTER || a.nationality === nationalityFilter)
        && (visaFilter === ALL_FILTER || a.visaType === visaFilter)
        && (schoolFilter === ALL_FILTER || a.schoolName === schoolFilter)
        && (!dateFilter || toDateKey(a.uploadedAt) === dateFilter),
    )),
    [targetApps, filterKey],
  );

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
              <td data-label="학생명" style={{ color: isFailed ? "var(--color-error,#dc2626)" : undefined }}>
                {s.studentName || "이름 미추출"}
              </td>
              <td data-label="국적">{s.nationality || "—"}</td>
              <td data-label="학교명">{s.schoolName}</td>
              <td data-label="업로드 날짜">
                {s.latestCase?.uploadedAt || "—"}
                {s.latestCase?.batchOrderIndex ? (
                  <span className="cellMeta">{s.latestCase.batchOrderIndex}번째 스캔</span>
                ) : null}
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
        description="누락 서류가 있거나 추출에 실패한 케이스를 처리합니다."
      />

      <section className="surfaceCard">
        <FilterBar
          search={{
            label: "학생명",
            value: nameFilter,
            onChange: setNameFilter,
            placeholder: "학생명으로 검색 (추출 실패 건은 이름이 없어 제외됩니다)",
          }}
          resultLabel={`${supplementStudents.length + failedStudents.length}명`}
          onReset={resetFilters}
          filters={[
            { key: "nationality", label: "국적", value: nationalityFilter, onChange: setNationalityFilter, options: toOptions(nationalityOptionsList) },
            { key: "visa", label: "비자 타입", value: visaFilter, onChange: setVisaFilter, options: toOptions(visaOptionsList) },
            { key: "school", label: "학교", value: schoolFilter, onChange: setSchoolFilter, options: toOptions(schoolOptionsList) },
            {
              key: "missing", label: "누락 서류", value: missingFilter, onChange: setMissingFilter,
              options: [
                { value: "1-2", label: "1~2건" },
                { value: "3-5", label: "3~5건" },
                { value: "6+", label: "6건 이상" },
              ],
            },
            { key: "date", label: "업로드 날짜", type: "date", value: dateFilter, onChange: setDateFilter },
          ]}
        />
      </section>

      {supplementStudents.length > 0 && (
        <section className="surfaceCard" style={{ borderLeft: "3px solid var(--color-warning,#d97706)" }}>
          <div className="sectionHeading">
            <h2>누락 서류 있음 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--color-warning,#d97706)", marginLeft: 6 }}>{supplementStudents.length}명</span></h2>
            <p>"처리하기" 클릭 → 케이스 상세에서 서류 매핑 · 정보 수정 · 보완 요청을 진행하세요.</p>
          </div>
          <SupplementTable rows={supplementStudents} isFailed={false} />
        </section>
      )}

      {failedStudents.length > 0 && (
        <section className="surfaceCard" style={{ borderLeft: "3px solid var(--color-error,#dc2626)" }}>
          <div className="sectionHeading">
            <h2>추출 실패 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--color-error,#dc2626)", marginLeft: 6 }}>{failedStudents.length}명</span></h2>
            <p>"처리하기" 클릭 → 학생 정보를 직접 입력하고 서류를 매핑하세요.</p>
          </div>
          <SupplementTable rows={failedStudents} isFailed={true} />
        </section>
      )}

      {supplementStudents.length === 0 && failedStudents.length === 0 && (
        <section className="surfaceCard">
          <EmptyState title="보완이 필요한 케이스가 없습니다." description="모든 학생이 정상 접수되었습니다." />
        </section>
      )}
    </>
  );
}

function AgencyUploadPage({
  onBack,
  backLabel = "대시보드",
  onZipFileSelect,
  onSubmit,
  onOpenHistory,
  onOpenUploadedBatch,
  uploadFeedback,
  uploadForm,
  onUploadFormChange,
  selectedZipFile,
  schools,
  liveBatch,
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
              ← {backLabel}(으)로 돌아가기
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
                    ? "업로드 접수 완료 — 처리 중"
                    : "업로드 실패"}
              </strong>
              {uploadFeedback.fileName ? <span>{uploadFeedback.fileName}</span> : null}
            </div>

            {uploadFeedback.phase === "success" ? (
              <UploadProcessingSteps batch={liveBatch ?? uploadFeedback.batch} />
            ) : (
              <p>{uploadFeedback.message}</p>
            )}

            {uploadFeedback.phase === "success" && uploadFeedback.batch ? (
              <div className="uploadStatusMeta" style={{ marginTop: 12 }}>
                <span>배치 ID {uploadFeedback.batch.id}</span>
                <span>처리 작업 {(liveBatch ?? uploadFeedback.batch).processingJobId || "대기 중"}</span>
                <span>상태 {(liveBatch ?? uploadFeedback.batch).status}</span>
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

function formatProcessingDuration(seconds) {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

function AgencyUploadHistoryPage({ batches, onOpenDetail, onBack, backLabel = "대시보드" }) {
  const { currentPage, setCurrentPage, totalPages, paginatedItems: pagedBatches } = usePagination(batches, 10);

  return (
    <>
      <PageHeader
        title="업로드 내역"
        description="ZIP 업로드 배치 이력과 처리 결과를 확인합니다. 완료 · 보완 · 반려 · 실패 네 가지 상태로 분류됩니다."
        actions={
          <button type="button" className="secondaryButton" onClick={onBack}>
            ← {backLabel}(으)로 돌아가기
          </button>
        }
      />

      <section className="surfaceCard">
        <SectionMeta
          count={`업로드 배치 ${batches.length}건`}
          helper={`완료: 정상 처리 · 보완: 서류 누락 · 반려: 정보 불일치 · 실패: 업로드 오류${totalPages > 1 ? ` · ${currentPage}/${totalPages} 페이지` : ""}`}
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
                  <th>처리 시간</th>
                  <th>상태</th>
                  <th>비고</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedBatches.map((batch) => {
                  const isActiveRow = !TERMINAL_BATCH_STATUSES_SET.has(
                    (batch.uploadBatchStatusRaw ?? "").toUpperCase()
                  ) && batch.uploadBatchStatusRaw !== "";
                  return (
                    <Fragment key={batch.id}>
                      <tr>
                        <td data-label="배치 ID">{batch.id}</td>
                        <td data-label="파일명">{batch.fileName}</td>
                        <td data-label="업로드 시각">{batch.uploadedAt}</td>
                        <td data-label="학생 수">
                          {batch.studentCount == null ? "-" : `${batch.studentCount}명`}
                        </td>
                        <td data-label="처리 시간">
                          {formatProcessingDuration(batch.processingDurationSeconds) ?? "-"}
                        </td>
                        <td data-label="상태">
                          <StatusBadge value={deriveUploadBatchDisplayStatus(batch)} />
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
                      {isActiveRow && (
                        <tr>
                          <td
                            colSpan={8}
                            style={{
                              padding: "4px 20px 16px",
                              background: "var(--surface-2,#f9fafb)",
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

// 인증 이미지 blob URL 캐시 (세션 수명, FIFO 상한) — 서류 전환 시 재다운로드와
// "로딩 중" 플래시(전체 새로고침처럼 보이는 레이아웃 점프)를 없앤다.
const AUTHED_IMAGE_CACHE_MAX = 80;
const authedImageCache = new Map(); // "batchId/filename" → objectUrl

function cacheAuthedImage(key, url) {
  if (authedImageCache.size >= AUTHED_IMAGE_CACHE_MAX) {
    const oldestKey = authedImageCache.keys().next().value;
    URL.revokeObjectURL(authedImageCache.get(oldestKey));
    authedImageCache.delete(oldestKey);
  }
  authedImageCache.set(key, url);
}

function AuthenticatedImage({ batchId, filename, imgStyle }) {
  const cacheKey = batchId && filename ? `${batchId}/${filename}` : null;
  // "FAILED" | objectUrl | null(최초 로딩). 파일 전환 시 초기화하지 않고
  // 이전 이미지를 그대로 보여주다가 새 이미지가 도착하면 교체한다(깜빡임 방지).
  const [current, setCurrent] = useState(() => (cacheKey ? authedImageCache.get(cacheKey) ?? null : "FAILED"));

  useEffect(() => {
    if (!cacheKey) {
      setCurrent("FAILED");
      return;
    }
    const cached = authedImageCache.get(cacheKey);
    if (cached) {
      setCurrent(cached);
      return;
    }
    let cancelled = false;
    const path = `/agency/upload-batches/${encodeURIComponent(batchId)}/images/${encodeURIComponent(filename)}`;
    fetchAuthedBlob(path, "이미지를 불러올 수 없습니다.")
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        cacheAuthedImage(cacheKey, url);
        if (!cancelled) setCurrent(url);
      })
      .catch(() => { if (!cancelled) setCurrent("FAILED"); }); // 실패는 캐시하지 않음 → 재방문 시 재시도
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const failed = current === "FAILED";
  const objectUrl = failed ? null : current;

  const defaultImgStyle = { maxWidth: "100%", maxHeight: "540px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--color-border, #e5e7eb)" };
  const resolvedImgStyle = imgStyle ?? defaultImgStyle;

  if (failed) {
    return (
      <div className="previewSurface" style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--color-text-muted, #6b7280)" }}>이미지를 불러올 수 없습니다.</p>
      </div>
    );
  }
  if (!objectUrl) {
    return (
      <div className="previewSurface" style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--color-text-muted, #6b7280)" }}>로딩 중...</p>
      </div>
    );
  }
  return <img src={objectUrl} alt={filename} style={resolvedImgStyle} />;
}

function BatchCaseDetailPage({
  caseData, batchId, batchName, session, onBack, backLabel = "목록", onRefresh,
  reviewQueue = [], queueLabel = "검토", onNavigateCase,
}) {
  const [selectedDocCode, setSelectedDocCode] = useState(caseData.documents[0]?.code ?? null);
  // 검토 큐(= 들어온 목록) 내 위치와 앞/뒤 케이스
  const _qIdx = reviewQueue.indexOf(caseData.id);
  const _prevReviewId = _qIdx > 0 ? reviewQueue[_qIdx - 1] : null;
  const _nextReviewId = _qIdx >= 0
    ? (_qIdx + 1 < reviewQueue.length ? reviewQueue[_qIdx + 1] : null)
    : (reviewQueue.find((id) => id !== caseData.id) ?? null);
  const isOtherDoc = selectedDocCode?.startsWith("other:");
  const otherFilename = isOtherDoc ? selectedDocCode.slice(6) : null;
  const selectedDoc = isOtherDoc ? null : (caseData.documents.find((d) => d.code === selectedDocCode) ?? null);
  // 선택된 양식이 가진 파일 목록(1:N). 레거시 단일 sourceFilename 도 1장으로 취급.
  const selectedDocFiles = selectedDoc
    ? (selectedDoc.sourceFilenames?.length ? selectedDoc.sourceFilenames : (selectedDoc.sourceFilename ? [selectedDoc.sourceFilename] : []))
    : [];
  const [showExtraInfo, setShowExtraInfo] = useState(false);
  // 양식 내 현재 보고 있는 파일 인덱스 (양식 변경 시 0으로 리셋)
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  useEffect(() => { setActiveFileIndex(0); }, [selectedDocCode]);
  const safeFileIndex = Math.min(activeFileIndex, Math.max(selectedDocFiles.length - 1, 0));
  const imageFilename = otherFilename ?? selectedDocFiles[safeFileIndex] ?? null;

  const [showPanel, setShowPanel] = useState(false);
  const [checkedDocs, setCheckedDocs] = useState(() => {
    const initial = {};
    caseData.documents.forEach((d) => {
      if (d.status === "미제출") initial[d.code] = true;
    });
    return initial;
  });
  const [reasons, setReasons] = useState({});
  const [globalMessage, setGlobalMessage] = useState("");
  const [sending, setSending] = useState(false);

  // 학생 정보 인라인 수정 (필드 단위)
  const [editingField, setEditingField] = useState(null); // API 필드명 (예: "passportNumber")
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [editError, setEditError] = useState("");
  const [highlightField, setHighlightField] = useState(null); // 체크리스트 진입 시 시각적 주의

  const STUDENT_FIELD_VALUE = {
    name: caseData.studentName,
    nationality: caseData.nationality,
    passportNumber: caseData.passportNumber,
    birthDate: caseData.birthDate,
    alienRegistrationNumber: caseData.alienRegistrationNumber,
    phoneNumber: caseData.phoneNumber,
    address: caseData.address,
  };
  // 검토 체크리스트 이슈 key → API 필드명
  const ISSUE_KEY_TO_FIELD = {
    student_name: "name", nationality: "nationality", passport_number: "passportNumber",
    date_of_birth: "birthDate", alien_registration_number: "alienRegistrationNumber",
    phone_number: "phoneNumber", address: "address",
  };

  function startFieldEdit(field) {
    if (savingField) return;
    const current = STUDENT_FIELD_VALUE[field];
    setEditingField(field);
    setEditingValue(current && current !== "UNKNOWN" ? current : "");
    setEditError("");
  }

  function cancelFieldEdit() {
    if (savingField) return;
    setEditingField(null);
    setEditingValue("");
    setEditError("");
  }

  function openFieldEditFromChecklist(issueKey) {
    const field = ISSUE_KEY_TO_FIELD[issueKey];
    if (!field) return;
    startFieldEdit(field);
    setHighlightField(field);
    setTimeout(() => setHighlightField(null), 1000);
  }

  async function handleFieldSave() {
    if (!editingField || savingField) return;
    setSavingField(true);
    setEditError("");
    try {
      // 수정한 필드만 전송 — 나머지는 undefined로 남겨 백엔드에서 무변경 처리
      await updateStudentInfo(caseData.id, { [editingField]: editingValue.trim() });
      await onRefresh?.();
      setEditingField(null);
      setEditingValue("");
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSavingField(false);
    }
  }

  // 가운데 이미지 클릭 확대(라이트박스) + 휠 줌 / 드래그 이동
  const [zoomedImage, setZoomedImage] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const zoomDrag = useRef(null);
  function openZoom(filename) {
    setZoomedImage(filename);
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
  }

  // 케이스 상태 변경 (관리자 판단으로 완료 처리 / 해제)
  const [statusSaving, setStatusSaving] = useState(false);
  async function handleSetCaseStatus(nextStatus) {
    setStatusSaving(true);
    try {
      await updateCaseStatus(caseData.id, nextStatus);
      await onRefresh?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setStatusSaving(false);
    }
  }

  // 검토 체크리스트: 추출 필드 이슈 + 서류 누락 + 서류 검수 지적을 한 목록으로 수집
  const CHECKLIST_FIELD_LABEL = {
    nationality: "국적", date_of_birth: "생년월일", passport_number: "여권번호",
    student_name: "이름", alien_registration_number: "외국인등록번호",
    phone_number: "전화번호", address: "주소",
  };
  const reviewIssues = useMemo(() => {
    const issues = [];
    let validations = {};
    try {
      validations = caseData.fieldValidations ? JSON.parse(caseData.fieldValidations) : {};
    } catch {
      validations = {};
    }
    Object.entries(validations).forEach(([key, v]) => {
      if (v && (v.status === "invalid" || v.status === "review")) {
        issues.push({ type: "field", key, label: CHECKLIST_FIELD_LABEL[key] || key, detail: v.detail || "" });
      }
    });
    caseData.documents.forEach((d) => {
      if (d.status === "미제출") {
        issues.push({ type: "missing", code: d.code, label: `누락: ${d.name}`, detail: "필수 서류가 제출되지 않았습니다." });
      } else if (typeof d.note === "string" && d.note.trim()) {
        issues.push({ type: "docReview", code: d.code, label: `검수: ${d.name}`, detail: d.note });
      }
    });
    return issues;
  }, [caseData.fieldValidations, caseData.documents]);

  // 활동 타임라인
  const [activities, setActivities] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchCaseActivities(caseData.id)
      .then((list) => { if (!cancelled) setActivities(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setActivities([]); });
    return () => { cancelled = true; };
  }, [caseData.id]);

  // 서류 업로드 모달
  const [uploadModalDoc, setUploadModalDoc] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [linkError, setLinkError] = useState("");

  // 스캔 → 서류 직접 매핑 (OCR 오분류 / 기타 스캔 교정)
  const [mapping, setMapping] = useState(false);
  const [mapFeedback, setMapFeedback] = useState(null);

  // 기타 서류 다중 선택 → 하나의 양식에 일괄 적용
  const [selectedOthers, setSelectedOthers] = useState([]); // filename[]
  const [bulkTargetCode, setBulkTargetCode] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkError, setBulkError] = useState("");

  // 스캔 정리 모드: 켜져 있을 때만 기타 서류 체크박스 + 일괄 적용 바 노출
  const [scanTidyMode, setScanTidyMode] = useState(false);

  // 활동 타임라인 접기 (기본 접힘)
  const [showTimeline, setShowTimeline] = useState(false);

  function toggleScanTidyMode() {
    const next = !scanTidyMode;
    setScanTidyMode(next);
    if (!next) {
      setSelectedOthers([]);
      setBulkTargetCode("");
      setBulkError("");
    }
  }

  function toggleOther(filename) {
    setBulkError("");
    setSelectedOthers((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : [...prev, filename],
    );
  }

  async function handleBulkApply() {
    if (selectedOthers.length === 0 || !bulkTargetCode) return;
    setBulkApplying(true);
    setBulkError("");
    try {
      await bulkAssignDocumentFiles(caseData.id, bulkTargetCode, selectedOthers);
      setSelectedOthers([]);
      setBulkTargetCode("");
      await onRefresh?.();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkApplying(false);
    }
  }

  async function handleConfirmUpload() {
    if (!uploadModalDoc || !uploadFile) return;
    setUploading(true);
    setLinkError("");
    try {
      await uploadSupplementDocument(caseData.id, uploadModalDoc.code, uploadFile);
      setUploadModalDoc(null);
      setUploadFile(null);
      await onRefresh?.();
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // 보고 있는 스캔이 바뀌면 피드백 초기화
  useEffect(() => {
    setMapFeedback(null);
  }, [imageFilename]);

  // 스캔 1장을 대상 양식(또는 "OTHER"=기타로 제외)으로 이동. 지정·변경·제외를 한 동작으로 처리.
  async function handleMoveScan(filename, targetCode) {
    if (!filename) return;
    setMapping(true);
    setMapFeedback(null);
    try {
      await moveDocumentScan(caseData.id, filename, targetCode);
      const isOther = !targetCode || targetCode === "OTHER";
      const label = isOther ? "기타(미지정)" : (caseData.documents.find((d) => d.code === targetCode)?.name ?? targetCode);
      setMapFeedback({ type: "ok", text: `"${label}"(으)로 이동했습니다.` });
      // 이동 후 보던 위치가 사라지므로 대상으로 선택 이동(데이터 새로고침 후 자연스럽게 표시)
      setSelectedDocCode(isOther ? `other:${filename}` : targetCode);
      await onRefresh?.();
    } catch (err) {
      setMapFeedback({ type: "err", text: err.message });
    } finally {
      setMapping(false);
    }
  }

  function toggleDoc(code) {
    setCheckedDocs((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function setReason(code, value) {
    setReasons((prev) => ({ ...prev, [code]: value }));
  }

  async function handleSendSupplement() {
    const items = caseData.documents
      .filter((d) => checkedDocs[d.code])
      .map((d) => ({ docCode: d.code, docName: d.name, reason: reasons[d.code]?.trim() ?? "" }));

    if (items.length === 0) {
      alert("보완이 필요한 서류를 하나 이상 선택해주세요.");
      return;
    }

    setSending(true);
    try {
      await requestSupplement(batchId, caseData.id, items, globalMessage.trim());
      setShowPanel(false);
      setGlobalMessage("");
      fetchCaseActivities(caseData.id).then((list) => setActivities(Array.isArray(list) ? list : [])).catch(() => {});
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={`유학원 / ${queueLabel} / 학생 상세`}
        title={formatStudentName(caseData.studentName)}
        description={`${caseData.nationality} · ${caseData.applicationType} · 제출 ${caseData.submittedCount}건${caseData.missingCount > 0 ? ` · 누락 ${caseData.missingCount}건` : ""}${batchName ? ` · 배치 ${batchName}` : ""}`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {reviewQueue.length > 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted,#9ca3af)" }}>
                {queueLabel} {_qIdx >= 0 ? `${_qIdx + 1}/${reviewQueue.length}` : `${reviewQueue.length}건`}
              </span>
            )}
            {_prevReviewId && onNavigateCase && (
              <button type="button" className="secondaryButton" onClick={() => onNavigateCase(_prevReviewId)}>
                ← 이전
              </button>
            )}
            {_nextReviewId && onNavigateCase && (
              <button type="button" className="primaryButton" onClick={() => onNavigateCase(_nextReviewId)}>
                다음 →
              </button>
            )}
            <button type="button" className="secondaryButton" onClick={onBack}>
              ← {backLabel}(으)로 돌아가기
            </button>
          </div>
        }
      />

      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)}
          onWheel={(e) => setZoomScale((s) => Math.min(8, Math.max(1, s - e.deltaY * 0.0015)))}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out", overflow: "hidden" }}>
          <button type="button" onClick={() => setZoomedImage(null)}
            style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#fff", fontSize: "1.8rem", cursor: "pointer", lineHeight: 1, zIndex: 1 }}>✕</button>
          <div style={{ position: "absolute", top: 18, left: 20, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
            휠: 확대/축소 · 드래그: 이동 · {Math.round(zoomScale * 100)}%
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => { zoomDrag.current = { x: e.clientX - zoomOffset.x, y: e.clientY - zoomOffset.y }; }}
            onMouseMove={(e) => { if (zoomDrag.current) setZoomOffset({ x: e.clientX - zoomDrag.current.x, y: e.clientY - zoomDrag.current.y }); }}
            onMouseUp={() => { zoomDrag.current = null; }}
            onMouseLeave={() => { zoomDrag.current = null; }}
            onDoubleClick={() => { setZoomScale(1); setZoomOffset({ x: 0, y: 0 }); }}
            style={{
              maxWidth: "94vw", maxHeight: "92vh",
              cursor: zoomScale > 1 ? "grab" : "default",
              transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
              transition: zoomDrag.current ? "none" : "transform 0.08s ease-out",
            }}>
            <AuthenticatedImage batchId={batchId} filename={zoomedImage}
              imgStyle={{ maxWidth: "94vw", maxHeight: "92vh", objectFit: "contain", display: "block", pointerEvents: "none" }} />
          </div>
        </div>
      )}

      {showPanel && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPanel(false); }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 12, padding: 28, width: "min(640px, 95vw)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>보완 요청 작성</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted,#6b7280)" }}>보완이 필요한 서류를 선택하고 사유를 입력하세요.</p>
              </div>
              <button type="button" onClick={() => setShowPanel(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted,#9ca3af)", lineHeight: 1, padding: 4 }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {caseData.documents.map((doc) => (
                <div key={doc.code} style={{
                  display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center",
                  padding: "10px 12px", borderRadius: 8,
                  background: checkedDocs[doc.code] ? "var(--primary-tint,#eff6ff)" : "var(--surface-muted,#f9fafb)",
                  border: `1px solid ${checkedDocs[doc.code] ? "var(--primary-light,#bfdbfe)" : "var(--line,#e5e7eb)"}`,
                }}>
                  <input type="checkbox" id={`supp-${doc.code}`} checked={!!checkedDocs[doc.code]} onChange={() => toggleDoc(doc.code)}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }} />
                  <label htmlFor={`supp-${doc.code}`} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{doc.name}</span>
                    <StatusBadge value={doc.status} />
                  </label>
                  <input type="text" placeholder="사유 (선택)" value={reasons[doc.code] ?? ""} onChange={(e) => setReason(doc.code, e.target.value)}
                    disabled={!checkedDocs[doc.code]}
                    style={{ fontSize: 13, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--line,#e5e7eb)", width: 200,
                      background: checkedDocs[doc.code] ? "#fff" : "var(--surface-muted,#f9fafb)",
                      color: checkedDocs[doc.code] ? "var(--text-primary)" : "var(--text-muted,#9ca3af)", outline: "none" }} />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary,#374151)" }}>학생 안내 메시지 (선택)</label>
              <textarea value={globalMessage} onChange={(e) => setGlobalMessage(e.target.value)}
                placeholder="학생에게 전달할 추가 안내 사항을 입력하세요." rows={3}
                style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line,#e5e7eb)", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="secondaryButton" onClick={() => setShowPanel(false)}>취소</button>
              <button type="button" className="primaryButton" onClick={handleSendSupplement} disabled={sending}>
                {sending ? "전송 중..." : "보완 요청 보내기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModalDoc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setUploadModalDoc(null); setUploadFile(null); } }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 12, padding: 28, width: "min(440px, 95vw)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>서류 업로드</h2>
              <button type="button" onClick={() => { setUploadModalDoc(null); setUploadFile(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted,#9ca3af)", lineHeight: 1, padding: 4 }}>✕</button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted,#6b7280)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{uploadModalDoc.name}</strong> 서류 파일을 선택하세요. 관리자가 직접 올리는 서류이므로 업로드 즉시 제출 처리됩니다.
            </p>
            <input type="file" accept="image/*,.pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              style={{ width: "100%", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
            {uploadFile && <p style={{ fontSize: 12, color: "var(--color-success,#059669)", margin: "0 0 8px" }}>선택됨: {uploadFile.name}</p>}
            {linkError && <p style={{ fontSize: 12, color: "var(--color-error,#dc2626)", margin: "0 0 8px" }}>{linkError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" className="secondaryButton" onClick={() => { setUploadModalDoc(null); setUploadFile(null); }}>취소</button>
              <button type="button" className="primaryButton" onClick={handleConfirmUpload} disabled={!uploadFile || uploading}>
                {uploading ? "업로드 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 260px", gap: 0, alignItems: "stretch", minHeight: "calc(100vh - 220px)", border: "1px solid var(--line,#e5e7eb)", borderRadius: 8, overflow: "hidden" }}>
        {/* 왼쪽: 서류 체크리스트 */}
        <div style={{ borderRight: "1px solid var(--line,#e5e7eb)", background: "var(--surface-2,#f9fafb)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line,#e5e7eb)", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted,#6b7280)", letterSpacing: "0.06em" }}>
            {caseData.applicationType} · 필요서류
            <span style={{ float: "right", color: caseData.missingCount > 0 ? "var(--color-error,#dc2626)" : "var(--color-success,#059669)" }}>
              {caseData.submittedCount}/{caseData.submittedCount + caseData.missingCount} · {caseData.missingCount > 0 ? `${caseData.missingCount}개 누락` : "완비"}
            </span>
          </div>
          <div className="documentStatusList" style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
            {caseData.documents.map((doc) => (
              <div key={doc.code}>
                <button
                  type="button"
                  className={`documentStatusButton${selectedDocCode === doc.code ? " isActive" : ""}`}
                  onClick={() => setSelectedDocCode(doc.code)}
                  style={{ borderLeft: doc.status === "미제출" ? "3px solid var(--color-error,#dc2626)" : undefined }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", wordBreak: "keep-all", overflowWrap: "anywhere", lineHeight: 1.3 }}>
                      {doc.name}
                      {(doc.sourceFilenames?.length ?? 0) > 1 && (
                        <span style={{ marginLeft: 6, fontSize: "0.72rem", fontWeight: 600, color: "var(--primary,#2563eb)" }}>· {doc.sourceFilenames.length}장</span>
                      )}
                    </strong>
                    {doc.sourceFilename && (
                      <p style={{ fontSize: "0.75rem", marginTop: 2, color: "var(--color-text-muted, #9ca3af)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.sourceFilename}</p>
                    )}
                  </div>
                  <StatusBadge value={doc.status} />
                </button>
                {doc.status === "미제출" && (
                  <button type="button" style={{ width: "100%", fontSize: 12, fontWeight: 600, padding: "5px 12px", background: "var(--primary-tint,#eff6ff)", border: "none", borderTop: "1px dashed var(--line,#e5e7eb)", cursor: "pointer", color: "var(--primary,#2563eb)", textAlign: "left" }}
                    onClick={() => { setUploadModalDoc(doc); setUploadFile(null); setLinkError(""); }}>
                    + 서류 업로드
                  </button>
                )}
              </div>
            ))}
            {caseData.otherDocuments?.length > 0 && (
              <>
                <div style={{ padding: "8px 12px 4px", fontSize: "0.75rem", color: "var(--color-text-muted, #9ca3af)", fontWeight: 600, letterSpacing: "0.04em", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span>기타 서류 ({caseData.otherDocuments.length}건)</span>
                  <button
                    type="button"
                    onClick={toggleScanTidyMode}
                    title="기타 스캔을 양식에 일괄 배정하는 정리 모드"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 10,
                      border: scanTidyMode ? "1px solid var(--primary,#2563eb)" : "1px solid var(--line,#e5e7eb)",
                      background: scanTidyMode ? "var(--primary-tint,#eff6ff)" : "none",
                      color: scanTidyMode ? "var(--primary,#2563eb)" : "var(--color-text-muted,#9ca3af)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    스캔 정리{scanTidyMode ? " 끄기" : ""}
                  </button>
                </div>
                {caseData.otherDocuments.map((filename) => {
                  const checked = selectedOthers.includes(filename);
                  return (
                    <div
                      key={filename}
                      className={`documentStatusButton${selectedDocCode === `other:${filename}` ? " isActive" : ""}`}
                      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: checked ? "var(--primary-tint,#eff6ff)" : undefined }}
                      onClick={() => setSelectedDocCode(`other:${filename}`)}
                    >
                      {scanTidyMode && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleOther(filename)}
                          style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--primary)", flexShrink: 0 }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontWeight: 400 }}>기타</strong>
                        <p style={{ fontSize: "0.75rem", marginTop: 2, color: "var(--color-text-muted, #9ca3af)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filename}</p>
                      </div>
                      <span className="status statusNeutral">제출</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* 다중 선택 일괄 적용 바 (스캔 정리 모드에서만) */}
          {scanTidyMode && selectedOthers.length > 0 && (
            <div style={{ borderTop: "1px solid var(--line,#e5e7eb)", padding: "10px 12px", background: "var(--primary-tint,#eff6ff)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>선택 {selectedOthers.length}건</div>
              <select
                value={bulkTargetCode}
                onChange={(e) => setBulkTargetCode(e.target.value)}
                style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid var(--line,#e5e7eb)", borderRadius: 8, background: "#fff", color: "var(--text-primary)" }}
              >
                <option value="">양식 선택…</option>
                {caseData.documents.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}{d.status === "미제출" ? " · 미제출" : (d.sourceFilenames?.length || (d.sourceFilename ? 1 : 0)) ? ` · ${d.sourceFilenames?.length || 1}장` : ""}
                  </option>
                ))}
              </select>
              {bulkError && <p style={{ margin: 0, fontSize: 12, color: "var(--color-error,#dc2626)" }}>⚠ {bulkError}</p>}
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="secondaryButton" style={{ fontSize: 12, padding: "6px 10px", flex: 1 }} onClick={() => { setSelectedOthers([]); setBulkTargetCode(""); setBulkError(""); }}>
                  선택 해제
                </button>
                <button type="button" className="primaryButton" style={{ fontSize: 12, padding: "6px 10px", flex: 1, whiteSpace: "nowrap" }} disabled={!bulkTargetCode || bulkApplying} onClick={handleBulkApply}>
                  {bulkApplying ? "적용 중…" : "일괄 적용"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 가운데: 이미지 뷰어 */}
        <div style={{ background: "#fff", display: "flex", flexDirection: "column", padding: 16, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>{selectedDoc?.name ?? otherFilename ?? "서류 미선택"}</strong>
            {selectedDoc && <span className={STATUS_CLASS_MAP[selectedDoc.status] ?? "status statusNeutral"}>{selectedDoc.status}</span>}
            {selectedDoc?.note && (
              <span style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>
                {selectedDoc.note}
              </span>
            )}
            {selectedDocFiles.length > 1 && (
              <span style={{ fontSize: 12, color: "var(--text-muted,#6b7280)" }}>{safeFileIndex + 1} / {selectedDocFiles.length}장</span>
            )}
          </div>
          {selectedDocFiles.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedDocFiles.map((fn, idx) => {
                const active = idx === safeFileIndex;
                return (
                  <button
                    key={fn}
                    type="button"
                    onClick={() => setActiveFileIndex(idx)}
                    title={fn}
                    style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${active ? "var(--primary,#2563eb)" : "var(--line,#e5e7eb)"}`,
                      background: active ? "var(--primary-tint,#eff6ff)" : "#fff",
                      color: active ? "var(--primary,#2563eb)" : "var(--text-secondary,#374151)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {idx + 1}장
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            {imageFilename ? (
              <div
                onClick={() => openZoom(imageFilename)}
                title="클릭하면 확대 (확대 후 휠로 줌, 드래그로 이동)"
                style={{ maxHeight: "calc(100vh - 300px)", aspectRatio: "210 / 297", overflow: "hidden", border: "1px solid var(--line)", borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in" }}>
                <AuthenticatedImage batchId={batchId} filename={imageFilename}
                  imgStyle={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              </div>
            ) : (
              <div style={{ width: "100%", minHeight: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--surface-2,#f9fafb)", border: "1px dashed var(--line,#e5e7eb)", borderRadius: 6, padding: 24 }}>
                {selectedDoc ? (
                  <>
                    <span className={STATUS_CLASS_MAP[selectedDoc.status] ?? "status statusNeutral"}>{selectedDoc.status}</span>
                    <strong>{selectedDoc.name}</strong>
                    <p style={{ color: "var(--text-muted,#6b7280)", fontSize: "0.875rem", margin: 0 }}>
                      {selectedDoc.status === "미제출" ? "아직 제출되지 않은 서류입니다." : "이미지 파일 정보가 없습니다."}
                    </p>
                  </>
                ) : <p style={{ color: "var(--text-muted,#9ca3af)", margin: 0 }}>왼쪽에서 서류를 선택하세요</p>}
              </div>
            )}
          </div>

          {imageFilename && (
            <div style={{ borderTop: "1px solid var(--line,#e5e7eb)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted,#6b7280)", letterSpacing: "0.04em" }}>
                이 스캔의 양식
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted,#9ca3af)", lineHeight: 1.5 }}>
                이 스캔의 양식을 바꾸거나 ‘기타(미지정)’로 빼낼 수 있습니다. 여러 장이면 위 탭에서 장을 선택한 뒤 변경하세요.
              </p>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={isOtherDoc ? "OTHER" : (selectedDoc?.code ?? "OTHER")}
                  disabled={mapping}
                  onChange={(e) => handleMoveScan(imageFilename, e.target.value)}
                  style={{ flex: "1 1 120px", minWidth: 120, fontSize: 12, padding: "6px 8px", border: "1px solid var(--line,#e5e7eb)", borderRadius: 10, background: "#fff", color: "var(--text-primary)" }}
                >
                  {caseData.documents.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}{d.status === "미제출" ? " · 미제출" : ((d.sourceFilenames?.length || (d.sourceFilename ? 1 : 0)) ? ` · ${d.sourceFilenames?.length || 1}장` : "")}
                    </option>
                  ))}
                  <option value="OTHER">기타(미지정) — 양식에서 제외</option>
                </select>
                {mapping && <span style={{ fontSize: 12, color: "var(--text-muted,#9ca3af)" }}>이동 중…</span>}
              </div>
              {mapFeedback && (
                <p style={{ margin: 0, fontSize: 12, color: mapFeedback.type === "ok" ? "var(--color-success,#166534)" : "var(--color-error,#dc2626)" }}>
                  {mapFeedback.type === "ok" ? "✓ " : "⚠ "}{mapFeedback.text}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 오른쪽: 케이스 패널 */}
        <div style={{ borderLeft: "1px solid var(--line,#e5e7eb)", background: "#fff", display: "flex", flexDirection: "column", padding: 16, gap: 14, overflowY: "auto" }}>
          {/* 상태 → 검토 체크리스트 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted,#9ca3af)", letterSpacing: "0.08em" }}>검토 체크리스트</div>
              {reviewIssues.length === 0 ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-success,#059669)" }}>✓ 이슈 없음</span>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-error,#dc2626)" }}>남은 이슈 {reviewIssues.length}건</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {(() => {
                const isCompleted = caseData.status === "COMPLETED";
                return (
                  <span className={isCompleted ? "status statusSuccess" : "status statusWarning"}>
                    {isCompleted ? "● 학생 목록 반영됨" : "● 검토 필요"}
                  </span>
                );
              })()}
            </div>
            {reviewIssues.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8, ...(reviewIssues.length > 6 ? { maxHeight: 160, overflowY: "auto" } : {}) }}>
                {reviewIssues.map((issue) => {
                  const color = issue.type === "field" ? "var(--color-error,#dc2626)"
                    : issue.type === "missing" ? "#ea580c"
                    : "#ca8a04";
                  return (
                    <button
                      key={`${issue.type}:${issue.key ?? issue.code}`}
                      type="button"
                      title={issue.detail || issue.label}
                      onClick={() => {
                        if (issue.type === "field") openFieldEditFromChecklist(issue.key);
                        else setSelectedDocCode(issue.code);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", borderLeft: `2px solid ${color}`, padding: "2px 4px 2px 8px", cursor: "pointer", textAlign: "left", fontSize: 12, color: "var(--text-primary,#0f172a)" }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {caseData.status === "COMPLETED" ? (
              <button type="button" className="secondaryButton" style={{ fontSize: 11, padding: "4px 10px", width: "100%" }}
                disabled={statusSaving}
                onClick={() => { if (window.confirm("이 학생을 검토 상태로 되돌리고 학생 목록에서 뺄까요?")) handleSetCaseStatus("NEEDS_REVIEW"); }}>
                {statusSaving ? "처리 중..." : "검토로 되돌리기 (목록에서 빼기)"}
              </button>
            ) : (
              <button type="button" className="primaryButton"
                style={{ fontSize: 11, padding: "4px 10px", width: "100%", ...(reviewIssues.length === 0 ? { background: "var(--color-success,#059669)", borderColor: "var(--color-success,#059669)" } : {}) }}
                disabled={statusSaving}
                onClick={() => {
                  const confirmText = reviewIssues.length > 0
                    ? `남은 이슈 ${reviewIssues.length}건이 있습니다. 그래도 검토를 완료하고 학생 목록에 추가할까요?`
                    : "이 학생의 검토를 완료하고 학생 목록에 추가할까요?";
                  if (window.confirm(confirmText)) handleSetCaseStatus("COMPLETED");
                }}>
                {statusSaving ? "처리 중..." : "검토 완료 · 학생 목록에 추가"}
              </button>
            )}
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--line,#e5e7eb)", margin: 0 }} />

          {/* 학생 정보 / 수정 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted,#9ca3af)", letterSpacing: "0.08em" }}>학생 정보</div>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="button" style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--primary,#2563eb)", padding: 0 }} onClick={() => setShowExtraInfo(true)}>
                  상세보기
                </button>
              </div>
            </div>
            {(() => {
                let validations = {};
                try {
                  validations = caseData.fieldValidations ? JSON.parse(caseData.fieldValidations) : {};
                } catch {
                  validations = {};
                }
                return (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
                {[
                  ["이름", caseData.studentName ? formatStudentName(caseData.studentName) : caseData.studentName, true, null, "name"],
                  ["국적", caseData.nationality, true, "nationality", "nationality"],
                  ["생년월일", caseData.birthDate, true, null, "birthDate"],
                  ["여권번호", caseData.passportNumber, true, null, "passportNumber"],
                  ["외국인등록번호", formatAlienRegistrationNumber(caseData.alienRegistrationNumber), false, "alien_registration_number", "alienRegistrationNumber"],
                  ["전화번호", caseData.phoneNumber, false, null, "phoneNumber"],
                  ["주소", caseData.address, false, "address", "address"],
                  ["신청 타입", caseData.applicationType, true, null, null],
                ].map(([label, val, required, vkey, apiField]) => {
                  const unknown = !val || val === "UNKNOWN";
                  const alertMissing = unknown && required;
                  const v = vkey ? validations[vkey] : null;
                  const invalid = v && v.status === "invalid";
                  const unverified = v && v.status === "unverified";
                  const editable = Boolean(apiField);
                  const isEditing = editable && editingField === apiField;
                  const isHighlighted = editable && highlightField === apiField;
                  if (isEditing) {
                    return (
                      <div key={label} style={{ background: isHighlighted ? "#dbeafe" : undefined, borderRadius: 6, transition: "background 0.18s ease" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ color: "var(--text-muted,#9ca3af)", flexShrink: 0 }}>{label}</span>
                          <input
                            autoFocus
                            type="text"
                            value={editingValue}
                            disabled={savingField}
                            placeholder={apiField === "birthDate" ? "YYYY-MM-DD" : label}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleFieldSave();
                              else if (e.key === "Escape") cancelFieldEdit();
                            }}
                            style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "2px 6px", border: "1px solid var(--primary,#2563eb)", borderRadius: 6, outline: "none" }}
                          />
                          <button type="button" title="저장 (Enter)" disabled={savingField} onClick={handleFieldSave}
                            style={{ background: "none", border: "none", cursor: savingField ? "default" : "pointer", color: "var(--color-success,#059669)", fontSize: 13, padding: "0 2px", lineHeight: 1 }}>
                            {savingField ? "⏳" : "✓"}
                          </button>
                          <button type="button" title="취소 (Esc)" disabled={savingField} onClick={cancelFieldEdit}
                            style={{ background: "none", border: "none", cursor: savingField ? "default" : "pointer", color: "var(--text-muted,#9ca3af)", fontSize: 13, padding: "0 2px", lineHeight: 1 }}>
                            ✕
                          </button>
                        </div>
                        {editError && (
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-error,#dc2626)" }}>{editError}</p>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={label}
                      style={{ display: "flex", justifyContent: "space-between", gap: 8, background: isHighlighted ? "#dbeafe" : undefined, borderRadius: 6, transition: "background 0.18s ease" }}>
                      <span style={{ color: "var(--text-muted,#9ca3af)", flexShrink: 0 }}>{label}</span>
                      <span
                        title={editable ? "클릭하여 수정" : undefined}
                        onClick={editable ? () => startFieldEdit(apiField) : undefined}
                        style={{ color: alertMissing || invalid ? "var(--color-error,#dc2626)" : (unknown ? "var(--text-muted,#9ca3af)" : undefined), fontWeight: alertMissing || invalid ? 600 : undefined, textAlign: "right", wordBreak: "break-all", cursor: editable ? "pointer" : undefined }}>
                        {unknown ? (required ? "⚠ 미입력" : "—") : val}
                        {invalid && (
                          <span title={v.detail} style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: "var(--color-error,#dc2626)", borderRadius: 4, padding: "1px 5px", cursor: "help" }}>⚠ 검증실패</span>
                        )}
                        {unverified && (
                          <span title={v.detail} style={{ marginLeft: 6, fontSize: 10, color: "var(--text-muted,#9ca3af)", border: "1px solid var(--line,#e5e7eb)", borderRadius: 4, padding: "1px 5px", cursor: "help" }}>미검증</span>
                        )}
                        {editable && (
                          <span aria-hidden="true" style={{ marginLeft: 5, fontSize: 10, color: "var(--text-muted,#c7ccd4)" }}>✎</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
                );
              })()}
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--line,#e5e7eb)", margin: 0 }} />

          {/* 활동 타임라인 */}
          <div>
            <button
              type="button"
              onClick={() => setShowTimeline((prev) => !prev)}
              style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted,#9ca3af)", letterSpacing: "0.08em", marginBottom: showTimeline ? 8 : 0 }}
            >
              <span>활동 타임라인 ({activities.length}건)</span>
              <span style={{ fontSize: 9 }}>{showTimeline ? "▾" : "▸"}</span>
            </button>
            {showTimeline && (
              activities.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted,#9ca3af)", margin: 0 }}>활동 내역 없음</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activities.map((a, i) => {
                    const color = a.type === "CREATED" ? "var(--text-muted,#9ca3af)"
                      : a.type === "SUPPLEMENT_REQUESTED" ? "var(--color-warning,#d97706)"
                      : a.type === "STUDENT_UPLOADED" ? "var(--color-success,#059669)"
                      : "var(--primary,#2563eb)";
                    return (
                      <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${color}` }}>
                        <div style={{ fontSize: 10, color: "var(--text-muted,#9ca3af)" }}>{a.time} · {a.actor}</div>
                        <div style={{ fontSize: 12, lineHeight: 1.35 }}>{a.description}</div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* 보완 요청 버튼 */}
          {!showPanel && (
            <button type="button" className="primaryButton" style={{ width: "100%", fontSize: 13 }} onClick={() => setShowPanel(true)}>
              보완 요청 작성
            </button>
          )}
          {showPanel && (
            <button type="button" className="secondaryButton" style={{ width: "100%", fontSize: 13 }} onClick={() => setShowPanel(false)}>
              보완 요청 닫기
            </button>
          )}
        </div>
      </div>

      {showExtraInfo && (
        <StudentExtraInfoModal
          extraInfo={caseData.extraInfo}
          studentName={caseData.studentName}
          onClose={() => setShowExtraInfo(false)}
        />
      )}
    </>
  );
}

// ─── 업로드 처리 4단계 ───────────────────────────────────────────────────────

const UPLOAD_PIPELINE_STEPS = [
  { key: "unzip",   label: "ZIP 해제",   desc: "서버에서 ZIP 파일을 해제합니다." },
  { key: "index",   label: "배치 인덱싱", desc: "페이지별 OCR/분류 작업을 실행합니다." },
  { key: "group",   label: "그룹화",      desc: "통합신청서 기준으로 학생 케이스를 묶습니다." },
  { key: "extract", label: "텍스트 추출", desc: "LLM으로 필드를 추출하고 케이스에 반영합니다." },
];

const TERMINAL_BATCH_STATUSES_SET = new Set([
  "COMPLETED", "RESULT_UPLOADED", "NEEDS_REVIEW", "FAILED", "CANCELED", "CANCELLED",
]);

function deriveStepStates(batch) {
  if (!batch) return ["current", "upcoming", "upcoming", "upcoming"];

  const batchStatus = (batch.uploadBatchStatusRaw ?? "").toUpperCase();
  const jobStatus   = (batch.processingJobStatusRaw ?? "").toUpperCase();
  const hasJob      = Boolean(batch.processingJobId);
  const hasCases    = Array.isArray(batch.cases) && batch.cases.length > 0;

  const isBatchDone = hasTerminalBatchStatus(batchStatus) || batchStatus === "VALIDATING" || batchStatus === "EXTRACTING" && hasTerminalProcessingStatus(jobStatus);
  const isJobDone   = hasTerminalProcessingStatus(jobStatus);
  if (isBatchDone || (isJobDone && hasCases)) return ["done", "done", "done", "done"];
  if (batchStatus === "EXTRACTING" || hasCases) return ["done", "done", "done", "current"];
  if (jobStatus === "SUCCEEDED" || jobStatus === "PARTIAL_SUCCESS") return ["done", "done", "current", "upcoming"];
  if (hasJob || jobStatus === "RUNNING" || ["PROCESSING", "RUNNING", "IN_PROGRESS"].includes(batchStatus)) {
    return ["done", "current", "upcoming", "upcoming"];
  }
  return ["done", "upcoming", "upcoming", "upcoming"];
}

function UploadProcessingSteps({ batch }) {
  const states  = deriveStepStates(batch);
  const allDone = states.every((s) => s === "done");
  const failed  = (batch?.uploadBatchStatusRaw ?? "").toUpperCase() === "FAILED";

  return (
    <div style={{ marginTop: 16 }}>
      <style>{`@keyframes pipelineSpin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex" }}>
        {UPLOAD_PIPELINE_STEPS.map((step, i) => {
          const state  = failed && i > 0 ? "upcoming" : states[i];
          const isLast = i === UPLOAD_PIPELINE_STEPS.length - 1;
          const lineColor = states[i + 1] === "upcoming" ? "var(--line,#e5e7eb)" : "var(--primary,#2563eb)";
          return (
            <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <div style={{ flex: 1, height: 2, background: i === 0 ? "transparent" : state === "upcoming" ? "var(--line,#e5e7eb)" : "var(--primary,#2563eb)" }} />
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, border: "2px solid",
                  background: state === "done" ? "var(--primary,#2563eb)" : state === "current" ? "#fff" : "var(--surface-2,#f3f4f6)",
                  borderColor: state === "upcoming" ? "var(--line,#e5e7eb)" : "var(--primary,#2563eb)",
                  color: state === "done" ? "#fff" : state === "current" ? "var(--primary,#2563eb)" : "var(--text-muted,#9ca3af)",
                }}>
                  {state === "done" ? "✓" : state === "current" ? (
                    <span style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--primary,#2563eb)", borderTopColor: "transparent", display: "inline-block", animation: "pipelineSpin 0.8s linear infinite" }} />
                  ) : i + 1}
                </div>
                <div style={{ flex: 1, height: 2, background: isLast ? "transparent" : lineColor }} />
              </div>
              <div style={{ textAlign: "center", marginTop: 6, padding: "0 2px" }}>
                <div style={{ fontSize: 12, fontWeight: state === "current" ? 700 : 500, color: state === "upcoming" ? "var(--text-muted,#9ca3af)" : state === "current" ? "var(--primary,#2563eb)" : "var(--text,#111)" }}>
                  {step.label}
                </div>
                {state === "current" && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary,#6b7280)", marginTop: 2, lineHeight: 1.3 }}>{step.desc}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {allDone && !failed && (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--success,#059669)", textAlign: "center" }}>✓ 모든 단계 완료</p>
      )}
      {failed && (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--error,#dc2626)", textAlign: "center" }}>처리 중 오류가 발생했습니다.</p>
      )}
    </div>
  );
}

const REPROCESSABLE_STATUSES = new Set(["RESULT_UPLOADED", "NEEDS_REVIEW", "FAILED"]);

// 검토 우선순위 티어 — 업로드 상세 "검토 필요" 목록과 케이스 상세 "검토 n/N" 큐가
// 반드시 같은 순서가 되도록 공용 함수로 통일 (2026-07-09: 두 화면 순서 불일치 수정).
// 필수 신원(1) > 누락(1.5) > 전화(2) > 주소(3) > 기타 서류검수(5)
const REVIEW_TIER_BY_FIELD = {
  date_of_birth: 1, passport_number: 1, nationality: 1, alien_registration_number: 1, student_name: 1,
  phone_number: 2, address: 3,
};
function caseReviewTier(c) {
  let tier = 9;
  try {
    const validations = c.fieldValidations ? JSON.parse(c.fieldValidations) : {};
    for (const [field, v] of Object.entries(validations)) {
      if (v && (v.status === "invalid" || v.status === "review")) {
        tier = Math.min(tier, REVIEW_TIER_BY_FIELD[field] ?? 3);
      }
    }
  } catch { /* 파싱 실패 시 기본 티어 유지 */ }
  if ((c.missingCount ?? 0) > 0) tier = Math.min(tier, 1.5);
  return tier === 9 ? 5 : tier;
}

function AgencyUploadHistoryDetailPage({ batch, onBack, backLabel = "업로드 내역", ocrProgress, session, onOpenCaseDetail, onReprocessDone, onToggleExclude }) {
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
                color: "var(--text-muted, #9ca3af)",
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
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.8125rem", color: "var(--text-secondary,#6b7280)" }}>
              <span>{progressTotal > 0 ? `파일 ${progressDone} / ${progressTotal}개 처리됨` : `${batch.processingFileCount || 0}개 파일 분석 대기 중`}</span>
              {progressTotal > 0 && <span>{progressPct}%</span>}
            </div>
            <div style={{ height: "6px", background: "var(--color-surface-2, #e5e7eb)", borderRadius: "4px", overflow: "hidden" }}>
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
          address: "주소", phone_number: "전화번호",
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
          ? { bg: "var(--color-error-soft, #fee2e2)", fg: "var(--color-error, #991b1b)", bold: true }
          : tier < 2
            ? { bg: "#ffedd5", fg: "#9a3412", bold: true }
            : tier === 2
              ? { bg: "#ffedd5", fg: "#9a3412", bold: false }
              : { bg: "var(--color-warning-soft, #fef3c7)", fg: "var(--color-warning, #92400e)", bold: false };
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
                  <td data-label="신청 타입">{c.applicationType}</td>
                  <td data-label="제출">{c.submittedCount}건</td>
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
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button type="button" className="secondaryButton" style={{ fontSize: "0.8rem", padding: "4px 10px" }} onClick={() => onOpenCaseDetail(c.id)}>
                        상세보기
                      </button>
                      {showExclude && onToggleExclude && (
                        <button
                          type="button"
                          className="secondaryButton"
                          style={{ fontSize: "0.8rem", padding: "4px 10px", color: "var(--color-error, #dc2626)" }}
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
              <section className="surfaceCard" style={{ borderLeft: "3px solid var(--primary, #2563eb)" }}>
                <div className="sectionHeading" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h2>검토 필요 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--primary, #2563eb)", marginLeft: 6 }}>{reviewCases.length}명</span></h2>
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
              <section className="surfaceCard" style={{ borderLeft: "3px solid var(--color-success, #059669)" }}>
                <div className="sectionHeading">
                  <h2>학생 목록 반영됨 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--color-success, #059669)", marginLeft: 6 }}>{reflectedCases.length}명</span></h2>
                  <p>검토가 끝나 학생 목록(대시보드)에 반영된 학생입니다. 잘못 들어갔으면 <b>[제외]</b>로 목록에서 뺄 수 있습니다.</p>
                </div>
                <CaseTable cases={reflectedCases} showExclude />
              </section>
            )}
            {failedCases.length > 0 && (
              <section className="surfaceCard" style={{ borderLeft: "3px solid var(--color-error, #dc2626)" }}>
                <div className="sectionHeading">
                  <h2>추출 실패 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--color-error, #dc2626)", marginLeft: 6 }}>{failedCases.length}명</span></h2>
                  <p>텍스트 추출에 실패했습니다. 재처리하거나 상세에서 수동으로 정보를 확인하세요.</p>
                </div>
                <CaseTable cases={failedCases} showExclude={false} />
              </section>
            )}
            {excludedCases.length > 0 && (
              <section className="surfaceCard" style={{ borderLeft: "3px solid var(--text-muted, #9ca3af)" }}>
                <div className="sectionHeading">
                  <h2>제외된 케이스 <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-muted, #9ca3af)", marginLeft: 6 }}>{excludedCases.length}명</span></h2>
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
                        <td data-label="신청 타입">{c.applicationType}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button type="button" className="secondaryButton" style={{ fontSize: "0.8rem", padding: "4px 10px" }} onClick={() => onOpenCaseDetail(c.id)}>
                              상세보기
                            </button>
                            {onToggleExclude && (
                              <button
                                type="button"
                                className="primaryButton"
                                style={{ fontSize: "0.8rem", padding: "4px 10px" }}
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

// 학생 로그인 자격(3필드) 탭 세션 보관 — 새로고침 시 자동 재로그인용.
// sessionStorage라 탭을 닫으면 사라진다(공용 PC에서 PII가 남지 않도록 localStorage는 쓰지 않음).
const STUDENT_CREDS_KEY = "immigrationOps.studentLogin";
function saveStudentCreds(form) {
  try { sessionStorage.setItem(STUDENT_CREDS_KEY, JSON.stringify(form)); } catch { /* 저장 실패해도 로그인 자체는 유지 */ }
}
function loadStudentCreds() {
  try {
    const raw = sessionStorage.getItem(STUDENT_CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearStudentCreds() {
  try { sessionStorage.removeItem(STUDENT_CREDS_KEY); } catch { /* noop */ }
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // URL이 화면의 단일 진실원. page/파라미터는 여기서 파생된다.
  const matchedRoute = matchRoute(location.pathname);
  const page = matchedRoute?.page ?? "login";
  const routeBatchId = matchedRoute?.params?.batchId ?? null;
  const routeCaseId = matchedRoute?.params?.caseId ?? null;
  const routeApplicationId = matchedRoute?.params?.applicationId ?? null;
  // 드릴다운할 때 출발 화면을 히스토리 state로 넘긴다 → "돌아가기" 문구를 출발지에 맞춘다.
  const originPage = location.state?.from ?? null;

  /** 화면 이동. 상세로 들어갈 땐 출발지를 함께 기록한다. */
  const goToPage = useCallback(
    (nextPage, params = {}, options = {}) => {
      navigate(pathForPage(nextPage, params), {
        state: { from: options.from ?? null },
        replace: Boolean(options.replace),
      });
    },
    [navigate],
  );

  /**
   * 돌아가기. 실제 브라우저 히스토리를 되감는다.
   * 링크/새로고침으로 곧장 들어와 되돌아갈 항목이 없으면 fallbackPage로 보낸다.
   */
  const goBack = useCallback(
    (fallbackPage, params = {}) => {
      if (location.key !== "default") {
        navigate(-1);
        return;
      }
      navigate(pathForPage(fallbackPage, params), { replace: true });
    },
    [navigate, location.key],
  );

  const [loginType, setLoginType] = useState("student");
  const [studentForm, setStudentForm] = useState(loginDefaults.student);
  const [orgForms, setOrgForms] = useState(emptyOrgForms);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [studentApplications, setStudentApplications] = useState([]);
  const [schoolStudents, setSchoolStudents] = useState([]);
  const [agencyApplications, setAgencyApplications] = useState([]);
  const [agencyApplicationDetail, setAgencyApplicationDetail] = useState(null);
  const [agencyUploadBatches, setAgencyUploadBatches] = useState([]);
  const [agencyUploadBatchDetail, setAgencyUploadBatchDetail] = useState(null);
  // 학교 화면 목록 필터도 URL에 (학생 목록·보완 접수와 같은 원칙)
  const [schoolSearch, setSchoolSearch] = useUrlState("q", "");
  const [schoolSearchField, setSchoolSearchField] = useUrlState("field", "name");
  const [schoolStatusFilter, setSchoolStatusFilter] = useUrlState("status", ALL_FILTER);
  const [schoolVisaFilter, setSchoolVisaFilter] = useUrlState("visa", ALL_FILTER);
  const [agencySearch, setAgencySearch] = useState("");
  const [agencySearchField, setAgencySearchField] = useState("studentName");
  const [agencyStatusFilter, setAgencyStatusFilter] = useState(ALL_FILTER);
  const [agencyPreviewId, setAgencyPreviewId] = useState(null);
  const [agencyBatchId, setAgencyBatchId] = useState(null);
  const [uploadFeedback, setUploadFeedback] = useState(EMPTY_UPLOAD_FEEDBACK);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM);
  const [selectedZipFile, setSelectedZipFile] = useState(null);
  const [schools, setSchools] = useState([]);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [pollRestartKey, setPollRestartKey] = useState(0);
  // 검토 컨텍스트 — 어느 목록에서 케이스 상세로 들어왔는지.
  // 케이스 상세의 "n/N"과 이전/다음 이동이 이 목록을 기준으로 동작해야 한다(어디서 어디로 갔는지 유지).
  // { label: 화면명, ids: 그 목록의 케이스 id 배열(목록과 같은 순서) }
  const [reviewContext, setReviewContext] = useState(null);
  const [bootRecovering, setBootRecovering] = useState(true);
  const [loginErrorModal, setLoginErrorModal] = useState(null);

  // 학생 상세는 URL이 곧 선택된 신청 건이다.
  const studentApplicationId = routeApplicationId;

  // 전역 세션 만료 처리: refresh 최종 실패 시 로그인 화면으로.
  useEffect(() => {
    setOnAuthExpired(() => {
      resetRoleData();
      setSession(null);
      navigate(pathForPage("login"), { replace: true });
      setError("세션이 만료되어 다시 로그인해주세요.");
    });
    return () => setOnAuthExpired(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // URL의 배치 id를 상태로 반영 — 딥링크/새로고침/뒤로가기 모두 이 경로로 들어온다.
  useEffect(() => {
    if (routeBatchId) setAgencyBatchId(routeBatchId);
  }, [routeBatchId]);

  // 로그인 상태에서 URL이 비었거나 역할에 맞지 않으면 그 역할의 첫 화면으로.
  useEffect(() => {
    if (!session?.isAuthenticated) return;
    if (matchedRoute && pageAllowedForRole(matchedRoute.page, session.role)) return;
    navigate(homePathForRole(session.role), { replace: true });
  }, [session, matchedRoute, navigate]);

  // 앱 부팅 시 복구: refresh 토큰이 있으면 access 재발급 후 /auth/me로 사용자 확정.
  useEffect(() => {
    let cancelled = false;
    async function recover() {
      // 학생 세션 복구 — 탭 세션에 로그인 자격이 있으면 재조회로 복원(토큰도 재발급됨)
      const studentCreds = loadStudentCreds();
      if (studentCreds) {
        try {
          const result = await lookupStudentAccess(studentCreds);
          if (cancelled) return;
          setLoginType("student");
          setStudentApplications(result.applications);
          setSession(buildSession("student", { ...result.student, ...studentCreds }));
          // 화면 이동은 하지 않는다 — 새로고침 전에 보던 URL을 그대로 유지한다.
          // (역할에 맞지 않는 URL이면 위의 리다이렉트 effect가 첫 화면으로 보낸다.)
        } catch {
          // 자격 무효(관리자가 정보 수정 등) → 저장 자격 폐기하고 로그인 화면 유지
          clearStudentCreds();
        } finally {
          if (!cancelled) setBootRecovering(false);
        }
        return;
      }

      if (!getRefreshToken()) {
        if (!cancelled) setBootRecovering(false);
        return;
      }
      try {
        await refreshAccessToken();
        const me = await fetchMe();
        if (cancelled) return;
        const view = viewForBackendRole(me.role);
        setLoginType(view);
        setSession(buildSession(view, {
          username: me.username,
          displayName: me.username,
          backendRole: me.role,
        }));
        await loadDataForView(view);
        // 화면 이동은 하지 않는다 — 새로고침 전에 보던 URL을 그대로 유지한다.
      } catch {
        // 복구 실패 → 로그인 화면 유지
      } finally {
        if (!cancelled) setBootRecovering(false);
      }
    }
    recover();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.isAuthenticated) {
      return;
    }
    fetchSchools()
      .then(setSchools)
      .catch(() => {});
  }, [session?.isAuthenticated]);

  // URL에 배치 id가 있는데 아직 안 불러왔으면 불러온다.
  // (딥링크·새로고침·다른 배치의 케이스로 이전/다음 이동한 경우)
  useEffect(() => {
    if (!session?.isAuthenticated || !routeBatchId) return;
    if (agencyUploadBatchDetail?.id === routeBatchId) return;

    let cancelled = false;
    setIsLoading(true);
    fetchAgencyUploadBatchDetail(routeBatchId)
      .then((detail) => {
        if (cancelled) return;
        const normalized = normalizeAgencyUploadBatch(detail);
        setAgencyUploadBatchDetail(normalized);
        upsertAgencyUploadBatch(normalized);
      })
      .catch((exception) => {
        if (!cancelled) setRuntimeError(exception.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeBatchId, session?.isAuthenticated]);

  // URL에 케이스 id가 있는 신청 상세(/agency/cases/:caseId)도 마찬가지.
  useEffect(() => {
    if (!session?.isAuthenticated) return;
    if (page !== "agency-detail" || !routeCaseId) return;
    if (agencyApplicationDetail?.id === routeCaseId) return;

    let cancelled = false;
    setIsLoading(true);
    fetchAgencyApplicationDetail(routeCaseId)
      .then((detail) => {
        if (cancelled) return;
        setAgencyApplicationDetail(detail);
        setAgencyPreviewId(detail.documents[0]?.code ?? null);
      })
      .catch((exception) => {
        if (!cancelled) setRuntimeError(exception.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, routeCaseId, session?.isAuthenticated]);

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
    if (!agencyBatchId || !session?.isAuthenticated) {
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
          fetchAgencyUploadBatchDetail(agencyBatchId),
          fetchOcrProgress(agencyBatchId).catch(() => null),
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
          // 배치 처리 완료 → 신청/학생/보완 목록 즉시 갱신 (새로고침 없이 반영)
          fetchAgencyApplications()
            .then((cases) => setAgencyApplications(cases))
            .catch(() => {});
        }
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 재시도
      }
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyBatchId, session, pollRestartKey]);

  // 업로드 내역(목록) 화면 폴링: 목록에 처리 중(비-종결) 배치가 있는 동안만
  // 3초마다 목록을 갱신해 "텍스트 추출 중" 스피너가 완료 즉시 사라지도록 한다.
  // 모든 배치가 종결 상태가 되면 폴링을 멈춰 무한 폴링을 방지한다.
  const isBatchActive = (batch) => {
    const raw = (batch?.uploadBatchStatusRaw ?? "").toUpperCase();
    // raw 상태를 알 수 있으면 종결 집합 기준, 없으면 한글 진행 상태 기준으로 판단
    if (raw) return !BATCH_TERMINAL_STATUSES.has(raw);
    return ACTIVE_PROCESSING_STATUSES.has(batch?.status);
  };
  const LIST_POLLING_PAGES = new Set(["agency-dashboard", "agency-upload-history"]);
  // 활성 배치 존재 여부를 불리언으로 의존성에 둬, 폴링 결과로 목록 참조가 바뀔 때마다
  // 인터벌이 매번 재생성(타이머 리셋)되는 것을 막는다.
  const hasActiveListBatch = agencyUploadBatches.some(isBatchActive);
  useEffect(() => {
    if (!session?.isAuthenticated || !LIST_POLLING_PAGES.has(page)) {
      return;
    }
    if (!hasActiveListBatch) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const batches = await fetchAgencyUploadBatches();
        const normalizedBatches = Array.isArray(batches)
          ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
          : [];
        setAgencyUploadBatches(normalizedBatches);

        // 모든 배치가 종결 상태면 다음 주기를 기다리지 않고 즉시 중단
        if (!normalizedBatches.some(isBatchActive)) {
          clearInterval(intervalId);
          // 처리 완료 → 신청/학생 목록도 최신화 (새로고침 없이 반영)
          fetchAgencyApplications()
            .then((cases) => setAgencyApplications(cases))
            .catch(() => {});
        }
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 재시도
      }
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, session, hasActiveListBatch]);

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

  const navBadges = {};

  const selectedAgencyApplication = agencyApplicationDetail;
  const selectedAgencyDocument =
    selectedAgencyApplication?.documents.find(
      (document) => document.code === agencyPreviewId,
    ) ??
    selectedAgencyApplication?.documents[0] ??
    null;

  // URL에 배치가 지정돼 있으면 반드시 그 배치를 쓴다 — 직전 화면의 배치가 남아 보이면 안 된다.
  const activeBatchId = routeBatchId ?? agencyBatchId;
  const selectedAgencyBatch = activeBatchId
    ? (agencyUploadBatchDetail?.id === activeBatchId
        ? agencyUploadBatchDetail
        : agencyUploadBatches.find((batch) => batch.id === activeBatchId) ?? null)
    : agencyUploadBatchDetail ?? agencyUploadBatches[0] ?? null;

  // 케이스 상세도 URL이 진실원 — 새로고침해도 같은 케이스가 열린다.
  const selectedBatchCase =
    routeCaseId && selectedAgencyBatch?.id === routeBatchId
      ? selectedAgencyBatch?.cases?.find((item) => item.id === routeCaseId) ?? null
      : null;

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
    setAgencyPreviewId(null);
    setAgencyBatchId(null);
    setReviewContext(null);
    setUploadFeedback(EMPTY_UPLOAD_FEEDBACK);
    setUploadForm({ ...EMPTY_UPLOAD_FORM, receiptDate: new Date().toISOString().split("T")[0] });
    setSelectedZipFile(null);
  }

  function upsertAgencyUploadBatch(batch) {
    setAgencyUploadBatches((current) => {
      const nextBatch = normalizeAgencyUploadBatch(batch);
      const idx = current.findIndex((b) => b.id === nextBatch.id);
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = nextBatch;
        return copy;
      }
      return [nextBatch, ...current];
    });
  }

  /**
   * 신청 케이스 상세(/agency/cases/:caseId) 열기.
   * from = 출발 화면. 돌아가기 문구를 출발지에 맞추는 데만 쓰인다(실제 되돌아가기는 브라우저 히스토리).
   */
  async function openAgencyApplicationDetail(applicationId, nextSession = session, from = page) {
    if (!nextSession?.isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setRuntimeError("");

    try {
      const detail = await fetchAgencyApplicationDetail(applicationId);

      setAgencyApplicationDetail(detail);
      setAgencyPreviewId(detail.documents[0]?.code ?? null);
      // 상세에서 상세로 이동하면 원래 출발지를 유지하고 히스토리도 덮어쓴다
      // (뒤로가기가 상세 사이를 맴돌지 않게).
      const isDetailToDetail = page === "agency-detail";
      goToPage(
        "agency-detail",
        { caseId: applicationId },
        { from: isDetailToDetail ? originPage : from, replace: isDetailToDetail },
      );
    } catch (exception) {
      setRuntimeError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  /** 배치 상세 데이터만 다시 불러온다 — 화면 이동은 하지 않는다(히스토리 오염 방지). */
  async function refreshBatchDetail(batchId) {
    const currentBatch =
      agencyUploadBatches.find((batch) => batch.id === batchId) ??
      (uploadFeedback.batch?.id === batchId ? uploadFeedback.batch : null);
    const detail = await fetchAgencyUploadBatchDetail(batchId);
    const normalizedDetail = normalizeAgencyUploadBatch(detail, currentBatch);

    setAgencyBatchId(batchId);
    setAgencyUploadBatchDetail(normalizedDetail);
    upsertAgencyUploadBatch(normalizedDetail);
    return normalizedDetail;
  }

  async function openAgencyUploadBatchDetail(batchId, nextSession = session, from = page) {
    if (!nextSession?.isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setRuntimeError("");

    try {
      await refreshBatchDetail(batchId);
      goToPage("agency-upload-history-detail", { batchId }, { from });
    } catch (exception) {
      setRuntimeError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReprocessDone(batchId) {
    try {
      await refreshBatchDetail(batchId);
    } catch (exception) {
      setRuntimeError(exception.message);
    }
    setPollRestartKey((k) => k + 1);
  }

  // 업로드 상세에서 케이스 제외/추가 토글 — 처리 후 배치 상세를 다시 불러와 반영한다.
  async function handleToggleCaseExcludeInBatch(caseId, currentlyExcluded, batchId) {
    if (!session?.isAuthenticated || !caseId) return;
    setRuntimeError("");
    try {
      if (currentlyExcluded) {
        await includeAgencyCase(caseId);
      } else {
        await excludeAgencyCase(caseId);
      }
      if (batchId) await refreshBatchDetail(batchId);
    } catch (exception) {
      setRuntimeError(exception.message);
    }
  }

  // 환불 제외(swap-and-remove): 서버에서 슬롯 교체 후 목록을 다시 불러와 반영한다.
  async function handleExcludeAgencyCase(caseId) {
    if (!session?.isAuthenticated || !caseId) return;
    setRuntimeError("");
    try {
      await excludeAgencyCase(caseId);
      const cases = await fetchAgencyApplications();
      setAgencyApplications(cases);
    } catch (exception) {
      setRuntimeError(exception.message);
    }
  }

  // 보완 접수에서 처리하기 → 배치 로드 후 곧바로 케이스 상세로 이동
  /**
   * 보완 접수 목록에서 "처리하기" 진입.
   * queueIds = 그 화면이 보여주던 목록 순서 그대로 → 케이스 상세의 "n/N"·이전/다음이 이 목록을 따른다.
   */
  async function handleSupplementFromStudentList(batchId, caseId, queueIds = []) {
    if (!session?.isAuthenticated || !batchId) return;
    setIsLoading(true);
    setRuntimeError("");
    try {
      const normalizedDetail = await refreshBatchDetail(batchId);
      setReviewContext(
        queueIds.length > 0 ? { label: "보완 접수", ids: queueIds } : null,
      );

      const found = normalizedDetail.cases?.find((c) => c.id === caseId);
      if (found) {
        goToPage("agency-batch-case-detail", { batchId, caseId }, { from: page });
      } else {
        // 케이스를 못 찾으면 배치 상세로 폴백
        goToPage("agency-upload-history-detail", { batchId }, { from: page });
      }
    } catch (exception) {
      setRuntimeError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * 케이스 상세 간 이동(이전/다음). 검토 큐가 보완 접수처럼 여러 배치에 걸칠 수 있으므로,
   * 현재 배치에 없으면 그 케이스가 속한 배치의 URL로 이동한다(데이터는 로더 effect가 불러온다).
   *
   * replace: 이전/다음은 히스토리에 쌓지 않는다 — 검토를 5명 넘긴 뒤 "돌아가기"를 눌렀을 때
   * 케이스들을 하나씩 되짚지 않고 곧장 출발한 목록으로 돌아가야 한다.
   */
  function navigateToCase(caseId) {
    const owner =
      agencyUploadBatchDetail?.cases?.some((c) => c.id === caseId)
        ? agencyUploadBatchDetail.id
        : agencyApplications.find((a) => a.id === caseId)?.intakeBatch;
    if (!owner) return;
    goToPage(
      "agency-batch-case-detail",
      { batchId: owner, caseId },
      { from: originPage, replace: true },
    );
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

    if (!session?.isAuthenticated) {
      setUploadFeedback({
        phase: "error",
        fileName: selectedZipFile.name,
        message: "유학원 계정 인증 정보가 없습니다. 다시 로그인해 주세요.",
        batch: null,
      });
      return;
    }

    // 워커가 동시 처리 불가(-P solo)라 새 업로드 시 서버가 진행중 배치를 자동 취소한다.
    // 사용자가 모르고 취소하는 일이 없도록 진행중 배치가 있으면 먼저 확인받는다.
    // 주의: 목록 폴링은 대시보드/업로드내역 페이지에서만 돌아 state가 낡았을 수 있으므로,
    // 이미 끝난 배치를 "진행 중"으로 오판하지 않게 반드시 서버에서 새로 조회해 판정한다.
    let freshBatches = agencyUploadBatches;
    try {
      const fetched = await fetchAgencyUploadBatches();
      freshBatches = Array.isArray(fetched)
        ? fetched.map((batch) => normalizeAgencyUploadBatch(batch))
        : [];
      setAgencyUploadBatches(freshBatches);
    } catch (_) {
      // 조회 실패 시엔 기존 state로 폴백 (업로드 자체는 막지 않음)
    }
    if (freshBatches.some(isBatchActive)) {
      const ok = window.confirm(
        "진행 중인 업로드가 있습니다. 새로 업로드하면 진행 중인 처리가 취소됩니다. 계속할까요?",
      );
      if (!ok) return;
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
        await uploadAgencyBatchFile(selectedZipFile, {
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

  // 부팅 복구 시 화면별 기본 데이터 로드 (활성 배치 자동 진입 없이 기본 목록만).
  async function loadDataForView(view) {
    if (view === "school") {
      const rows = await fetchSchoolStudents();
      setSchoolStudents(rows);
      return;
    }
    const [cases, batches] = await Promise.all([
      fetchAgencyApplications(),
      fetchAgencyUploadBatches(),
    ]);
    const normalizedBatches = Array.isArray(batches)
      ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
      : [];
    setAgencyApplications(cases);
    setAgencyUploadBatches(normalizedBatches);
    setAgencyBatchId(normalizedBatches[0]?.id ?? null);
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

        saveStudentCreds(studentForm); // 새로고침 시 자동 재로그인용 (탭 세션)
        setStudentApplications(result.applications);
        setSession(buildSession("student", { ...result.student, ...studentForm }));
        goToPage("student-list", {}, { replace: true });
        return;
      }

      const currentForm = orgForms[loginType];
      if (!currentForm.username || !currentForm.password) {
        setError(`${ROLE_LABELS[loginType]} 로그인 정보를 입력해 주세요.`);
        return;
      }

      const auth = await login(currentForm.username, currentForm.password);

      const nextSession = buildSession(loginType, {
        username: auth.username ?? currentForm.username,
        displayName: auth.displayName,
        backendRole: auth.role,
      });

      // 세션은 갈 곳을 정한 다음에 세팅한다. 먼저 세팅하면 "역할 첫 화면" 리다이렉트
      // effect가 즉시 발동해, 남은 await가 끝난 뒤의 이동과 경쟁한다(사용자가 이미
      // 다른 메뉴를 눌렀는데 뒤늦게 화면이 바뀌는 문제).
      if (loginType === "school") {
        const rows = await fetchSchoolStudents();
        setSchoolStudents(rows);
        setSession(nextSession);
        goToPage("school-list", {}, { replace: true });
        return;
      }

      const [cases, batches] = await Promise.all([
        fetchAgencyApplications(),
        fetchAgencyUploadBatches(),
      ]);
      const normalizedBatches = Array.isArray(batches)
        ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
        : [];

      setAgencyApplications(cases);
      setAgencyUploadBatches(normalizedBatches);

      // 처리 중인 배치가 있으면 바로 상세 화면으로 복귀
      const activeBatch = normalizedBatches.find(
        (b) => !BATCH_TERMINAL_STATUSES.has((b.uploadBatchStatusRaw ?? "").toUpperCase())
          && b.uploadBatchStatusRaw !== "",
      );
      if (activeBatch) {
        try {
          const detail = await fetchAgencyUploadBatchDetail(activeBatch.id);
          const normalizedDetail = normalizeAgencyUploadBatch(detail, activeBatch);
          setAgencyBatchId(activeBatch.id);
          setAgencyUploadBatchDetail(normalizedDetail);
          upsertAgencyUploadBatch(normalizedDetail);
          setSession(nextSession);
          goToPage(
            "agency-upload-history-detail",
            { batchId: activeBatch.id },
            { from: "agency-dashboard", replace: true },
          );
          return;
        } catch {
          // 상세 로드 실패 → 대시보드로
        }
      }
      setAgencyBatchId(normalizedBatches[0]?.id ?? null);
      setSession(nextSession);
      goToPage("agency-dashboard", {}, { replace: true });
    } catch (exception) {
      setLoginErrorModal(exception.message || "로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    logout().catch(() => {});
    clearStudentCreds(); // 학생 자동 재로그인 자격 폐기
    resetRoleData();
    setSession(null);
    navigate(pathForPage("login"), { replace: true });
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
          session={session}
          onSaveProfile={async (fields) => {
            const updated = await updateStudentProfile({
              nationality: session.nationality,
              passportNumber: session.passportNumber,
              birthDate: session.birthDate,
              ...fields,
            });
            // 신원 필드는 세션 유지(로그인 키 드리프트 방지), 연락처류만 갱신 반영
            setSession((prev) => ({
              ...prev,
              phoneNumber: updated.phoneNumber,
              address: updated.address,
              alienRegistrationNumber: updated.alienRegistrationNumber,
            }));
          }}
          onOpenDetail={(applicationId) => {
            goToPage("student-detail", { applicationId }, { from: page });
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
          session={session}
          onBack={() => goBack("student-list")}
          onRefreshApplications={async () => {
            // 재조회로 서류 상태 즉시 반영 (lookup이 학생 토큰도 재발급해 만료도 함께 해소)
            const result = await lookupStudentAccess({
              nationality: session.nationality,
              passportNumber: session.passportNumber,
              birthDate: session.birthDate,
            });
            setStudentApplications(result.applications);
          }}
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
          batches={agencyUploadBatches}
          onOpenDetail={openAgencyUploadBatchDetail}
          onOpenUpload={() => goToPage("agency-upload", {}, { from: page })}
          onOpenDownload={() => goToPage("agency-download", {}, { from: page })}
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
          onBack={() => goBack(originPage ?? "agency-student-list")}
          backLabel={pageLabel(originPage ?? "agency-student-list")}
          session={session}
          onStatusChange={(result) => {
            setAgencyApplicationDetail((current) =>
              current ? { ...current, status: result.status ?? current.status, statusKey: result.statusKey ?? current.statusKey } : current
            );
            setAgencyApplications((list) =>
              list.map((app) =>
                app.id === selectedAgencyApplication.id
                  ? { ...app, status: result.status ?? app.status, statusKey: result.statusKey ?? app.statusKey }
                  : app
              )
            );
          }}
          onNoteChange={(docCode, note) => {
            setAgencyApplicationDetail((current) => {
              if (!current) return current;
              return {
                ...current,
                documents: current.documents.map((doc) =>
                  doc.code === docCode ? { ...doc, note } : doc
                ),
              };
            });
          }}
        />
      );
    }

    if (page === "agency-upload") {
      return (
        <AgencyUploadPage
          onBack={() => goBack(originPage ?? "agency-dashboard")}
          backLabel={pageLabel(originPage ?? "agency-dashboard")}
          onZipFileSelect={handleZipFileSelect}
          onSubmit={handleAgencyUploadSubmit}
          onOpenHistory={() => goToPage("agency-upload-history", {}, { from: page })}
          onOpenUploadedBatch={() => {
            const batchId = uploadFeedback.batch?.id;
            if (!batchId) {
              return;
            }

            setAgencyBatchId(batchId);
            setAgencyUploadBatchDetail(uploadFeedback.batch);
            goToPage("agency-upload-history-detail", { batchId }, { from: page });
          }}
          uploadFeedback={uploadFeedback}
          uploadForm={uploadForm}
          onUploadFormChange={handleUploadFormChange}
          selectedZipFile={selectedZipFile}
          schools={schools}
          liveBatch={
            uploadFeedback.batch?.id && agencyUploadBatchDetail?.id === uploadFeedback.batch.id
              ? agencyUploadBatchDetail
              : uploadFeedback.batch
          }
        />
      );
    }

    if (page === "agency-upload-history") {
      return (
        <AgencyUploadHistoryPage
          batches={agencyUploadBatches}
          onOpenDetail={openAgencyUploadBatchDetail}
          onBack={() => goBack(originPage ?? "agency-dashboard")}
          backLabel={pageLabel(originPage ?? "agency-dashboard")}
        />
      );
    }

    if (page === "agency-student-list") {
      return (
        <AgencyStudentListPage
          applications={agencyApplications}
          onOpenDetail={openAgencyApplicationDetail}
          onExclude={handleExcludeAgencyCase}
        />
      );
    }

    if (page === "agency-supplement-list") {
      return (
        <AgencySupplementListPage
          applications={agencyApplications}
          onSupplementRequest={handleSupplementFromStudentList}
        />
      );
    }

    if (page === "agency-file-list") {
      return (
        <AgencyFileListPage
          batches={agencyUploadBatches}
          session={session}
        />
      );
    }

    if (page === "agency-download") {
      return (
        <AgencyDownloadPage
          session={session}
          schools={schools}
          batches={agencyUploadBatches}
        />
      );
    }

    if (page === "agency-batch-case-detail") {
      if (!selectedBatchCase || !selectedAgencyBatch) return <LoadingState />;
      // 검토 큐 = 업로드 상세의 "검토 필요" 섹션과 동일 집합.
      // 추출 이슈뿐 아니라 서류 누락·검수 지적 등 미완료(COMPLETED 아님) 케이스 전부 포함한다.
      const _needsReview = (c) =>
        !c.excluded
        && c.studentName && c.studentName.toUpperCase() !== "UNKNOWN"
        && c.status !== "COMPLETED";
      // 업로드 상세 "검토 필요" 섹션과 동일한 티어 정렬 → "검토 n/N" 순서 일치
      const batchQueue = (selectedAgencyBatch.cases || [])
        .filter(_needsReview)
        .sort((a, b) => caseReviewTier(a) - caseReviewTier(b))
        .map((c) => c.id);
      // 보완 접수 등 다른 목록에서 들어왔으면 그 목록이 기준(어디서 어디로 갔는지 유지).
      const fromContext = reviewContext?.ids?.includes(selectedBatchCase.id);
      const reviewQueue = fromContext ? reviewContext.ids : batchQueue;
      const queueLabel = fromContext ? reviewContext.label : "업로드 배치";
      return (
        <BatchCaseDetailPage
          key={selectedBatchCase.id} // 케이스 전환(다음 검토 등) 시 내부 상태(선택 서류·편집 폼) 전부 초기화
          caseData={selectedBatchCase}
          batchId={selectedAgencyBatch.id}
          batchName={selectedAgencyBatch.displayName || selectedAgencyBatch.fileName}
          reviewQueue={reviewQueue}
          queueLabel={queueLabel}
          onNavigateCase={(id) => navigateToCase(id)}
          session={session}
          onBack={() =>
            goBack(originPage ?? "agency-upload-history-detail", {
              batchId: selectedAgencyBatch.id,
            })
          }
          backLabel={pageLabel(originPage, "업로드 배치")}
          onRefresh={async () => {
            try {
              const detail = await fetchAgencyUploadBatchDetail(selectedAgencyBatch.id);
              const normalized = normalizeAgencyUploadBatch(detail, selectedAgencyBatch);
              setAgencyUploadBatchDetail(normalized);
              upsertAgencyUploadBatch(normalized);
              // selectedBatchCase 는 이 배치에서 파생되므로 별도 갱신이 필요 없다.
              // 학생/대시보드/보완 목록 소스도 갱신 (배치뷰에서 완료/매핑한 변경이 즉시 반영되도록)
              fetchAgencyApplications().then((cases) => setAgencyApplications(cases)).catch(() => {});
            } catch (_) {}
          }}
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
        onBack={() => goBack(originPage ?? "agency-upload-history")}
        backLabel={pageLabel(originPage ?? "agency-upload-history")}
        ocrProgress={ocrProgress}
        session={session}
        onOpenCaseDetail={(id) => {
          const found = selectedAgencyBatch?.cases?.find((c) => c.id === id);
          if (found) {
            setReviewContext(null); // 배치 상세에서 들어오면 검토 큐는 이 배치 기준
            goToPage(
              "agency-batch-case-detail",
              { batchId: selectedAgencyBatch.id, caseId: id },
              { from: page },
            );
          }
        }}
        onReprocessDone={handleReprocessDone}
        onToggleExclude={handleToggleCaseExcludeInBatch}
      />
    );
  }

  if (!session && bootRecovering) {
    return (
      <main className="loginShell">
        <section className="loginCard">
          <div className="loginCardHeader">
            <div className="loginBrand">Immigration Ops</div>
            <h1>세션 확인 중</h1>
            <p>로그인 상태를 복구하고 있습니다. 잠시만 기다려 주세요.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <>
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
        <LoginErrorModal
          message={loginErrorModal}
          onClose={() => setLoginErrorModal(null)}
        />
      </>
    );
  }

  return (
    <AppShell
      session={session}
      page={page}
      originPage={originPage}
      onNavigate={(nextPage) => goToPage(nextPage)}
      onLogout={handleLogout}
      navBadges={navBadges}
    >
      {runtimeError ? <div className="errorBox">{runtimeError}</div> : null}
      {renderPage()}
    </AppShell>
  );
}
