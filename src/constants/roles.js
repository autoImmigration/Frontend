export const ROLE_LABELS = {
  student: "학생",
  school: "학교",
  agency: "유학원",
};

export const ROLE_HELP = {
  student: "국적, 여권번호, 생년월일로 본인 신청 건을 확인합니다.",
  school: "학교 담당자 계정으로 학생 목록과 신청 상태를 조회합니다.",
  agency: "유학원 운영 계정으로 신청 건, 문서 상태, ZIP 업로드를 관리합니다.",
};

export const NAV_ITEMS = {
  student: [{ page: "student-list", label: "신청 현황" }],
  school: [
    { page: "school-list", label: "학생 목록" },
    { page: "school-download", label: "다운로드" },
  ],
  agency: [
    { page: "agency-dashboard", label: "신청 대시보드" },
    { page: "agency-student-list", label: "학생 목록" },
    { page: "agency-supplement-list", label: "보완 접수" },
    { page: "agency-file-list", label: "파일 목록" },
    { page: "agency-upload", label: "ZIP 업로드" },
    { page: "agency-upload-history", label: "업로드 내역" },
    { page: "agency-download", label: "다운로드" },
  ],
};

/** 페이지 id → 사람이 읽는 화면 이름. "돌아가기" 버튼 문구를 출발지에 맞추는 데 쓴다. */
export const PAGE_LABELS = Object.fromEntries(
  Object.values(NAV_ITEMS).flat().map((item) => [item.page, item.label]),
);
