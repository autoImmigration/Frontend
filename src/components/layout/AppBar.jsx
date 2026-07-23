import { ROLE_LABELS } from "../../constants/roles.js";

export function AppBar({ session, currentSection, onLogout }) {
  return (
    <header className="appBar">
      <div className="appBarLogo">
        <span>✦</span>
        <span>비자자동화</span>
      </div>
      <div className="appBarSection">{currentSection}</div>
      <div className="appBarRight">
        <span className="appBarRoleChip">{ROLE_LABELS[session.role]}</span>
        <span className="appBarUser">{session.subtitle}</span>
        <button
          type="button"
          className="secondaryButton"
          style={{ minHeight: 32, padding: "0 12px", fontSize: 13 }}
          onClick={onLogout}
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
