export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8080/api/v1"
).replace(/\/+$/, "");

function basicAuth(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`;
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

async function request(path, { username, password, fallbackMessage, ...options } = {}) {
  const headers = new Headers(options.headers ?? {});

  if (username && password) {
    headers.set("Authorization", basicAuth(username, password));
  }

  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let lastError;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

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

export async function fetchMe(username, password) {
  return request("/auth/me", {
    username,
    password,
    fallbackMessage: "Authentication failed",
  });
}

export async function lookupStudentAccess({ nationality, passportNumber, birthDate }) {
  return request("/student-access/lookup", {
    method: "POST",
    body: JSON.stringify({
      nationality,
      passportNumber,
      birthDate,
    }),
    fallbackMessage: "Failed to load student applications",
  });
}

export async function fetchSchoolStudents(username, password, params = {}) {
  return request(`/school/students${buildQuery(params)}`, {
    username,
    password,
    fallbackMessage: "Failed to load school students",
  });
}

export async function fetchAgencyApplications(username, password, params = {}) {
  return request(`/agency/application-cases${buildQuery(params)}`, {
    username,
    password,
    fallbackMessage: "Failed to load agency applications",
  });
}

export async function fetchAgencyApplicationDetail(username, password, caseId) {
  return request(`/agency/application-cases/${caseId}`, {
    username,
    password,
    fallbackMessage: "Failed to load application case detail",
  });
}

export async function fetchAgencyUploadBatches(username, password) {
  return request("/agency/upload-batches", {
    username,
    password,
    fallbackMessage: "Failed to load upload batches",
  });
}

export async function fetchOcrProgress(username, password, batchId) {
  return request(`/agency/upload-batches/${batchId}/ocr-progress`, {
    username,
    password,
    fallbackMessage: "Failed to load OCR progress",
  });
}

export async function fetchAgencyUploadBatchDetail(username, password, batchId) {
  return request(`/agency/upload-batches/${batchId}`, {
    username,
    password,
    fallbackMessage: "Failed to load upload batch detail",
  });
}

export async function fetchSchools(username, password) {
  return request("/agency/schools", {
    username,
    password,
    fallbackMessage: "Failed to load schools",
  });
}

export async function uploadAgencyBatchFile(username, password, file, { schoolId, note, visaTypeCode } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  if (schoolId) formData.append("schoolId", schoolId);
  if (note) formData.append("note", note);
  if (visaTypeCode) formData.append("visaTypeCode", visaTypeCode);

  return request("/agency/upload-batches/file", {
    method: "POST",
    username,
    password,
    body: formData,
    fallbackMessage: "Failed to upload ZIP file",
  });
}
