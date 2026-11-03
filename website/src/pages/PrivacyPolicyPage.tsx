import React from 'react';
import { Shield, Lock, Check, X, ArrowLeft } from 'lucide-react';
import { PageRoute } from '../components/Navbar';

interface PrivacyPolicyPageProps {
  onNavigate: (page: PageRoute) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onNavigate }) => {
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
          <Lock className="w-3.5 h-3.5 text-neutral-700" />
          <span>Local-First Data Guarantee</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-xs text-neutral-400 font-mono">
          Last updated: November 2026 • 100% Client-Side Privacy
        </p>
      </div>

      <div className="ghost-card p-6 sm:p-8 bg-white border border-neutral-200 rounded-xl space-y-8 text-sm text-neutral-600 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-neutral-900 flex items-center space-x-2">
            <Shield className="w-4 h-4 text-neutral-900" />
            <span>Core Privacy Architecture</span>
          </h2>
          <p className="text-xs text-neutral-500 leading-relaxed">
            GHOSTING is a local-first photo privacy utility. Your privacy is fundamental to our architecture, not an afterthought.
          </p>
        </section>

        {/* What GHOSTING Does NOT Do */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-neutral-900">What GHOSTING Does NOT Do</h3>
          <ul className="space-y-2 text-xs text-neutral-500">
            <li className="flex items-start space-x-2">
              <X className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>We do <strong>not</strong> upload, transmit, or store your photographs on any server.</span>
            </li>
            <li className="flex items-start space-x-2">
              <X className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>We do <strong>not</strong> collect personal information, email addresses, or account credentials.</span>
            </li>
            <li className="flex items-start space-x-2">
              <X className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>We do <strong>not</strong> load third-party analytics scripts, tracking pixels, or advertising beacons.</span>
            </li>
          </ul>
        </section>

        {/* What GHOSTING Does */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-neutral-900">What GHOSTING Does</h3>
          <ul className="space-y-2 text-xs text-neutral-500">
            <li className="flex items-start space-x-2">
              <Check className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>Processes image data completely within your browser's local sandbox memory.</span>
            </li>
            <li className="flex items-start space-x-2">
              <Check className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>Inspects container headers (EXIF, GPS, IPTC, XMP) in-memory on your CPU.</span>
            </li>
            <li className="flex items-start space-x-2">
              <Check className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
              <span>Exports sanitized photo files directly to your device downloads folder with zero network calls.</span>
            </li>
          </ul>
        </section>

        {/* Retention */}
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-neutral-900">Data Retention</h3>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Because GHOSTING has no server backend or database, no personal data or image binaries are ever stored by us.
            Closing or refreshing the browser tab immediately frees all in-memory buffers.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
