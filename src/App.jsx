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
  downloadReceptionList,
  downloadStudentRoster,
  excludeAgencyCase,
  includeAgencyCase,
  fetchAgencyApplicationDetail,
  fetchAgencyApplications,
  fetchAgencyUploadBatchDetail,
  fetchAgencyUploadBatches,
  fetchAuthedBlob,
  fetchStudentBlob,
  studentCaseImagePath,
  fetchCaseActivities,
  fetchMe,
  fetchOcrProgress,
  fetchSchoolStudents,
  fetchSchoolStudentDetail,
  schoolCaseImagePath,
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
import { useModalA11y } from "./lib/useModalA11y.js";

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
  school: [
    { page: "school-list", label: "학생 목록" },
    { page: "school-download", label: "다운로드" },
  ],
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

// 로컬 타임존 기준 오늘 날짜(YYYY-MM-DD). toISOString()은 UTC라 KST 오전엔 하루 밀리므로 직접 조립한다.
function todayLocalIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const EMPTY_UPLOAD_FORM = {
  receiptDate: todayLocalIso(),
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
      subtitle: payload.term ? `${payload.schoolName} · ${payload.term}` : (payload.schoolName ?? ""),
      passportNumber: payload.passportNumber ?? "",
      birthDate: payload.birthDate ? String(payload.birthDate) : "",
      nationality: payload.nationality ?? "",
      gender: payload.gender ?? "",
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

/**
 * 업로드 내역 목록의 상태 — 업로드 자체의 성패만 표시한다 (완료/실패).
 * 추출·검증 등 처리 파이프라인 진행 상황은 진행 중 배치의 단계 표시와 상세 화면에서 확인.
 */
function deriveUploadOnlyStatus(batch) {
  const raw = (batch.uploadBatchStatusRaw ?? "").toUpperCase();
  return raw === "FAILED" ? "실패" : "완료";
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

function PageHeader({ breadcrumb, title, description, actions, onBack }) {
  return (
    <header className="pageHeader">
      {onBack ? (
        <button type="button" className="backArrowButton" onClick={onBack} aria-label="이전 화면으로">
          ←
        </button>
      ) : null}
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
      {items.map((item) => {
        const baseClassName = `summaryItem${item.tone ? ` ${item.tone}` : ""}${
          item.featured ? " isFeatured" : ""
        }`;
        // onClick이 있으면 필터 카드로 동작: button으로 렌더해 키보드 접근 보장.
        // onClick이 없는 기존 호출부는 이전과 동일하게 article로 렌더된다.
        if (item.onClick) {
          return (
            <button
              key={item.label}
              type="button"
              className={`${baseClassName} summaryItemClickable${
                item.isActive ? " isActiveFilter" : ""
              }`}
              onClick={item.onClick}
              aria-pressed={item.isActive ?? false}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.hint}</p>
            </button>
          );
        }
        return (
          <article key={item.label} className={baseClassName}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.hint}</p>
          </article>
        );
      })}
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
          background: "#fff", border: "1px solid var(--line)", borderRadius: 8,
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
                  background: value === option ? "var(--primary-soft)" : "transparent",
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
          background: "var(--surface)",
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
            color: "var(--text-muted)",
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
  // 네비 항목이 하나뿐이면(학생) 모바일에서 사이드바를 숨긴다 — 앱바가 이미 섹션명을 보여줘 중복.
  const singleNav = NAV_ITEMS[session.role].length <= 1;

  return (
    <div className={`appLayout${singleNav ? " singleNav" : ""}`}>
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

// 값이 없는 행("—"/null/빈문자열)은 버린다 — "추출한 항목만" 보여주기 위함.
const EMPTY_CELL = new Set(["—", "", null, undefined]);
function ExtraInfoSection({ title, rows }) {
  const filled = rows.filter(([, value]) => !EMPTY_CELL.has(value));
  if (filled.length === 0) return null; // 전부 비었으면 섹션 자체를 숨긴다
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filled.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: "var(--text-main)", flexShrink: 0 }}>{label}</span>
            <span style={{ textAlign: "right", wordBreak: "break-all", fontVariantNumeric: "tabular-nums" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 신청 상세보기 모달.
 * - 기본 정보(이름·국적·여권·주소 등)를 먼저 보여준다 — 추출 부가정보만이 아니라 전체를 한눈에.
 * - 추출된 값만 노출한다. 값이 없는 행·섹션은 숨긴다(빈 "—" 나열 제거).
 *
 * basic: [label, value][] — 각 상세 페이지에서 학생 기본 필드를 넘긴다.
 */
function StudentExtraInfoModal({ extraInfo, basic = [], studentName, onClose }) {
  const info = extraInfo ?? {};
  const basicRows = basic.filter(([, value]) => !EMPTY_CELL.has(value));

  const extraSections = [
    { title: "학사", rows: [
      ["직전 학기 성적", formatExtraGpa(info.prevSemesterGpa, info.gpaScale)],
      ["누적 성적", formatExtraGpa(info.cumulativeGpa, info.gpaScale)],
      ["학기 수", formatExtraCount(info.semesterCount, "학기")],
      ["졸업 예정일", formatExtraDate(info.expectedGraduationDate)],
    ] },
    { title: "증명서 발급일", rows: [
      ["재학증명서", formatExtraDate(info.enrollmentIssuedDate)],
      ["출석증명서", formatExtraDate(info.attendanceIssuedDate)],
      ["성적증명서", formatExtraDate(info.transcriptIssuedDate)],
    ] },
    { title: "은행 잔고", rows: [
      ["잔고 금액", formatExtraAmount(info.bankBalanceAmount, info.bankBalanceCurrency)],
      ["발급일", formatExtraDate(info.bankBalanceIssuedDate)],
      ["예금주", formatExtraText(info.bankAccountHolder)],
    ] },
    { title: "부동산 계약", rows: [
      ["계약 시작일", formatExtraDate(info.leaseStartDate)],
      ["계약 종료일", formatExtraDate(info.leaseEndDate)],
      ["임차인", formatExtraText(info.lesseeName)],
    ] },
    { title: "출석", rows: [["출석률", formatExtraRate(info.attendanceRate)]] },
    { title: "외국인등록증", rows: [["뒷면 주소", formatExtraText(info.arcBackAddress)]] },
  ];
  // 값이 있는 섹션이 하나라도 있는지 (없으면 안내 문구)
  const hasExtra = extraSections.some((s) => s.rows.some(([, v]) => !EMPTY_CELL.has(v)));

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 14, padding: 28, width: "min(560px, 95vw)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>신청 상세 정보</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-muted)" }}>
          {studentName ? `${formatStudentName(studentName)} · ` : ""}추출된 정보만 표시합니다.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ExtraInfoSection title="기본 정보" rows={basicRows} />
          {extraSections.map((section) => (
            <ExtraInfoSection key={section.title} title={section.title} rows={section.rows} />
          ))}
          {!hasExtra && basicRows.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "8px 0" }}>추출된 정보가 없습니다.</p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <button type="button" className="secondaryButton" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

/** 성별 코드(M/F)를 한국어 라벨로. 값이 없으면 빈 문자열(표시부에서 "—"로 대체). */
function genderLabel(code) {
  if (code === "M") return "남성";
  if (code === "F") return "여성";
  return "";
}

/** 상세보기 모달에 넘길 기본 정보 행 — application/caseData 공통 필드에서 뽑는다. */
function basicInfoRows(src) {
  if (!src) return [];
  return [
    ["이름", formatStudentName(src.studentName)],
    ["국적", src.nationality],
    ["여권번호", src.passportNumber],
    ["생년월일", src.birthDate],
    ["외국인등록번호", formatAlienRegistrationNumber(src.alienRegistrationNumber) || src.alienRegistrationNumber],
    ["학교", src.schoolName],
    ["주소", src.address],
    ["전화번호", src.phoneNumber],
  ];
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
  const [editOpen, setEditOpen] = useState(false);

  async function handleProfileSave() {
    if (profileSaving || !onSaveProfile) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await onSaveProfile(profileForm);
      setProfileMsg({ type: "ok", text: "저장되었습니다." });
      setEditOpen(false);
    } catch (err) {
      setProfileMsg({ type: "err", text: err.message });
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="studentPortal">
      <PageHeader
        title="신청 현황"
        description="학생 본인이 제출한 신청 건과 현재 상태를 확인합니다."
      />

      {session && (
        <section className="surfaceCard myInfoSection">
          <div className="sectionHeading myInfoHeading">
            <div>
              <h2>내 정보</h2>
              <p>전화번호·주소·외국인등록번호는 직접 수정할 수 있습니다. 이름·국적·여권번호·생년월일 변경은 유학원에 문의하세요.</p>
            </div>
            <button type="button" className="secondaryButton myInfoEditButton" onClick={() => { setProfileMsg(null); setEditOpen(true); }}>
              수정하기
            </button>
          </div>
          <div className="studentInfoGrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: 13 }}>
            {[
              ["이름", formatStudentName(session.name)],
              ["국적", session.nationality],
              ["여권번호", session.passportNumber],
              ["성별", genderLabel(session.gender)],
              ["생년월일", session.birthDate],
              ["학교", session.schoolName],
              ["전화번호", profileForm.phoneNumber],
              ["외국인등록번호", profileForm.alienRegistrationNumber],
              ["주소", profileForm.address],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
                <div>{value || "—"}</div>
              </div>
            ))}
          </div>
          {profileMsg && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: profileMsg.type === "ok" ? "var(--success)" : "var(--danger)" }}>
              {profileMsg.type === "ok" ? "✓ " : "⚠ "}{profileMsg.text}
            </p>
          )}
        </section>
      )}

      {editOpen && (
        <div className="modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }}>
          <div className="modalCard" role="dialog" aria-modal="true" aria-label="내 정보 수정">
            <div className="modalHeader">
              <h2>내 정보 수정</h2>
              <button type="button" className="modalClose" onClick={() => setEditOpen(false)} aria-label="닫기">✕</button>
            </div>
            <div className="profileEditGrid">
              {[
                ["전화번호", "phoneNumber", "010-0000-0000"],
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
              <label className="field profileAddressField">
                <span>주소</span>
                <input
                  type="text"
                  value={profileForm.address}
                  placeholder="현재 거주지 주소"
                  onChange={(e) => setProfileForm((f) => ({ ...f, address: e.target.value }))}
                />
              </label>
            </div>
            {profileMsg?.type === "err" && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--danger)" }}>⚠ {profileMsg.text}</p>
            )}
            <div className="modalActions">
              <button type="button" className="secondaryButton" onClick={() => setEditOpen(false)} disabled={profileSaving}>취소</button>
              <button type="button" className="primaryButton" onClick={handleProfileSave} disabled={profileSaving}>
                {profileSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="surfaceCard myAppsSection">
        <div className="sectionHeading">
          <h2>내 신청 목록</h2>
          <p>본인 명의로 접수된 신청 건과 현재 처리 상태입니다. 상세 보기에서 보완 서류를 업로드할 수 있습니다.</p>
        </div>

        {applications.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            표시할 신청 건이 없습니다.
          </p>
        ) : (
        <div className="tableWrap">
          <table className="dataTable studentAppTable">
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
    </div>
  );
}

/** 학생 본인 스캔 이미지 — 학생 토큰으로 인증해 blob 로 로드. */
function StudentScanImage({ caseId, filename, alt, loadBlob }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!caseId || !filename) { setFailed(true); return; }
    let cancelled = false;
    let objectUrl = null;
    const fetcher = loadBlob || ((cid, fn) => fetchStudentBlob(studentCaseImagePath(cid, fn)));
    fetcher(caseId, filename)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [caseId, filename]);

  if (failed) {
    return <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>이미지를 불러올 수 없습니다.</div>;
  }
  if (!url) {
    return <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>불러오는 중…</div>;
  }
  return <img src={url} alt={alt} style={{ maxWidth: "100%", maxHeight: "76vh", objectFit: "contain", display: "block", margin: "0 auto", borderRadius: 6 }} />;
}

/** 학생이 자기 서류 스캔을 넘겨보는 라이트박스. */
function StudentScanViewer({ caseId, doc, onClose, loadBlob }) {
  const scans = doc?.scans ?? [];
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, scans.length - 1));
  if (!doc || scans.length === 0) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 14, padding: 20, width: "min(720px, 95vw)", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{doc.name}</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              업로드된 스캔 {scans.length}장{scans.length > 1 ? ` · ${safeIndex + 1}/${scans.length}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        {scans.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {scans.map((fn, i) => (
              <button
                key={fn}
                type="button"
                onClick={() => setIndex(i)}
                style={{
                  fontSize: 12, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${i === safeIndex ? "var(--primary)" : "var(--line)"}`,
                  background: i === safeIndex ? "var(--primary-soft)" : "#fff",
                  color: i === safeIndex ? "var(--primary)" : "var(--text-main)",
                  fontWeight: i === safeIndex ? 600 : 400,
                }}
              >
                {i + 1}장
              </button>
            ))}
          </div>
        )}
        <StudentScanImage caseId={caseId} filename={scans[safeIndex]} alt={`${doc.name} ${safeIndex + 1}장`} loadBlob={loadBlob} />
      </div>
    </div>
  );
}

function StudentDetailPage({ application, session, onBack, onRefreshApplications }) {
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

function SchoolDownloadPage({ students }) {
  function downloadCsv() {
    const headers = ["학생명", "국적", "신청 유형", "비자 타입", "상태", "최근 갱신"];
    const esc = (v) => {
      const str = String(v ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [headers, ...students.map((s) => [
      s.name, s.nationality, s.applicationType, s.visaType, s.status, s.lastUpdated,
    ])];
    // 엑셀 한글 깨짐 방지용 BOM(﻿) 포함.
    const csv = "﻿" + lines.map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `학생목록_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="다운로드"
        description="학교에 등록된 학생 목록을 파일로 내려받습니다."
      />
      <section className="surfaceCard">
        <div className="sectionHeading">
          <h2>학생 목록 다운로드</h2>
          <p>현재 조회 가능한 학생 {students.length}명의 목록을 CSV(엑셀에서 열림) 파일로 저장합니다.</p>
        </div>
        <button
          type="button"
          className="primaryButton"
          disabled={students.length === 0}
          onClick={downloadCsv}
        >
          학생 목록 CSV 다운로드
        </button>
        {students.length === 0 && (
          <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>
            내려받을 학생이 없습니다.
          </p>
        )}
      </section>
    </>
  );
}

function AgencyDashboardPage({ batches, applications = [], onOpenDetail, onOpenUpload, onOpenDownload }) {
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

function ExcelExportCard({ title, description, schools, onExport }) {
  const [selectedSchool, setSelectedSchool] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await onExport(selectedSchool || undefined);
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="surfaceCard">
      <div className="sectionHeading">
        <h2>{title}</h2>
        <p>{description}</p>
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
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "추출 중..." : "엑셀 내보내기"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** 입력 없이 버튼 하나로 내려받는 추출 카드 (단체수납입금표용). */
function SimpleExportCard({ title, description, onExport }) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await onExport();
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="surfaceCard">
      <div className="sectionHeading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="primaryButton" onClick={handleExport} disabled={isExporting}>
          {isExporting ? "추출 중..." : "엑셀 내보내기"}
        </button>
      </div>
    </section>
  );
}

/** 학생명단 및 신청현황표 — 케이스(배치) 선택 모달을 거쳐 내보내는 카드. */
function RosterExportCard({ title, description, batches }) {
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const modalRef = useModalA11y(showModal, () => setShowModal(false));

  const allSelected = batches.length > 0 && selectedIds.length === batches.length;

  function toggleBatch(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : batches.map((b) => b.id));
  }

  async function handleExport() {
    if (isExporting || selectedIds.length === 0) return;
    setIsExporting(true);
    try {
      // 전달 순서 = 화면 목록 순서 (엑셀 행 순서가 배치 목록 순서를 따라간다)
      const ordered = batches.filter((b) => selectedIds.includes(b.id)).map((b) => b.id);
      await downloadStudentRoster(ordered);
      setShowModal(false);
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="surfaceCard">
      <div className="sectionHeading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="primaryButton"
          onClick={() => { setSelectedIds(batches.map((b) => b.id)); setShowModal(true); }}
        >
          케이스 선택 후 내보내기
        </button>
      </div>

      {showModal && (
        <div className="caseModalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="caseModalBackdrop" />
          <div className="caseModal" ref={modalRef} tabIndex={-1}
            role="dialog" aria-modal="true" aria-labelledby="rosterCaseModalTitle">
            <div className="caseModalHead">
              <div>
                <h2 className="caseModalTitle" id="rosterCaseModalTitle">케이스 선택</h2>
                <p className="caseModalSub">선택한 케이스의 학생들이 목록 순서대로 엑셀에 담깁니다.</p>
              </div>
              <button type="button" className="caseModalClose" onClick={() => setShowModal(false)} aria-label="닫기">✕</button>
            </div>

            {batches.length === 0 ? (
              <EmptyState title="케이스가 없습니다." description="ZIP 파일을 업로드하면 케이스가 생성됩니다." />
            ) : (
              <div className="caseChecklistRows">
                <label className={`caseChecklistRow${allSelected ? " isChecked" : ""}`}>
                  <input
                    type="checkbox"
                    className="caseChecklistCheckbox"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                  <span className="caseChecklistLabel"><strong>모든 케이스</strong></span>
                  <span className="cellMeta">{batches.length}건</span>
                </label>
                {batches.map((batch) => {
                  const checked = selectedIds.includes(batch.id);
                  return (
                    <label key={batch.id} className={`caseChecklistRow${checked ? " isChecked" : ""}`}>
                      <input
                        type="checkbox"
                        className="caseChecklistCheckbox"
                        checked={checked}
                        onChange={() => toggleBatch(batch.id)}
                      />
                      <span className="caseChecklistLabel">
                        {batch.displayName || batch.fileName}
                        {batch.studentCount != null && <span className="cellMeta">{batch.studentCount}명</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="caseModalActions hasTopGap">
              <button type="button" className="secondaryButton" onClick={() => setShowModal(false)}>취소</button>
              <button
                type="button"
                className="primaryButton"
                onClick={handleExport}
                disabled={isExporting || selectedIds.length === 0}
              >
                {isExporting ? "추출 중..." : `선택 ${selectedIds.length}건 내보내기`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AgencyDownloadPage({ schools, batches }) {
  return (
    <>
      <PageHeader
        title="다운로드"
        description="단체수납입금표·접수명단·학생명단 및 신청현황표를 양식 엑셀로 추출합니다."
      />
      <div className="downloadPageGrid">
        <SimpleExportCard
          title="단체수납입금표"
          description="외국인등록 신청 건 전체를 학교별 시트로 나눠 내보냅니다."
          onExport={downloadGroupPayment}
        />
        <ExcelExportCard
          title="접수명단 (대학교 제출용)"
          description="외국인등록 신청 건의 접수일자·서비스항목·영문성명·등록번호·주소·연락처를 내보냅니다."
          schools={schools}
          onExport={downloadReceptionList}
        />
        <RosterExportCard
          title="학생명단 및 신청현황표"
          description="선택한 케이스의 학생 정보를 채운 신청현황표를 내보냅니다. 접수결과·회계 항목은 빈칸으로 생성됩니다."
          batches={batches}
        />
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
                          border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
                          background: active ? "var(--primary-soft)" : "#fff",
                          color: active ? "var(--primary)" : "var(--text-main)",
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
              style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--primary)", padding: 0 }}
            >
              상세보기
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-strong)" }}>
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
                  <span style={{ color: "var(--text-main)", minWidth: 100, flexShrink: 0 }}>{label}</span>
                  <span style={{ color: isMissing ? "var(--danger)" : undefined, fontWeight: isMissing ? 600 : undefined }}>
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
                        background: entry.type === "system" ? "var(--text-muted)" : entry.type === "status" ? "var(--primary)" : "var(--text-strong)",
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
          basic={basicInfoRows(application)}
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
        background: "var(--surface)",
        border: "1px solid var(--line)",
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
      <strong style={{ fontSize: "0.8125rem", wordBreak: "break-all", color: "var(--text-strong)" }}>{name}</strong>
      {meta.map((m, i) => m ? (
        <span key={i} style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{m}</span>
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

      <div className="fileBreadcrumb">
        {breadcrumbParts.map((part, i) => (
          <span key={i} className="fileBreadcrumbItem">
            {i > 0 && <span className="fileBreadcrumbSep">›</span>}
            {i < breadcrumbParts.length - 1 ? (
              <button
                type="button"
                className="fileBreadcrumbLink"
                onClick={() => {
                  if (i === 0) { setLevel(0); setSelectedBatch(null); setSelectedCase(null); }
                  else if (i === 1) { setLevel(1); setSelectedCase(null); }
                }}
              >
                {part}
              </button>
            ) : (
              <span className="fileBreadcrumbCurrent">{part}</span>
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
            <p style={{ marginTop: 12, fontSize: "0.875rem", color: "var(--text-muted)" }}>불러오는 중...</p>
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
            {saveError && <p style={{ color: "var(--danger)", fontSize: "0.8125rem", marginBottom: 8 }}>{saveError}</p>}
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
                      style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#f9fafb", padding: 0, cursor: "zoom-in", display: "block", width: "100%" }}
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
                          style={{ flex: 1, fontSize: "0.75rem", padding: "2px 6px", border: "1px solid var(--primary)", borderRadius: 4, outline: "none" }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0, wordBreak: "break-all", flex: 1 }}>
                          {displayName}
                        </p>
                        <button
                          type="button"
                          onClick={() => startEdit(doc)}
                          title="파일명 변경"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: "0.75rem", color: "var(--text-muted)", flexShrink: 0, lineHeight: 1 }}
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
// "missing"은 옛 필터(케이스로 대체됨) — 초기화 시 레거시 URL 파라미터를 함께 쓸어내려 남겨둔다.
const SUPPLEMENT_FILTER_KEYS = ["name", "nationality", "visa", "school", "case", "date", "missing"];

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

function AgencySupplementListPage({ applications, onSupplementRequest }) {
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
  // 첫 진입부터 빨간 테두리로 겁주지 않는다 — ZIP을 골라 업로드 의사가 드러난 뒤에만 필수 누락을 강조.
  const showSchoolError = Boolean(selectedZipFile) && missingSchool;
  const showVisaError = Boolean(selectedZipFile) && missingVisaType;

  return (
    <>
      <PageHeader
        onBack={onBack}
        title="ZIP 업로드"
        description="접수 정보를 입력하고 스캔본 ZIP 파일을 업로드합니다."
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
            <span>대학교 <span style={{ color: "var(--danger)" }}>*</span></span>
            <select
              value={uploadForm.schoolId}
              onChange={(e) => onUploadFormChange("schoolId", e.target.value)}
              style={showSchoolError ? { borderColor: "var(--danger)" } : undefined}
            >
              <option value="">학교 선택 (필수)</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>신청 타입 <span style={{ color: "var(--danger)" }}>*</span></span>
            <select
              value={uploadForm.visaTypeCode}
              onChange={(e) => onUploadFormChange("visaTypeCode", e.target.value)}
              style={showVisaError ? { borderColor: "var(--danger)" } : undefined}
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
            <span className="uploadHint">ZIP 파일 1개씩 업로드할 수 있습니다.</span>
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
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--danger)" }}>
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
                  ? "업로드 중"
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
                <span>상태 {(liveBatch ?? uploadFeedback.batch).status}</span>
                <span>배치 ID {uploadFeedback.batch.id}</span>
                <span>처리 작업 {(liveBatch ?? uploadFeedback.batch).processingJobId || "대기 중"}</span>
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

function AgencyUploadHistoryPage({ batches, showProcessingSteps = true, onOpenDetail, onBack, backLabel = "대시보드" }) {
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

  const defaultImgStyle = { maxWidth: "100%", maxHeight: "540px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--line)" };
  const resolvedImgStyle = imgStyle ?? defaultImgStyle;

  if (failed) {
    return (
      <div className="previewSurface" style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>이미지를 불러올 수 없습니다.</p>
      </div>
    );
  }
  if (!objectUrl) {
    return (
      <div className="previewSurface" style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>로딩 중...</p>
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
  // 검토 큐(= 들어온 목록) 내 위치와 앞/뒤 케이스.
  // 큐는 이 케이스를 여는 순간으로 고정한다(스냅샷). 안 그러면 [검토 완료] 직후 라이브 큐에서
  // 현재 케이스가 빠지면서 위치가 -1이 돼 "다음"이 큐 맨 앞으로 튀고 "이전"이 사라진다.
  // 다른 케이스로 이동하면 key=caseId 리마운트로 큐가 새로 잡힌다.
  const [reviewQueueSnapshot] = useState(reviewQueue);
  const _qIdx = reviewQueueSnapshot.indexOf(caseData.id);
  const _prevReviewId = _qIdx > 0 ? reviewQueueSnapshot[_qIdx - 1] : null;
  const _nextReviewId = _qIdx >= 0
    ? (_qIdx + 1 < reviewQueueSnapshot.length ? reviewQueueSnapshot[_qIdx + 1] : null)
    : (reviewQueueSnapshot.find((id) => id !== caseData.id) ?? null);
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
    phone_number: "전화번호", address: "주소", gender: "성별",
    enrollment_passport_number: "재학증명서 여권번호",
    enrollment_birth_date: "재학증명서 생년월일",
  };
  // 잔고증명·부동산계약서는 추출 난도가 높아 보수적으로 운영 —
  // 추출 실패나 검수 지적을 검토 이슈로 올리지 않는다 (서류 자체가 미제출인 경우는 계속 표시).
  const REVIEW_EXEMPT_FIELD_PREFIXES = ["bank_", "lease_", "lessee_"];
  const REVIEW_EXEMPT_DOC_CODES = new Set(["BANK_BALANCE_CERTIFICATE", "REAL_ESTATE_CONTRACT"]);
  const reviewIssues = useMemo(() => {
    const issues = [];
    let validations = {};
    try {
      validations = caseData.fieldValidations ? JSON.parse(caseData.fieldValidations) : {};
    } catch {
      validations = {};
    }
    Object.entries(validations).forEach(([key, v]) => {
      if (REVIEW_EXEMPT_FIELD_PREFIXES.some((prefix) => key.startsWith(prefix))) return;
      if (v && (v.status === "invalid" || v.status === "review")) {
        issues.push({ type: "field", key, label: CHECKLIST_FIELD_LABEL[key] || key, detail: v.detail || "" });
      }
    });
    caseData.documents.forEach((d) => {
      if (d.status === "미제출") {
        issues.push({ type: "missing", code: d.code, label: `누락: ${d.name}`, detail: "필수 서류가 제출되지 않았습니다." });
      } else if (typeof d.note === "string" && d.note.trim() && !REVIEW_EXEMPT_DOC_CODES.has(d.code)) {
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

  // 모달 접근성(Esc·포커스 트랩·복귀)
  const supplementModalRef = useModalA11y(showPanel, () => setShowPanel(false));
  const uploadModalRef = useModalA11y(Boolean(uploadModalDoc), () => { setUploadModalDoc(null); setUploadFile(null); });

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
      // 케이스 상태·목록이 즉시 반영되도록 갱신 (안 하면 상세 칩과 복귀한 목록이 전송 전 상태로 남음)
      await onRefresh?.();
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
          <div className="caseHeaderActions">
            {reviewQueue.length > 0 && (
              <span className="caseQueueMeta">
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
          className="caseLightbox">
          <button type="button" onClick={() => setZoomedImage(null)}
            className="caseLightboxClose">✕</button>
          <div className="caseLightboxHint">
            휠: 확대/축소 · 드래그: 이동 · {Math.round(zoomScale * 100)}%
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => { zoomDrag.current = { x: e.clientX - zoomOffset.x, y: e.clientY - zoomOffset.y }; }}
            onMouseMove={(e) => { if (zoomDrag.current) setZoomOffset({ x: e.clientX - zoomDrag.current.x, y: e.clientY - zoomDrag.current.y }); }}
            onMouseUp={() => { zoomDrag.current = null; }}
            onMouseLeave={() => { zoomDrag.current = null; }}
            onDoubleClick={() => { setZoomScale(1); setZoomOffset({ x: 0, y: 0 }); }}
            className="caseLightboxCanvas"
            style={{
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
        <div className="caseModalOverlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPanel(false); }}>
          <div className="caseModalBackdrop" />
          <div className="caseModal isWide" ref={supplementModalRef} tabIndex={-1}
            role="dialog" aria-modal="true" aria-labelledby="supplementModalTitle">
            <div className="caseModalHead">
              <div>
                <h2 className="caseModalTitle" id="supplementModalTitle">보완 요청 작성</h2>
                <p className="caseModalSub">보완이 필요한 서류를 선택하고 사유를 입력하세요.</p>
              </div>
              <button type="button" onClick={() => setShowPanel(false)} className="caseModalClose" aria-label="닫기">✕</button>
            </div>

            <div className="caseChecklistRows">
              {caseData.documents.map((doc) => (
                <div key={doc.code} className={`caseChecklistRow${checkedDocs[doc.code] ? " isChecked" : ""}`}>
                  <input type="checkbox" id={`supp-${doc.code}`} checked={!!checkedDocs[doc.code]} onChange={() => toggleDoc(doc.code)}
                    className="caseChecklistCheckbox" />
                  <label htmlFor={`supp-${doc.code}`} className="caseChecklistLabel">
                    <strong>{doc.name}</strong>
                    <StatusBadge value={doc.status} />
                  </label>
                  <input type="text" placeholder="사유 (선택)" value={reasons[doc.code] ?? ""} onChange={(e) => setReason(doc.code, e.target.value)}
                    disabled={!checkedDocs[doc.code]}
                    className="caseChecklistReason" />
                </div>
              ))}
            </div>

            <div className="caseModalField">
              <label className="caseModalFieldLabel">학생 안내 메시지 (선택)</label>
              <textarea value={globalMessage} onChange={(e) => setGlobalMessage(e.target.value)}
                placeholder="학생에게 전달할 추가 안내 사항을 입력하세요." rows={3}
                className="caseTextarea" />
            </div>

            <div className="caseModalActions">
              <button type="button" className="secondaryButton" onClick={() => setShowPanel(false)}>취소</button>
              <button type="button" className="primaryButton" onClick={handleSendSupplement} disabled={sending}>
                {sending ? "전송 중..." : "보완 요청 보내기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModalDoc && (
        <div className="caseModalOverlay"
          onClick={(e) => { if (e.target === e.currentTarget) { setUploadModalDoc(null); setUploadFile(null); } }}>
          <div className="caseModalBackdrop" />
          <div className="caseModal isNarrow" ref={uploadModalRef} tabIndex={-1}
            role="dialog" aria-modal="true" aria-labelledby="uploadModalTitle">
            <div className="caseModalHead">
              <h2 className="caseModalTitle" id="uploadModalTitle">서류 업로드</h2>
              <button type="button" onClick={() => { setUploadModalDoc(null); setUploadFile(null); }} className="caseModalClose" aria-label="닫기">✕</button>
            </div>
            <p className="caseModalDesc">
              <strong>{uploadModalDoc.name}</strong> 서류 파일을 선택하세요. 관리자가 직접 올리는 서류이므로 업로드 즉시 제출 처리됩니다.
            </p>
            <input type="file" accept="image/*,.pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="caseFileInput" />
            {uploadFile && <p className="caseSuccessText hasBottomGap">선택됨: {uploadFile.name}</p>}
            {linkError && <p className="caseErrorText hasBottomGap">{linkError}</p>}
            <div className="caseModalActions hasTopGap">
              <button type="button" className="secondaryButton" onClick={() => { setUploadModalDoc(null); setUploadFile(null); }}>취소</button>
              <button type="button" className="primaryButton" onClick={handleConfirmUpload} disabled={!uploadFile || uploading}>
                {uploading ? "업로드 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="caseDetailSplit">
        {/* 왼쪽: 서류 체크리스트 */}
        <div className="caseDocRail">
          <div className="railLabel caseRailHead">
            <span>{caseData.applicationType} · 필요서류</span>
            <span className={caseData.missingCount > 0 ? "isMissing" : "isComplete"}>
              {caseData.submittedCount}/{caseData.submittedCount + caseData.missingCount} · {caseData.missingCount > 0 ? `${caseData.missingCount}개 누락` : "완비"}
            </span>
          </div>
          <div className="documentStatusList caseDocList">
            {caseData.documents.map((doc) => (
              <div key={doc.code}>
                <button
                  type="button"
                  className={`documentStatusButton${selectedDocCode === doc.code ? " isActive" : ""}${doc.status === "미제출" ? " isMissing" : ""}`}
                  onClick={() => setSelectedDocCode(doc.code)}
                >
                  <div className="caseDocMain">
                    <strong className="caseDocName">
                      {doc.name}
                      {(doc.sourceFilenames?.length ?? 0) > 1 && (
                        <span className="docPageCount">· {doc.sourceFilenames.length}장</span>
                      )}
                    </strong>
                    {doc.sourceFilename && (
                      <p className="caseDocFile">{doc.sourceFilename}</p>
                    )}
                  </div>
                  <StatusBadge value={doc.status} />
                </button>
                {doc.status === "미제출" && (
                  <button type="button" className="caseUploadInlineButton"
                    onClick={() => { setUploadModalDoc(doc); setUploadFile(null); setLinkError(""); }}>
                    + 서류 업로드
                  </button>
                )}
              </div>
            ))}
            {caseData.otherDocuments?.length > 0 && (
              <>
                <div className="caseOtherHead">
                  <span>기타 서류 ({caseData.otherDocuments.length}건)</span>
                  <button
                    type="button"
                    onClick={toggleScanTidyMode}
                    title="기타 스캔을 양식에 일괄 배정하는 정리 모드"
                    className={`caseTidyToggle${scanTidyMode ? " isActive" : ""}`}
                  >
                    스캔 정리{scanTidyMode ? " 끄기" : ""}
                  </button>
                </div>
                {caseData.otherDocuments.map((filename) => {
                  const checked = selectedOthers.includes(filename);
                  return (
                    <div
                      key={filename}
                      className={`documentStatusButton caseOtherItem${selectedDocCode === `other:${filename}` ? " isActive" : ""}${checked ? " isChecked" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDocCode(`other:${filename}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedDocCode(`other:${filename}`); }
                      }}
                    >
                      {scanTidyMode && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleOther(filename)}
                          className="caseTidyCheckbox"
                          aria-label={`${filename} 선택`}
                        />
                      )}
                      <div className="caseOtherBody">
                        <strong>기타</strong>
                        <p className="caseDocFile">{filename}</p>
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
            <div className="caseBulkBar">
              <div className="caseBulkTitle">선택 {selectedOthers.length}건</div>
              <select
                value={bulkTargetCode}
                onChange={(e) => setBulkTargetCode(e.target.value)}
                className="caseSelect"
              >
                <option value="">양식 선택…</option>
                {caseData.documents.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}{d.status === "미제출" ? " · 미제출" : (d.sourceFilenames?.length || (d.sourceFilename ? 1 : 0)) ? ` · ${d.sourceFilenames?.length || 1}장` : ""}
                  </option>
                ))}
              </select>
              {bulkError && <p className="caseErrorText">⚠ {bulkError}</p>}
              <div className="caseBulkActions">
                <button type="button" className="secondaryButton" onClick={() => { setSelectedOthers([]); setBulkTargetCode(""); setBulkError(""); }}>
                  선택 해제
                </button>
                <button type="button" className="primaryButton" disabled={!bulkTargetCode || bulkApplying} onClick={handleBulkApply}>
                  {bulkApplying ? "적용 중…" : "일괄 적용"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 가운데: 이미지 뷰어 */}
        <div className="caseScanPane">
          <div className="scanToolbar">
            <strong>{selectedDoc?.name ?? otherFilename ?? "서류 미선택"}</strong>
            {selectedDoc && <span className={STATUS_CLASS_MAP[selectedDoc.status] ?? "status statusNeutral"}>{selectedDoc.status}</span>}
            {selectedDoc?.note && (
              <span className="scanNote">
                {selectedDoc.note}
              </span>
            )}
            {selectedDocFiles.length > 1 && (
              <span className="scanPageMeta">{safeFileIndex + 1} / {selectedDocFiles.length}장</span>
            )}
          </div>
          {selectedDocFiles.length > 1 && (
            <div className="scanPageChips">
              {selectedDocFiles.map((fn, idx) => {
                const active = idx === safeFileIndex;
                return (
                  <button
                    key={fn}
                    type="button"
                    onClick={() => setActiveFileIndex(idx)}
                    title={fn}
                    className={`scanPageChip${active ? " isActive" : ""}`}
                  >
                    {idx + 1}장
                  </button>
                );
              })}
            </div>
          )}
          <div className="scanStage caseScanStage">
            {imageFilename ? (
              <div
                onClick={() => openZoom(imageFilename)}
                title="클릭하면 확대 (확대 후 휠로 줌, 드래그로 이동)"
                className="caseScanFrame">
                <AuthenticatedImage batchId={batchId} filename={imageFilename}
                  imgStyle={{ width: "100%", height: "auto", display: "block" }} />
              </div>
            ) : (
              <div className="scanEmpty">
                {selectedDoc ? (
                  <>
                    <span className={STATUS_CLASS_MAP[selectedDoc.status] ?? "status statusNeutral"}>{selectedDoc.status}</span>
                    <strong>{selectedDoc.name}</strong>
                    <p>
                      {selectedDoc.status === "미제출" ? "아직 제출되지 않은 서류입니다." : "이미지 파일 정보가 없습니다."}
                    </p>
                  </>
                ) : <p>왼쪽에서 서류를 선택하세요</p>}
              </div>
            )}
          </div>

          {imageFilename && (
            <div className="caseScanAssign">
              <div className="caseKicker">
                이 스캔의 양식
              </div>
              <p className="caseScanAssignHint">
                이 스캔의 양식을 바꾸거나 ‘기타(미지정)’로 빼낼 수 있습니다. 여러 장이면 위 탭에서 장을 선택한 뒤 변경하세요.
              </p>
              <div className="caseScanAssignRow">
                <select
                  value={isOtherDoc ? "OTHER" : (selectedDoc?.code ?? "OTHER")}
                  disabled={mapping}
                  onChange={(e) => handleMoveScan(imageFilename, e.target.value)}
                  className="caseSelect caseScanSelect"
                >
                  {caseData.documents.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}{d.status === "미제출" ? " · 미제출" : ((d.sourceFilenames?.length || (d.sourceFilename ? 1 : 0)) ? ` · ${d.sourceFilenames?.length || 1}장` : "")}
                    </option>
                  ))}
                  <option value="OTHER">기타(미지정) — 양식에서 제외</option>
                </select>
                {mapping && <span className="caseMutedText">이동 중…</span>}
              </div>
              {mapFeedback && (
                <p className={mapFeedback.type === "ok" ? "caseSuccessText" : "caseErrorText"}>
                  {mapFeedback.type === "ok" ? "✓ " : "⚠ "}{mapFeedback.text}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 오른쪽: 케이스 패널 */}
        <div className="caseInfoRail">
          {/* 상태 → 검토 체크리스트 */}
          <div>
            <div className="caseSectionHead">
              <div className="caseKicker">검토 체크리스트</div>
              {reviewIssues.length === 0 ? (
                <span className="caseIssueOk">✓ 이슈 없음</span>
              ) : (
                <span className="caseIssueBad">남은 이슈 {reviewIssues.length}건</span>
              )}
            </div>
            <div className="caseStatusRow">
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
              <div className={`caseIssueList${reviewIssues.length > 6 ? " isScrollable" : ""}`}>
                {reviewIssues.map((issue) => {
                  const isWarn = issue.type !== "field";
                  return (
                    <button
                      key={`${issue.type}:${issue.key ?? issue.code}`}
                      type="button"
                      title={issue.detail || issue.label}
                      onClick={() => {
                        if (issue.type === "field") openFieldEditFromChecklist(issue.key);
                        else setSelectedDocCode(issue.code);
                      }}
                      className={`caseIssueItem${isWarn ? " isWarn" : ""}`}
                    >
                      <span className="caseIssueDot" />
                      <span className="caseIssueBody">
                        <span className="caseIssueLabel">{issue.label}</span>
                        {issue.detail && (
                          <span className="caseIssueDetail">{issue.detail}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {caseData.status === "COMPLETED" ? (
              <button type="button" className="secondaryButton caseWideAction"
                disabled={statusSaving}
                onClick={() => { if (window.confirm("이 학생을 검토 상태로 되돌리고 학생 목록에서 뺄까요?")) handleSetCaseStatus("NEEDS_REVIEW"); }}>
                {statusSaving ? "처리 중..." : "검토로 되돌리기 (목록에서 빼기)"}
              </button>
            ) : (
              <button type="button" className={`primaryButton caseWideAction${reviewIssues.length === 0 ? " isReady" : ""}`}
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

          <hr className="caseDivider" />

          {/* 학생 정보 / 수정 */}
          <div>
            <div className="caseSectionHead">
              <div className="caseKicker">학생 정보</div>
              <div>
                <button type="button" className="caseLinkButton" onClick={() => setShowExtraInfo(true)}>
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
              <div className="caseFieldList">
                {[
                  ["이름", caseData.studentName ? formatStudentName(caseData.studentName) : caseData.studentName, true, null, "name"],
                  ["국적", caseData.nationality, true, "nationality", "nationality"],
                  ["생년월일", caseData.birthDate, true, null, "birthDate"],
                  ["여권번호", caseData.passportNumber, true, null, "passportNumber"],
                  ["성별", genderLabel(caseData.gender), false, null, null],
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
                      <div key={label} className={`caseFieldEditBox${isHighlighted ? " isHighlighted" : ""}`}>
                        <div className="caseFieldEditRow">
                          <span className="caseFieldLabel">{label}</span>
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
                            className="caseFieldInput"
                          />
                          <button type="button" title="저장 (Enter)" disabled={savingField} onClick={handleFieldSave}
                            className="caseIconButton isSave">
                            {savingField ? "⏳" : "✓"}
                          </button>
                          <button type="button" title="취소 (Esc)" disabled={savingField} onClick={cancelFieldEdit}
                            className="caseIconButton isCancel">
                            ✕
                          </button>
                        </div>
                        {editError && (
                          <p className="caseFieldError">{editError}</p>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={label}
                      className={`caseFieldRow${isHighlighted ? " isHighlighted" : ""}`}>
                      <span className="caseFieldLabel">{label}</span>
                      <span
                        title={editable ? "클릭하여 수정" : undefined}
                        onClick={editable ? () => startFieldEdit(apiField) : undefined}
                        className={`caseFieldValue${alertMissing || invalid ? " isMissing" : (unknown ? " isUnknown" : "")}${editable ? " isEditable" : ""}`}>
                        {unknown ? (required ? "⚠ 미입력" : "—") : val}
                        {invalid && (
                          <span title={v.detail} className="caseBadgeInvalid">⚠ 검증실패</span>
                        )}
                        {unverified && (
                          <span title={v.detail} className="caseBadgeUnverified">미검증</span>
                        )}
                        {editable && (
                          <span aria-hidden="true" className="caseEditHint">✎</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
                );
              })()}
          </div>

          <hr className="caseDivider" />

          {/* 활동 타임라인 */}
          <div>
            <button
              type="button"
              onClick={() => setShowTimeline((prev) => !prev)}
              className={`caseTimelineToggle caseKicker${showTimeline ? " isOpen" : ""}`}
            >
              <span>활동 타임라인 ({activities.length}건)</span>
              <span className="caseTimelineCaret">{showTimeline ? "▾" : "▸"}</span>
            </button>
            {showTimeline && (
              activities.length === 0 ? (
                <p className="caseMutedText">활동 내역 없음</p>
              ) : (
                <div className="caseTimelineList">
                  {activities.map((a, i) => {
                    const tone = a.type === "CREATED" ? ""
                      : a.type === "SUPPLEMENT_REQUESTED" ? " isWarning"
                      : a.type === "STUDENT_UPLOADED" ? " isSuccess"
                      : " isPrimary";
                    return (
                      <div key={i} className={`caseTimelineItem${tone}`}>
                        <div className="caseTimelineMeta">{a.time} · {a.actor}</div>
                        <div className="caseTimelineDesc">{a.description}</div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          <div className="caseRailSpacer" />

          {/* 보완 요청 버튼 */}
          {!showPanel && (
            <button
              type="button"
              className="primaryButton caseFooterAction"
              onClick={() => {
                // 열 때마다 현재 문서 상태 기준으로 기본 체크를 다시 계산한다.
                // (직전에 업로드해 제출된 서류가 미제출 시점의 체크로 남아 보완 요청에 끼는 것 방지)
                const fresh = {};
                caseData.documents.forEach((d) => { if (d.status === "미제출") fresh[d.code] = true; });
                setCheckedDocs(fresh);
                setReasons({});
                setShowPanel(true);
              }}
            >
              보완 요청 작성
            </button>
          )}
          {showPanel && (
            <button type="button" className="secondaryButton caseFooterAction" onClick={() => setShowPanel(false)}>
              보완 요청 닫기
            </button>
          )}
        </div>
      </div>

      {showExtraInfo && (
        <StudentExtraInfoModal
          extraInfo={caseData.extraInfo}
          basic={basicInfoRows(caseData)}
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
          const lineColor = states[i + 1] === "upcoming" ? "var(--line)" : "var(--primary)";
          return (
            <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <div style={{ flex: 1, height: 2, background: i === 0 ? "transparent" : state === "upcoming" ? "var(--line)" : "var(--primary)" }} />
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, border: "2px solid",
                  background: state === "done" ? "var(--primary)" : state === "current" ? "#fff" : "var(--surface-muted)",
                  borderColor: state === "upcoming" ? "var(--line)" : "var(--primary)",
                  color: state === "done" ? "#fff" : state === "current" ? "var(--primary)" : "var(--text-muted)",
                }}>
                  {state === "done" ? "✓" : state === "current" ? (
                    <span style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--primary)", borderTopColor: "transparent", display: "inline-block", animation: "pipelineSpin 0.8s linear infinite" }} />
                  ) : i + 1}
                </div>
                <div style={{ flex: 1, height: 2, background: isLast ? "transparent" : lineColor }} />
              </div>
              <div style={{ textAlign: "center", marginTop: 6, padding: "0 2px" }}>
                <div style={{ fontSize: 12, fontWeight: state === "current" ? 700 : 500, color: state === "upcoming" ? "var(--text-muted)" : state === "current" ? "var(--primary)" : "var(--text-strong)" }}>
                  {step.label}
                </div>
                {state === "current" && (
                  <div style={{ fontSize: 11, color: "var(--text-main)", marginTop: 2, lineHeight: 1.3 }}>{step.desc}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {allDone && !failed && (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--success)", textAlign: "center" }}>✓ 모든 단계 완료</p>
      )}
      {failed && (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--danger)", textAlign: "center" }}>처리 중 오류가 발생했습니다.</p>
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

  // 업로드 내역 진입 시 목록을 즉시 재조회한다. 재조회 전에는 낡은 state의 "진행 중" 배치가
  // 진행 단계 표시를 잠깐 그렸다 지우는 깜빡임이 생기므로, 갱신 완료 여부를 함께 추적해
  // 목록 화면이 진행 단계를 신선한 데이터로만 그리게 한다.
  const [isBatchListFresh, setIsBatchListFresh] = useState(false);
  useEffect(() => {
    if (!session?.isAuthenticated || page !== "agency-upload-history") {
      return;
    }
    let cancelled = false;
    setIsBatchListFresh(false);
    fetchAgencyUploadBatches()
      .then((batches) => {
        if (cancelled) return;
        setAgencyUploadBatches(
          Array.isArray(batches)
            ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
            : [],
        );
        setIsBatchListFresh(true);
      })
      .catch(() => {
        // 조회 실패 시엔 기존 목록 기준으로라도 진행 단계를 보여준다
        if (!cancelled) setIsBatchListFresh(true);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, session]);

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
    setUploadForm({ ...EMPTY_UPLOAD_FORM, receiptDate: todayLocalIso() });
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
          onRefresh={async () => {
            const rows = await fetchSchoolStudents();
            setSchoolStudents(rows);
          }}
        />
      );
    }

    if (page === "school-download") {
      return <SchoolDownloadPage students={schoolStudents} />;
    }

    if (page === "agency-dashboard") {
      return (
        <AgencyDashboardPage
          batches={agencyUploadBatches}
          applications={agencyApplications}
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
          showProcessingSteps={isBatchListFresh}
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
        <AgencyDownloadPage schools={schools} batches={agencyUploadBatches} />
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
