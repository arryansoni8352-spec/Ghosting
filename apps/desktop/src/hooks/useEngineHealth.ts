import { useState, useEffect } from "react";

interface EngineHealth {
  status: "ready" | "degraded" | "unavailable" | "loading";
  algorithms: Array<{ id: string; name: string; status: string; description: string }>;
}

export function useEngineHealth(): EngineHealth {
  const [health, setHealth] = useState<EngineHealth>({
    status: "loading",
    algorithms: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const result = await window.veilguard.engineHealth({
          engineId: "veilguard-python-v1",
        });

        if (cancelled) return;

        const r = result as Record<string, unknown>;
        const rawAlgs = (r["availableAlgorithms"] as Array<Record<string, unknown>>) ?? [];

        setHealth({
          status: (r["status"] as EngineHealth["status"]) ?? "unavailable",
          algorithms: rawAlgs.map((a) => ({
            id: String(a["id"]),
            name: String(a["name"]),
            status: String(a["status"]),
            description: String(a["description"]),
          })),
        });
      } catch {
        if (!cancelled) {
          setHealth({ status: "unavailable", algorithms: [] });
        }
      }
    }

    fetchHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  return health;
}
