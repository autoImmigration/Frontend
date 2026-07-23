import { useEffect, useMemo, useRef, useState } from "react";
import { bulkAssignDocumentFiles, fetchCaseActivities, moveDocumentScan, requestSupplement, updateCaseStatus, updateStudentInfo, uploadSupplementDocument } from "../../api.js";
import { AuthenticatedImage } from "../../components/media/AuthenticatedImage.jsx";
import { StudentExtraInfoModal } from "../../components/modals/StudentExtraInfoModal.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { STATUS_CLASS_MAP } from "../../constants/status.js";
import { basicInfoRows, genderLabel } from "../../lib/caseFormat.js";
import { formatAlienRegistrationNumber, formatStudentName } from "../../lib/studentFormat.js";
import { useModalA11y } from "../../lib/useModalA11y.js";

export function BatchCaseDetailPage({
  caseData, batchId, batchName, session, onBack, backLabel = "목록", onRefresh,
  reviewQueue = [], queueLabel = "검토", onNavigateCase,
}) {
  const [selectedDocCode, setSelectedDocCode] = useState(caseData.documents[0]?.code ?? null);
  // 검토 큐(= 들어온 목록) 내 위치와 앞/뒤 케이스.
  // 큐는 이 케이스를 여는 순간으로 고정한다(스냅샷). 안 그러면 [검토 완료] 직후 라이브 큐에서
  // 현재 케이스가 빠지면서 위치가 -1이 돼 "다음"이 큐 맨 앞으로 튀고 "이전"이 사라진다.
  // 다른 케이스로 이동하면 key=caseId 리마운트로 큐가 새로 잡힌다.
  const [reviewQueueSnapshot] = useState(reviewQueue);
  const _qIdx = reviewQueueSnapshot.indexOf(caseData.id);
  const _prevReviewId = _qIdx > 0 ? reviewQueueSnapshot[_qIdx - 1] : null;
  const _nextReviewId = _qIdx >= 0
    ? (_qIdx + 1 < reviewQueueSnapshot.length ? reviewQueueSnapshot[_qIdx + 1] : null)
    : (reviewQueueSnapshot.find((id) => id !== caseData.id) ?? null);
  const isOtherDoc = selectedDocCode?.startsWith("other:");
  const otherFilename = isOtherDoc ? selectedDocCode.slice(6) : null;
  const selectedDoc = isOtherDoc ? null : (caseData.documents.find((d) => d.code === selectedDocCode) ?? null);
  // 선택된 양식이 가진 파일 목록(1:N). 레거시 단일 sourceFilename 도 1장으로 취급.
  const selectedDocFiles = selectedDoc
    ? (selectedDoc.sourceFilenames?.length ? selectedDoc.sourceFilenames : (selectedDoc.sourceFilename ? [selectedDoc.sourceFilename] : []))
    : [];
  const [showExtraInfo, setShowExtraInfo] = useState(false);
  // 양식 내 현재 보고 있는 파일 인덱스 (양식 변경 시 0으로 리셋)
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  useEffect(() => { setActiveFileIndex(0); }, [selectedDocCode]);
  const safeFileIndex = Math.min(activeFileIndex, Math.max(selectedDocFiles.length - 1, 0));
  const imageFilename = otherFilename ?? selectedDocFiles[safeFileIndex] ?? null;

  const [showPanel, setShowPanel] = useState(false);
  const [checkedDocs, setCheckedDocs] = useState(() => {
    const initial = {};
    caseData.documents.forEach((d) => {
      if (d.status === "미제출") initial[d.code] = true;
    });
    return initial;
  });
  const [reasons, setReasons] = useState({});
  const [globalMessage, setGlobalMessage] = useState("");
  const [sending, setSending] = useState(false);

  // 학생 정보 인라인 수정 (필드 단위)
  const [editingField, setEditingField] = useState(null); // API 필드명 (예: "passportNumber")
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [editError, setEditError] = useState("");
  const [highlightField, setHighlightField] = useState(null); // 체크리스트 진입 시 시각적 주의

  const STUDENT_FIELD_VALUE = {
    name: caseData.studentName,
    nationality: caseData.nationality,
    passportNumber: caseData.passportNumber,
    birthDate: caseData.birthDate,
    alienRegistrationNumber: caseData.alienRegistrationNumber,
    phoneNumber: caseData.phoneNumber,
    address: caseData.address,
  };
  // 검토 체크리스트 이슈 key → API 필드명
  const ISSUE_KEY_TO_FIELD = {
    student_name: "name", nationality: "nationality", passport_number: "passportNumber",
    date_of_birth: "birthDate", alien_registration_number: "alienRegistrationNumber",
    phone_number: "phoneNumber", address: "address",
  };

  function startFieldEdit(field) {
    if (savingField) return;
    const current = STUDENT_FIELD_VALUE[field];
    setEditingField(field);
    setEditingValue(current && current !== "UNKNOWN" ? current : "");
    setEditError("");
  }

  function cancelFieldEdit() {
    if (savingField) return;
    setEditingField(null);
    setEditingValue("");
    setEditError("");
  }

  function openFieldEditFromChecklist(issueKey) {
    const field = ISSUE_KEY_TO_FIELD[issueKey];
    if (!field) return;
    startFieldEdit(field);
    setHighlightField(field);
    setTimeout(() => setHighlightField(null), 1000);
  }

  async function handleFieldSave() {
    if (!editingField || savingField) return;
    setSavingField(true);
    setEditError("");
    try {
      // 수정한 필드만 전송 — 나머지는 undefined로 남겨 백엔드에서 무변경 처리
      await updateStudentInfo(caseData.id, { [editingField]: editingValue.trim() });
      await onRefresh?.();
      setEditingField(null);
      setEditingValue("");
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSavingField(false);
    }
  }

  // 가운데 이미지 클릭 확대(라이트박스) + 휠 줌 / 드래그 이동
  const [zoomedImage, setZoomedImage] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const zoomDrag = useRef(null);
  function openZoom(filename) {
    setZoomedImage(filename);
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
  }

  // 케이스 상태 변경 (관리자 판단으로 완료 처리 / 해제)
  const [statusSaving, setStatusSaving] = useState(false);
  async function handleSetCaseStatus(nextStatus) {
    setStatusSaving(true);
    try {
      await updateCaseStatus(caseData.id, nextStatus);
      await onRefresh?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setStatusSaving(false);
    }
  }

  // 검토 체크리스트: 추출 필드 이슈 + 서류 누락 + 서류 검수 지적을 한 목록으로 수집
  const CHECKLIST_FIELD_LABEL = {
    nationality: "국적", date_of_birth: "생년월일", passport_number: "여권번호",
    student_name: "이름", alien_registration_number: "외국인등록번호",
    phone_number: "전화번호", address: "주소", gender: "성별",
    enrollment_passport_number: "재학증명서 여권번호",
    enrollment_birth_date: "재학증명서 생년월일",
  };
  // 잔고증명·부동산계약서는 추출 난도가 높아 보수적으로 운영 —
  // 추출 실패나 검수 지적을 검토 이슈로 올리지 않는다 (서류 자체가 미제출인 경우는 계속 표시).
  const REVIEW_EXEMPT_FIELD_PREFIXES = ["bank_", "lease_", "lessee_"];
  const REVIEW_EXEMPT_DOC_CODES = new Set(["BANK_BALANCE_CERTIFICATE", "REAL_ESTATE_CONTRACT"]);
  const reviewIssues = useMemo(() => {
    const issues = [];
    let validations = {};
    try {
      validations = caseData.fieldValidations ? JSON.parse(caseData.fieldValidations) : {};
    } catch {
      validations = {};
    }
    Object.entries(validations).forEach(([key, v]) => {
      if (REVIEW_EXEMPT_FIELD_PREFIXES.some((prefix) => key.startsWith(prefix))) return;
      if (v && (v.status === "invalid" || v.status === "review")) {
        issues.push({ type: "field", key, label: CHECKLIST_FIELD_LABEL[key] || key, detail: v.detail || "" });
      }
    });
    caseData.documents.forEach((d) => {
      if (d.status === "미제출") {
        issues.push({ type: "missing", code: d.code, label: `누락: ${d.name}`, detail: "필수 서류가 제출되지 않았습니다." });
      } else if (typeof d.note === "string" && d.note.trim() && !REVIEW_EXEMPT_DOC_CODES.has(d.code)) {
        issues.push({ type: "docReview", code: d.code, label: `검수: ${d.name}`, detail: d.note });
      }
    });
    return issues;
  }, [caseData.fieldValidations, caseData.documents]);

  // 활동 타임라인
  const [activities, setActivities] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchCaseActivities(caseData.id)
      .then((list) => { if (!cancelled) setActivities(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setActivities([]); });
    return () => { cancelled = true; };
  }, [caseData.id]);

  // 서류 업로드 모달
  const [uploadModalDoc, setUploadModalDoc] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [linkError, setLinkError] = useState("");

  // 모달 접근성(Esc·포커스 트랩·복귀)
  const supplementModalRef = useModalA11y(showPanel, () => setShowPanel(false));
  const uploadModalRef = useModalA11y(Boolean(uploadModalDoc), () => { setUploadModalDoc(null); setUploadFile(null); });

  // 스캔 → 서류 직접 매핑 (OCR 오분류 / 기타 스캔 교정)
  const [mapping, setMapping] = useState(false);
  const [mapFeedback, setMapFeedback] = useState(null);

  // 기타 서류 다중 선택 → 하나의 양식에 일괄 적용
  const [selectedOthers, setSelectedOthers] = useState([]); // filename[]
  const [bulkTargetCode, setBulkTargetCode] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkError, setBulkError] = useState("");

  // 스캔 정리 모드: 켜져 있을 때만 기타 서류 체크박스 + 일괄 적용 바 노출
  const [scanTidyMode, setScanTidyMode] = useState(false);

  // 활동 타임라인 접기 (기본 접힘)
  const [showTimeline, setShowTimeline] = useState(false);

  function toggleScanTidyMode() {
    const next = !scanTidyMode;
    setScanTidyMode(next);
    if (!next) {
      setSelectedOthers([]);
      setBulkTargetCode("");
      setBulkError("");
    }
  }

  function toggleOther(filename) {
    setBulkError("");
    setSelectedOthers((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : [...prev, filename],
    );
  }

  async function handleBulkApply() {
    if (selectedOthers.length === 0 || !bulkTargetCode) return;
    setBulkApplying(true);
    setBulkError("");
    try {
      await bulkAssignDocumentFiles(caseData.id, bulkTargetCode, selectedOthers);
      setSelectedOthers([]);
      setBulkTargetCode("");
      await onRefresh?.();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkApplying(false);
    }
  }

  async function handleConfirmUpload() {
    if (!uploadModalDoc || !uploadFile) return;
    setUploading(true);
    setLinkError("");
    try {
      await uploadSupplementDocument(caseData.id, uploadModalDoc.code, uploadFile);
      setUploadModalDoc(null);
      setUploadFile(null);
      await onRefresh?.();
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // 보고 있는 스캔이 바뀌면 피드백 초기화
  useEffect(() => {
    setMapFeedback(null);
  }, [imageFilename]);

  // 스캔 1장을 대상 양식(또는 "OTHER"=기타로 제외)으로 이동. 지정·변경·제외를 한 동작으로 처리.
  async function handleMoveScan(filename, targetCode) {
    if (!filename) return;
    setMapping(true);
    setMapFeedback(null);
    try {
      await moveDocumentScan(caseData.id, filename, targetCode);
      const isOther = !targetCode || targetCode === "OTHER";
      const label = isOther ? "기타(미지정)" : (caseData.documents.find((d) => d.code === targetCode)?.name ?? targetCode);
      setMapFeedback({ type: "ok", text: `"${label}"(으)로 이동했습니다.` });
      // 이동 후 보던 위치가 사라지므로 대상으로 선택 이동(데이터 새로고침 후 자연스럽게 표시)
      setSelectedDocCode(isOther ? `other:${filename}` : targetCode);
      await onRefresh?.();
    } catch (err) {
      setMapFeedback({ type: "err", text: err.message });
    } finally {
      setMapping(false);
    }
  }

  function toggleDoc(code) {
    setCheckedDocs((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function setReason(code, value) {
    setReasons((prev) => ({ ...prev, [code]: value }));
  }

  async function handleSendSupplement() {
    const items = caseData.documents
      .filter((d) => checkedDocs[d.code])
      .map((d) => ({ docCode: d.code, docName: d.name, reason: reasons[d.code]?.trim() ?? "" }));

    if (items.length === 0) {
      alert("보완이 필요한 서류를 하나 이상 선택해주세요.");
      return;
    }

    setSending(true);
    try {
      await requestSupplement(batchId, caseData.id, items, globalMessage.trim());
      setShowPanel(false);
      setGlobalMessage("");
      // 케이스 상태·목록이 즉시 반영되도록 갱신 (안 하면 상세 칩과 복귀한 목록이 전송 전 상태로 남음)
      await onRefresh?.();
      fetchCaseActivities(caseData.id).then((list) => setActivities(Array.isArray(list) ? list : [])).catch(() => {});
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={`유학원 / ${queueLabel} / 학생 상세`}
        title={formatStudentName(caseData.studentName)}
        description={`${caseData.nationality} · ${caseData.applicationType} · 제출 ${caseData.submittedCount}건${caseData.missingCount > 0 ? ` · 누락 ${caseData.missingCount}건` : ""}${batchName ? ` · 배치 ${batchName}` : ""}`}
        actions={
          <div className="caseHeaderActions">
            {reviewQueue.length > 0 && (
              <span className="caseQueueMeta">
                {queueLabel} {_qIdx >= 0 ? `${_qIdx + 1}/${reviewQueue.length}` : `${reviewQueue.length}건`}
              </span>
            )}
            {_prevReviewId && onNavigateCase && (
              <button type="button" className="secondaryButton" onClick={() => onNavigateCase(_prevReviewId)}>
                ← 이전
              </button>
            )}
            {_nextReviewId && onNavigateCase && (
              <button type="button" className="primaryButton" onClick={() => onNavigateCase(_nextReviewId)}>
                다음 →
              </button>
            )}
            <button type="button" className="secondaryButton" onClick={onBack}>
              ← {backLabel}(으)로 돌아가기
            </button>
          </div>
        }
      />

      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)}
          onWheel={(e) => setZoomScale((s) => Math.min(8, Math.max(1, s - e.deltaY * 0.0015)))}
          className="caseLightbox">
          <button type="button" onClick={() => setZoomedImage(null)}
            className="caseLightboxClose">✕</button>
          <div className="caseLightboxHint">
            휠: 확대/축소 · 드래그: 이동 · {Math.round(zoomScale * 100)}%
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => { zoomDrag.current = { x: e.clientX - zoomOffset.x, y: e.clientY - zoomOffset.y }; }}
            onMouseMove={(e) => { if (zoomDrag.current) setZoomOffset({ x: e.clientX - zoomDrag.current.x, y: e.clientY - zoomDrag.current.y }); }}
            onMouseUp={() => { zoomDrag.current = null; }}
            onMouseLeave={() => { zoomDrag.current = null; }}
            onDoubleClick={() => { setZoomScale(1); setZoomOffset({ x: 0, y: 0 }); }}
            className="caseLightboxCanvas"
            style={{
              cursor: zoomScale > 1 ? "grab" : "default",
              transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
              transition: zoomDrag.current ? "none" : "transform 0.08s ease-out",
            }}>
            <AuthenticatedImage batchId={batchId} filename={zoomedImage}
              imgStyle={{ maxWidth: "94vw", maxHeight: "92vh", objectFit: "contain", display: "block", pointerEvents: "none" }} />
          </div>
        </div>
      )}

      {showPanel && (
        <div className="caseModalOverlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPanel(false); }}>
          <div className="caseModalBackdrop" />
          <div className="caseModal isWide" ref={supplementModalRef} tabIndex={-1}
            role="dialog" aria-modal="true" aria-labelledby="supplementModalTitle">
            <div className="caseModalHead">
              <div>
                <h2 className="caseModalTitle" id="supplementModalTitle">보완 요청 작성</h2>
                <p className="caseModalSub">보완이 필요한 서류를 선택하고 사유를 입력하세요.</p>
              </div>
              <button type="button" onClick={() => setShowPanel(false)} className="caseModalClose" aria-label="닫기">✕</button>
            </div>

            <div className="caseChecklistRows">
              {caseData.documents.map((doc) => (
                <div key={doc.code} className={`caseChecklistRow${checkedDocs[doc.code] ? " isChecked" : ""}`}>
                  <input type="checkbox" id={`supp-${doc.code}`} checked={!!checkedDocs[doc.code]} onChange={() => toggleDoc(doc.code)}
                    className="caseChecklistCheckbox" />
                  <label htmlFor={`supp-${doc.code}`} className="caseChecklistLabel">
                    <strong>{doc.name}</strong>
                    <StatusBadge value={doc.status} />
                  </label>
                  <input type="text" placeholder="사유 (선택)" value={reasons[doc.code] ?? ""} onChange={(e) => setReason(doc.code, e.target.value)}
                    disabled={!checkedDocs[doc.code]}
                    className="caseChecklistReason" />
                </div>
              ))}
            </div>

            <div className="caseModalField">
              <label className="caseModalFieldLabel">학생 안내 메시지 (선택)</label>
              <textarea value={globalMessage} onChange={(e) => setGlobalMessage(e.target.value)}
                placeholder="학생에게 전달할 추가 안내 사항을 입력하세요." rows={3}
                className="caseTextarea" />
            </div>

            <div className="caseModalActions">
              <button type="button" className="secondaryButton" onClick={() => setShowPanel(false)}>취소</button>
              <button type="button" className="primaryButton" onClick={handleSendSupplement} disabled={sending}>
                {sending ? "전송 중..." : "보완 요청 보내기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModalDoc && (
        <div className="caseModalOverlay"
          onClick={(e) => { if (e.target === e.currentTarget) { setUploadModalDoc(null); setUploadFile(null); } }}>
          <div className="caseModalBackdrop" />
          <div className="caseModal isNarrow" ref={uploadModalRef} tabIndex={-1}
            role="dialog" aria-modal="true" aria-labelledby="uploadModalTitle">
            <div className="caseModalHead">
              <h2 className="caseModalTitle" id="uploadModalTitle">서류 업로드</h2>
              <button type="button" onClick={() => { setUploadModalDoc(null); setUploadFile(null); }} className="caseModalClose" aria-label="닫기">✕</button>
            </div>
            <p className="caseModalDesc">
              <strong>{uploadModalDoc.name}</strong> 서류 파일을 선택하세요. 관리자가 직접 올리는 서류이므로 업로드 즉시 제출 처리됩니다.
            </p>
            <input type="file" accept="image/*,.pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="caseFileInput" />
            {uploadFile && <p className="caseSuccessText hasBottomGap">선택됨: {uploadFile.name}</p>}
            {linkError && <p className="caseErrorText hasBottomGap">{linkError}</p>}
            <div className="caseModalActions hasTopGap">
              <button type="button" className="secondaryButton" onClick={() => { setUploadModalDoc(null); setUploadFile(null); }}>취소</button>
              <button type="button" className="primaryButton" onClick={handleConfirmUpload} disabled={!uploadFile || uploading}>
                {uploading ? "업로드 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="caseDetailSplit">
        {/* 왼쪽: 서류 체크리스트 */}
        <div className="caseDocRail">
          <div className="railLabel caseRailHead">
            <span>{caseData.applicationType} · 필요서류</span>
            <span className={caseData.missingCount > 0 ? "isMissing" : "isComplete"}>
              {caseData.submittedCount}/{caseData.submittedCount + caseData.missingCount} · {caseData.missingCount > 0 ? `${caseData.missingCount}개 누락` : "완비"}
            </span>
          </div>
          <div className="documentStatusList caseDocList">
            {caseData.documents.map((doc) => (
              <div key={doc.code}>
                <button
                  type="button"
                  className={`documentStatusButton${selectedDocCode === doc.code ? " isActive" : ""}${doc.status === "미제출" ? " isMissing" : ""}`}
                  onClick={() => setSelectedDocCode(doc.code)}
                >
                  <div className="caseDocMain">
                    <strong className="caseDocName">
                      {doc.name}
                      {(doc.sourceFilenames?.length ?? 0) > 1 && (
                        <span className="docPageCount">· {doc.sourceFilenames.length}장</span>
                      )}
                    </strong>
                    {doc.sourceFilename && (
                      <p className="caseDocFile">{doc.sourceFilename}</p>
                    )}
                  </div>
                  <StatusBadge value={doc.status} />
                </button>
                {doc.status === "미제출" && (
                  <button type="button" className="caseUploadInlineButton"
                    onClick={() => { setUploadModalDoc(doc); setUploadFile(null); setLinkError(""); }}>
                    + 서류 업로드
                  </button>
                )}
              </div>
            ))}
            {caseData.otherDocuments?.length > 0 && (
              <>
                <div className="caseOtherHead">
                  <span>기타 서류 ({caseData.otherDocuments.length}건)</span>
                  <button
                    type="button"
                    onClick={toggleScanTidyMode}
                    title="기타 스캔을 양식에 일괄 배정하는 정리 모드"
                    className={`caseTidyToggle${scanTidyMode ? " isActive" : ""}`}
                  >
                    스캔 정리{scanTidyMode ? " 끄기" : ""}
                  </button>
                </div>
                {caseData.otherDocuments.map((filename) => {
                  const checked = selectedOthers.includes(filename);
                  return (
                    <div
                      key={filename}
                      className={`documentStatusButton caseOtherItem${selectedDocCode === `other:${filename}` ? " isActive" : ""}${checked ? " isChecked" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDocCode(`other:${filename}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedDocCode(`other:${filename}`); }
                      }}
                    >
                      {scanTidyMode && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleOther(filename)}
                          className="caseTidyCheckbox"
                          aria-label={`${filename} 선택`}
                        />
                      )}
                      <div className="caseOtherBody">
                        <strong>기타</strong>
                        <p className="caseDocFile">{filename}</p>
                      </div>
                      <span className="status statusNeutral">제출</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* 다중 선택 일괄 적용 바 (스캔 정리 모드에서만) */}
          {scanTidyMode && selectedOthers.length > 0 && (
            <div className="caseBulkBar">
              <div className="caseBulkTitle">선택 {selectedOthers.length}건</div>
              <select
                value={bulkTargetCode}
                onChange={(e) => setBulkTargetCode(e.target.value)}
                className="caseSelect"
              >
                <option value="">양식 선택…</option>
                {caseData.documents.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}{d.status === "미제출" ? " · 미제출" : (d.sourceFilenames?.length || (d.sourceFilename ? 1 : 0)) ? ` · ${d.sourceFilenames?.length || 1}장` : ""}
                  </option>
                ))}
              </select>
              {bulkError && <p className="caseErrorText">⚠ {bulkError}</p>}
              <div className="caseBulkActions">
                <button type="button" className="secondaryButton" onClick={() => { setSelectedOthers([]); setBulkTargetCode(""); setBulkError(""); }}>
                  선택 해제
                </button>
                <button type="button" className="primaryButton" disabled={!bulkTargetCode || bulkApplying} onClick={handleBulkApply}>
                  {bulkApplying ? "적용 중…" : "일괄 적용"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 가운데: 이미지 뷰어 */}
        <div className="caseScanPane">
          <div className="scanToolbar">
            <strong>{selectedDoc?.name ?? otherFilename ?? "서류 미선택"}</strong>
            {selectedDoc && <span className={STATUS_CLASS_MAP[selectedDoc.status] ?? "status statusNeutral"}>{selectedDoc.status}</span>}
            {selectedDoc?.note && (
              <span className="scanNote">
                {selectedDoc.note}
              </span>
            )}
            {selectedDocFiles.length > 1 && (
              <span className="scanPageMeta">{safeFileIndex + 1} / {selectedDocFiles.length}장</span>
            )}
          </div>
          {selectedDocFiles.length > 1 && (
            <div className="scanPageChips">
              {selectedDocFiles.map((fn, idx) => {
                const active = idx === safeFileIndex;
                return (
                  <button
                    key={fn}
                    type="button"
                    onClick={() => setActiveFileIndex(idx)}
                    title={fn}
                    className={`scanPageChip${active ? " isActive" : ""}`}
                  >
                    {idx + 1}장
                  </button>
                );
              })}
            </div>
          )}
          <div className="scanStage caseScanStage">
            {imageFilename ? (
              <div
                onClick={() => openZoom(imageFilename)}
                title="클릭하면 확대 (확대 후 휠로 줌, 드래그로 이동)"
                className="caseScanFrame">
                <AuthenticatedImage batchId={batchId} filename={imageFilename}
                  imgStyle={{ width: "100%", height: "auto", display: "block" }} />
              </div>
            ) : (
              <div className="scanEmpty">
                {selectedDoc ? (
                  <>
                    <span className={STATUS_CLASS_MAP[selectedDoc.status] ?? "status statusNeutral"}>{selectedDoc.status}</span>
                    <strong>{selectedDoc.name}</strong>
                    <p>
                      {selectedDoc.status === "미제출" ? "아직 제출되지 않은 서류입니다." : "이미지 파일 정보가 없습니다."}
                    </p>
                  </>
                ) : <p>왼쪽에서 서류를 선택하세요</p>}
              </div>
            )}
          </div>

          {imageFilename && (
            <div className="caseScanAssign">
              <div className="caseKicker">
                이 스캔의 양식
              </div>
              <p className="caseScanAssignHint">
                이 스캔의 양식을 바꾸거나 ‘기타(미지정)’로 빼낼 수 있습니다. 여러 장이면 위 탭에서 장을 선택한 뒤 변경하세요.
              </p>
              <div className="caseScanAssignRow">
                <select
                  value={isOtherDoc ? "OTHER" : (selectedDoc?.code ?? "OTHER")}
                  disabled={mapping}
                  onChange={(e) => handleMoveScan(imageFilename, e.target.value)}
                  className="caseSelect caseScanSelect"
                >
                  {caseData.documents.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}{d.status === "미제출" ? " · 미제출" : ((d.sourceFilenames?.length || (d.sourceFilename ? 1 : 0)) ? ` · ${d.sourceFilenames?.length || 1}장` : "")}
                    </option>
                  ))}
                  <option value="OTHER">기타(미지정) — 양식에서 제외</option>
                </select>
                {mapping && <span className="caseMutedText">이동 중…</span>}
              </div>
              {mapFeedback && (
                <p className={mapFeedback.type === "ok" ? "caseSuccessText" : "caseErrorText"}>
                  {mapFeedback.type === "ok" ? "✓ " : "⚠ "}{mapFeedback.text}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 오른쪽: 케이스 패널 */}
        <div className="caseInfoRail">
          {/* 상태 → 검토 체크리스트 */}
          <div>
            <div className="caseSectionHead">
              <div className="caseKicker">검토 체크리스트</div>
              {reviewIssues.length === 0 ? (
                <span className="caseIssueOk">✓ 이슈 없음</span>
              ) : (
                <span className="caseIssueBad">남은 이슈 {reviewIssues.length}건</span>
              )}
            </div>
            <div className="caseStatusRow">
              {(() => {
                const isCompleted = caseData.status === "COMPLETED";
                return (
                  <span className={isCompleted ? "status statusSuccess" : "status statusWarning"}>
                    {isCompleted ? "● 학생 목록 반영됨" : "● 검토 필요"}
                  </span>
                );
              })()}
            </div>
            {reviewIssues.length > 0 && (
              <div className={`caseIssueList${reviewIssues.length > 6 ? " isScrollable" : ""}`}>
                {reviewIssues.map((issue) => {
                  const isWarn = issue.type !== "field";
                  return (
                    <button
                      key={`${issue.type}:${issue.key ?? issue.code}`}
                      type="button"
                      title={issue.detail || issue.label}
                      onClick={() => {
                        if (issue.type === "field") openFieldEditFromChecklist(issue.key);
                        else setSelectedDocCode(issue.code);
                      }}
                      className={`caseIssueItem${isWarn ? " isWarn" : ""}`}
                    >
                      <span className="caseIssueDot" />
                      <span className="caseIssueBody">
                        <span className="caseIssueLabel">{issue.label}</span>
                        {issue.detail && (
                          <span className="caseIssueDetail">{issue.detail}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {caseData.status === "COMPLETED" ? (
              <button type="button" className="secondaryButton caseWideAction"
                disabled={statusSaving}
                onClick={() => { if (window.confirm("이 학생을 검토 상태로 되돌리고 학생 목록에서 뺄까요?")) handleSetCaseStatus("NEEDS_REVIEW"); }}>
                {statusSaving ? "처리 중..." : "검토로 되돌리기 (목록에서 빼기)"}
              </button>
            ) : (
              <button type="button" className={`primaryButton caseWideAction${reviewIssues.length === 0 ? " isReady" : ""}`}
                disabled={statusSaving}
                onClick={() => {
                  const confirmText = reviewIssues.length > 0
                    ? `남은 이슈 ${reviewIssues.length}건이 있습니다. 그래도 검토를 완료하고 학생 목록에 추가할까요?`
                    : "이 학생의 검토를 완료하고 학생 목록에 추가할까요?";
                  if (window.confirm(confirmText)) handleSetCaseStatus("COMPLETED");
                }}>
                {statusSaving ? "처리 중..." : "검토 완료 · 학생 목록에 추가"}
              </button>
            )}
          </div>

          <hr className="caseDivider" />

          {/* 학생 정보 / 수정 */}
          <div>
            <div className="caseSectionHead">
              <div className="caseKicker">학생 정보</div>
              <div>
                <button type="button" className="caseLinkButton" onClick={() => setShowExtraInfo(true)}>
                  상세보기
                </button>
              </div>
            </div>
            {(() => {
                let validations = {};
                try {
                  validations = caseData.fieldValidations ? JSON.parse(caseData.fieldValidations) : {};
                } catch {
                  validations = {};
                }
                return (
              <div className="caseFieldList">
                {[
                  ["이름", caseData.studentName ? formatStudentName(caseData.studentName) : caseData.studentName, true, null, "name"],
                  ["국적", caseData.nationality, true, "nationality", "nationality"],
                  ["생년월일", caseData.birthDate, true, null, "birthDate"],
                  ["여권번호", caseData.passportNumber, true, null, "passportNumber"],
                  ["성별", genderLabel(caseData.gender), false, null, null],
                  ["외국인등록번호", formatAlienRegistrationNumber(caseData.alienRegistrationNumber), false, "alien_registration_number", "alienRegistrationNumber"],
                  ["전화번호", caseData.phoneNumber, false, null, "phoneNumber"],
                  ["주소", caseData.address, false, "address", "address"],
                  ["신청 타입", caseData.applicationType, true, null, null],
                ].map(([label, val, required, vkey, apiField]) => {
                  const unknown = !val || val === "UNKNOWN";
                  const alertMissing = unknown && required;
                  const v = vkey ? validations[vkey] : null;
                  const invalid = v && v.status === "invalid";
                  const unverified = v && v.status === "unverified";
                  const editable = Boolean(apiField);
                  const isEditing = editable && editingField === apiField;
                  const isHighlighted = editable && highlightField === apiField;
                  if (isEditing) {
                    return (
                      <div key={label} className={`caseFieldEditBox${isHighlighted ? " isHighlighted" : ""}`}>
                        <div className="caseFieldEditRow">
                          <span className="caseFieldLabel">{label}</span>
                          <input
                            autoFocus
                            type="text"
                            value={editingValue}
                            disabled={savingField}
                            placeholder={apiField === "birthDate" ? "YYYY-MM-DD" : label}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleFieldSave();
                              else if (e.key === "Escape") cancelFieldEdit();
                            }}
                            className="caseFieldInput"
                          />
                          <button type="button" title="저장 (Enter)" disabled={savingField} onClick={handleFieldSave}
                            className="caseIconButton isSave">
                            {savingField ? "⏳" : "✓"}
                          </button>
                          <button type="button" title="취소 (Esc)" disabled={savingField} onClick={cancelFieldEdit}
                            className="caseIconButton isCancel">
                            ✕
                          </button>
                        </div>
                        {editError && (
                          <p className="caseFieldError">{editError}</p>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={label}
                      className={`caseFieldRow${isHighlighted ? " isHighlighted" : ""}`}>
                      <span className="caseFieldLabel">{label}</span>
                      <span
                        title={editable ? "클릭하여 수정" : undefined}
                        onClick={editable ? () => startFieldEdit(apiField) : undefined}
                        className={`caseFieldValue${alertMissing || invalid ? " isMissing" : (unknown ? " isUnknown" : "")}${editable ? " isEditable" : ""}`}>
                        {unknown ? (required ? "⚠ 미입력" : "—") : val}
                        {invalid && (
                          <span title={v.detail} className="caseBadgeInvalid">⚠ 검증실패</span>
                        )}
                        {unverified && (
                          <span title={v.detail} className="caseBadgeUnverified">미검증</span>
                        )}
                        {editable && (
                          <span aria-hidden="true" className="caseEditHint">✎</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
                );
              })()}
          </div>

          <hr className="caseDivider" />

          {/* 활동 타임라인 */}
          <div>
            <button
              type="button"
              onClick={() => setShowTimeline((prev) => !prev)}
              className={`caseTimelineToggle caseKicker${showTimeline ? " isOpen" : ""}`}
            >
              <span>활동 타임라인 ({activities.length}건)</span>
              <span className="caseTimelineCaret">{showTimeline ? "▾" : "▸"}</span>
            </button>
            {showTimeline && (
              activities.length === 0 ? (
                <p className="caseMutedText">활동 내역 없음</p>
              ) : (
                <div className="caseTimelineList">
                  {activities.map((a, i) => {
                    const tone = a.type === "CREATED" ? ""
                      : a.type === "SUPPLEMENT_REQUESTED" ? " isWarning"
                      : a.type === "STUDENT_UPLOADED" ? " isSuccess"
                      : " isPrimary";
                    return (
                      <div key={i} className={`caseTimelineItem${tone}`}>
                        <div className="caseTimelineMeta">{a.time} · {a.actor}</div>
                        <div className="caseTimelineDesc">{a.description}</div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          <div className="caseRailSpacer" />

          {/* 보완 요청 버튼 */}
          {!showPanel && (
            <button
              type="button"
              className="primaryButton caseFooterAction"
              onClick={() => {
                // 열 때마다 현재 문서 상태 기준으로 기본 체크를 다시 계산한다.
                // (직전에 업로드해 제출된 서류가 미제출 시점의 체크로 남아 보완 요청에 끼는 것 방지)
                const fresh = {};
                caseData.documents.forEach((d) => { if (d.status === "미제출") fresh[d.code] = true; });
                setCheckedDocs(fresh);
                setReasons({});
                setShowPanel(true);
              }}
            >
              보완 요청 작성
            </button>
          )}
          {showPanel && (
            <button type="button" className="secondaryButton caseFooterAction" onClick={() => setShowPanel(false)}>
              보완 요청 닫기
            </button>
          )}
        </div>
      </div>

      {showExtraInfo && (
        <StudentExtraInfoModal
          extraInfo={caseData.extraInfo}
          basic={basicInfoRows(caseData)}
          studentName={caseData.studentName}
          onClose={() => setShowExtraInfo(false)}
        />
      )}
    </>
  );
}

// ─── 업로드 처리 4단계 ───────────────────────────────────────────────────────
