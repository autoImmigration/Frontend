export function PageHeader({ breadcrumb, title, description, actions, onBack }) {
  return (
    <header className="pageHeader">
      {onBack ? (
        <button type="button" className="backArrowButton" onClick={onBack} aria-label="이전 화면으로">
          ←
        </button>
      ) : null}
      <div className="pageHeaderText">
        {breadcrumb ? <div className="breadcrumb">{breadcrumb}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="pageDescription">{description}</p> : null}
      </div>
      {actions ? <div className="headerActions">{actions}</div> : null}
    </header>
  );
}
