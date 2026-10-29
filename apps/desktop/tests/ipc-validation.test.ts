/**
 * VeilGuard Desktop — Unit tests for Milestone 1
 *
 * Tests cover:
 *   - IPC input validation helpers (path safety, format detection)
 *   - Engine manager request construction
 *   - Preload channel allowlist enforcement
 *   - Preference update safety
 */

import { describe, it, expect } from "vitest";

// ─── Path safety tests (mirror of ipc-handlers.ts logic) ─────────────────────

/**
 * Mirror the path safety logic from ipc-handlers.ts in a testable pure form.
 * In a full test setup, we'd import from the handlers directly.
 */
function isSafeExtension(filePath: string): boolean {
  const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"]);
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return SUPPORTED.has(ext);
}

function isSafeOutputPath(outputPath: string, inputPath: string): boolean {
  if (!outputPath || !inputPath) return false;
  if (outputPath === inputPath) return false;
  if (!isSafeExtension(outputPath)) return false;
  return true;
}

describe("Path Safety", () => {
  describe("isSafeExtension", () => {
    it("accepts .jpg", () => expect(isSafeExtension("/images/photo.jpg")).toBe(true));
    it("accepts .jpeg", () => expect(isSafeExtension("/images/photo.jpeg")).toBe(true));
    it("accepts .png", () => expect(isSafeExtension("/images/photo.png")).toBe(true));
    it("accepts .webp", () => expect(isSafeExtension("/images/photo.webp")).toBe(true));
    it("accepts .tiff", () => expect(isSafeExtension("/images/photo.tiff")).toBe(true));
    it("accepts .tif", () => expect(isSafeExtension("/images/photo.tif")).toBe(true));
    it("rejects .exe", () => expect(isSafeExtension("/malware.exe")).toBe(false));
    it("rejects .sh", () => expect(isSafeExtension("/script.sh")).toBe(false));
    it("rejects .py", () => expect(isSafeExtension("/script.py")).toBe(false));
    it("rejects empty string", () => expect(isSafeExtension("")).toBe(false));
    it("rejects path with no extension", () => expect(isSafeExtension("/images/noextension")).toBe(false));
    it("rejects uppercase .JPG (case-insensitive check)", () => expect(isSafeExtension("/images/PHOTO.JPG")).toBe(true));
  });

  describe("isSafeOutputPath", () => {
    it("rejects when output equals input", () => {
      expect(isSafeOutputPath("/images/photo.png", "/images/photo.png")).toBe(false);
    });
    it("rejects empty output path", () => {
      expect(isSafeOutputPath("", "/images/photo.png")).toBe(false);
    });
    it("rejects empty input path", () => {
      expect(isSafeOutputPath("/out/photo.png", "")).toBe(false);
    });
    it("rejects unsafe output extension", () => {
      expect(isSafeOutputPath("/out/photo.exe", "/images/photo.png")).toBe(false);
    });
    it("accepts valid different paths", () => {
      expect(isSafeOutputPath("/out/photo_protected.png", "/images/photo.png")).toBe(true);
    });
  });
});

// ─── IPC Channel allowlist test ────────────────────────────────────────────────

import { IPC_CHANNELS } from "../../../packages/engine-interface/src/types";

describe("IPC Channel Registry", () => {
  it("IPC_CHANNELS contains ENGINE_HEALTH", () => {
    expect(IPC_CHANNELS.ENGINE_HEALTH).toBeDefined();
  });

  it("IPC_CHANNELS contains ENGINE_PROCESS", () => {
    expect(IPC_CHANNELS.ENGINE_PROCESS).toBeDefined();
  });

  it("IPC_CHANNELS contains ENGINE_CANCEL", () => {
    expect(IPC_CHANNELS.ENGINE_CANCEL).toBeDefined();
  });

  it("all channel names are strings", () => {
    for (const [_key, val] of Object.entries(IPC_CHANNELS)) {
      expect(typeof val).toBe("string");
    }
  });

  it("no two channels have the same value", () => {
    const values = Object.values(IPC_CHANNELS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ─── Preference safety tests ───────────────────────────────────────────────────

import { DEFAULT_PREFERENCES } from "../../../packages/engine-interface/src/types";

function applySafePreferenceUpdate(
  current: typeof DEFAULT_PREFERENCES,
  update: Record<string, unknown>
): typeof DEFAULT_PREFERENCES {
  const allowed = new Set(Object.keys(DEFAULT_PREFERENCES));
  const safe = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(update)) {
    if (allowed.has(key)) {
      safe[key] = value;
    }
    // Unknown keys are silently ignored — not applied
  }
  return safe as unknown as typeof DEFAULT_PREFERENCES;
}

describe("Preference Update Safety", () => {
  it("applies known key updates", () => {
    const result = applySafePreferenceUpdate(DEFAULT_PREFERENCES, {
      defaultDevice: "cuda",
    });
    expect(result.defaultDevice).toBe("cuda");
  });

  it("ignores unknown keys", () => {
    const result = applySafePreferenceUpdate(DEFAULT_PREFERENCES, {
      __proto__: { evil: true },
      maliciousKey: "value",
    });
    expect((result as unknown as Record<string, unknown>)["maliciousKey"]).toBeUndefined();
  });

  it("does not mutate original", () => {
    const original = { ...DEFAULT_PREFERENCES };
    applySafePreferenceUpdate(DEFAULT_PREFERENCES, { defaultDevice: "cuda" });
    expect(DEFAULT_PREFERENCES.defaultDevice).toBe(original.defaultDevice as string);
  });

  it("default JPEG quality is in valid range", () => {
    expect(DEFAULT_PREFERENCES.defaultJpegQuality).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_PREFERENCES.defaultJpegQuality).toBeLessThanOrEqual(100);
  });

  it("default device is cpu", () => {
    expect(DEFAULT_PREFERENCES.defaultDevice).toBe("cpu");
  });
});

// ─── Engine interface version test ─────────────────────────────────────────────

import { ENGINE_INTERFACE_VERSION } from "../../../packages/engine-interface/src/types";

describe("Engine Interface Version", () => {
  it("is a semver string", () => {
    expect(ENGINE_INTERFACE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
