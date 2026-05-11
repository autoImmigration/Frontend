const documentRuleMap = {
  통합신청서: {
    category: "신청",
    rule: "ZIP 업로드 시 학생 구간 분리의 기준 문서",
  },
  여권사본: {
    category: "신원",
    rule: "학생 이름, 국적, 생년월일 추출 1순위",
  },
  사증발급서: {
    category: "비자",
    rule: "학교와 입국 목적 일치 여부 확인",
  },
  재학증명서: {
    category: "학교",
    rule: "학적 상태와 신청 학기 일치 여부 확인",
  },
  부동산계약서: {
    category: "거주",
    rule: "주소 추출 대상 문서",
  },
  외국인등록증사본: {
    category: "신분",
    rule: "기존 등록번호 및 체류자격 확인",
  },
  "외국인등록증 사본": {
    category: "신분",
    rule: "기존 등록번호 및 체류자격 확인",
  },
  출석증명서: {
    category: "학교",
    rule: "출석률 기준 확인 필요",
  },
  은행잔고증명서: {
    category: "재정",
    rule: "재정 요건 충족 여부 확인",
  },
  사유서: {
    category: "보완",
    rule: "연장 또는 변경 사유 검토 대상",
  },
  위임장: {
    category: "대리",
    rule: "유학원 대리 접수 여부 확인",
  },
  "지도교수 확인서": {
    category: "학교",
    rule: "학업 지속 사유 확인 문서",
  },
  표준입학허가서: {
    category: "학교",
    rule: "입학허가 정보와 신청 유형 매칭",
  },
  등록금납부확인서: {
    category: "재정",
    rule: "등록금 납부 여부 확인",
  },
  "최종학력 인증서": {
    category: "학력",
    rule: "최종학력 증빙 문서",
  },
  "최종학력 성적표": {
    category: "학력",
    rule: "직전 학력 성적 확인",
  },
  "어학당 재학증명서": {
    category: "학교",
    rule: "어학당 재학 상태 확인",
  },
  "어학당 성적증명서": {
    category: "학교",
    rule: "어학당 이수 성적 확인",
  },
};

export const visaDocumentMap = {
  외국인등록: [
    "통합신청서",
    "여권사본",
    "사증발급서",
    "재학증명서",
    "부동산계약서",
  ].map(toDocumentDefinition),
  D2연장: [
    "통합신청서",
    "여권사본",
    "외국인등록증사본",
    "재학증명서",
    "출석증명서",
    "은행잔고증명서",
    "사유서",
    "부동산계약서",
    "위임장",
  ].map(toDocumentDefinition),
  D4연장: [
    "통합신청서",
    "여권사본",
    "외국인등록증 사본",
    "재학증명서",
    "출석증명서",
    "은행잔고증명서",
    "사유서",
    "지도교수 확인서",
    "부동산계약서",
    "위임장",
  ].map(toDocumentDefinition),
  "세부체류자격 변경 및 연장": [
    "통합신청서",
    "여권사본",
    "외국인등록증 사본",
    "표준입학허가서",
    "등록금납부확인서",
    "최종학력 인증서",
    "최종학력 성적표",
    "은행잔고증명서",
    "사유서",
    "부동산계약서",
    "위임장",
  ].map(toDocumentDefinition),
  D2변경: [
    "통합신청서",
    "여권사본",
    "외국인등록증 사본",
    "표준입학허가서",
    "등록금납부확인서",
    "최종학력 인증서",
    "최종학력 성적표",
    "어학당 재학증명서",
    "어학당 성적증명서",
    "은행잔고증명서",
    "부동산계약서",
    "위임장",
  ].map(toDocumentDefinition),
};

function slugify(value) {
  return value
    .replace(/\s+/g, "-")
    .replace(/[()]/g, "")
    .toLowerCase();
}

function toDocumentDefinition(name) {
  const metadata = documentRuleMap[name] ?? {
    category: "기타",
    rule: "운영자 검토 규칙 미정",
  };

  return {
    code: slugify(name),
    name,
    category: metadata.category,
    rule: metadata.rule,
  };
}

function buildDocuments(visaType, overrides = {}) {
  return visaDocumentMap[visaType].map((document) => ({
    ...document,
    status: overrides[document.code]?.status ?? "미제출",
    submittedAt: overrides[document.code]?.submittedAt ?? "-",
    note: overrides[document.code]?.note ?? "확인 대기",
    preview:
      overrides[document.code]?.preview ??
      `${document.name} 스캔본이 선택되면 이 영역에 미리보기와 OCR 요약이 표시됩니다.`,
  }));
}

export const roleLabels = {
  student: "학생",
  school: "학교",
  agency: "유학원",
};

export const roleDescriptions = {
  student: "본인 신청 현황 확인과 개별 문서 보완 준비",
  school: "학생 상태 모니터링과 명단 관리",
  agency: "신청 건 운영, 문서 검수, ZIP 업로드 준비",
};

export const nationalityOptions = [
  "대한민국",
  "중국",
  "베트남",
  "몽골",
  "일본",
  "우즈베키스탄",
];

export const studentProfile = {
  name: "린응옥안",
  nationality: "베트남",
  passportNumber: "M38492017",
  birthDate: "2002-11-14",
  schoolName: "한빛대학교",
  agencyName: "글로벌브릿지 유학원",
  term: "2026 봄학기",
};

export const studentApplications = [
  {
    id: "STU-2026-0412",
    applicationType: "신규 신청",
    visaType: "외국인등록",
    submittedAt: "2026.04.12",
    status: "보완",
    lane: "학부 정규과정",
    note: "부동산계약서가 없어 주소 추출을 못 해서 보완 대기 상태입니다.",
    documents: buildDocuments("외국인등록", {
      [slugify("통합신청서")]: {
        status: "제출",
        submittedAt: "2026.04.10",
        note: "학생 구간 분리 기준 문서로 인식",
        preview: "통합신청서 1-3페이지, 연락처 항목 기재 완료",
      },
      [slugify("여권사본")]: {
        status: "제출",
        submittedAt: "2026.04.10",
        note: "이름, 국적, 생년월일 추출 완료",
        preview: "여권 사진면 스캔본",
      },
      [slugify("사증발급서")]: {
        status: "제출",
        submittedAt: "2026.04.09",
        note: "발급 번호 확인 완료",
      },
      [slugify("재학증명서")]: {
        status: "제출",
        submittedAt: "2026.04.09",
        note: "재학 상태 확인",
      },
      [slugify("부동산계약서")]: {
        status: "미제출",
        note: "체류지 주소 추출 대상 문서 필요",
        preview: "부동산계약서가 제출되면 주소 추출 결과가 표시됩니다.",
      },
    }),
  },
  {
    id: "STU-2026-0227",
    applicationType: "연장 신청",
    visaType: "D2연장",
    submittedAt: "2026.02.27",
    status: "완료",
    lane: "학부 체류 연장",
    note: "필수 서류 제출 및 검토 완료",
    documents: buildDocuments("D2연장", {
      [slugify("통합신청서")]: {
        status: "제출",
        submittedAt: "2026.02.20",
        note: "통합신청서 OCR 완료",
      },
      [slugify("여권사본")]: {
        status: "제출",
        submittedAt: "2026.02.20",
        note: "여권번호 자동 인식 성공",
      },
      [slugify("외국인등록증사본")]: {
        status: "제출",
        submittedAt: "2026.02.19",
        note: "등록번호 확인 완료",
      },
      [slugify("재학증명서")]: {
        status: "제출",
        submittedAt: "2026.02.19",
        note: "학적 확인 완료",
      },
      [slugify("출석증명서")]: {
        status: "제출",
        submittedAt: "2026.02.18",
        note: "출석률 기준 충족",
      },
      [slugify("은행잔고증명서")]: {
        status: "제출",
        submittedAt: "2026.02.18",
        note: "재정 요건 충족",
      },
      [slugify("사유서")]: {
        status: "제출",
        submittedAt: "2026.02.17",
        note: "연장 사유 확인",
      },
      [slugify("부동산계약서")]: {
        status: "제출",
        submittedAt: "2026.02.17",
        note: "주소 추출 완료",
      },
      [slugify("위임장")]: {
        status: "제출",
        submittedAt: "2026.02.17",
        note: "대리 접수 확인",
      },
    }),
  },
  {
    id: "STU-2025-1218",
    applicationType: "변경 신청",
    visaType: "D2변경",
    submittedAt: "2025.12.18",
    status: "보완",
    lane: "어학당 -> 학위과정 변경",
    note: "어학당 성적증명서와 부동산계약서가 누락되어 보완 요청 상태입니다.",
    documents: buildDocuments("D2변경", {
      [slugify("통합신청서")]: {
        status: "제출",
        submittedAt: "2025.12.11",
        note: "통합신청서 기준 구간 인식 완료",
      },
      [slugify("여권사본")]: {
        status: "제출",
        submittedAt: "2025.12.11",
        note: "여권값 우선 매칭 완료",
      },
      [slugify("외국인등록증 사본")]: {
        status: "제출",
        submittedAt: "2025.12.10",
        note: "기존 체류자격 확인",
      },
      [slugify("표준입학허가서")]: {
        status: "제출",
        submittedAt: "2025.12.10",
        note: "입학허가서 확인",
      },
      [slugify("등록금납부확인서")]: {
        status: "제출",
        submittedAt: "2025.12.09",
        note: "등록금 납부 확인",
      },
      [slugify("최종학력 인증서")]: {
        status: "제출",
        submittedAt: "2025.12.09",
        note: "최종학력 증빙 확보",
      },
      [slugify("최종학력 성적표")]: {
        status: "제출",
        submittedAt: "2025.12.08",
        note: "성적표 확인",
      },
      [slugify("어학당 재학증명서")]: {
        status: "제출",
        submittedAt: "2025.12.08",
        note: "어학당 재학 상태 확인",
      },
      [slugify("어학당 성적증명서")]: {
        status: "미제출",
        note: "어학당 성적 증빙 필요",
      },
      [slugify("은행잔고증명서")]: {
        status: "제출",
        submittedAt: "2025.12.08",
        note: "재정 요건 충족",
      },
      [slugify("부동산계약서")]: {
        status: "미제출",
        note: "주소 추출 대상 누락",
      },
      [slugify("위임장")]: {
        status: "제출",
        submittedAt: "2025.12.07",
        note: "대리 접수 확인",
      },
    }),
  },
];

export const schoolStudents = [
  {
    id: "SCH-1001",
    name: "린응옥안",
    nationality: "베트남",
    visaType: "외국인등록",
    applicationType: "신규 신청",
    status: "보완",
    schoolDepartment: "국제학부",
    agencyName: "글로벌브릿지 유학원",
    lastUpdated: "2026.04.14",
    missingCount: 1,
  },
  {
    id: "SCH-1002",
    name: "장웨이",
    nationality: "중국",
    visaType: "D2연장",
    applicationType: "연장 신청",
    status: "완료",
    schoolDepartment: "경영학과",
    agencyName: "동방에듀",
    lastUpdated: "2026.04.11",
    missingCount: 0,
  },
  {
    id: "SCH-1003",
    name: "바트에르덴",
    nationality: "몽골",
    visaType: "D4연장",
    applicationType: "연장 신청",
    status: "보완",
    schoolDepartment: "한국어교육원",
    agencyName: "스텝인코리아",
    lastUpdated: "2026.04.13",
    missingCount: 2,
  },
  {
    id: "SCH-1004",
    name: "사토 미유",
    nationality: "일본",
    visaType: "세부체류자격 변경 및 연장",
    applicationType: "변경 및 연장",
    status: "완료",
    schoolDepartment: "국제처",
    agencyName: "직접 신청",
    lastUpdated: "2026.04.10",
    missingCount: 0,
  },
  {
    id: "SCH-1005",
    name: "응우옌티하",
    nationality: "베트남",
    visaType: "D2변경",
    applicationType: "변경 신청",
    status: "보완",
    schoolDepartment: "한국어교육원",
    agencyName: "글로벌브릿지 유학원",
    lastUpdated: "2026.04.12",
    missingCount: 2,
  },
];

export const agencyApplications = [
  {
    id: "AG-24018",
    studentName: "린응옥안",
    nationality: "베트남",
    schoolName: "한빛대학교",
    visaType: "외국인등록",
    applicationType: "신규 신청",
    applicationDate: "2026.04.12",
    status: "보완",
    coordinator: "이소정",
    updatedAt: "2026.04.14 09:20",
    intakeBatch: "2026 봄학기 / 학부",
    submittedCount: 4,
    missingCount: 1,
    documents: buildDocuments("외국인등록", {
      [slugify("통합신청서")]: {
        status: "제출",
        submittedAt: "2026.04.10",
        note: "학생 구간 분리 성공",
        preview: "통합신청서 상단 이름과 신청 유형 인식 완료",
      },
      [slugify("여권사본")]: {
        status: "제출",
        submittedAt: "2026.04.10",
        note: "여권 우선 규칙 적용",
        preview: "이름, 국적, 생년월일 추출 성공",
      },
      [slugify("사증발급서")]: {
        status: "제출",
        submittedAt: "2026.04.09",
        note: "사증 발급 확인",
      },
      [slugify("재학증명서")]: {
        status: "제출",
        submittedAt: "2026.04.09",
        note: "재학 상태 확인",
      },
      [slugify("부동산계약서")]: {
        status: "미제출",
        note: "주소 추출 대기",
        preview: "부동산계약서가 없어서 체류지 주소가 비어 있습니다.",
      },
    }),
  },
  {
    id: "AG-24011",
    studentName: "응우옌티하",
    nationality: "베트남",
    schoolName: "한빛대학교 한국어교육원",
    visaType: "D4연장",
    applicationType: "연장 신청",
    applicationDate: "2026.04.09",
    status: "보완",
    coordinator: "정민재",
    updatedAt: "2026.04.12 16:40",
    intakeBatch: "2026 여름학기 / 어학당",
    submittedCount: 8,
    missingCount: 2,
    documents: buildDocuments("D4연장", {
      [slugify("통합신청서")]: {
        status: "제출",
        submittedAt: "2026.04.09",
        note: "통합신청서 인식 완료",
      },
      [slugify("여권사본")]: {
        status: "제출",
        submittedAt: "2026.04.09",
        note: "여권번호 자동 추출",
      },
      [slugify("외국인등록증 사본")]: {
        status: "제출",
        submittedAt: "2026.04.08",
        note: "등록증 확인",
      },
      [slugify("재학증명서")]: {
        status: "제출",
        submittedAt: "2026.04.08",
        note: "재학 상태 확인",
      },
      [slugify("출석증명서")]: {
        status: "제출",
        submittedAt: "2026.04.08",
        note: "출석률 확인",
      },
      [slugify("은행잔고증명서")]: {
        status: "제출",
        submittedAt: "2026.04.08",
        note: "잔고 확인",
      },
      [slugify("사유서")]: {
        status: "제출",
        submittedAt: "2026.04.07",
        note: "연장 사유 확인",
      },
      [slugify("지도교수 확인서")]: {
        status: "미제출",
        note: "지도교수 확인 필요",
      },
      [slugify("부동산계약서")]: {
        status: "제출",
        submittedAt: "2026.04.07",
        note: "주소 추출 완료",
        preview: "부동산계약서에서 서울시 동대문구 주소 추출",
      },
      [slugify("위임장")]: {
        status: "미제출",
        note: "위임장 누락",
      },
    }),
  },
  {
    id: "AG-23997",
    studentName: "사토 미유",
    nationality: "일본",
    schoolName: "한빛대학교 국제처",
    visaType: "세부체류자격 변경 및 연장",
    applicationType: "변경 및 연장",
    applicationDate: "2026.04.02",
    status: "완료",
    coordinator: "이소정",
    updatedAt: "2026.04.10 11:10",
    intakeBatch: "학사편입 / 자격변경",
    submittedCount: 11,
    missingCount: 0,
    documents: buildDocuments("세부체류자격 변경 및 연장", {
      [slugify("통합신청서")]: {
        status: "제출",
        submittedAt: "2026.04.02",
        note: "학생 구간 분리 완료",
      },
      [slugify("여권사본")]: {
        status: "제출",
        submittedAt: "2026.04.02",
        note: "기본 인적사항 추출 완료",
      },
      [slugify("외국인등록증 사본")]: {
        status: "제출",
        submittedAt: "2026.04.01",
        note: "등록증 확인",
      },
      [slugify("표준입학허가서")]: {
        status: "제출",
        submittedAt: "2026.04.01",
        note: "입학 허가 확인",
      },
      [slugify("등록금납부확인서")]: {
        status: "제출",
        submittedAt: "2026.03.31",
        note: "등록금 납부 확인",
      },
      [slugify("최종학력 인증서")]: {
        status: "제출",
        submittedAt: "2026.03.31",
        note: "최종학력 인증 완료",
      },
      [slugify("최종학력 성적표")]: {
        status: "제출",
        submittedAt: "2026.03.31",
        note: "성적표 확인 완료",
      },
      [slugify("은행잔고증명서")]: {
        status: "제출",
        submittedAt: "2026.03.30",
        note: "재정 요건 충족",
      },
      [slugify("사유서")]: {
        status: "제출",
        submittedAt: "2026.03.30",
        note: "변경 사유 확인",
      },
      [slugify("부동산계약서")]: {
        status: "제출",
        submittedAt: "2026.03.30",
        note: "주소 추출 완료",
      },
      [slugify("위임장")]: {
        status: "제출",
        submittedAt: "2026.03.30",
        note: "위임장 제출 완료",
      },
    }),
  },
];

export const zipRules = [
  {
    title: "통합신청서 기준 학생 분리",
    description: "ZIP 안의 문서들은 통합신청서가 나올 때마다 새로운 학생 구간으로 나눕니다.",
    bullets: [
      "첫 번째 통합신청서부터 한 학생 묶음 시작",
      "다음 통합신청서 전까지는 같은 학생 문서로 간주",
      "다음 통합신청서가 나오면 직전 문서까지 이전 학생 자료로 마감",
    ],
  },
  {
    title: "여권 우선 정보 추출",
    description: "학생 이름, 국적, 생년월일은 여권에서 먼저 가져옵니다.",
    bullets: [
      "여권값이 있으면 학생 기본정보의 1차 기준으로 사용",
      "여권 인식이 불완전하면 통합신청서 값으로 보완",
      "여권번호와 생년월일 조합으로 같은 학생 여부를 점검",
    ],
  },
  {
    title: "통합신청서와 부동산계약서 보완",
    description: "여권에서 부족한 값은 통합신청서로 채우고, 주소는 부동산계약서에서 추출합니다.",
    bullets: [
      "통합신청서에서 외국인등록번호와 전화번호 추출",
      "부동산계약서가 있으면 주소를 추출해 체류지 필드에 반영",
      "필수 문서 누락 또는 핵심 필드 누락 시 보완 상태로 유지",
    ],
  },
];

export const agencyUploadBatches = [
  {
    id: "BATCH-2026-0414-A",
    fileName: "hanbit_spring_batch_a.zip",
    uploadedAt: "2026.04.14 08:50",
    studentCount: 12,
    status: "보완",
    note: "부동산계약서 2건 누락, 통합신청서 1건 재분류 필요",
    previewFiles: [
      {
        id: "SCAN-0414-01",
        studentName: "리응우안",
        documentName: "통합신청서",
        pageRange: "1-3페이지",
        note: "학생 구간 첫 문서로 인식되어 케이스 시작점으로 분류됨",
      },
      {
        id: "SCAN-0414-02",
        studentName: "리응우안",
        documentName: "여권사본",
        pageRange: "4페이지",
        note: "이름, 국적, 생년월일을 우선 추출한 여권 스캔본",
      },
      {
        id: "SCAN-0414-03",
        studentName: "왕치엔",
        documentName: "재학증명서",
        pageRange: "11페이지",
        note: "학교명과 재학 상태가 읽혀 다음 문서와 같은 학생으로 연결됨",
      },
      {
        id: "SCAN-0414-04",
        studentName: "왕치엔",
        documentName: "부동산계약서",
        pageRange: "15-16페이지",
        note: "주소 추출 대상 문서지만 서명 영역만 선명해 운영자 확인 필요",
      },
    ],
  },
  {
    id: "BATCH-2026-0412-B",
    fileName: "language_center_extension.zip",
    uploadedAt: "2026.04.12 14:10",
    studentCount: 8,
    status: "완료",
    note: "여권 우선 추출과 통합신청서 보완까지 처리 완료",
    previewFiles: [
      {
        id: "SCAN-0412-01",
        studentName: "정우타티",
        documentName: "통합신청서",
        pageRange: "1-2페이지",
        note: "ZIP 업로드 후 첫 학생 구간 문서로 분류 완료",
      },
      {
        id: "SCAN-0412-02",
        studentName: "정우타티",
        documentName: "여권사본",
        pageRange: "3페이지",
        note: "여권번호와 생년월일 추출이 정상 완료됨",
      },
      {
        id: "SCAN-0412-03",
        studentName: "정우타티",
        documentName: "외국인등록증 사본",
        pageRange: "4페이지",
        note: "기존 체류 자격과 등록번호 확인에 사용됨",
      },
      {
        id: "SCAN-0412-04",
        studentName: "정우타티",
        documentName: "출석증명서",
        pageRange: "7페이지",
        note: "출석률 확인 필드가 정상 추출되어 완료 상태로 마감",
      },
    ],
  },
  {
    id: "BATCH-2026-0410-C",
    fileName: "status_change_group_01.zip",
    uploadedAt: "2026.04.10 10:25",
    studentCount: 5,
    status: "보완",
    note: "어학당 성적증명서 누락 1건, 주소 추출 확인 필요 1건",
    previewFiles: [
      {
        id: "SCAN-0410-01",
        studentName: "사토 미유",
        documentName: "통합신청서",
        pageRange: "1-2페이지",
        note: "체류자격 변경 케이스의 시작 문서로 분류됨",
      },
      {
        id: "SCAN-0410-02",
        studentName: "사토 미유",
        documentName: "표준입학허가서",
        pageRange: "5페이지",
        note: "학교 정보와 과정명이 신청 타입과 일치함",
      },
      {
        id: "SCAN-0410-03",
        studentName: "사토 미유",
        documentName: "최종학력 성적표",
        pageRange: "8-10페이지",
        note: "성적표는 읽혔지만 어학당 성적증명서는 확인되지 않음",
      },
      {
        id: "SCAN-0410-04",
        studentName: "사토 미유",
        documentName: "부동산계약서",
        pageRange: "12페이지",
        note: "주소 필드 추출값이 낮은 신뢰도로 표시되어 검수 대기 중",
      },
    ],
  },
];

export const extractionPriorityRules = [
  {
    field: "학생 이름",
    primary: "여권사본",
    fallback: "통합신청서",
  },
  {
    field: "국적",
    primary: "여권사본",
    fallback: "통합신청서",
  },
  {
    field: "생년월일",
    primary: "여권사본",
    fallback: "통합신청서",
  },
  {
    field: "외국인등록번호",
    primary: "통합신청서",
    fallback: "운영자 확인",
  },
  {
    field: "전화번호",
    primary: "통합신청서",
    fallback: "운영자 확인",
  },
  {
    field: "주소",
    primary: "부동산계약서",
    fallback: "운영자 확인",
  },
];

export const uploadFlowSteps = [
  "통합신청서를 기준으로 학생 구간 분리",
  "학생 구간 안에서 문서 유형 분류",
  "여권에서 학생 이름, 국적, 생년월일 우선 추출",
  "통합신청서에서 외국인등록번호, 전화번호 및 누락값 보완",
  "부동산계약서에서 주소 추출 후 케이스에 반영",
];

export const loginDefaults = {
  student: {
    nationality: studentProfile.nationality,
    passportNumber: studentProfile.passportNumber,
    birthDate: studentProfile.birthDate,
  },
  school: {
    username: "school-admin",
    password: "demo1234",
  },
  agency: {
    username: "agency-ops",
    password: "demo1234",
  },
};
