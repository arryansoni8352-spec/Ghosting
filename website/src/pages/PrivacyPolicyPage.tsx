import React from 'react';
import { Shield, Lock, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { PageRoute } from '../components/Navbar';

interface PrivacyPolicyPageProps {
  onNavigate: (page: PageRoute) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onNavigate }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      {/* Back button */}
      <div>
        <button
          onClick={() => onNavigate('home')}
          className="text-xs text-cyber-sky hover:underline flex items-center space-x-1 font-mono"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 text-xs font-mono text-cyber-emerald">
          <Lock className="w-3.5 h-3.5" />
          <span>Local-First Data Guarantee</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          VeilGuard Privacy Policy
        </h1>
        <p className="text-xs text-slate-400 font-mono">
          Last updated: October 2026 • Aligned with repository PRIVACY.md
        </p>
      </div>

      <div className="glass-card rounded-xl p-6 sm:p-8 bg-navy-900/60 border border-navy-700/80 space-y-8 text-sm text-slate-300 leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Shield className="w-4 h-4 text-cyber-indigo" />
            <span>Core Privacy Architecture</span>
          </h2>
          <p>
            VeilGuard is a local-first image-protection research application and privacy toolkit.
            Your privacy is fundamental to our architecture, not an afterthought.
          </p>
        </section>

        {/* What VeilGuard Does NOT Do */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-white">What VeilGuard Does NOT Do</h3>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start space-x-2 text-slate-300">
              <XCircle className="w-4 h-4 text-cyber-rose flex-shrink-0 mt-0.5" />
              <span><strong>Never uploads your photos</strong>, thumbnails, or file paths to any server or cloud infrastructure.</span>
            </li>
            <li className="flex items-start space-x-2 text-slate-300">
              <XCircle className="w-4 h-4 text-cyber-rose flex-shrink-0 mt-0.5" />
              <span><strong>Never collects telemetry</strong>, tracking cookies, analytics, or behavioral surveillance.</span>
            </li>
            <li className="flex items-start space-x-2 text-slate-300">
              <XCircle className="w-4 h-4 text-cyber-rose flex-shrink-0 mt-0.5" />
              <span><strong>Never requires user accounts</strong>, passwords, email sign-ups, or login sessions.</span>
            </li>
            <li className="flex items-start space-x-2 text-slate-300">
              <XCircle className="w-4 h-4 text-cyber-rose flex-shrink-0 mt-0.5" />
              <span><strong>Never shares data with third parties</strong>, advertising brokers, or AI training datasets.</span>
            </li>
            <li className="flex items-start space-x-2 text-slate-300">
              <XCircle className="w-4 h-4 text-cyber-rose flex-shrink-0 mt-0.5" />
              <span><strong>Never accesses any file</strong> on your device that you have not explicitly chosen in a file dialog.</span>
            </li>
          </ul>
        </section>

        {/* Browser Tools Privacy */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-white">Privacy Tools & Web Application</h3>
          <p className="text-xs text-slate-300">
            When using the VeilGuard web tools (such as our Image Metadata Inspector and EXIF Stripper):
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start space-x-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-cyber-emerald flex-shrink-0 mt-0.5" />
              <span>Image files are processed <strong>entirely inside your browser's JavaScript sandbox</strong> using HTML5 Canvas and WebAssembly/typed arrays.</span>
            </li>
            <li className="flex items-start space-x-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-cyber-emerald flex-shrink-0 mt-0.5" />
              <span>Zero network transmission: No bytes of your image leave your device.</span>
            </li>
            <li className="flex items-start space-x-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-cyber-emerald flex-shrink-0 mt-0.5" />
              <span>In-memory Object URLs are revoked and garbage-collected upon resetting or leaving the page.</span>
            </li>
          </ul>
        </section>

        {/* What VeilGuard Desktop Stores */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-white">What VeilGuard Desktop Stores Locally</h3>
          <ul className="space-y-2 text-xs">
            <li>
              <strong className="text-white">Application preferences:</strong> Stored locally in your operating system's standard application data directory (e.g. <code>%APPDATA%\veilguard</code> on Windows).
            </li>
            <li>
              <strong className="text-white">Temporary processing files:</strong> Generated during image perturbation, written to the local system temp directory, and deleted after each session.
            </li>
            <li>
              <strong className="text-white">Zero Cloud Sync:</strong> All configurations remain strictly on your local filesystem.
            </li>
          </ul>
        </section>

        {/* Contact */}
        <section className="space-y-3 pt-4 border-t border-navy-800">
          <h3 className="text-base font-semibold text-white">Privacy Concerns & Contact</h3>
          <p className="text-xs text-slate-300">
            For privacy inquiries or technical verification questions, please consult our source code repository or reach out via our security contact at <code className="text-cyber-sky font-mono">arryansoni8352@gmail.com</code>.
          </p>
        </section>
      </div>
    </div>
  );
};
