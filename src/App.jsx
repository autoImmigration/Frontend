import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { homePathForRole, matchRoute, pageAllowedForRole, pathForPage } from "./routes.js";
import { loginDefaults } from "./mockData.js";
import { excludeAgencyCase, includeAgencyCase, fetchAgencyApplicationDetail, fetchAgencyApplications, fetchAgencyUploadBatchDetail, fetchAgencyUploadBatches, fetchMe, fetchOcrProgress, fetchSchoolStudents, fetchSchools, login, logout, lookupStudentAccess, refreshAccessToken, setOnAuthExpired, updateStudentProfile, uploadAgencyBatchFile } from "./api.js";
import { getRefreshToken } from "./auth/tokenStore.js";
import { useUrlState } from "./lib/useUrlState.js";
import { ROLE_LABELS } from "./constants/roles.js";
import { ACTIVE_PROCESSING_STATUSES } from "./constants/status.js";
import { ALL_FILTER } from "./constants/search.js";
import { EMPTY_UPLOAD_FORM, emptyOrgForms, EMPTY_UPLOAD_FEEDBACK } from "./constants/upload.js";
import { pageLabel } from "./lib/pageNav.js";
import { todayLocalIso } from "./lib/datetime.js";
import { normalizeAgencyUploadBatch, caseReviewTier } from "./lib/batchNormalize.js";
import { saveStudentCreds, loadStudentCreds, clearStudentCreds } from "./lib/studentCreds.js";
import { buildSession, viewForBackendRole } from "./lib/session.js";
import { LoadingState } from "./components/ui/EmptyState.jsx";
import { AppShell } from "./components/layout/AppShell.jsx";
import { LoginErrorModal } from "./components/modals/LoginErrorModal.jsx";

import { LoginPage } from "./pages/LoginPage.jsx";
import { StudentListPage } from "./pages/student/StudentListPage.jsx";
import { StudentDetailPage } from "./pages/student/StudentDetailPage.jsx";
import { SchoolListPage } from "./pages/school/SchoolListPage.jsx";
import { SchoolDownloadPage } from "./pages/school/SchoolDownloadPage.jsx";
import { AgencyDashboardPage } from "./pages/agency/AgencyDashboardPage.jsx";
import { AgencyDownloadPage } from "./pages/agency/AgencyDownloadPage.jsx";
import { AgencyDetailPage } from "./pages/agency/AgencyDetailPage.jsx";
import { AgencyFileListPage } from "./pages/agency/AgencyFileListPage.jsx";
import { AgencyStudentListPage } from "./pages/agency/AgencyStudentListPage.jsx";
import { AgencySupplementListPage } from "./pages/agency/AgencySupplementListPage.jsx";
import { AgencyUploadPage } from "./pages/agency/AgencyUploadPage.jsx";
import { AgencyUploadHistoryPage } from "./pages/agency/AgencyUploadHistoryPage.jsx";
import { BatchCaseDetailPage } from "./pages/agency/BatchCaseDetailPage.jsx";
import { AgencyUploadHistoryDetailPage } from "./pages/agency/AgencyUploadHistoryDetailPage.jsx";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // URL이 화면의 단일 진실원. page/파라미터는 여기서 파생된다.
  const matchedRoute = matchRoute(location.pathname);
  const page = matchedRoute?.page ?? "login";
  const routeBatchId = matchedRoute?.params?.batchId ?? null;
  const routeCaseId = matchedRoute?.params?.caseId ?? null;
  const routeApplicationId = matchedRoute?.params?.applicationId ?? null;
  // 드릴다운할 때 출발 화면을 히스토리 state로 넘긴다 → "돌아가기" 문구를 출발지에 맞춘다.
  const originPage = location.state?.from ?? null;

  /** 화면 이동. 상세로 들어갈 땐 출발지를 함께 기록한다. */
  const goToPage = useCallback(
    (nextPage, params = {}, options = {}) => {
      navigate(pathForPage(nextPage, params), {
        state: { from: options.from ?? null },
        replace: Boolean(options.replace),
      });
    },
    [navigate],
  );

  /**
   * 돌아가기. 실제 브라우저 히스토리를 되감는다.
   * 링크/새로고침으로 곧장 들어와 되돌아갈 항목이 없으면 fallbackPage로 보낸다.
   */
  const goBack = useCallback(
    (fallbackPage, params = {}) => {
      if (location.key !== "default") {
        navigate(-1);
        return;
      }
      navigate(pathForPage(fallbackPage, params), { replace: true });
    },
    [navigate, location.key],
  );

  const [loginType, setLoginType] = useState("student");
  const [studentForm, setStudentForm] = useState(loginDefaults.student);
  const [orgForms, setOrgForms] = useState(emptyOrgForms);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [studentApplications, setStudentApplications] = useState([]);
  const [schoolStudents, setSchoolStudents] = useState([]);
  const [agencyApplications, setAgencyApplications] = useState([]);
  const [agencyApplicationDetail, setAgencyApplicationDetail] = useState(null);
  const [agencyUploadBatches, setAgencyUploadBatches] = useState([]);
  const [agencyUploadBatchDetail, setAgencyUploadBatchDetail] = useState(null);
  // 학교 화면 목록 필터도 URL에 (학생 목록·보완 접수와 같은 원칙)
  const [schoolSearch, setSchoolSearch] = useUrlState("q", "");
  const [schoolSearchField, setSchoolSearchField] = useUrlState("field", "name");
  const [schoolStatusFilter, setSchoolStatusFilter] = useUrlState("status", ALL_FILTER);
  const [schoolVisaFilter, setSchoolVisaFilter] = useUrlState("visa", ALL_FILTER);
  const [agencySearch, setAgencySearch] = useState("");
  const [agencySearchField, setAgencySearchField] = useState("studentName");
  const [agencyStatusFilter, setAgencyStatusFilter] = useState(ALL_FILTER);
  const [agencyPreviewId, setAgencyPreviewId] = useState(null);
  const [agencyBatchId, setAgencyBatchId] = useState(null);
  const [uploadFeedback, setUploadFeedback] = useState(EMPTY_UPLOAD_FEEDBACK);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM);
  const [selectedZipFile, setSelectedZipFile] = useState(null);
  const [schools, setSchools] = useState([]);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [pollRestartKey, setPollRestartKey] = useState(0);
  // 검토 컨텍스트 — 어느 목록에서 케이스 상세로 들어왔는지.
  // 케이스 상세의 "n/N"과 이전/다음 이동이 이 목록을 기준으로 동작해야 한다(어디서 어디로 갔는지 유지).
  // { label: 화면명, ids: 그 목록의 케이스 id 배열(목록과 같은 순서) }
  const [reviewContext, setReviewContext] = useState(null);
  const [bootRecovering, setBootRecovering] = useState(true);
  const [loginErrorModal, setLoginErrorModal] = useState(null);

  // 학생 상세는 URL이 곧 선택된 신청 건이다.
  const studentApplicationId = routeApplicationId;

  // 전역 세션 만료 처리: refresh 최종 실패 시 로그인 화면으로.
  useEffect(() => {
    setOnAuthExpired(() => {
      resetRoleData();
      setSession(null);
      navigate(pathForPage("login"), { replace: true });
      setError("세션이 만료되어 다시 로그인해주세요.");
    });
    return () => setOnAuthExpired(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // URL의 배치 id를 상태로 반영 — 딥링크/새로고침/뒤로가기 모두 이 경로로 들어온다.
  useEffect(() => {
    if (routeBatchId) setAgencyBatchId(routeBatchId);
  }, [routeBatchId]);

  // 로그인 상태에서 URL이 비었거나 역할에 맞지 않으면 그 역할의 첫 화면으로.
  useEffect(() => {
    if (!session?.isAuthenticated) return;
    if (matchedRoute && pageAllowedForRole(matchedRoute.page, session.role)) return;
    navigate(homePathForRole(session.role), { replace: true });
  }, [session, matchedRoute, navigate]);

  // 앱 부팅 시 복구: refresh 토큰이 있으면 access 재발급 후 /auth/me로 사용자 확정.
  useEffect(() => {
    let cancelled = false;
    async function recover() {
      // 학생 세션 복구 — 탭 세션에 로그인 자격이 있으면 재조회로 복원(토큰도 재발급됨)
      const studentCreds = loadStudentCreds();
      if (studentCreds) {
        try {
          const result = await lookupStudentAccess(studentCreds);
          if (cancelled) return;
          setLoginType("student");
          setStudentApplications(result.applications);
          setSession(buildSession("student", { ...result.student, ...studentCreds }));
          // 화면 이동은 하지 않는다 — 새로고침 전에 보던 URL을 그대로 유지한다.
          // (역할에 맞지 않는 URL이면 위의 리다이렉트 effect가 첫 화면으로 보낸다.)
        } catch {
          // 자격 무효(관리자가 정보 수정 등) → 저장 자격 폐기하고 로그인 화면 유지
          clearStudentCreds();
        } finally {
          if (!cancelled) setBootRecovering(false);
        }
        return;
      }

      if (!getRefreshToken()) {
        if (!cancelled) setBootRecovering(false);
        return;
      }
      try {
        await refreshAccessToken();
        const me = await fetchMe();
        if (cancelled) return;
        const view = viewForBackendRole(me.role);
        setLoginType(view);
        setSession(buildSession(view, {
          username: me.username,
          displayName: me.username,
          backendRole: me.role,
        }));
        await loadDataForView(view);
        // 화면 이동은 하지 않는다 — 새로고침 전에 보던 URL을 그대로 유지한다.
      } catch {
        // 복구 실패 → 로그인 화면 유지
      } finally {
        if (!cancelled) setBootRecovering(false);
      }
    }
    recover();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.isAuthenticated) {
      return;
    }
    fetchSchools()
      .then(setSchools)
      .catch(() => {});
  }, [session?.isAuthenticated]);

  // URL에 배치 id가 있는데 아직 안 불러왔으면 불러온다.
  // (딥링크·새로고침·다른 배치의 케이스로 이전/다음 이동한 경우)
  useEffect(() => {
    if (!session?.isAuthenticated || !routeBatchId) return;
    if (agencyUploadBatchDetail?.id === routeBatchId) return;

    let cancelled = false;
    setIsLoading(true);
    fetchAgencyUploadBatchDetail(routeBatchId)
      .then((detail) => {
        if (cancelled) return;
        const normalized = normalizeAgencyUploadBatch(detail);
        setAgencyUploadBatchDetail(normalized);
        upsertAgencyUploadBatch(normalized);
      })
      .catch((exception) => {
        if (!cancelled) setRuntimeError(exception.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeBatchId, session?.isAuthenticated]);

  // URL에 케이스 id가 있는 신청 상세(/agency/cases/:caseId)도 마찬가지.
  useEffect(() => {
    if (!session?.isAuthenticated) return;
    if (page !== "agency-detail" || !routeCaseId) return;
    if (agencyApplicationDetail?.id === routeCaseId) return;

    let cancelled = false;
    setIsLoading(true);
    fetchAgencyApplicationDetail(routeCaseId)
      .then((detail) => {
        if (cancelled) return;
        setAgencyApplicationDetail(detail);
        setAgencyPreviewId(detail.documents[0]?.code ?? null);
      })
      .catch((exception) => {
        if (!cancelled) setRuntimeError(exception.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, routeCaseId, session?.isAuthenticated]);

  const BATCH_TERMINAL_STATUSES = new Set([
    "COMPLETED",
    "RESULT_UPLOADED",
    "NEEDS_REVIEW",
    "FAILED",
    "CANCELED",
    "CANCELLED",
  ]);

  const pollingBatchIdRef = useRef(null);

  useEffect(() => {
    if (!agencyBatchId || !session?.isAuthenticated) {
      return;
    }

    const currentBatch =
      agencyUploadBatchDetail ??
      agencyUploadBatches.find((batch) => batch.id === agencyBatchId) ??
      null;

    const rawStatus = currentBatch?.uploadBatchStatusRaw ?? "";
    if (rawStatus && BATCH_TERMINAL_STATUSES.has(rawStatus.toUpperCase())) {
      return;
    }

    pollingBatchIdRef.current = agencyBatchId;

    const intervalId = setInterval(async () => {
      if (pollingBatchIdRef.current !== agencyBatchId) {
        clearInterval(intervalId);
        return;
      }

      try {
        const [detail, progress] = await Promise.all([
          fetchAgencyUploadBatchDetail(agencyBatchId),
          fetchOcrProgress(agencyBatchId).catch(() => null),
        ]);
        const fallback =
          agencyUploadBatchDetail?.id === agencyBatchId ? agencyUploadBatchDetail : null;
        const normalizedDetail = normalizeAgencyUploadBatch(detail, fallback ?? {});

        setAgencyUploadBatchDetail((current) =>
          current?.id === agencyBatchId ? normalizedDetail : current,
        );
        upsertAgencyUploadBatch(normalizedDetail);
        if (progress) setOcrProgress(progress);

        const updatedRawStatus = normalizedDetail.uploadBatchStatusRaw ?? "";
        if (updatedRawStatus && BATCH_TERMINAL_STATUSES.has(updatedRawStatus.toUpperCase())) {
          clearInterval(intervalId);
          setOcrProgress(null);
          // 배치 처리 완료 → 신청/학생/보완 목록 즉시 갱신 (새로고침 없이 반영)
          fetchAgencyApplications()
            .then((cases) => setAgencyApplications(cases))
            .catch(() => {});
        }
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 재시도
      }
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyBatchId, session, pollRestartKey]);

  // 업로드 내역(목록) 화면 폴링: 목록에 처리 중(비-종결) 배치가 있는 동안만
  // 3초마다 목록을 갱신해 "텍스트 추출 중" 스피너가 완료 즉시 사라지도록 한다.
  // 모든 배치가 종결 상태가 되면 폴링을 멈춰 무한 폴링을 방지한다.
  const isBatchActive = (batch) => {
    const raw = (batch?.uploadBatchStatusRaw ?? "").toUpperCase();
    // raw 상태를 알 수 있으면 종결 집합 기준, 없으면 한글 진행 상태 기준으로 판단
    if (raw) return !BATCH_TERMINAL_STATUSES.has(raw);
    return ACTIVE_PROCESSING_STATUSES.has(batch?.status);
  };
  const LIST_POLLING_PAGES = new Set(["agency-dashboard", "agency-upload-history"]);
  // 활성 배치 존재 여부를 불리언으로 의존성에 둬, 폴링 결과로 목록 참조가 바뀔 때마다
  // 인터벌이 매번 재생성(타이머 리셋)되는 것을 막는다.
  const hasActiveListBatch = agencyUploadBatches.some(isBatchActive);
  useEffect(() => {
    if (!session?.isAuthenticated || !LIST_POLLING_PAGES.has(page)) {
      return;
    }
    if (!hasActiveListBatch) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const batches = await fetchAgencyUploadBatches();
        const normalizedBatches = Array.isArray(batches)
          ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
          : [];
        setAgencyUploadBatches(normalizedBatches);

        // 모든 배치가 종결 상태면 다음 주기를 기다리지 않고 즉시 중단
        if (!normalizedBatches.some(isBatchActive)) {
          clearInterval(intervalId);
          // 처리 완료 → 신청/학생 목록도 최신화 (새로고침 없이 반영)
          fetchAgencyApplications()
            .then((cases) => setAgencyApplications(cases))
            .catch(() => {});
        }
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 재시도
      }
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, session, hasActiveListBatch]);

  // 업로드 내역 진입 시 목록을 즉시 재조회한다. 재조회 전에는 낡은 state의 "진행 중" 배치가
  // 진행 단계 표시를 잠깐 그렸다 지우는 깜빡임이 생기므로, 갱신 완료 여부를 함께 추적해
  // 목록 화면이 진행 단계를 신선한 데이터로만 그리게 한다.
  const [isBatchListFresh, setIsBatchListFresh] = useState(false);
  useEffect(() => {
    if (!session?.isAuthenticated || page !== "agency-upload-history") {
      return;
    }
    let cancelled = false;
    setIsBatchListFresh(false);
    fetchAgencyUploadBatches()
      .then((batches) => {
        if (cancelled) return;
        setAgencyUploadBatches(
          Array.isArray(batches)
            ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
            : [],
        );
        setIsBatchListFresh(true);
      })
      .catch(() => {
        // 조회 실패 시엔 기존 목록 기준으로라도 진행 단계를 보여준다
        if (!cancelled) setIsBatchListFresh(true);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, session]);

  const selectedStudentApplication =
    studentApplications.find((application) => application.id === studentApplicationId) ??
    studentApplications[0] ??
    null;

  const filteredSchoolStudents = useMemo(() => {
    const query = schoolSearch.trim().toLowerCase();

    return schoolStudents.filter((student) => {
      const matchesSearch =
        !query ||
        String(student[schoolSearchField] ?? "")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        schoolStatusFilter === ALL_FILTER || student.status === schoolStatusFilter;
      const matchesVisa =
        schoolVisaFilter === ALL_FILTER || student.visaType === schoolVisaFilter;

      return matchesSearch && matchesStatus && matchesVisa;
    });
  }, [schoolStudents, schoolSearch, schoolSearchField, schoolStatusFilter, schoolVisaFilter]);

  const filteredAgencyApplications = useMemo(() => {
    const query = agencySearch.trim().toLowerCase();

    return agencyApplications.filter((application) => {
      const matchesSearch =
        !query ||
        String(application[agencySearchField] ?? "")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        agencyStatusFilter === ALL_FILTER || application.status === agencyStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [agencyApplications, agencySearch, agencySearchField, agencyStatusFilter]);

  const navBadges = {};

  const selectedAgencyApplication = agencyApplicationDetail;
  const selectedAgencyDocument =
    selectedAgencyApplication?.documents.find(
      (document) => document.code === agencyPreviewId,
    ) ??
    selectedAgencyApplication?.documents[0] ??
    null;

  // URL에 배치가 지정돼 있으면 반드시 그 배치를 쓴다 — 직전 화면의 배치가 남아 보이면 안 된다.
  const activeBatchId = routeBatchId ?? agencyBatchId;
  const selectedAgencyBatch = activeBatchId
    ? (agencyUploadBatchDetail?.id === activeBatchId
        ? agencyUploadBatchDetail
        : agencyUploadBatches.find((batch) => batch.id === activeBatchId) ?? null)
    : agencyUploadBatchDetail ?? agencyUploadBatches[0] ?? null;

  // 케이스 상세도 URL이 진실원 — 새로고침해도 같은 케이스가 열린다.
  const selectedBatchCase =
    routeCaseId && selectedAgencyBatch?.id === routeBatchId
      ? selectedAgencyBatch?.cases?.find((item) => item.id === routeCaseId) ?? null
      : null;

  function handleStudentFieldChange(field, value) {
    setStudentForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleOrgFieldChange(role, field, value) {
    setOrgForms((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [field]: value,
      },
    }));
  }

  function resetRoleData() {
    setStudentApplications([]);
    setSchoolStudents([]);
    setAgencyApplications([]);
    setAgencyApplicationDetail(null);
    setAgencyUploadBatches([]);
    setAgencyUploadBatchDetail(null);
    setAgencyPreviewId(null);
    setAgencyBatchId(null);
    setReviewContext(null);
    setUploadFeedback(EMPTY_UPLOAD_FEEDBACK);
    setUploadForm({ ...EMPTY_UPLOAD_FORM, receiptDate: todayLocalIso() });
    setSelectedZipFile(null);
  }

  function upsertAgencyUploadBatch(batch) {
    setAgencyUploadBatches((current) => {
      const nextBatch = normalizeAgencyUploadBatch(batch);
      const idx = current.findIndex((b) => b.id === nextBatch.id);
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = nextBatch;
        return copy;
      }
      return [nextBatch, ...current];
    });
  }

  /**
   * 신청 케이스 상세(/agency/cases/:caseId) 열기.
   * from = 출발 화면. 돌아가기 문구를 출발지에 맞추는 데만 쓰인다(실제 되돌아가기는 브라우저 히스토리).
   */
  async function openAgencyApplicationDetail(applicationId, nextSession = session, from = page) {
    if (!nextSession?.isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setRuntimeError("");

    try {
      const detail = await fetchAgencyApplicationDetail(applicationId);

      setAgencyApplicationDetail(detail);
      setAgencyPreviewId(detail.documents[0]?.code ?? null);
      // 상세에서 상세로 이동하면 원래 출발지를 유지하고 히스토리도 덮어쓴다
      // (뒤로가기가 상세 사이를 맴돌지 않게).
      const isDetailToDetail = page === "agency-detail";
      goToPage(
        "agency-detail",
        { caseId: applicationId },
        { from: isDetailToDetail ? originPage : from, replace: isDetailToDetail },
      );
    } catch (exception) {
      setRuntimeError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  /** 배치 상세 데이터만 다시 불러온다 — 화면 이동은 하지 않는다(히스토리 오염 방지). */
  async function refreshBatchDetail(batchId) {
    const currentBatch =
      agencyUploadBatches.find((batch) => batch.id === batchId) ??
      (uploadFeedback.batch?.id === batchId ? uploadFeedback.batch : null);
    const detail = await fetchAgencyUploadBatchDetail(batchId);
    const normalizedDetail = normalizeAgencyUploadBatch(detail, currentBatch);

    setAgencyBatchId(batchId);
    setAgencyUploadBatchDetail(normalizedDetail);
    upsertAgencyUploadBatch(normalizedDetail);
    return normalizedDetail;
  }

  async function openAgencyUploadBatchDetail(batchId, nextSession = session, from = page) {
    if (!nextSession?.isAuthenticated) {
      return;
    }

    setIsLoading(true);
    setRuntimeError("");

    try {
      await refreshBatchDetail(batchId);
      goToPage("agency-upload-history-detail", { batchId }, { from });
    } catch (exception) {
      setRuntimeError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReprocessDone(batchId) {
    try {
      await refreshBatchDetail(batchId);
    } catch (exception) {
      setRuntimeError(exception.message);
    }
    setPollRestartKey((k) => k + 1);
  }

  // 업로드 상세에서 케이스 제외/추가 토글 — 처리 후 배치 상세를 다시 불러와 반영한다.
  async function handleToggleCaseExcludeInBatch(caseId, currentlyExcluded, batchId) {
    if (!session?.isAuthenticated || !caseId) return;
    setRuntimeError("");
    try {
      if (currentlyExcluded) {
        await includeAgencyCase(caseId);
      } else {
        await excludeAgencyCase(caseId);
      }
      if (batchId) await refreshBatchDetail(batchId);
    } catch (exception) {
      setRuntimeError(exception.message);
    }
  }

  // 환불 제외(swap-and-remove): 서버에서 슬롯 교체 후 목록을 다시 불러와 반영한다.
  async function handleExcludeAgencyCase(caseId) {
    if (!session?.isAuthenticated || !caseId) return;
    setRuntimeError("");
    try {
      await excludeAgencyCase(caseId);
      const cases = await fetchAgencyApplications();
      setAgencyApplications(cases);
    } catch (exception) {
      setRuntimeError(exception.message);
    }
  }

  // 보완 접수에서 처리하기 → 배치 로드 후 곧바로 케이스 상세로 이동
  /**
   * 보완 접수 목록에서 "처리하기" 진입.
   * queueIds = 그 화면이 보여주던 목록 순서 그대로 → 케이스 상세의 "n/N"·이전/다음이 이 목록을 따른다.
   */
  async function handleSupplementFromStudentList(batchId, caseId, queueIds = []) {
    if (!session?.isAuthenticated || !batchId) return;
    setIsLoading(true);
    setRuntimeError("");
    try {
      const normalizedDetail = await refreshBatchDetail(batchId);
      setReviewContext(
        queueIds.length > 0 ? { label: "보완 접수", ids: queueIds } : null,
      );

      const found = normalizedDetail.cases?.find((c) => c.id === caseId);
      if (found) {
        goToPage("agency-batch-case-detail", { batchId, caseId }, { from: page });
      } else {
        // 케이스를 못 찾으면 배치 상세로 폴백
        goToPage("agency-upload-history-detail", { batchId }, { from: page });
      }
    } catch (exception) {
      setRuntimeError(exception.message);
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * 케이스 상세 간 이동(이전/다음). 검토 큐가 보완 접수처럼 여러 배치에 걸칠 수 있으므로,
   * 현재 배치에 없으면 그 케이스가 속한 배치의 URL로 이동한다(데이터는 로더 effect가 불러온다).
   *
   * replace: 이전/다음은 히스토리에 쌓지 않는다 — 검토를 5명 넘긴 뒤 "돌아가기"를 눌렀을 때
   * 케이스들을 하나씩 되짚지 않고 곧장 출발한 목록으로 돌아가야 한다.
   */
  function navigateToCase(caseId) {
    const owner =
      agencyUploadBatchDetail?.cases?.some((c) => c.id === caseId)
        ? agencyUploadBatchDetail.id
        : agencyApplications.find((a) => a.id === caseId)?.intakeBatch;
    if (!owner) return;
    goToPage(
      "agency-batch-case-detail",
      { batchId: owner, caseId },
      { from: originPage, replace: true },
    );
  }

  function handleUploadFormChange(field, value) {
    setUploadForm((current) => ({ ...current, [field]: value }));
  }

  function handleZipFileSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setUploadFeedback({
        phase: "error",
        fileName: file.name,
        message: "ZIP 파일만 업로드할 수 있습니다.",
        batch: null,
      });
      return;
    }

    setSelectedZipFile(file);
    setUploadFeedback(EMPTY_UPLOAD_FEEDBACK);
  }

  function buildUploadNote(form) {
    const parts = [
      form.receiptDate && `접수일: ${form.receiptDate}`,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : null;
  }

  async function handleAgencyUploadSubmit() {
    if (!selectedZipFile) return;

    if (!session?.isAuthenticated) {
      setUploadFeedback({
        phase: "error",
        fileName: selectedZipFile.name,
        message: "유학원 계정 인증 정보가 없습니다. 다시 로그인해 주세요.",
        batch: null,
      });
      return;
    }

    // 워커가 동시 처리 불가(-P solo)라 새 업로드 시 서버가 진행중 배치를 자동 취소한다.
    // 사용자가 모르고 취소하는 일이 없도록 진행중 배치가 있으면 먼저 확인받는다.
    // 주의: 목록 폴링은 대시보드/업로드내역 페이지에서만 돌아 state가 낡았을 수 있으므로,
    // 이미 끝난 배치를 "진행 중"으로 오판하지 않게 반드시 서버에서 새로 조회해 판정한다.
    let freshBatches = agencyUploadBatches;
    try {
      const fetched = await fetchAgencyUploadBatches();
      freshBatches = Array.isArray(fetched)
        ? fetched.map((batch) => normalizeAgencyUploadBatch(batch))
        : [];
      setAgencyUploadBatches(freshBatches);
    } catch (_) {
      // 조회 실패 시엔 기존 state로 폴백 (업로드 자체는 막지 않음)
    }
    if (freshBatches.some(isBatchActive)) {
      const ok = window.confirm(
        "진행 중인 업로드가 있습니다. 새로 업로드하면 진행 중인 처리가 취소됩니다. 계속할까요?",
      );
      if (!ok) return;
    }

    const schoolId = uploadForm.schoolId.trim() || undefined;
    const visaTypeCode = uploadForm.visaTypeCode.trim() || undefined;
    const note = buildUploadNote(uploadForm) || undefined;

    setRuntimeError("");
    setUploadFeedback({
      phase: "uploading",
      fileName: selectedZipFile.name,
      message: "ZIP 파일을 업로드하고 배치를 생성하고 있습니다.",
      batch: null,
    });

    try {
      const createdBatch = normalizeAgencyUploadBatch(
        await uploadAgencyBatchFile(selectedZipFile, {
          schoolId,
          note,
          visaTypeCode,
        }),
        { fileName: selectedZipFile.name },
      );

      upsertAgencyUploadBatch(createdBatch);
      setAgencyBatchId(createdBatch.id);
      setAgencyUploadBatchDetail(createdBatch);
      setSelectedZipFile(null);
      setUploadFeedback({
        phase: "success",
        fileName: createdBatch.fileName || selectedZipFile.name,
        message: "업로드가 접수되었습니다. 생성된 배치를 업로드 이력에서 바로 확인할 수 있습니다.",
        batch: createdBatch,
      });
    } catch (exception) {
      setUploadFeedback({
        phase: "error",
        fileName: selectedZipFile.name,
        message: exception.message,
        batch: null,
      });
    }
  }

  // 부팅 복구 시 화면별 기본 데이터 로드 (활성 배치 자동 진입 없이 기본 목록만).
  async function loadDataForView(view) {
    if (view === "school") {
      const rows = await fetchSchoolStudents();
      setSchoolStudents(rows);
      return;
    }
    const [cases, batches] = await Promise.all([
      fetchAgencyApplications(),
      fetchAgencyUploadBatches(),
    ]);
    const normalizedBatches = Array.isArray(batches)
      ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
      : [];
    setAgencyApplications(cases);
    setAgencyUploadBatches(normalizedBatches);
    setAgencyBatchId(normalizedBatches[0]?.id ?? null);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setRuntimeError("");

    if (loginType === "student") {
      const hasEmptyField = Object.values(studentForm).some((value) => !value);
      if (hasEmptyField) {
        setError("학생 로그인 정보 3가지를 모두 입력해 주세요.");
        return;
      }
    }

    setIsLoading(true);

    try {
      resetRoleData();

      if (loginType === "student") {
        const result = await lookupStudentAccess(studentForm);

        saveStudentCreds(studentForm); // 새로고침 시 자동 재로그인용 (탭 세션)
        setStudentApplications(result.applications);
        setSession(buildSession("student", { ...result.student, ...studentForm }));
        goToPage("student-list", {}, { replace: true });
        return;
      }

      const currentForm = orgForms[loginType];
      if (!currentForm.username || !currentForm.password) {
        setError(`${ROLE_LABELS[loginType]} 로그인 정보를 입력해 주세요.`);
        return;
      }

      const auth = await login(currentForm.username, currentForm.password);

      const nextSession = buildSession(loginType, {
        username: auth.username ?? currentForm.username,
        displayName: auth.displayName,
        backendRole: auth.role,
      });

      // 세션은 갈 곳을 정한 다음에 세팅한다. 먼저 세팅하면 "역할 첫 화면" 리다이렉트
      // effect가 즉시 발동해, 남은 await가 끝난 뒤의 이동과 경쟁한다(사용자가 이미
      // 다른 메뉴를 눌렀는데 뒤늦게 화면이 바뀌는 문제).
      if (loginType === "school") {
        const rows = await fetchSchoolStudents();
        setSchoolStudents(rows);
        setSession(nextSession);
        goToPage("school-list", {}, { replace: true });
        return;
      }

      const [cases, batches] = await Promise.all([
        fetchAgencyApplications(),
        fetchAgencyUploadBatches(),
      ]);
      const normalizedBatches = Array.isArray(batches)
        ? batches.map((batch) => normalizeAgencyUploadBatch(batch))
        : [];

      setAgencyApplications(cases);
      setAgencyUploadBatches(normalizedBatches);

      // 처리 중인 배치가 있으면 바로 상세 화면으로 복귀
      const activeBatch = normalizedBatches.find(
        (b) => !BATCH_TERMINAL_STATUSES.has((b.uploadBatchStatusRaw ?? "").toUpperCase())
          && b.uploadBatchStatusRaw !== "",
      );
      if (activeBatch) {
        try {
          const detail = await fetchAgencyUploadBatchDetail(activeBatch.id);
          const normalizedDetail = normalizeAgencyUploadBatch(detail, activeBatch);
          setAgencyBatchId(activeBatch.id);
          setAgencyUploadBatchDetail(normalizedDetail);
          upsertAgencyUploadBatch(normalizedDetail);
          setSession(nextSession);
          goToPage(
            "agency-upload-history-detail",
            { batchId: activeBatch.id },
            { from: "agency-dashboard", replace: true },
          );
          return;
        } catch {
          // 상세 로드 실패 → 대시보드로
        }
      }
      setAgencyBatchId(normalizedBatches[0]?.id ?? null);
      setSession(nextSession);
      goToPage("agency-dashboard", {}, { replace: true });
    } catch (exception) {
      setLoginErrorModal(exception.message || "로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    logout().catch(() => {});
    clearStudentCreds(); // 학생 자동 재로그인 자격 폐기
    resetRoleData();
    setSession(null);
    navigate(pathForPage("login"), { replace: true });
    setError("");
    setRuntimeError("");
  }

  function renderPage() {
    if (page === "student-list") {
      if (isLoading && studentApplications.length === 0) {
        return <LoadingState />;
      }

      return (
        <StudentListPage
          applications={studentApplications}
          session={session}
          onSaveProfile={async (fields) => {
            const updated = await updateStudentProfile({
              nationality: session.nationality,
              passportNumber: session.passportNumber,
              birthDate: session.birthDate,
              ...fields,
            });
            // 신원 필드는 세션 유지(로그인 키 드리프트 방지), 연락처류만 갱신 반영
            setSession((prev) => ({
              ...prev,
              phoneNumber: updated.phoneNumber,
              address: updated.address,
              alienRegistrationNumber: updated.alienRegistrationNumber,
            }));
          }}
          onOpenDetail={(applicationId) => {
            goToPage("student-detail", { applicationId }, { from: page });
          }}
        />
      );
    }

    if (page === "student-detail") {
      if (!selectedStudentApplication) {
        return (
          <section className="surfaceCard">
            <LoadingState title="신청 건이 없습니다." description="학생 신청 데이터를 다시 확인해 주세요." />
          </section>
        );
      }

      return (
        <StudentDetailPage
          application={selectedStudentApplication}
          session={session}
          onBack={() => goBack("student-list")}
          onRefreshApplications={async () => {
            // 재조회로 서류 상태 즉시 반영 (lookup이 학생 토큰도 재발급해 만료도 함께 해소)
            const result = await lookupStudentAccess({
              nationality: session.nationality,
              passportNumber: session.passportNumber,
              birthDate: session.birthDate,
            });
            setStudentApplications(result.applications);
          }}
        />
      );
    }

    if (page === "school-list") {
      return (
        <SchoolListPage
          students={filteredSchoolStudents}
          allStudents={schoolStudents}
          search={schoolSearch}
          searchField={schoolSearchField}
          statusFilter={schoolStatusFilter}
          visaFilter={schoolVisaFilter}
          onSearchChange={setSchoolSearch}
          onSearchFieldChange={setSchoolSearchField}
          onStatusFilterChange={setSchoolStatusFilter}
          onVisaFilterChange={setSchoolVisaFilter}
          onRefresh={async () => {
            const rows = await fetchSchoolStudents();
            setSchoolStudents(rows);
          }}
        />
      );
    }

    if (page === "school-download") {
      return <SchoolDownloadPage students={schoolStudents} />;
    }

    if (page === "agency-dashboard") {
      return (
        <AgencyDashboardPage
          batches={agencyUploadBatches}
          applications={agencyApplications}
          onOpenDetail={openAgencyUploadBatchDetail}
          onOpenUpload={() => goToPage("agency-upload", {}, { from: page })}
          onOpenDownload={() => goToPage("agency-download", {}, { from: page })}
        />
      );
    }

    if (page === "agency-detail") {
      if (isLoading && !selectedAgencyApplication) {
        return <LoadingState />;
      }

      if (!selectedAgencyApplication || !selectedAgencyDocument) {
        return (
          <section className="surfaceCard">
            <LoadingState title="상세 데이터를 불러오지 못했습니다." description="대시보드에서 다시 선택해 주세요." />
          </section>
        );
      }

      return (
        <AgencyDetailPage
          application={selectedAgencyApplication}
          selectedDocument={selectedAgencyDocument}
          onSelectDocument={setAgencyPreviewId}
          onBack={() => goBack(originPage ?? "agency-student-list")}
          backLabel={pageLabel(originPage ?? "agency-student-list")}
          session={session}
          onStatusChange={(result) => {
            setAgencyApplicationDetail((current) =>
              current ? { ...current, status: result.status ?? current.status, statusKey: result.statusKey ?? current.statusKey } : current
            );
            setAgencyApplications((list) =>
              list.map((app) =>
                app.id === selectedAgencyApplication.id
                  ? { ...app, status: result.status ?? app.status, statusKey: result.statusKey ?? app.statusKey }
                  : app
              )
            );
          }}
          onNoteChange={(docCode, note) => {
            setAgencyApplicationDetail((current) => {
              if (!current) return current;
              return {
                ...current,
                documents: current.documents.map((doc) =>
                  doc.code === docCode ? { ...doc, note } : doc
                ),
              };
            });
          }}
        />
      );
    }

    if (page === "agency-upload") {
      return (
        <AgencyUploadPage
          onBack={() => goBack(originPage ?? "agency-dashboard")}
          backLabel={pageLabel(originPage ?? "agency-dashboard")}
          onZipFileSelect={handleZipFileSelect}
          onSubmit={handleAgencyUploadSubmit}
          onOpenHistory={() => goToPage("agency-upload-history", {}, { from: page })}
          onOpenUploadedBatch={() => {
            const batchId = uploadFeedback.batch?.id;
            if (!batchId) {
              return;
            }

            setAgencyBatchId(batchId);
            setAgencyUploadBatchDetail(uploadFeedback.batch);
            goToPage("agency-upload-history-detail", { batchId }, { from: page });
          }}
          uploadFeedback={uploadFeedback}
          uploadForm={uploadForm}
          onUploadFormChange={handleUploadFormChange}
          selectedZipFile={selectedZipFile}
          schools={schools}
          liveBatch={
            uploadFeedback.batch?.id && agencyUploadBatchDetail?.id === uploadFeedback.batch.id
              ? agencyUploadBatchDetail
              : uploadFeedback.batch
          }
        />
      );
    }

    if (page === "agency-upload-history") {
      return (
        <AgencyUploadHistoryPage
          batches={agencyUploadBatches}
          showProcessingSteps={isBatchListFresh}
          onOpenDetail={openAgencyUploadBatchDetail}
          onBack={() => goBack(originPage ?? "agency-dashboard")}
          backLabel={pageLabel(originPage ?? "agency-dashboard")}
        />
      );
    }

    if (page === "agency-student-list") {
      return (
        <AgencyStudentListPage
          applications={agencyApplications}
          onOpenDetail={openAgencyApplicationDetail}
          onExclude={handleExcludeAgencyCase}
        />
      );
    }

    if (page === "agency-supplement-list") {
      return (
        <AgencySupplementListPage
          applications={agencyApplications}
          onSupplementRequest={handleSupplementFromStudentList}
        />
      );
    }

    if (page === "agency-file-list") {
      return (
        <AgencyFileListPage
          batches={agencyUploadBatches}
          session={session}
        />
      );
    }

    if (page === "agency-download") {
      return (
        <AgencyDownloadPage schools={schools} batches={agencyUploadBatches} />
      );
    }

    if (page === "agency-batch-case-detail") {
      if (!selectedBatchCase || !selectedAgencyBatch) return <LoadingState />;
      // 검토 큐 = 업로드 상세의 "검토 필요" 섹션과 동일 집합.
      // 추출 이슈뿐 아니라 서류 누락·검수 지적 등 미완료(COMPLETED 아님) 케이스 전부 포함한다.
      const _needsReview = (c) =>
        !c.excluded
        && c.studentName && c.studentName.toUpperCase() !== "UNKNOWN"
        && c.status !== "COMPLETED";
      // 업로드 상세 "검토 필요" 섹션과 동일한 티어 정렬 → "검토 n/N" 순서 일치
      const batchQueue = (selectedAgencyBatch.cases || [])
        .filter(_needsReview)
        .sort((a, b) => caseReviewTier(a) - caseReviewTier(b))
        .map((c) => c.id);
      // 보완 접수 등 다른 목록에서 들어왔으면 그 목록이 기준(어디서 어디로 갔는지 유지).
      const fromContext = reviewContext?.ids?.includes(selectedBatchCase.id);
      const reviewQueue = fromContext ? reviewContext.ids : batchQueue;
      const queueLabel = fromContext ? reviewContext.label : "업로드 배치";
      return (
        <BatchCaseDetailPage
          key={selectedBatchCase.id} // 케이스 전환(다음 검토 등) 시 내부 상태(선택 서류·편집 폼) 전부 초기화
          caseData={selectedBatchCase}
          batchId={selectedAgencyBatch.id}
          batchName={selectedAgencyBatch.displayName || selectedAgencyBatch.fileName}
          reviewQueue={reviewQueue}
          queueLabel={queueLabel}
          onNavigateCase={(id) => navigateToCase(id)}
          session={session}
          onBack={() =>
            goBack(originPage ?? "agency-upload-history-detail", {
              batchId: selectedAgencyBatch.id,
            })
          }
          backLabel={pageLabel(originPage, "업로드 배치")}
          onRefresh={async () => {
            try {
              const detail = await fetchAgencyUploadBatchDetail(selectedAgencyBatch.id);
              const normalized = normalizeAgencyUploadBatch(detail, selectedAgencyBatch);
              setAgencyUploadBatchDetail(normalized);
              upsertAgencyUploadBatch(normalized);
              // selectedBatchCase 는 이 배치에서 파생되므로 별도 갱신이 필요 없다.
              // 학생/대시보드/보완 목록 소스도 갱신 (배치뷰에서 완료/매핑한 변경이 즉시 반영되도록)
              fetchAgencyApplications().then((cases) => setAgencyApplications(cases)).catch(() => {});
            } catch (_) {}
          }}
        />
      );
    }

    if (isLoading && !selectedAgencyBatch) {
      return <LoadingState />;
    }

    if (!selectedAgencyBatch) {
      return (
        <section className="surfaceCard">
          <LoadingState title="업로드 배치가 없습니다." description="업로드 이력 데이터를 다시 확인해 주세요." />
        </section>
      );
    }

    return (
      <AgencyUploadHistoryDetailPage
        batch={selectedAgencyBatch}
        onBack={() => goBack(originPage ?? "agency-upload-history")}
        backLabel={pageLabel(originPage ?? "agency-upload-history")}
        ocrProgress={ocrProgress}
        session={session}
        onOpenCaseDetail={(id) => {
          const found = selectedAgencyBatch?.cases?.find((c) => c.id === id);
          if (found) {
            setReviewContext(null); // 배치 상세에서 들어오면 검토 큐는 이 배치 기준
            goToPage(
              "agency-batch-case-detail",
              { batchId: selectedAgencyBatch.id, caseId: id },
              { from: page },
            );
          }
        }}
        onReprocessDone={handleReprocessDone}
        onToggleExclude={handleToggleCaseExcludeInBatch}
      />
    );
  }

  if (!session && bootRecovering) {
    return (
      <main className="loginShell">
        <section className="loginCard">
          <div className="loginCardHeader">
            <div className="loginBrand">Immigration Ops</div>
            <h1>세션 확인 중</h1>
            <p>로그인 상태를 복구하고 있습니다. 잠시만 기다려 주세요.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <>
        <LoginPage
          loginType={loginType}
          studentForm={studentForm}
          orgForms={orgForms}
          onRoleSelect={(role) => {
            setLoginType(role);
            setError("");
          }}
          onStudentFieldChange={handleStudentFieldChange}
          onOrgFieldChange={handleOrgFieldChange}
          onSubmit={handleLogin}
          error={isLoading ? "로그인 정보를 확인하는 중입니다." : error}
        />
        <LoginErrorModal
          message={loginErrorModal}
          onClose={() => setLoginErrorModal(null)}
        />
      </>
    );
  }

  return (
    <AppShell
      session={session}
      page={page}
      originPage={originPage}
      onNavigate={(nextPage) => goToPage(nextPage)}
      onLogout={handleLogout}
      navBadges={navBadges}
    >
      {runtimeError ? <div className="errorBox">{runtimeError}</div> : null}
      {renderPage()}
    </AppShell>
  );
}
