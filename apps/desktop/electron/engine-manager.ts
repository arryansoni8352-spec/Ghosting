/**
 * VeilGuard — Engine Manager
 *
 * Manages the Python engine subprocess:
 *   - Spawns and monitors the process
 *   - Sends typed JSON requests via stdin
 *   - Receives progress and result events via stdout
 *   - Enforces timeouts and handles cancellation
 *   - Cleans up on shutdown
 *
 * The renderer never communicates with the engine directly.
 * All requests go through: Renderer → IPC → Main → EngineManager → Python subprocess
 */

import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProgressCallback = (data: {
  requestId: string;
  percent: number;
  message: string;
  elapsedMs: number;
}) => void;

type ResultCallback = (result: unknown) => void;

interface PendingRequest {
  requestId: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  progressCallback?: ProgressCallback;
}

// ─── Engine Manager ───────────────────────────────────────────────────────────

export class EngineManager {
  private subprocess: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private buffer = "";
  private progressListeners: ProgressCallback[] = [];
  private resultListeners: ResultCallback[] = [];
  private enginePath: string;
  private pythonPath: string;
  private isShuttingDown = false;

  constructor() {
    this.enginePath = this.resolveEnginePath();
    this.pythonPath = this.resolvePythonPath();
  }

  // ── Path Resolution ───────────────────────────────────────────────────────

  private resolveEnginePath(): string {
    // 1. Packaged electron app: extraResources copies engine to process.resourcesPath/engine
    if (process.resourcesPath) {
      const packagedEngine = path.join(process.resourcesPath, "engine");
      if (fs.existsSync(path.join(packagedEngine, "run_engine.py"))) {
        return packagedEngine;
      }
    }

    // 2. Traverse parent directories until we find the engine directory with run_engine.py
    let current = __dirname;
    while (current && current !== path.dirname(current)) {
      const candidate = path.join(current, "engine");
      if (fs.existsSync(path.join(candidate, "run_engine.py"))) {
        return candidate;
      }
      current = path.dirname(current);
    }

    // 3. Fallbacks for dev and nested dist-electron paths
    const candidates = [
      path.resolve(__dirname, "../../../../engine"),
      path.resolve(__dirname, "../../../engine"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, "run_engine.py"))) {
        return c;
      }
    }

    return path.resolve(__dirname, "../../../../engine");
  }

  private resolvePythonPath(): string {
    // 0. Explicit override via environment variable
    if (process.env.VEILGUARD_PYTHON_PATH && fs.existsSync(process.env.VEILGUARD_PYTHON_PATH)) {
      return process.env.VEILGUARD_PYTHON_PATH;
    }

    const localAppData = process.env.LOCALAPPDATA || "";
    const venvPaths = [
      // Per-user managed environment (created by setup_engine_env.ps1, writable & persistent across updates)
      path.join(localAppData, "VeilGuard", "engine-env", "Scripts", "python.exe"),
      path.join(localAppData, "VeilGuard", "engine-env", "bin", "python"),
      // Engine-local environment (for repository development)
      path.join(this.enginePath, ".venv", "Scripts", "python.exe"),
      path.join(this.enginePath, ".venv", "bin", "python"),
    ];
    for (const p of venvPaths) {
      if (p && fs.existsSync(p)) return p;
    }

    // On Windows, check standard python installation locations if 'python' isn't in default GUI app PATH
    if (process.platform === "win32") {
      const commonWindowsPaths = [
        path.join(localAppData, "Programs", "Python", "Python311", "python.exe"),
        path.join(localAppData, "Programs", "Python", "Python312", "python.exe"),
        path.join(localAppData, "Programs", "Python", "Python310", "python.exe"),
        "C:\\Python311\\python.exe",
        "C:\\Python312\\python.exe",
        "C:\\Python310\\python.exe",
      ];
      for (const p of commonWindowsPaths) {
        if (fs.existsSync(p)) return p;
      }
      return "python.exe";
    }

    return "python3";
  }

  // ── Subprocess Management ─────────────────────────────────────────────────

  private ensureRunning(): void {
    if (this.subprocess && !this.subprocess.killed) return;
    if (this.isShuttingDown) return;

    const runScript = path.join(this.enginePath, "run_engine.py");

    this.subprocess = spawn(this.pythonPath, ["-u", runScript], {
      cwd: this.enginePath,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      },
    });

    this.buffer = "";

    this.subprocess.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf-8");
      this.flushBuffer();
    });

    this.subprocess.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8").trim();
      if (text) {
        console.error("[VeilGuard Engine STDERR]", text);
      }
    });

    this.subprocess.on("exit", (code, signal) => {
      console.warn(`[VeilGuard Engine] Process exited: code=${code} signal=${signal}`);
      this.subprocess = null;
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timeoutHandle);
        pending.reject(new Error(`Engine process exited unexpectedly (code=${code})`));
      }
      this.pending.clear();
    });

    this.subprocess.on("error", (err) => {
      console.error("[VeilGuard Engine] Failed to start:", err);
      this.subprocess = null;
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timeoutHandle);
        pending.reject(err);
      }
      this.pending.clear();
    });
  }

  private flushBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as Record<string, unknown>;
        this.handleEngineMessage(msg);
      } catch {
        console.error("[VeilGuard Engine] Failed to parse line:", trimmed);
      }
    }
  }

  private handleEngineMessage(msg: Record<string, unknown>): void {
    const type = msg["type"] as string;

    if (type === "progress") {
      const requestId = msg["requestId"] as string;
      const pending = this.pending.get(requestId);
      const progressData = {
        requestId,
        percent: msg["percent"] as number,
        message: msg["message"] as string,
        elapsedMs: msg["elapsedMs"] as number,
      };
      if (pending?.progressCallback) {
        pending.progressCallback(progressData);
      }
      for (const listener of this.progressListeners) {
        listener(progressData);
      }
    } else if (type === "result") {
      const requestId = msg["requestId"] as string;
      const pending = this.pending.get(requestId);
      if (pending) {
        clearTimeout(pending.timeoutHandle);
        this.pending.delete(requestId);
        pending.resolve(msg);
      }
      for (const listener of this.resultListeners) {
        listener(msg);
      }
    } else if (type === "health") {
      const pending = this.pending.get("health");
      if (pending) {
        clearTimeout(pending.timeoutHandle);
        this.pending.delete("health");
        pending.resolve(msg);
      }
    } else if (type === "pong") {
      const pending = this.pending.get("ping");
      if (pending) {
        clearTimeout(pending.timeoutHandle);
        this.pending.delete("ping");
        pending.resolve(msg);
      }
    } else if (type === "error") {
      console.error("[VeilGuard Engine] Engine error:", msg);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async health(timeoutMs = 5000): Promise<unknown> {
    this.ensureRunning();
    return this.sendRequest({ type: "health" }, "health", timeoutMs);
  }

  async runProcess(
    request: Record<string, unknown>,
    progressCallback?: ProgressCallback,
    timeoutMs = 120_000
  ): Promise<unknown> {
    this.ensureRunning();
    const requestId = (request["requestId"] as string) || uuidv4();
    return this.sendRequest(
      { ...request, type: "process", requestId },
      requestId,
      timeoutMs,
      progressCallback
    );
  }

  cancel(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      this.pending.delete(requestId);
      pending.resolve({
        type: "result",
        status: "failure",
        requestId,
        error: { code: "CANCELLED", message: "Cancelled by user." },
        elapsedMs: 0,
      });
    }
  }

  onProgress(callback: ProgressCallback): () => void {
    this.progressListeners.push(callback);
    return () => {
      this.progressListeners = this.progressListeners.filter((l) => l !== callback);
    };
  }

  onResult(callback: ResultCallback): () => void {
    this.resultListeners.push(callback);
    return () => {
      this.resultListeners = this.resultListeners.filter((l) => l !== callback);
    };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.subprocess) {
      this.subprocess.stdin?.end();
      this.subprocess.kill("SIGTERM");
      this.subprocess = null;
    }
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private sendRequest(
    request: Record<string, unknown>,
    pendingKey: string,
    timeoutMs: number,
    progressCallback?: ProgressCallback
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(pendingKey);
        reject(new Error(`Engine request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(pendingKey, {
        requestId: pendingKey,
        resolve,
        reject,
        timeoutHandle,
        progressCallback,
      });

      try {
        const json = JSON.stringify(request) + "\n";
        this.subprocess?.stdin?.write(json, "utf-8", (err) => {
          if (err) {
            clearTimeout(timeoutHandle);
            this.pending.delete(pendingKey);
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timeoutHandle);
        this.pending.delete(pendingKey);
        reject(err);
      }
    });
  }
}
