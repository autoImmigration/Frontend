import { STATUS_CLASS_MAP, ACTIVE_PROCESSING_STATUSES } from "../../constants/status.js";

export function StatusBadge({ value }) {
  const isActive = ACTIVE_PROCESSING_STATUSES.has(value);
  return (
    <span className={`${STATUS_CLASS_MAP[value] ?? "status"}${isActive ? " isProcessing" : ""}`}>
      {isActive && <span className="processingDot" aria-hidden="true" />}
      {value}
    </span>
  );
}
