import React, { useState } from 'react';
import {
  Lock,
  Cpu,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  EyeOff,
  Zap,
  Terminal,
  Download,
} from 'lucide-react';
import { PageRoute } from '../components/Navbar';

interface HomePageProps {
  onNavigate: (page: PageRoute) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [activeArchTab, setActiveArchTab] = useState<'architecture' | 'engine' | 'bounds'>('architecture');

  return (
    <div className="space-y-24 py-6">
      {/* 1. HERO SECTION */}
      <section className="relative pt-8 pb-12 overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-cyber-indigo/10 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-5xl mx-auto text-center space-y-6 px-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-navy-900 border border-cyber-indigo/30 shadow-subtle text-xs text-cyber-violet">
            <span className="w-2 h-2 rounded-full bg-cyber-emerald animate-pulse" />
            <span className="font-mono font-medium">v0.1.0-rc1 Source Available</span>
            <span className="text-navy-700">•</span>
            <span className="text-slate-300">100% Local-First Engine</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight">
            Investigating Bounded Adversarial Perturbations for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyber-indigo via-cyber-violet to-cyber-sky">
              Image Privacy
            </span>
          </h1>

          <p className="max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            VeilGuard is an open-source, local-first experimental desktop application and research tool
            exploring mathematical perturbations designed to disrupt deep neural image-processing representations
            while preserving perceptual fidelity ($L_\infty \le 8/255$).
          </p>

          {/* Action CTAs */}
          <div className="pt-4 flex flex-wrap justify-center gap-4">
            <button
              onClick={() => onNavigate('privacy-tools')}
              className="px-6 py-3 rounded-lg bg-cyber-indigo hover:bg-cyber-indigo/90 text-white font-medium text-sm transition-all shadow-glow flex items-center space-x-2 focus:ring-2 focus:ring-offset-2 focus:ring-cyber-indigo"
            >
              <span>Launch Browser Privacy Tools</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => onNavigate('research')}
              className="px-6 py-3 rounded-lg bg-navy-850 hover:bg-navy-800 text-slate-200 border border-navy-700 hover:border-slate-500 font-medium text-sm transition-all shadow-subtle flex items-center space-x-2"
            >
              <span>Read Empirical Benchmarks</span>
            </button>

            <button
              onClick={() => onNavigate('download')}
              className="px-5 py-3 rounded-lg bg-navy-900 hover:bg-navy-850 text-slate-300 border border-navy-800 font-medium text-sm transition-all flex items-center space-x-2"
            >
              <Download className="w-4 h-4 text-slate-400" />
              <span>Get Desktop App</span>
            </button>
          </div>

          {/* Key Trust Signals */}
          <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-4xl mx-auto text-xs text-slate-300">
            <div className="p-3 rounded-lg bg-navy-900/60 border border-navy-800 flex items-center justify-center space-x-2">
              <Lock className="w-4 h-4 text-cyber-emerald flex-shrink-0" />
              <span>Zero Network Calls</span>
            </div>
            <div className="p-3 rounded-lg bg-navy-900/60 border border-navy-800 flex items-center justify-center space-x-2">
              <Cpu className="w-4 h-4 text-cyber-sky flex-shrink-0" />
              <span>CPU Feasible (~1-3s)</span>
            </div>
            <div className="p-3 rounded-lg bg-navy-900/60 border border-navy-800 flex items-center justify-center space-x-2">
              <EyeOff className="w-4 h-4 text-cyber-violet flex-shrink-0" />
              <span>$L_\infty \le 8/255$ Bound</span>
            </div>
            <div className="p-3 rounded-lg bg-navy-900/60 border border-navy-800 flex items-center justify-center space-x-2">
              <FileCode className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span>MIT Open Source</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HONEST RESEARCH LIMITATIONS BANNER */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="rounded-xl bg-navy-900/90 border border-cyber-amber/30 p-6 shadow-card">
          <div className="flex items-start space-x-4">
            <div className="p-2.5 rounded-lg bg-cyber-amber/10 border border-cyber-amber/30 text-cyber-amber flex-shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-white">
                Scientific Transparency & Capability Boundaries
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                VeilGuard is an experimental research project. It does <strong>not</strong> guarantee universal immunity against
                generative AI, automated inpainting, facial recognition, or commercial editors (e.g. Adobe Firefly, DALL-E, Midjourney).
                Adversarial perturbations are mathematically bounded and model-specific. Common transformations such as lossy JPEG re-compression
                below Quality 75, spatial downsampling, or Gaussian blur degrade or neutralize the adversarial effect.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => onNavigate('research')}
                  className="text-xs text-cyber-sky hover:underline font-medium inline-flex items-center space-x-1"
                >
                  <span>Review transformation robustness benchmark tables in our Research section</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HONEST INTERFACE & ARCHITECTURE PREVIEW */}
      <section className="max-w-5xl mx-auto px-4 space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Engine Architecture & Inspection Pipeline
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto">
            VeilGuard separates presentation, communication, and adversarial computation across three strictly isolated layers.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex justify-center space-x-2 border-b border-navy-800 pb-3">
          <button
            onClick={() => setActiveArchTab('architecture')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeArchTab === 'architecture'
                ? 'bg-cyber-indigo/20 text-white border border-cyber-indigo/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3-Layer System Model
          </button>
          <button
            onClick={() => setActiveArchTab('engine')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeArchTab === 'engine'
                ? 'bg-cyber-indigo/20 text-white border border-cyber-indigo/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            JSON IPC Stdio Protocol
          </button>
          <button
            onClick={() => setActiveArchTab('bounds')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeArchTab === 'bounds'
                ? 'bg-cyber-indigo/20 text-white border border-cyber-indigo/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            On-Disk $L_\infty$ Verification
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="glass-card rounded-xl p-6 sm:p-8 bg-navy-900/70 border border-navy-700/80">
          {activeArchTab === 'architecture' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-lg bg-navy-850/80 border border-navy-700 space-y-3">
                <div className="flex items-center space-x-2 text-cyber-violet">
                  <Layers className="w-5 h-5" />
                  <span className="font-semibold text-sm text-white">Layer 1: Desktop Shell</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Electron 35 + React 19 interface. Never touches raw sockets. Manages non-destructive file dialogs,
                  real-time image previews, and diagnostic engine health monitoring.
                </p>
                <div className="font-mono text-[11px] text-slate-400 pt-2 border-t border-navy-800">
                  TypeScript • CSP Enforced
                </div>
              </div>

              <div className="p-5 rounded-lg bg-navy-850/80 border border-navy-700 space-y-3">
                <div className="flex items-center space-x-2 text-cyber-sky">
                  <Terminal className="w-5 h-5" />
                  <span className="font-semibold text-sm text-white">Layer 2: IPC stdio Channel</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Zero network ports. Communicates exclusively over child process standard input/output with strict
                  newline-delimited JSON schemas and process health timeouts.
                </p>
                <div className="font-mono text-[11px] text-slate-400 pt-2 border-t border-navy-800">
                  stdio JSON • Zero Network Sockets
                </div>
              </div>

              <div className="p-5 rounded-lg bg-navy-850/80 border border-navy-700 space-y-3">
                <div className="flex items-center space-x-2 text-cyber-emerald">
                  <Zap className="w-5 h-5" />
                  <span className="font-semibold text-sm text-white">Layer 3: Python Engine</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Python 3.11 + PyTorch. Executes gradient-based Projected Gradient Descent (PGD) optimizations across
                  perceptual convolutional feature representations (ResNet-18).
                </p>
                <div className="font-mono text-[11px] text-slate-400 pt-2 border-t border-navy-800">
                  PyTorch CPU • $L_\infty \le 8/255$
                </div>
              </div>
            </div>
          )}

          {activeArchTab === 'engine' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300">
                All engine communication is strictly structured over JSON-RPC-like stdio commands without binding any local HTTP ports:
              </div>
              <div className="rounded-lg bg-navy-950 p-4 font-mono text-xs text-slate-300 border border-navy-800 overflow-x-auto">
                <pre className="text-cyber-sky">{`// Request sent from Desktop Shell to Python Child Process:
{
  "command": "run_perturbation",
  "image_path": "C:\\\\Users\\\\...\\\\input.png",
  "adapter_id": "neural-feature-disruption",
  "strength": 0.03137,  // 8.0 / 255.0 maximum bound
  "iterations": 10,
  "seed": 42
}

// Response from Python Engine (Offline stdio):
{
  "status": "success",
  "output_path": "C:\\\\Users\\\\...\\\\input_veilguard_protected.png",
  "linf_max_observed": 8.0,
  "psnr_db": 32.86,
  "ssim": 0.9964,
  "execution_seconds": 1.29
}`}</pre>
              </div>
            </div>
          )}

          {activeArchTab === 'bounds' && (
            <div className="space-y-4 text-xs text-slate-300">
              <p className="leading-relaxed">
                Rather than trusting memory tensors, VeilGuard implements a secondary on-disk verification step:
                after the protected image is written to disk as a PNG, the engine re-reads the written file byte-by-byte
                and computes the absolute maximum pixel difference against the original input.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-navy-950 rounded border border-navy-800">
                  <div className="text-slate-400 font-mono text-[11px]">Parametric Bound ($\epsilon$)</div>
                  <div className="text-base font-bold text-white font-mono mt-1">8 / 255 (3.14%)</div>
                </div>
                <div className="p-3 bg-navy-950 rounded border border-navy-800">
                  <div className="text-slate-400 font-mono text-[11px]">Empirical PSNR</div>
                  <div className="text-base font-bold text-cyber-emerald font-mono mt-1">&gt; 32.8 dB</div>
                </div>
                <div className="p-3 bg-navy-950 rounded border border-navy-800">
                  <div className="text-slate-400 font-mono text-[11px]">Structural Similarity (SSIM)</div>
                  <div className="text-base font-bold text-cyber-emerald font-mono mt-1">0.9964</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. THREE STEP PROCESS */}
      <section className="max-w-5xl mx-auto px-4 space-y-10">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            How VeilGuard Operates
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            A non-destructive, locally verified protection workflow designed for researchers and photographers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card rounded-xl p-6 bg-navy-900/60 border border-navy-700/60 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-cyber-indigo/15 border border-cyber-indigo/40 flex items-center justify-center font-bold text-cyber-violet font-mono text-sm">
              01
            </div>
            <h3 className="text-base font-semibold text-white">Pre-flight Validation</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Verifies input image magic bytes, aspect ratios, and dimension boundaries ($\le 8192 \times 8192$ px).
              Ensures the original image is treated strictly as read-only.
            </p>
          </div>

          <div className="glass-card rounded-xl p-6 bg-navy-900/60 border border-navy-700/60 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-cyber-sky/15 border border-cyber-sky/40 flex items-center justify-center font-bold text-cyber-sky font-mono text-sm">
              02
            </div>
            <h3 className="text-base font-semibold text-white">Adversarial Optimization</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Iterates multi-step PGD gradient ascent on ResNet perceptual feature representations,
              clamping perturbations within the strict $L_\infty \le 8/255$ hypercube.
            </p>
          </div>

          <div className="glass-card rounded-xl p-6 bg-navy-900/60 border border-navy-700/60 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-cyber-emerald/15 border border-cyber-emerald/40 flex items-center justify-center font-bold text-cyber-emerald font-mono text-sm">
              03
            </div>
            <h3 className="text-base font-semibold text-white">Non-Destructive Export</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Exports a new lossless PNG to a user-chosen destination, verifies pixel bounds directly from disk,
              and generates a reproducible empirical audit log.
            </p>
          </div>
        </div>
      </section>

      {/* 5. PRIVACY TOOLS TEASER BANNER */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="glass-card rounded-xl p-8 bg-gradient-to-r from-navy-900 via-navy-850 to-navy-900 border border-cyber-indigo/30 shadow-card">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center space-x-1.5 text-xs text-cyber-emerald font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Zero Server Uploads • Pure Client-Side Web Tool</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Inspect & Strip Image EXIF Metadata Right Now
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                Try our browser-local privacy inspector: uncover hidden GPS coordinates, camera serial numbers,
                and creation timestamps, then strip them completely before sharing.
              </p>
            </div>
            <button
              onClick={() => onNavigate('privacy-tools')}
              className="px-6 py-3 rounded-lg bg-cyber-indigo hover:bg-cyber-indigo/90 text-white font-medium text-sm transition-all shadow-glow flex items-center space-x-2 flex-shrink-0"
            >
              <span>Open Privacy Tools</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
