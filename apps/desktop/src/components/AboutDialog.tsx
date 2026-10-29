import { useEffect } from "react";
import "./AboutDialog.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  appVersion?: string;
}

export function AboutDialog({ isOpen, onClose, appVersion = "0.1.0-rc1" }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="about-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
      <div className="about-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="about-modal-header">
          <div className="about-brand-row">
            <div className="about-icon-badge" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" fill="var(--accent-primary)" opacity="0.2" />
                <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="var(--accent-primary)" strokeWidth="1.8" />
                <path d="M9 12l2 2 4-4" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 id="about-dialog-title" className="about-modal-title">VeilGuard</h2>
              <span className="about-version-badge">Version {appVersion} (Release Candidate)</span>
            </div>
          </div>
          <button className="about-close-btn" onClick={onClose} aria-label="Close dialog">×</button>
        </div>

        <div className="about-modal-body">
          <section className="about-section">
            <h3 className="about-section-heading">Local Privacy Guarantee</h3>
            <p className="about-text">
              VeilGuard is engineered with a strict <strong>local-first</strong> architecture. Your images, filenames, and processed outputs never leave your computer. The application contains zero telemetry, zero analytics tracking, and zero silent network transmissions.
            </p>
          </section>

          <section className="about-section">
            <h3 className="about-section-heading">Empirical Scope & Honest Limitations</h3>
            <div className="about-limitations-box">
              <ul className="about-list">
                <li>
                  <strong>Mathematical Perturbations:</strong> Perturbations are strictly constrained to \(L_\infty \le 8/255\) and verified on disk for lossless PNG exports.
                </li>
                <li>
                  <strong>Research-Grade Efficacy:</strong> Evaluated against local classifier transferability and latent diffusion feature disruption.
                </li>
                <li>
                  <strong>No Universal Immunity:</strong> VeilGuard does <em>not</em> claim that protected images cannot be edited, inpainted, or animated by commercial AI tools (such as Adobe Firefly, Midjourney, or DALL-E) or future generative models.
                </li>
                <li>
                  <strong>Transformation Degradation:</strong> Common lossy operations (JPEG re-encoding, image resizing, Gaussian filtering) degrade or eliminate adversarial perturbations.
                </li>
                <li>
                  <strong>Host Runtime Requirement:</strong> Requires a pre-installed local Python 3.11+ environment with PyTorch for tensor optimization.
                </li>
              </ul>
            </div>
          </section>

          <section className="about-section">
            <h3 className="about-section-heading">Licensing & Open Source Attribution</h3>
            <p className="about-text">
              VeilGuard core software and desktop interface are distributed under the <strong>MIT License</strong>.
            </p>
            <div className="about-license-chips">
              <span className="license-chip">MIT License · Core App</span>
              <span className="license-chip">BSD-3-Clause · ResNet-18</span>
              <span className="license-chip">CreativeML OpenRAIL-M · SD VAE</span>
            </div>
          </section>
        </div>

        <div className="about-modal-footer">
          <span className="about-footnote">Engine Interface: veilguard-python-v1</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
