import { useState, useCallback, useRef } from "react";
import type { ImageMetadata } from "../../../../packages/engine-interface/src/types";
import "./ImageWorkspace.css";

interface EngineHealth {
  status: "ready" | "degraded" | "unavailable" | "loading";
  algorithms: Array<{ id: string; name: string; status: string; description: string }>;
}

interface Props {
  imageMetadata: ImageMetadata;
  onBack: () => void;
  engineHealth: EngineHealth;
}

interface ProcessingState {
  status: "idle" | "processing" | "success" | "error" | "cancelled";
  percent: number;
  message: string;
  elapsedMs: number;
  result?: Record<string, unknown>;
  error?: string;
  protectedImageUrl?: string;
}

export function ImageWorkspace({ imageMetadata, onBack, engineHealth }: Props) {
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(
    engineHealth.algorithms[0]?.id ?? ""
  );
  const [strength, setStrength] = useState(8);
  const [processing, setProcessing] = useState<ProcessingState>({
    status: "idle",
    percent: 0,
    message: "",
    elapsedMs: 0,
  });
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const handleChooseOutput = useCallback(async (): Promise<string | null> => {
    const baseName = imageMetadata.filename.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_protected.png`;
    const path = await window.veilguard.saveFileDialog({
      title: "Save Protected Image",
      defaultPath,
      filters: [
        { name: "PNG Image", extensions: ["png"] },
        { name: "JPEG Image", extensions: ["jpg", "jpeg"] },
        { name: "WebP Image", extensions: ["webp"] },
      ],
    });
    if (path) {
      setOutputPath(path);
      return path;
    }
    return null;
  }, [imageMetadata.filename]);

  const handleProcess = useCallback(async () => {
    let targetPath = outputPath;
    if (!targetPath) {
      targetPath = await handleChooseOutput();
      if (!targetPath) return;
    }

    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;

    setProcessing({ status: "processing", percent: 0, message: "Starting…", elapsedMs: 0 });

    // Listen for progress
    const unsubProgress = window.veilguard.onEngineProgress((prog: { requestId: string; percent: number; message: string; elapsedMs: number }) => {
      if (prog.requestId !== requestId) return;
      setProcessing((prev) => ({
        ...prev,
        percent: prog.percent,
        message: prog.message,
        elapsedMs: prog.elapsedMs,
      }));
    });

    try {
      const result = (await window.veilguard.engineProcess({
        requestId,
        engineId: "veilguard-python-v1",
        algorithmId: selectedAlgorithm,
        inputPath: imageMetadata.path,
        outputPath: targetPath,
        device: "cpu",
        params: { strength, jpegQuality: 92 },
        timeoutSeconds: 120,
      })) as Record<string, unknown>;

      if (result["status"] === "success") {
        // Load preview of protected image
        let protectedImageUrl: string | undefined;
        try {
          const protectedMeta = await window.veilguard.readImageMetadata(
            result["outputPath"] as string
          );
          protectedImageUrl = protectedMeta?.previewDataUrl;
        } catch {
          // Preview unavailable
        }
        setProcessing({
          status: "success",
          percent: 100,
          message: "Protection applied.",
          elapsedMs: result["elapsedMs"] as number,
          result,
          protectedImageUrl,
        });
      } else {
        const err = result["error"] as Record<string, string>;
        setProcessing({
          status: "error",
          percent: 0,
          message: "",
          elapsedMs: result["elapsedMs"] as number ?? 0,
          error: err?.message ?? "Unknown error",
        });
      }
    } catch (err) {
      setProcessing({
        status: "error",
        percent: 0,
        message: "",
        elapsedMs: 0,
        error: String(err),
      });
    } finally {
      unsubProgress();
      currentRequestIdRef.current = null;
    }
  }, [outputPath, selectedAlgorithm, strength, imageMetadata, handleChooseOutput]);

  const handleCancel = useCallback(() => {
    if (currentRequestIdRef.current) {
      window.veilguard.engineCancel(currentRequestIdRef.current);
      setProcessing((prev) => ({ ...prev, status: "cancelled", message: "Cancelled." }));
    }
  }, []);

  const handleReset = useCallback(() => {
    setProcessing({ status: "idle", percent: 0, message: "", elapsedMs: 0 });
    setOutputPath(null);
  }, []);

  const selectedAlg = engineHealth.algorithms.find((a) => a.id === selectedAlgorithm);
  const isExperimental = selectedAlg?.status === "EXPERIMENTAL";
  const isBlocked = selectedAlg?.status === "BLOCKED" || selectedAlg?.status === "UNAVAILABLE";
  const canProcess =
    processing.status === "idle" &&
    !!selectedAlgorithm &&
    !isBlocked &&
    engineHealth.status !== "unavailable";

  return (
    <div className="workspace-root">
      {/* Header */}
      <div className="workspace-header">
        <button className="btn btn-secondary btn-sm" onClick={onBack} aria-label="Back to home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div className="workspace-file-info">
          <span className="workspace-filename truncate">{imageMetadata.filename}</span>
          <span className="workspace-meta">
            {imageMetadata.widthPx > 0 ? `${imageMetadata.widthPx}×${imageMetadata.heightPx} · ` : ""}
            {formatBytes(imageMetadata.fileSizeBytes)} · {imageMetadata.format.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="workspace-body">
        {/* Image preview panel */}
        <div className="workspace-preview-panel">
          <div className="panel-label">Original</div>
          <div className="image-preview-container">
            <img
              src={imageMetadata.previewDataUrl}
              alt={`Original: ${imageMetadata.filename}`}
              className="image-preview"
              draggable={false}
            />
          </div>
          {processing.status === "success" && processing.protectedImageUrl && (
            <>
              <div className="panel-label panel-label-protected">Protected (Experimental)</div>
              <div className="image-preview-container">
                <img
                  src={processing.protectedImageUrl}
                  alt="Protected version"
                  className="image-preview"
                  draggable={false}
                />
              </div>
            </>
          )}
        </div>

        {/* Control panel */}
        <div className="workspace-controls-panel">
          {/* Algorithm selection */}
          <section className="control-section" aria-labelledby="alg-label">
            <h2 id="alg-label" className="control-section-title">Protection Method</h2>
            <div className="algorithm-list" role="radiogroup" aria-labelledby="alg-label">
              {engineHealth.algorithms.map((alg) => (
                <label
                  key={alg.id}
                  className={`algorithm-item ${selectedAlgorithm === alg.id ? "selected" : ""} ${alg.status !== "PRODUCTION_READY" ? "experimental" : ""}`}
                >
                  <input
                    type="radio"
                    name="algorithm"
                    value={alg.id}
                    checked={selectedAlgorithm === alg.id}
                    onChange={() => setSelectedAlgorithm(alg.id)}
                    className="sr-only"
                  />
                  <div className="algorithm-info">
                    <div className="algorithm-name-row">
                      <span className="algorithm-name">{alg.name}</span>
                      {alg.status !== "PRODUCTION_READY" && (
                        <span className="badge badge-experimental">{alg.status}</span>
                      )}
                    </div>
                    <p className="algorithm-desc">{alg.description.slice(0, 100)}…</p>
                  </div>
                </label>
              ))}
              {engineHealth.algorithms.length === 0 && (
                <div className="engine-unavailable-box" role="alert">
                  <div className="engine-unavail-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <strong>Python Engine Setup Required</strong>
                  </div>
                  <p className="engine-unavail-msg">
                    VeilGuard requires a local Python 3.11+ environment with PyTorch to execute image protection algorithms.
                  </p>
                  <ul className="engine-unavail-steps">
                    <li>Install <strong>Python 3.11</strong> (64-bit) from <code>python.org</code></li>
                    <li>Install PyTorch: <code>pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu</code></li>
                    <li>Or set <code>VEILGUARD_PYTHON_PATH</code> to your Python executable.</li>
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Parameters */}
          {selectedAlg && (
            <section className="control-section" aria-labelledby="params-label">
              <h2 id="params-label" className="control-section-title">Parameters</h2>
              <div className="param-row">
                <label htmlFor="strength-slider" className="param-label">
                  Perturbation Strength
                  <span className="param-value">{strength}</span>
                </label>
                <input
                  id="strength-slider"
                  type="range"
                  min={1}
                  max={32}
                  step={1}
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  className="range-slider"
                  aria-valuemin={1}
                  aria-valuemax={32}
                  aria-valuenow={strength}
                />
                <div className="param-hints">
                  <span>Subtle</span>
                  <span>Strong</span>
                </div>
              </div>
            </section>
          )}

          {/* Output path */}
          <section className="control-section" aria-labelledby="output-label">
            <h2 id="output-label" className="control-section-title">Output File</h2>
            <div className="output-path-row">
              <div className="output-path-display">
                {outputPath ? (
                  <span className="output-path-value truncate" title={outputPath}>
                    {outputPath.split(/[/\\]/).pop()}
                  </span>
                ) : (
                  <span className="output-path-placeholder">No output file selected</span>
                )}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleChooseOutput} type="button">
                Choose…
              </button>
            </div>
            <p className="output-note">
              The original image is never modified. A new file is always created.
            </p>
          </section>

          {/* Blocked Model Prerequisite & Consent Dialog */}
          {selectedAlg?.status === "BLOCKED" && (
            <div className="model-requirement-box" role="region" aria-label="Model requirements">
              <div className="model-req-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Model Prerequisite & Offline Notice</span>
              </div>
              <p>
                {selectedAlg.name} requires pre-trained Latent Diffusion weights that are not bundled locally:
              </p>
              <ul className="model-req-list">
                <li><strong>Architecture:</strong> Stable Diffusion VAE (AutoencoderKL)</li>
                <li><strong>Weight Footprint:</strong> ~335 MB (safetensors checkpoint)</li>
                <li><strong>License:</strong> CreativeML OpenRAIL-M (commercial use with behavioral restrictions)</li>
                <li><strong>Compute Limits:</strong> Requires ~800 MB RAM; runs on local CPU or GPU.</li>
              </ul>
              <div className="model-req-footer">
                <strong>Offline Privacy Guarantee:</strong> VeilGuard never downloads weights silently. To enable this method, set the <code>VEILGUARD_SD_VAE_PATH</code> environment variable to your local weights directory, or explicitly authorize a manual download.
              </div>
            </div>
          )}

          {/* Experimental warning */}
          {isExperimental && (
            <div className="experimental-banner" role="note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <strong>Experimental method.</strong> Evaluated locally against neural feature disruption.
                This does NOT guarantee that the image cannot be edited, inpainted, or animated by external AI systems.
              </div>
            </div>
          )}

          {/* Progress */}
          {processing.status === "processing" && (
            <div className="processing-panel" role="status" aria-live="polite">
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${processing.percent}%` }}
                  role="progressbar"
                  aria-valuenow={processing.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="progress-info">
                <span>{processing.message}</span>
                <span>{processing.percent}%</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleCancel} type="button">
                Cancel
              </button>
            </div>
          )}

          {/* Neutral Completion Result (No misleading green success celebrations) */}
          {processing.status === "success" && (
            <div className="result-panel result-complete" role="status">
              <div className="result-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 14 14" />
                </svg>
                <strong>Perturbation Applied</strong>
                <span className="result-time">{formatMs(processing.elapsedMs)}</span>
              </div>
              <div className="protection-neutral-disclaimer">
                <strong>Notice:</strong> Bounded pixel perturbation has been written to the export file. This does <em>not</em> guarantee that the image is immune to AI-powered editing, inpainting, or animation.
              </div>
              {(processing.result?.["limitationNotices"] as string[] | undefined)?.map((notice, i) => (
                <p key={i} className="limitation-notice">{notice}</p>
              ))}
              <div className="result-actions-row">
                <button className="btn btn-primary btn-sm" onClick={onBack} type="button">
                  Process New Image
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleReset} type="button">
                  Adjust Parameters
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {processing.status === "error" && (
            <div className="result-panel result-error" role="alert">
              <div className="result-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <strong>Processing failed</strong>
              </div>
              <p className="result-error-msg">{processing.error}</p>
              <button className="btn btn-secondary btn-sm" onClick={handleReset} type="button">
                Try Again
              </button>
            </div>
          )}

          {/* Action button */}
          {(processing.status === "idle" || processing.status === "cancelled") && (
            <button
              className="btn btn-primary btn-process"
              onClick={handleProcess}
              disabled={!canProcess}
              type="button"
            >
              {isBlocked
                ? "Prerequisite Required (Model Weights Missing)"
                : outputPath
                ? "Apply Protection"
                : "Choose Output & Apply"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
