import { NAV_ITEMS } from "../../constants/roles.js";
import { pageToActiveKey } from "../../lib/pageNav.js";
import { AppBar } from "./AppBar.jsx";

export function AppShell({ session, page, originPage = null, onNavigate, onLogout, navBadges = {}, children }) {
  const activeKey = pageToActiveKey(page, originPage);
  const currentNav = NAV_ITEMS[session.role].find((item) => item.page === activeKey);
  // 네비 항목이 하나뿐이면(학생) 모바일에서 사이드바를 숨긴다 — 앱바가 이미 섹션명을 보여줘 중복.
  const singleNav = NAV_ITEMS[session.role].length <= 1;

  return (
    <div className={`appLayout${singleNav ? " singleNav" : ""}`}>
      <AppBar
        session={session}
        currentSection={currentNav?.label ?? ""}
        onLogout={onLogout}
      />
      <div className="workspaceShell">
        <aside className="sidebar">
          <nav className="sidebarNav">
            {NAV_ITEMS[session.role].map((item) => (
              <button
                key={item.page}
                type="button"
                className={`sidebarLink${activeKey === item.page ? " isActive" : ""}`}
                onClick={() => onNavigate(item.page)}
              >
                {item.label}
                {navBadges[item.page] ? (
                  <span className="navBadge">{navBadges[item.page]}</span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <section className="contentArea">
          <div className="pageStack">{children}</div>
        </section>
      </div>
    </div>
  );
}
