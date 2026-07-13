import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * 목록의 필터·검색어를 URL query string에 담는다.
 *
 * 컴포넌트 내부 useState 로 두면 새로고침·뒤로가기에서 필터가 날아가고,
 * "이 조건으로 걸러진 화면"을 동료에게 링크로 넘길 수도 없다.
 *
 * - 기본값과 같거나 빈 값이면 파라미터를 지운다 → URL이 지저분해지지 않는다.
 * - 필터가 바뀌면 page 를 지운다 → 3페이지를 보다 필터를 바꿔 결과가 1페이지뿐일 때
 *   빈 화면에 갇히지 않는다.
 * - replace: 필터 조작은 히스토리에 쌓지 않는다. 드롭다운 몇 번 만졌다고
 *   뒤로가기를 그만큼 눌러야 하면 안 된다.
 */
export function useUrlState(key, defaultValue = "") {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const value = raw === null ? defaultValue : raw;

  const setValue = useCallback(
    (next) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === null || next === undefined || next === "" || next === defaultValue) {
            params.delete(key);
          } else {
            params.set(key, String(next));
          }
          if (key !== "page") params.delete("page");
          return params;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setSearchParams],
  );

  return [value, setValue];
}

/** usePagination 과 같은 모양이지만 현재 페이지를 URL(?page=)에 둔다. */
export function useUrlPagination(items, pageSize) {
  const [rawPage, setRawPage] = useUrlState("page", "1");

  const requested = Math.max(1, Number.parseInt(rawPage, 10) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(requested, totalPages);
  const paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const setCurrentPage = useCallback(
    (next) => setRawPage(String(next)),
    [setRawPage],
  );

  return { currentPage, setCurrentPage, totalPages, paginatedItems, totalItems: items.length };
}
