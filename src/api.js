import {
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  getStudentToken,
  setStudentToken,
  clear as clearTokens,
} from "./auth/tokenStore.js";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8080/api/v1"
).replace(/\/+$/, "");

// Global callback invoked when refresh ultimately fails (school/agency session expired).
let onAuthExpired = null;
export function setOnAuthExpired(callback) {
  onAuthExpired = typeof callback === "function" ? callback : null;
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.set(key, value);
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

async function readErrorMessage(response, fallbackMessage) {
  const error = await response.json().catch(() => null);
  return error?.message ?? fallbackMessage;
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

function isServerError(status) {
  return status >= 500 && status < 600;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Single-flight refresh: concurrent 401s share one in-flight refresh promise.
// ---------------------------------------------------------------------------
let refreshPromise = null;

async function performRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token");
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw new Error("Refresh failed");
  }

  const data = await response.json();
  // Rotation: store both the new access AND the new refresh token.
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  return data.accessToken;
}

// Returns the new access token, or null if refresh failed (tokens cleared).
async function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = performRefresh()
      .catch((error) => {
        clearTokens();
        if (onAuthExpired) onAuthExpired();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  try {
    return await refreshPromise;
  } catch {
    return null;
  }
}

// Public wrapper used by App.jsx for boot-time session recovery.
export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = performRefresh()
      .catch((error) => {
        // Boot-time recovery with a stale/invalid refresh token: drop it so it
        // can't keep failing or surface as a spurious "Authentication failed".
        clearTokens();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Core request: Bearer injection + 5xx backoff retry + 401 -> refresh -> retry.
// `auth` selects which token to inject: "bearer" (school/agency) or "student".
// ---------------------------------------------------------------------------
function selectToken(auth) {
  return auth === "student" ? getStudentToken() : getAccessToken();
}

async function rawFetch(path, options, auth) {
  const headers = new Headers(options.headers ?? {});
  const token = selectToken(auth);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

async function request(path, { fallbackMessage, auth = "bearer", ...options } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    let response = await rawFetch(path, options, auth);

    // 401 -> refresh (school/agency only) -> single retry. Student has no refresh.
    if (response.status === 401 && auth === "bearer") {
      const newToken = await refreshOnce();
      if (newToken) {
        response = await rawFetch(path, options, auth);
      }
    }

    if (!response.ok) {
      if (isServerError(response.status) && attempt < RETRY_DELAYS_MS.length) {
        lastError = new Error(await readErrorMessage(response, fallbackMessage ?? "Request failed"));
        continue;
      }
      throw new Error(await readErrorMessage(response, fallbackMessage ?? "Request failed"));
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------
export async function login(username, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "로그인에 실패했습니다."));
  }

  const data = await response.json();
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  return data;
}

export async function logout() {
  try {
    await request("/auth/logout", { method: "POST", fallbackMessage: "로그아웃 실패" });
  } catch {
    // Even if the server call fails, clear local tokens.
  } finally {
    clearTokens();
  }
}

export async function fetchMe() {
  return request("/auth/me", {
    fallbackMessage: "Authentication failed",
  });
}

// ---------------------------------------------------------------------------
// Student access (public lookup returns a temporary student JWT)
// ---------------------------------------------------------------------------
export async function lookupStudentAccess({ nationality, passportNumber, birthDate }) {
  const result = await request("/student-access/lookup", {
    method: "POST",
    auth: "student",
    body: JSON.stringify({ nationality, passportNumber, birthDate }),
    fallbackMessage: "Failed to load student applications",
  });

  if (result?.accessToken) {
    setStudentToken(result.accessToken);
  }
  return result;
}

export async function updateStudentProfile({
  nationality, passportNumber, birthDate, phoneNumber, address, alienRegistrationNumber,
}) {
  return request("/student-access/profile", {
    method: "PATCH",
    auth: "student",
    body: JSON.stringify({
      nationality, passportNumber, birthDate, phoneNumber, address, alienRegistrationNumber,
    }),
    fallbackMessage: "내 정보 수정에 실패했습니다.",
  });
}

// ---------------------------------------------------------------------------
// School / agency endpoints (Bearer)
// ---------------------------------------------------------------------------
export async function fetchSchoolStudents(params = {}) {
  return request(`/school/students${buildQuery(params)}`, {
    fallbackMessage: "Failed to load school students",
  });
}

export async function fetchAgencyApplications(params = {}) {
  return request(`/agency/application-cases${buildQuery(params)}`, {
    fallbackMessage: "Failed to load agency applications",
  });
}

export async function fetchAgencyApplicationDetail(caseId) {
  return request(`/agency/application-cases/${caseId}`, {
    fallbackMessage: "Failed to load application case detail",
  });
}

/**
 * 검토 화면 위치 정보 — 목록과 같은 필터를 넘겨야 "n/N"이 목록과 일치한다.
 * @returns {Promise<{index:number,total:number,prevId:?string,prevName:?string,nextId:?string,nextName:?string}>}
 */
export async function fetchAgencyCaseNavigation(caseId, params = {}) {
  return request(
    `/agency/application-cases/${encodeURIComponent(caseId)}/navigation${buildQuery(params)}`,
    { fallbackMessage: "Failed to load case navigation" },
  );
}

export async function fetchAgencyUploadBatches() {
  return request("/agency/upload-batches", {
    fallbackMessage: "Failed to load upload batches",
  });
}

export async function fetchOcrProgress(batchId) {
  return request(`/agency/upload-batches/${batchId}/ocr-progress`, {
    fallbackMessage: "Failed to load OCR progress",
  });
}

export async function fetchAgencyUploadBatchDetail(batchId) {
  return request(`/agency/upload-batches/${batchId}`, {
    fallbackMessage: "Failed to load upload batch detail",
  });
}

export async function fetchSchools() {
  return request("/agency/schools", {
    fallbackMessage: "Failed to load schools",
  });
}

export async function uploadAgencyBatchFile(file, { schoolId, note, visaTypeCode } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  if (schoolId) formData.append("schoolId", schoolId);
  if (note) formData.append("note", note);
  if (visaTypeCode) formData.append("visaTypeCode", visaTypeCode);

  return request("/agency/upload-batches/file", {
    method: "POST",
    body: formData,
    fallbackMessage: "Failed to upload ZIP file",
  });
}

export async function reprocessBatch(batchId) {
  return request(`/agency/upload-batches/${batchId}/reprocess`, {
    method: "POST",
    fallbackMessage: "Failed to reprocess batch",
  });
}

export async function excludeAgencyCase(caseId) {
  return request(`/agency/application-cases/${encodeURIComponent(caseId)}/exclude`, {
    method: "POST",
    fallbackMessage: "학생 제외 처리에 실패했습니다.",
  });
}

export async function includeAgencyCase(caseId) {
  return request(`/agency/application-cases/${encodeURIComponent(caseId)}/include`, {
    method: "POST",
    fallbackMessage: "학생 추가(복원) 처리에 실패했습니다.",
  });
}

export async function updateCaseStatus(caseId, status) {
  return request(`/agency/application-cases/${caseId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
    fallbackMessage: "Failed to update case status",
  });
}

export async function updateDocumentNote(caseId, docCode, note) {
  return request(`/agency/application-cases/${caseId}/documents/${docCode}/note`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
    fallbackMessage: "Failed to update document note",
  });
}

export async function requestSupplement(batchId, caseId, items, message) {
  return request(`/agency/upload-batches/${encodeURIComponent(batchId)}/cases/${encodeURIComponent(caseId)}/supplement-request`, {
    method: "POST",
    body: JSON.stringify({ items, message }),
    fallbackMessage: "보완 요청 전송에 실패했습니다.",
  });
}

export async function fetchCaseActivities(caseId) {
  return request(`/agency/application-cases/${encodeURIComponent(caseId)}/activities`, {
    fallbackMessage: "활동 내역을 불러오지 못했습니다.",
  });
}

export async function updateStudentInfo(caseId, { name, nationality, passportNumber, birthDate, alienRegistrationNumber, phoneNumber, address }) {
  return request(`/agency/application-cases/${encodeURIComponent(caseId)}/student`, {
    method: "PATCH",
    body: JSON.stringify({ name, nationality, passportNumber, birthDate, alienRegistrationNumber, phoneNumber, address }),
    fallbackMessage: "학생 정보 수정에 실패했습니다.",
  });
}

// Student supplement upload — uses the STUDENT Bearer token (no refresh path).
export async function uploadStudentSupplement(passportNumber, birthDate, caseId, docCode, file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("passportNumber", passportNumber);
  formData.append("birthDate", birthDate);
  return request(
    `/student-access/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(docCode)}/upload`,
    {
      method: "POST",
      auth: "student",
      body: formData,
      fallbackMessage: "보완 서류 업로드에 실패했습니다.",
    },
  );
}

export async function uploadSupplementDocument(caseId, docCode, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(
    `/agency/application-cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(docCode)}/upload`,
    {
      method: "POST",
      body: formData,
      fallbackMessage: "보완 서류 업로드에 실패했습니다.",
    },
  );
}

export async function linkDocumentFile(caseId, docCode, filename) {
  return request(`/agency/application-cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(docCode)}/file`, {
    method: "PATCH",
    body: JSON.stringify({ filename }),
    fallbackMessage: "서류 파일 연결에 실패했습니다.",
  });
}

// 다중 선택 일괄 매핑: '기타' 스캔 여러 개를 하나의 양식에 한 번에 추가한다.
export async function bulkAssignDocumentFiles(caseId, docCode, filenames) {
  return request(`/agency/application-cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(docCode)}/files`, {
    method: "POST",
    body: JSON.stringify({ filenames }),
    fallbackMessage: "서류 일괄 지정에 실패했습니다.",
  });
}

// 스캔 1장 이동: 현재 위치(양식/기타)에서 떼어 대상으로. targetCode 미지정/"OTHER" 이면 제외(기타로).
// 지정·변경·제외를 한 동작으로 처리한다(스캔별 드롭다운 전용).
export async function moveDocumentScan(caseId, filename, targetCode) {
  return request(`/agency/application-cases/${encodeURIComponent(caseId)}/documents/files/move`, {
    method: "PATCH",
    body: JSON.stringify({ filename, targetCode: targetCode || "OTHER" }),
    fallbackMessage: "스캔 이동에 실패했습니다.",
  });
}

export async function renameUploadBatchDocument(batchId, caseId, docCode, name) {
  return request(`/agency/upload-batches/${encodeURIComponent(batchId)}/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(docCode)}/name`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
    fallbackMessage: "Failed to rename document",
  });
}

// ---------------------------------------------------------------------------
// Blob download / authenticated image — share the Bearer + 401 refresh path.
// ---------------------------------------------------------------------------

// Fetch a protected resource as a Blob, applying the same Bearer + 401-refresh
// path as request(). Returns a Blob. Throws with `fallbackMessage` on failure.
export async function fetchAuthedBlob(path, fallbackMessage = "요청에 실패했습니다.") {
  let response = await rawFetch(path, {}, "bearer");
  if (response.status === 401) {
    const newToken = await refreshOnce();
    if (newToken) {
      response = await rawFetch(path, {}, "bearer");
    }
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage));
  }
  return response.blob();
}

async function downloadBlob(path, filename) {
  const blob = await fetchAuthedBlob(path, "다운로드에 실패했습니다.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadGroupPayment(schoolId) {
  await downloadBlob(
    `/agency/export/group-payment${buildQuery({ schoolId })}`,
    "group-payment.csv",
  );
}

export async function downloadOcrResults(batchId) {
  await downloadBlob(
    `/agency/export/ocr-results${buildQuery({ batchId })}`,
    "ocr-results.csv",
  );
}

/**
 * 배치의 스캔 이미지를 학생별 폴더로 묶은 ZIP 다운로드.
 * 파일이 하나도 없으면(204) 다운로드를 시작하지 않고 false 를 반환한다.
 */
export async function downloadBatchFiles(batchId, filename) {
  const path = `/agency/export/batches/${encodeURIComponent(batchId)}/files`;
  const response = await rawFetch(path, {}, "bearer");
  if (response.status === 401) {
    const newToken = await refreshOnce();
    if (newToken) return downloadBatchFiles(batchId, filename);
  }
  if (response.status === 204) return false;
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "파일 다운로드에 실패했습니다."));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `${batchId}-files.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
