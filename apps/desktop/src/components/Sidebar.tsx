import type { AppView } from "../App";
import "./Sidebar.css";

interface Props {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenAbout?: () => void;
}

interface NavItem {
  id: AppView;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "welcome",
    label: "Home",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
];

export function Sidebar({ currentView, onNavigate, onOpenAbout }: Props) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <ul className="sidebar-nav" role="list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              className={`sidebar-item ${currentView === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              aria-current={currentView === item.id ? "page" : undefined}
              title={item.label}
              type="button"
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-bottom">
        <button
          className="sidebar-item"
          onClick={onOpenAbout}
          title="About VeilGuard & Disclosures"
          type="button"
        >
          <span className="sidebar-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </span>
          <span className="sidebar-label">About</span>
        </button>
      </div>
    </nav>
  );
}
