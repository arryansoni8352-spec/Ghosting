# VeilGuard — Architecture

## Overview

VeilGuard is a modular monorepo desktop application. All image processing runs locally on the user's machine.

```
veilguard/
├── apps/desktop/              Electron + React + TypeScript + Vite
│   ├── electron/              Main process (Node.js, privileged)
│   │   ├── main.ts            App lifecycle, window creation, CSP
│   │   ├── preload.ts         Context bridge — narrow typed API only
│   │   ├── ipc-handlers.ts    IPC allowlist, input validation, file dialogs
│   │   └── engine-manager.ts  Python subprocess management
│   ├── src/                   Renderer (React, TypeScript, no Node access)
│   │   ├── App.tsx
│   │   ├── components/        UI components
│   │   ├── hooks/             Custom React hooks
│   │   └── styles/            CSS
│   └── tests/                 Vitest unit tests
├── packages/engine-interface/ Shared typed IPC contract (TypeScript)
│   └── src/types.ts           All interface types, channel names, defaults
├── engine/                    Python protection engine
│   ├── veilguard_engine/      Core package
│   │   ├── engine.py          Event loop, request dispatching
│   │   ├── image_utils.py     Image validation, metadata, bounds checking
│   │   └── adapters/          Algorithm adapters
│   │       ├── base.py        Abstract adapter interface
│   │       ├── registry.py    Adapter registry
│   │       └── baseline.py    Experimental pixel-noise baseline
│   ├── run_engine.py          Entry point (started by Electron main)
│   └── tests/                 Pytest test suite
└── docs/                      Research, security and architecture docs
```

## Security Architecture

### Process Isolation

```
┌─────────────────────────────────────────────────────────┐
│ Renderer Process (sandboxed, no Node.js)                │
│  React UI                                               │
│  window.veilguard.*  (typed API only)                   │
└────────────────┬────────────────────────────────────────┘
                 │ contextBridge (named typed methods only)
┌────────────────▼────────────────────────────────────────┐
│ Main Process (Node.js, privileged)                      │
│  IPC Handlers (allowlist + input validation)            │
│  Engine Manager                                         │
│  File Dialogs (OS native)                               │
└────────────────┬────────────────────────────────────────┘
                 │ stdin/stdout (line-delimited JSON)
┌────────────────▼────────────────────────────────────────┐
│ Python Engine Subprocess                                │
│  Image validation, bounds checking                      │
│  Algorithm adapters                                     │
│  No network access                                      │
└─────────────────────────────────────────────────────────┘
```

### IPC Design

- The renderer has NO access to `ipcRenderer.invoke` directly
- Only named methods exposed via `contextBridge.exposeInMainWorld`
- Every IPC handler validates its input before acting
- File paths from the renderer are re-validated in the main process before passing to the engine
- The engine validates paths again independently

### Resource Limits

| Limit | Value |
|-------|-------|
| Max file size | 50 MB |
| Max image dimension | 8192 × 8192 px |
| Max pixel count | 67 MP |
| Engine timeout | 120 seconds (configurable) |
| Processing timeout | Per-request |

## Engine Interface

The engine communicates over stdio using line-delimited JSON. The protocol is versioned (interface v1.0.0).

### Message Types (Main → Engine)
- `{ type: "health" }` — request health report
- `{ type: "process", requestId, algorithmId, inputPath, outputPath, params, ... }` — process image
- `{ type: "ping" }` — connectivity check

### Message Types (Engine → Main)
- `{ type: "health", ... }` — health report
- `{ type: "progress", requestId, percent, message, elapsedMs }` — processing progress
- `{ type: "result", status: "success"|"failure", requestId, ... }` — final result
- `{ type: "pong" }` — ping response
- `{ type: "error", code, message }` — engine-level error

## Algorithm Adapter Interface

All research algorithms implement the `AlgorithmAdapter` abstract class:

```python
class AlgorithmAdapter(ABC):
    @property
    def algorithm_id(self) -> str: ...
    def descriptor(self) -> dict: ...  # Status, name, limitations
    def run(self, input_path, output_path, params, device, seed,
            timeout_seconds, progress_callback) -> dict: ...
```

Algorithm status values (in descriptor):
- `PRODUCTION_READY` — validated against target models
- `EXPERIMENTAL` — functional but not validated
- `RESEARCH_ONLY` — reference implementation
- `BLOCKED` — dependency or license issue
- `UNAVAILABLE` — model weights not present

## Extension Points for Future Milestones

- **New algorithms:** Register a new `AlgorithmAdapter` subclass in `adapters/registry.py`
- **Licensing/editions:** Preference system is in place; gate algorithm access by edition flag
- **CUDA support:** `device` parameter already threaded through; adapters can check `torch.cuda.is_available()`
- **Batch processing:** Engine loop already handles concurrent requests; add a batch API
- **Signed releases:** `electron-builder` config already present; add code-signing credentials in CI
