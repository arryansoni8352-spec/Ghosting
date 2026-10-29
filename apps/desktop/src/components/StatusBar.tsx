import "./StatusBar.css";

interface EngineHealth {
  status: "ready" | "degraded" | "unavailable" | "loading";
  algorithms: Array<{ id: string; name: string; status: string }>;
}

interface Props {
  engineHealth: EngineHealth;
}

export function StatusBar({ engineHealth }: Props) {
  const statusColors: Record<string, string> = {
    ready: "var(--success)",
    degraded: "var(--warning)",
    unavailable: "var(--error)",
    loading: "var(--text-tertiary)",
  };

  const statusLabels: Record<string, string> = {
    ready: "Engine ready",
    degraded: "Engine degraded",
    unavailable: "Engine unavailable",
    loading: "Connecting to engine…",
  };

  const algorithmCount = engineHealth.algorithms.length;

  return (
    <footer className="statusbar" role="contentinfo" aria-label="Application status">
      <div className="statusbar-left">
        <div className="engine-status" title={`Engine status: ${engineHealth.status}`}>
          <span
            className="status-dot"
            style={{ background: statusColors[engineHealth.status] ?? "var(--text-tertiary)" }}
            aria-hidden="true"
          />
          <span className="status-label">{statusLabels[engineHealth.status] ?? "Unknown"}</span>
        </div>
        {algorithmCount > 0 && (
          <span className="statusbar-sep" aria-hidden="true">·</span>
        )}
        {algorithmCount > 0 && (
          <span className="statusbar-info">
            {algorithmCount} algorithm{algorithmCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="statusbar-right">
        <span className="statusbar-info">CPU processing · Local only · No uploads</span>
      </div>
    </footer>
  );
}
