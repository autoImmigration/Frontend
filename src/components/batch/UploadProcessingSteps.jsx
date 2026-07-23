import { deriveStepStates } from "../../lib/batchNormalize.js";

const UPLOAD_PIPELINE_STEPS = [
  { key: "unzip",   label: "ZIP 해제",   desc: "서버에서 ZIP 파일을 해제합니다." },
  { key: "index",   label: "배치 인덱싱", desc: "페이지별 OCR/분류 작업을 실행합니다." },
  { key: "group",   label: "그룹화",      desc: "통합신청서 기준으로 학생 케이스를 묶습니다." },
  { key: "extract", label: "텍스트 추출", desc: "LLM으로 필드를 추출하고 케이스에 반영합니다." },
];

export function UploadProcessingSteps({ batch }) {
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
