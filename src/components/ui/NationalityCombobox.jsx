import { useState } from "react";

// 국적 선택 콤보박스 — 클릭하면 전체 목록, 타이핑하면 필터. (네이티브 datalist는
// 값이 미리 채워져 있으면 목록을 안 펼쳐주는 브라우저 동작 때문에 커스텀으로 대체)
export function NationalityCombobox({ value, onChange, options }) {
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
