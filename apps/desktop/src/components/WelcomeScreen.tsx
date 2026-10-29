import { useState, useCallback, useRef } from "react";
import type { ImageMetadata } from "../../../../packages/engine-interface/src/types";
import "./WelcomeScreen.css";

interface Props {
  onImageSelected: (meta: ImageMetadata) => void;
  engineHealth?: { status: string };
}

export function WelcomeScreen({ onImageSelected, engineHealth }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const loadImage = useCallback(
    async (filePath: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const meta = await window.veilguard.readImageMetadata(filePath);
        if (!meta) {
          setError(
            "This file could not be read. Please ensure it is a valid JPEG, PNG, WebP or TIFF image under 50 MB."
          );
          return;
        }
        onImageSelected(meta);
      } catch (err) {
        setError(`Failed to load image: ${String(err)}`);
      } finally {
        setIsLoading(false);
      }
    },
    [onImageSelected]
  );

  const handleOpenFile = useCallback(async () => {
    const filePath = await window.veilguard.openFileDialog({ title: "Open Image" });
    if (filePath) {
      await loadImage(filePath);
    }
  }, [loadImage]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if leaving the drop zone entirely
    if (!dropRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      // Only use the first file; ignore the rest
      const file = files[0];
      // In Electron, File.path gives the absolute path
      const filePath = (file as File & { path?: string }).path;
      if (!filePath) {
        setError("Could not read file path. Please use the file picker instead.");
        return;
      }

      await loadImage(filePath);
    },
    [loadImage]
  );

  return (
    <div className="welcome-root">
      {/* Privacy notice — shown on first run */}
      <div className="welcome-privacy-banner" role="note">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>
          <strong>Local-first privacy:</strong> Your images never leave your device. All processing happens on your computer.
        </span>
      </div>

      {engineHealth?.status === "unavailable" && (
        <div className="welcome-engine-notice" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            <strong>Python Engine Setup Required:</strong> Python 3.11+ was not detected. Please install Python and PyTorch, or configure <code>VEILGUARD_PYTHON_PATH</code>.
          </span>
        </div>
      )}

      <div className="welcome-content">
        {/* Hero */}
        <div className="welcome-hero">
          <div className="welcome-shield">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" fill="var(--accent-primary)" opacity="0.15" />
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="var(--accent-primary)" strokeWidth="1.5" fill="none" />
              <path d="M9 12l2 2 4-4" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="welcome-title">VeilGuard</h1>
          <p className="welcome-subtitle">
            Local image protection research tool.{" "}
            <br />
            Investigate AI-image perturbation techniques.
          </p>
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          className={`drop-zone ${isDragging ? "dragging" : ""} ${isLoading ? "loading" : ""}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Drop an image here or press Enter to open the file picker"
          onKeyDown={(e) => e.key === "Enter" && handleOpenFile()}
        >
          {isLoading ? (
            <div className="drop-zone-loading">
              <div className="spinner" aria-hidden="true" />
              <span>Loading image…</span>
            </div>
          ) : isDragging ? (
            <div className="drop-zone-inner">
              <div className="drop-icon dragging-icon" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="8 17 12 21 16 17" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                  <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
                </svg>
              </div>
              <p>Drop to open</p>
            </div>
          ) : (
            <div className="drop-zone-inner">
              <div className="drop-icon" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <p className="drop-zone-main">Drop an image here</p>
              <p className="drop-zone-sub">or</p>
              <button className="btn btn-primary" onClick={handleOpenFile} type="button">
                Choose File
              </button>
              <p className="drop-zone-formats">
                JPEG · PNG · WebP · TIFF · Max 50 MB
              </p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="welcome-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
            <button className="welcome-error-dismiss" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        {/* Disclaimer */}
        <div className="welcome-disclaimer">
          <p>
            <strong>Research tool — not a guarantee.</strong>{" "}
            Image perturbations may be reduced or eliminated by compression, resizing or other transformations.
            No claim is made that protected images cannot be edited by AI systems.
          </p>
        </div>
      </div>
    </div>
  );
}
