import "./Titlebar.css";

export function Titlebar() {
  return (
    <header className="titlebar drag-region" role="banner">
      <div className="titlebar-logo no-drag">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"
            fill="var(--accent-primary)"
            opacity="0.9"
          />
          <path
            d="M12 5.5L6 9v3.5c0 3.3 2.4 6.3 6 7.15 3.6-.85 6-3.85 6-7.15V9L12 5.5z"
            fill="var(--bg-primary)"
          />
          <path
            d="M12 8l-3 2v2c0 1.8 1.3 3.4 3 3.9 1.7-.5 3-2.1 3-3.9v-2L12 8z"
            fill="var(--accent-primary)"
          />
        </svg>
        <span className="titlebar-title">VeilGuard</span>
        <span className="titlebar-badge">0.1.0-dev</span>
      </div>
    </header>
  );
}
