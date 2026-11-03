import React from 'react';
import { Shield, Lock, ArrowLeft, Check } from 'lucide-react';
import { PageRoute } from '../components/Navbar';

interface SecurityPolicyPageProps {
  onNavigate: (page: PageRoute) => void;
}

export const SecurityPolicyPage: React.FC<SecurityPolicyPageProps> = ({ onNavigate }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-10">
      {/* Back button */}
      <div>
        <button
          onClick={() => onNavigate('home')}
          className="text-xs text-neutral-500 hover:text-neutral-900 flex items-center space-x-1.5 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 text-xs font-medium text-neutral-600 bg-neutral-50 border border-neutral-200 px-3 py-1 rounded-full">
          <Shield className="w-3.5 h-3.5 text-neutral-700" />
          <span>Security & Disclosure</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
          Security Policy & Reporting
        </h1>
        <p className="text-xs text-neutral-400 font-mono">
          Last updated: November 2026 • Local-First Architecture
        </p>
      </div>

      <div className="ghost-card p-6 sm:p-8 bg-white border border-neutral-200 rounded-xl space-y-8 text-sm text-neutral-600 leading-relaxed">
        {/* Architecture Security */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-neutral-900 flex items-center space-x-2">
            <Lock className="w-4 h-4 text-neutral-900" />
            <span>Zero-Exposure Architecture</span>
          </h2>
          <p className="text-xs text-neutral-500 leading-relaxed">
            GHOSTING enforces strict client-side data isolation. Image binaries loaded into the interface are never serialized over WebSockets, fetch calls, or background channels.
          </p>
        </section>

        {/* Security Commitments */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-neutral-900">Security Commitments</h3>
          <ul className="space-y-2 text-xs text-neutral-500">
            <li className="flex items-start space-x-2">
              <Check className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>Offline Execution: All image processing executes via standard browser Canvas and TypedArray APIs in memory.</span>
            </li>
            <li className="flex items-start space-x-2">
              <Check className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>Zero Backend Exposure: We maintain zero cloud upload endpoints, preventing server-side data leaks.</span>
            </li>
            <li className="flex items-start space-x-2">
              <Check className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>Verifiable Builds: All production artifacts are compiled via automated deterministic build pipelines.</span>
            </li>
          </ul>
        </section>

        {/* Responsible Disclosure */}
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-neutral-900">Responsible Disclosure</h3>
          <p className="text-xs text-neutral-500 leading-relaxed">
            If you discover an issue related to metadata parsing or data handling, please submit a detailed report through official channels. All validated submissions receive prompt engineering response.
          </p>
        </section>
      </div>
    </div>
  );
};

export default SecurityPolicyPage;
