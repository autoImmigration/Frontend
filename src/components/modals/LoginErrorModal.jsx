export function LoginErrorModal({ message, onClose }) {
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
