import { ALL_FILTER } from "../../constants/search.js";

export function FilterBar({ search, filters = [], onReset, resultLabel }) {
  // 날짜 필터는 "미지정"이 빈 문자열, 셀렉트는 "전체"
  const isActive = (filter) =>
    filter.type === "date" ? Boolean(filter.value) : filter.value !== ALL_FILTER;
  const clearedValue = (filter) => (filter.type === "date" ? "" : ALL_FILTER);

  const activeFilters = filters.filter(isActive);
  const searchText = search?.value?.trim() ?? "";
  const activeCount = activeFilters.length + (searchText ? 1 : 0);

  const optionLabel = (filter) =>
    filter.type === "date"
      ? filter.value
      : filter.options.find((option) => option.value === filter.value)?.label ?? filter.value;

  return (
    <div className="filterBar">
      <div className="filterBarTop">
        {search && (
          <div className="filterSearch">
            <svg className="filterSearchIcon" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13.5 13.5 L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              aria-label={search.label}
            />
          </div>
        )}
        <div className="filterBarMeta">
          {resultLabel && <strong>{resultLabel}</strong>}
          <button
            type="button"
            className="filterReset"
            onClick={onReset}
            disabled={activeCount === 0}
          >
            필터 초기화{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>

      <div className="filterGrid">
        {filters.map((filter) => (
          <label key={filter.key} className="filterField">
            <span>{filter.label}</span>
            {filter.type === "date" ? (
              <input
                type="date"
                className={isActive(filter) ? "isActive" : ""}
                value={filter.value}
                min={filter.min}
                max={filter.max}
                onChange={(event) => filter.onChange(event.target.value)}
              />
            ) : (
              <select
                className={isActive(filter) ? "isActive" : ""}
                value={filter.value}
                onChange={(event) => filter.onChange(event.target.value)}
              >
                <option value={ALL_FILTER}>전체</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
          </label>
        ))}
      </div>

      {activeCount > 0 && (
        <div className="filterChips">
          {searchText && (
            <button type="button" className="filterChip" onClick={() => search.onChange("")}>
              <span>{search.label}: {searchText}</span>
              <span className="filterChipX" aria-hidden="true">×</span>
            </button>
          )}
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="filterChip"
              onClick={() => filter.onChange(clearedValue(filter))}
            >
              <span>{filter.label}: {optionLabel(filter)}</span>
              <span className="filterChipX" aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
