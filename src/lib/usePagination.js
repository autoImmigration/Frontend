import { useEffect, useState } from "react";

export function usePagination(items, pageSize, resetKey) {
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey, items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { currentPage: safePage, setCurrentPage, totalPages, paginatedItems, totalItems: items.length };
}
