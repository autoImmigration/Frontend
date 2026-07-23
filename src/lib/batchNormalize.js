import { BATCH_STATUS_LABELS } from "../constants/status.js";
import { formatDisplayDateTime } from "./datetime.js";

export function normalizeBatchStatusLabel(status) {
  if (!status) {
    return "";
  }

  const normalizedStatus = String(status).trim();
  const mappedStatus = BATCH_STATUS_LABELS[normalizedStatus.toUpperCase()];

  return mappedStatus ?? normalizedStatus;
}

export function buildBatchNote(batch, fallbackNote = "") {
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

export function hasTerminalProcessingStatus(status) {
  return ["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"].includes(status);
}

export function hasTerminalBatchStatus(status) {
  return ["COMPLETED", "NEEDS_REVIEW", "FAILED", "RESULT_UPLOADED", "REJECTED"].includes(status);
}

/**
 * 업로드 내역 목록의 상태 — 업로드 자체의 성패만 표시한다 (완료/실패).
 * 추출·검증 등 처리 파이프라인 진행 상황은 진행 중 배치의 단계 표시와 상세 화면에서 확인.
 */
export function deriveUploadOnlyStatus(batch) {
  const raw = (batch.uploadBatchStatusRaw ?? "").toUpperCase();
  return raw === "FAILED" ? "실패" : "완료";
}

export function buildBatchTimeline(batch) {
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

export function buildBatchEvents(batch) {
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

export function normalizeAgencyUploadBatch(batch, fallback = {}) {
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

export function deriveStepStates(batch) {
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

// 검토 우선순위 티어 — 업로드 상세 "검토 필요" 목록과 케이스 상세 "검토 n/N" 큐가
// 반드시 같은 순서가 되도록 공용 함수로 통일 (2026-07-09: 두 화면 순서 불일치 수정).
// 필수 신원(1) > 누락(1.5) > 전화(2) > 주소(3) > 기타 서류검수(5)
const REVIEW_TIER_BY_FIELD = {
  date_of_birth: 1, passport_number: 1, nationality: 1, alien_registration_number: 1, student_name: 1,
  phone_number: 2, address: 3,
};
export function caseReviewTier(c) {
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
