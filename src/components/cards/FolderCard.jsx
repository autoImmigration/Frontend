export function FolderCard({ icon, name, meta, onClick, disabled }) {
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
