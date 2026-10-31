import React from 'react';
import { Shield, Lock, ExternalLink, AlertCircle } from 'lucide-react';
import { PageRoute } from './Navbar';

interface FooterProps {
  onNavigate: (page: PageRoute) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="border-t border-navy-800 bg-navy-950/90 text-slate-400 text-sm mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand & Mission */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-cyber-indigo" />
              <span className="font-bold text-base text-white tracking-tight">VeilGuard</span>
              <span className="badge-tag bg-navy-800 text-slate-300 border border-navy-700 text-[10px] font-mono">
                Open Source
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-md">
              VeilGuard is an experimental, local-first image privacy research application exploring
              bounded adversarial perturbations ($L_\infty \le 8/255$) and client-side metadata sanitization.
              Built on principles of scientific transparency, zero telemetry, and honest capability boundaries.
            </p>
            <div className="flex items-center space-x-2 text-xs text-cyber-emerald pt-1">
              <Lock className="w-3.5 h-3.5" />
              <span>100% Client-Side Privacy: Your photos never leave your device.</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold text-xs uppercase tracking-wider mb-3">
              Research & Tools
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('privacy-tools')}
                  className="hover:text-white transition-colors text-left"
                >
                  Privacy Tools (EXIF Inspector & Cleaner)
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('research')}
                  className="hover:text-white transition-colors text-left"
                >
                  Empirical Benchmarks & Methodology
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('download')}
                  className="hover:text-white transition-colors text-left"
                >
                  Verified Releases & Source Setup
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-white transition-colors text-left"
                >
                  Project Roadmap & Attribution
                </button>
              </li>
            </ul>
          </div>

          {/* Governance & Policies */}
          <div>
            <h3 className="text-white font-semibold text-xs uppercase tracking-wider mb-3">
              Governance & Policies
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('privacy')}
                  className="hover:text-white transition-colors text-left flex items-center space-x-1"
                >
                  <span>Privacy Policy</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('security')}
                  className="hover:text-white transition-colors text-left flex items-center space-x-1"
                >
                  <span>Security & Vulnerability Reporting</span>
                </button>
              </li>
              <li>
                <a
                  href="https://github.com/arryansoni8352-spec/veilguard/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors flex items-center space-x-1"
                >
                  <span>MIT License</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/arryansoni8352-spec/veilguard/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors flex items-center space-x-1"
                >
                  <span>Issue Tracker</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Honest Scientific Limitation Notice */}
        <div className="mt-8 pt-6 border-t border-navy-800/80">
          <div className="p-3.5 rounded-lg bg-navy-900/60 border border-navy-800 text-xs text-slate-400 flex items-start space-x-3">
            <AlertCircle className="w-4 h-4 text-cyber-amber flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-slate-300">Important Research Notice: </span>
              VeilGuard explores probabilistic, model-targeted adversarial perturbations. It does
              <strong className="text-slate-300 font-semibold"> not </strong> guarantee universal protection against AI editing, generative inpainting, model training, or intentional manual manipulation. Lossy re-compression (e.g. JPEG Q &lt; 75), heavy downsampling, and spatial blurring degrade or neutralize perturbations.
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-400">
            <p>© {new Date().getFullYear()} VeilGuard Research Contributors. Open source under MIT License.</p>
            <p className="mt-2 sm:mt-0 font-mono text-[11px] text-slate-400">
              commit: 7113d33 • branch: main
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
