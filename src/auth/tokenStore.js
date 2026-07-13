// Central token store.
// - accessToken: in-memory only (lost on refresh, recovered via refreshAccessToken()).
// - refreshToken: localStorage (persists across reload/revisit) — school/agency only.
// - studentToken: sessionStorage (tab-scoped, no refresh) — student flow.

const REFRESH_KEY = "ops_refresh_token";
const STUDENT_KEY = "student_access_token";

let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token ?? null;
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setRefreshToken(token) {
  try {
    if (token) {
      localStorage.setItem(REFRESH_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
  } catch {
    // storage unavailable — tokens stay in memory only
  }
}

export function getStudentToken() {
  try {
    return sessionStorage.getItem(STUDENT_KEY);
  } catch {
    return null;
  }
}

export function setStudentToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(STUDENT_KEY, token);
    } else {
      sessionStorage.removeItem(STUDENT_KEY);
    }
  } catch {
    // storage unavailable
  }
}

export function clearStudent() {
  setStudentToken(null);
}

// Clears school/agency tokens (access in memory + refresh in localStorage).
export function clear() {
  accessToken = null;
  setRefreshToken(null);
}
