export const STATUS_CLASS_MAP = {
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

export const BATCH_STATUS_LABELS = {
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

export const ACTIVE_PROCESSING_STATUSES = new Set(["처리 중", "대기", "텍스트 추출 중", "검증 중"]);

export const CASE_STATUS_OPTIONS = [
  { key: "DRAFT", label: "임시" },
  { key: "SUBMITTED", label: "접수" },
  { key: "RECEIVED", label: "접수 확인" },
  { key: "NEEDS_REVIEW", label: "검수 필요" },
  { key: "NEEDS_SUPPLEMENT", label: "보완" },
  { key: "COMPLETED", label: "완료" },
  { key: "REJECTED", label: "반려" },
];

export const TERMINAL_BATCH_STATUSES_SET = new Set([
  "COMPLETED", "RESULT_UPLOADED", "NEEDS_REVIEW", "FAILED", "CANCELED", "CANCELLED",
]);

export const REPROCESSABLE_STATUSES = new Set(["RESULT_UPLOADED", "NEEDS_REVIEW", "FAILED"]);
