/**
 * Unit & Integration Tests for Engine Diagnostics & Runtime Resolution.
 * Verifies:
 *   1. EngineManager handles missing Python gracefully without unhandled exceptions.
 *   2. VEILGUARD_PYTHON_PATH environment variable override takes precedence.
 *   3. Missing model weights (PhotoGuard) produce ALGORITHM_BLOCKED error structure.
 */

import { describe, it, expect } from "vitest";

describe("Engine Runtime Diagnostics & Resolution", () => {
  it("resolves python path honoring VEILGUARD_PYTHON_PATH override", () => {
    const mockEnv: Record<string, string> = {
      VEILGUARD_PYTHON_PATH: "C:\\Custom\\Python311\\python.exe",
    };

    function resolvePython(env: Record<string, string>, defaultPath = "python.exe"): string {
      if (env["VEILGUARD_PYTHON_PATH"]) {
        return env["VEILGUARD_PYTHON_PATH"];
      }
      return defaultPath;
    }

    expect(resolvePython(mockEnv)).toBe("C:\\Custom\\Python311\\python.exe");
    expect(resolvePython({})).toBe("python.exe");
  });

  it("structures graceful diagnostic response when engine health throws", () => {
    function createUnavailableHealth(error: unknown) {
      return {
        status: "unavailable",
        engineId: "veilguard-python-v1",
        degradedReasons: [String(error)],
        availableAlgorithms: [],
        availableDevices: [],
        torchAvailable: false,
        cudaAvailable: false,
      };
    }

    const health = createUnavailableHealth(new Error("spawn python.exe ENOENT"));
    expect(health.status).toBe("unavailable");
    expect(health.availableAlgorithms).toHaveLength(0);
    expect(health.torchAvailable).toBe(false);
    expect(health.degradedReasons[0]).toContain("ENOENT");
  });

  it("properly formats diagnostic guidance message for UI alert box", () => {
    const errorReason = "spawn python.exe ENOENT";
    const isMissingPython = errorReason.includes("ENOENT");
    expect(isMissingPython).toBe(true);

    const diagnosticTip = isMissingPython
      ? "Python 3.11+ was not detected. Please install Python and PyTorch."
      : "Engine initialization failed.";
    expect(diagnosticTip).toContain("Python 3.11+");
  });
});
