import { PAGE_LABELS } from "../constants/roles.js";

export function pageLabel(page, fallback = "목록") {
  return PAGE_LABELS[page] ?? fallback;
}

/** 상세 화면들 — 사이드바에 자기 항목이 없어서, 어느 메뉴를 강조할지 정해줘야 한다. */
const DETAIL_PAGES = new Set([
  "student-detail",
  "agency-detail",
  "agency-upload-history-detail",
  "agency-batch-case-detail",
]);

/**
 * 상세 화면에서 강조할 사이드바 메뉴.
 *
 * 출발한 메뉴(originPage)가 있으면 그걸 쓴다 — 보완 접수에서 케이스로 들어갔는데
 * 업로드 내역이 강조되면 자기가 어디 있는지 알 수 없다. 출발지를 모를 때만(딥링크·
 * 새로고침) 아래 기본값으로 떨어진다.
 */
export function pageToActiveKey(page, originPage = null) {
  if (DETAIL_PAGES.has(page) && originPage && PAGE_LABELS[originPage]) {
    return originPage;
  }

  if (page === "student-detail") {
    return "student-list";
  }

  if (page === "agency-detail") {
    // 케이스 상세는 학생 목록에서만 열린다 (대시보드의 '케이스 보기'는 배치 상세로 간다)
    return "agency-student-list";
  }

  if (page === "agency-upload-history-detail") {
    return "agency-upload-history";
  }

  if (page === "agency-batch-case-detail") {
    return "agency-upload-history";
  }

  return page;
}

export function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}
