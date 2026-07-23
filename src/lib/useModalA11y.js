import { useEffect, useRef } from "react";

/**
 * 모달 접근성 공용 배선.
 * - Esc 키로 닫기
 * - 열릴 때 모달 내부 첫 포커서블로 포커스 이동
 * - Tab이 배경으로 새지 않도록 포커스 트랩
 * - 닫힐 때 열기 직전 요소로 포커스 복귀
 *
 * 반환한 ref를 모달 컨테이너 엘리먼트에 붙인다. 컨테이너에는 tabIndex={-1}과
 * role="dialog" aria-modal="true" aria-labelledby(제목 id)를 함께 지정한다.
 *
 * @param {boolean} isOpen 모달 표시 여부
 * @param {() => void} onClose Esc 등으로 닫을 때 호출
 */
export function useModalA11y(isOpen, onClose) {
  const containerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const trigger = document.activeElement;
    const node = containerRef.current;

    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = node?.querySelector(selector);
    (firstFocusable ?? node)?.focus?.();

    function onKey(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = node.querySelectorAll(selector);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (trigger && typeof trigger.focus === "function") trigger.focus();
    };
  }, [isOpen]);

  return containerRef;
}
