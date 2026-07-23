export function SummaryStrip({ items, variant = "" }) {
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
