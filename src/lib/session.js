import { ROLE_LABELS } from "../constants/roles.js";

export function buildSession(role, payload) {
  if (role === "student") {
    return {
      role,
      title: `${payload.name} 학생`,
      subtitle: payload.term ? `${payload.schoolName} · ${payload.term}` : (payload.schoolName ?? ""),
      passportNumber: payload.passportNumber ?? "",
      birthDate: payload.birthDate ? String(payload.birthDate) : "",
      nationality: payload.nationality ?? "",
      gender: payload.gender ?? "",
      // 내 정보 카드 표시/수정용 — 프로필 응답에서 전달
      name: payload.name ?? "",
      schoolName: payload.schoolName ?? "",
      phoneNumber: payload.phoneNumber ?? "",
      address: payload.address ?? "",
      alienRegistrationNumber: payload.alienRegistrationNumber ?? "",
    };
  }

  return {
    role,
    title: `${ROLE_LABELS[role]} 운영 계정`,
    subtitle: payload.displayName || payload.username,
    username: payload.username,
    displayName: payload.displayName || payload.username,
    backendRole: payload.backendRole || "",
    isAuthenticated: true,
  };
}

// 백엔드 role(ROLE_SCHOOL_ADMIN / ROLE_AGENCY_ADMIN / ROLE_SYSTEM_ADMIN)을
// 프론트 화면(school / agency)으로 매핑. SYSTEM_ADMIN은 전체 운영 화면(agency)으로.
export function viewForBackendRole(backendRole) {
  const normalized = String(backendRole ?? "").toUpperCase();
  if (normalized.includes("SCHOOL")) {
    return "school";
  }
  return "agency";
}
