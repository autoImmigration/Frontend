import { UploadProcessingSteps } from "../../components/batch/UploadProcessingSteps.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { VISA_TYPE_OPTIONS } from "../../constants/search.js";
import { uploadFlowSteps } from "../../mockData.js";

export function AgencyUploadPage({
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
