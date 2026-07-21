import { matchPath, generatePath } from "react-router-dom";

/**
 * 화면 ↔ URL 매핑.
 *
 * URL이 단일 진실원이고 화면 id(page)는 여기서 파생된다. 그래서
 * 새로고침·브라우저 뒤로가기·링크 공유가 전부 동작한다.
 *
 * 예전에는 `useState("agency-dashboard")` 같은 화면 상태로만 이동했기 때문에
 * "돌아가기"가 갈 곳을 각 화면이 추측해서 하드코딩해야 했고, 그래서 출발지와
 * 다른 곳으로 튕기는 버그가 반복됐다.
 */
export const ROUTES = [
  { page: "login", path: "/login", role: null },

  { page: "student-detail", path: "/student/applications/:applicationId", role: "student" },
  { page: "student-list", path: "/student", role: "student" },

  { page: "school-list", path: "/school/students", role: "school" },
  { page: "school-download", path: "/school/download", role: "school" },

  // 구체적인 경로가 먼저 와야 한다 (/agency/batches/:batchId 가 케이스 경로를 가로채지 않도록)
  { page: "agency-batch-case-detail", path: "/agency/batches/:batchId/cases/:caseId", role: "agency" },
  { page: "agency-upload-history-detail", path: "/agency/batches/:batchId", role: "agency" },
  { page: "agency-upload-history", path: "/agency/batches", role: "agency" },
  { page: "agency-detail", path: "/agency/cases/:caseId", role: "agency" },
  { page: "agency-student-list", path: "/agency/students", role: "agency" },
  { page: "agency-supplement-list", path: "/agency/supplements", role: "agency" },
  { page: "agency-file-list", path: "/agency/files", role: "agency" },
  { page: "agency-upload", path: "/agency/upload", role: "agency" },
  { page: "agency-download", path: "/agency/download", role: "agency" },
  { page: "agency-dashboard", path: "/agency", role: "agency" },
];

const ROUTE_BY_PAGE = Object.fromEntries(ROUTES.map((route) => [route.page, route]));

/** 현재 URL → { page, params }. 매칭되는 라우트가 없으면 null. */
export function matchRoute(pathname) {
  for (const route of ROUTES) {
    const matched = matchPath(route.path, pathname);
    if (matched) {
      return { page: route.page, params: matched.params ?? {}, role: route.role };
    }
  }
  return null;
}

/** 화면 id + 파라미터 → URL. 파라미터가 모자라면 부모 경로로 안전하게 낮춘다. */
export function pathForPage(page, params = {}) {
  const route = ROUTE_BY_PAGE[page];
  if (!route) return "/login";

  try {
    return generatePath(route.path, params);
  } catch {
    // :param 이 비었을 때 — 상세 대신 그 상위 목록으로 보낸다.
    const parent = route.path.split("/:")[0];
    return parent || "/login";
  }
}

/** 로그인 직후 갈 첫 화면. */
export function homePathForRole(role) {
  if (role === "student") return pathForPage("student-list");
  if (role === "school") return pathForPage("school-list");
  return pathForPage("agency-dashboard");
}

/** 이 화면을 이 역할이 볼 수 있는가 — 학생 URL에 유학원 세션으로 진입하는 것 등을 막는다. */
export function pageAllowedForRole(page, role) {
  const route = ROUTE_BY_PAGE[page];
  return Boolean(route) && route.role === role;
}
