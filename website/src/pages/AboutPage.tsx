import React from 'react';
import {
  Info,
  Shield,
  FileCode,
  Lock,
  ExternalLink,
  Milestone,
  CheckCircle2,
  Clock,
  Mail,
} from 'lucide-react';
import { PageRoute } from '../components/Navbar';

interface AboutPageProps {
  onNavigate: (page: PageRoute) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 text-xs font-mono text-cyber-indigo">
          <Info className="w-3.5 h-3.5" />
          <span>Project Mission, Governance & Research Ethics</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          About VeilGuard
        </h1>
        <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
          VeilGuard was founded to investigate practical, local-first defensive techniques for visual privacy,
          rejecting closed SaaS black-boxes, false security claims, and unnecessary cloud telemetry.
        </p>
      </div>

      {/* 1. MISSION & ETHICAL PRINCIPLES */}
      <section className="glass-card rounded-xl p-6 sm:p-8 bg-navy-900/60 border border-navy-700/80 space-y-6">
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <Shield className="w-5 h-5 text-cyber-indigo" />
          <span>Core Mission & Research Ethics</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-300">
          <div className="p-4 rounded-lg bg-navy-950 border border-navy-800 space-y-2">
            <div className="font-semibold text-white text-sm">1. Absolute Local Privacy</div>
            <p className="leading-relaxed text-slate-400">
              Personal photographs must never be transmitted across networks to cloud servers under the guise
              of "protection". All computation occurs 100% on the user's local machine.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-navy-950 border border-navy-800 space-y-2">
            <div className="font-semibold text-white text-sm">2. Scientific Honesty</div>
            <p className="leading-relaxed text-slate-400">
              We reject hype. We do not claim images are "immune" to AI, "un-scrapable", or "un-trainable".
              Adversarial fragility to lossy compression and resizing is explicitly measured and documented.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-navy-950 border border-navy-800 space-y-2">
            <div className="font-semibold text-white text-sm">3. Zero-Budget Open Source</div>
            <p className="leading-relaxed text-slate-400">
              Free software under permissive open-source licenses. No paid tiers, no telemetry, no subscription
              locks, and no artificial limitations.
            </p>
          </div>
        </div>
      </section>

      {/* 2. PROJECT ROADMAP */}
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Milestone className="w-5 h-5 text-cyber-sky" />
            <span>Project Roadmap & Milestones</span>
          </h2>
          <p className="text-xs text-slate-400">
            Development milestones tracked against our repository test suites and quality gates:
          </p>
        </div>

        <div className="space-y-4">
          <div className="glass-card rounded-xl p-5 bg-navy-900/60 border border-navy-700/80 flex items-start space-x-4">
            <div className="p-2 rounded-lg bg-cyber-emerald/15 text-cyber-emerald flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-white">Milestone 1: Local-First Core Architecture</span>
                <span className="badge-tag bg-cyber-emerald/15 text-cyber-emerald border border-cyber-emerald/40 text-[10px] font-mono">
                  COMPLETED
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Engineered Electron 35 desktop shell, non-networked JSON stdio child process architecture,
                image validation pipeline ($\le 8192\times 8192$ px), and 49 verified automated tests.
              </p>
            </div>
          </div>

          <div className="glass-card rounded-xl p-5 bg-navy-900/60 border border-navy-700/80 flex items-start space-x-4">
            <div className="p-2 rounded-lg bg-cyber-emerald/15 text-cyber-emerald flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-white">Milestone 2: Research Integration & PGD Feature Disruption</span>
                <span className="badge-tag bg-cyber-emerald/15 text-cyber-emerald border border-cyber-emerald/40 text-[10px] font-mono">
                  COMPLETED
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Implemented multi-layer ResNet-18 perceptual PGD gradient ascent, parametric $L_\infty \le 8/255$ bound,
                empirical benchmark suite (PSNR 32.86 dB, SSIM 0.9964), and honest weight blocker reports.
              </p>
            </div>
          </div>

          <div className="glass-card rounded-xl p-5 bg-navy-900/60 border border-navy-700/80 flex items-start space-x-4">
            <div className="p-2 rounded-lg bg-cyber-emerald/15 text-cyber-emerald flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-white">Milestone 3: Automated Zero-Budget Publication & CI</span>
                <span className="badge-tag bg-cyber-emerald/15 text-cyber-emerald border border-cyber-emerald/40 text-[10px] font-mono">
                  COMPLETED
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Automated open-source release to GitHub (<code>arryansoni8352-spec/veilguard</code>), configured
                least-privilege GitHub Actions CI running 88 unit & integration tests on push, and eliminated offline test blockers.
              </p>
            </div>
          </div>

          <div className="glass-card rounded-xl p-5 bg-navy-900/60 border border-cyber-indigo/40 flex items-start space-x-4">
            <div className="p-2 rounded-lg bg-cyber-indigo/15 text-cyber-violet flex-shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-white">Milestone 4: Web Privacy Suite & Authenticode Signing</span>
                <span className="badge-tag bg-cyber-indigo/20 text-cyber-violet border border-cyber-indigo/40 text-[10px] font-mono">
                  IN PROGRESS
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Shipped browser-local EXIF metadata inspection and sanitization tool, comprehensive empirical research
                portal, and preparation for official digital certificate code-signing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CONTRIBUTIONS & OPEN SOURCE LICENSE */}
      <section className="glass-card rounded-xl p-6 sm:p-8 bg-navy-900/60 border border-navy-700/80 space-y-6">
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <FileCode className="w-5 h-5 text-cyber-violet" />
          <span>Open Source Licensing & Contributing</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-slate-300">
          <div className="space-y-3">
            <h3 className="font-semibold text-white text-sm">MIT License</h3>
            <p className="leading-relaxed text-slate-400">
              VeilGuard's core source code, documentation, and web tools are licensed under the permissive{' '}
              <strong className="text-white">MIT License</strong>. You are free to inspect, modify, fork, and use the code.
            </p>
            <a
              href="https://github.com/arryansoni8352-spec/veilguard/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyber-sky hover:underline inline-flex items-center space-x-1"
            >
              <span>Read Full LICENSE on GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-white text-sm">Contribution Guidelines</h3>
            <p className="leading-relaxed text-slate-400">
              Contributions are welcome! Please read <code className="text-slate-300 font-mono">CONTRIBUTING.md</code> in the repository.
              All pull requests must include unit tests and pass CI quality checks before merging.
            </p>
            <a
              href="https://github.com/arryansoni8352-spec/veilguard/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyber-sky hover:underline inline-flex items-center space-x-1"
            >
              <span>View CONTRIBUTING.md</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </section>

      {/* 4. SECURITY & VULNERABILITY CONTACT */}
      <section className="rounded-xl bg-navy-900/80 border border-navy-700 p-6 sm:p-8 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center space-x-2">
          <Lock className="w-4 h-4 text-cyber-emerald" />
          <span>Security & Vulnerability Disclosure</span>
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          If you discover a security vulnerability or potential privacy leak in VeilGuard, please do not file a public issue on GitHub.
          Instead, report it responsibly via our coordinated disclosure channel specified in <code className="text-cyber-sky font-mono">SECURITY.md</code>:
        </p>
        <div className="p-3 bg-navy-950 rounded border border-navy-800 flex items-center space-x-3 text-xs font-mono text-white">
          <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span>Security Contact: arryansoni8352@gmail.com</span>
        </div>
        <div className="pt-1">
          <button
            onClick={() => onNavigate('security')}
            className="text-xs text-cyber-sky hover:underline font-medium"
          >
            Review our complete Security Policy →
          </button>
        </div>
      </section>
    </div>
  );
};
