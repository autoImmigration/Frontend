export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8080/api/v1"
).replace(/\/+$/, "");

function basicAuth(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

async function readErrorMessage(response, fallbackMessage) {
  const error = await response.json().catch(() => null);
  return error?.message ?? fallbackMessage;
}

export async function fetchMe(username, password) {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: basicAuth(username, password),
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Authentication failed"));
  }

  return response.json();
}

export async function uploadDocument({ username, password, file }) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(username, password),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Upload failed"));
  }

  return response.json();
}

export async function fetchDocuments(username, password) {
  const response = await fetch(`${API_BASE_URL}/documents`, {
    headers: {
      Authorization: basicAuth(username, password),
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load documents"));
  }

  return response.json();
}
