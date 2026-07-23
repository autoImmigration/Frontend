export function PaginationNav({ currentPage, totalPages, onPageChange }) {
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
