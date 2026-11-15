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
          <span>Local-First, with one opt-in exception</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-xs text-neutral-400 font-mono">
          Last updated: November 2026 • Client-side tools + optional AI Shield
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
              <span>In the photo and video privacy tools, we do <strong>not</strong> upload, transmit, or store your files on any server. (The optional AI Shield page is the one exception: see below.)</span>
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
            For the privacy tools, which have no server backend or database, no personal data or image binaries are ever stored by us.
            Closing or refreshing the browser tab immediately frees all in-memory buffers. AI Shield retention is described in the next section.
          </p>
        </section>
      </div>

      <div className="ghost-card p-6 sm:p-8 bg-white border border-mint-300 rounded-xl space-y-4 text-sm text-neutral-600 leading-relaxed" id="ai-shield-privacy">
        <h2 className="text-base font-bold text-neutral-900">AI Shield (experimental): files ARE uploaded</h2>
        <p className="text-xs text-neutral-500">
          This section applies only to the optional AI Shield page. It does not change how the photo tools, the Video Studio or the
          VeilGuard desktop application work: those remain local-only.
        </p>
        <ul className="space-y-2 text-xs text-neutral-500 list-disc pl-5">
          <li><strong>What is sent.</strong> The image or video you choose, over HTTPS, to a separate GHOSTING processing server, only after you tick a confirmation box on the AI Shield page.</li>
          <li><strong>Storage while processing.</strong> The file is held in server memory and temporary storage while the job runs. Video frames are written to temporary storage and removed when processing ends.</li>
          <li><strong>Retention.</strong> The processed result is kept for a limited time after completion (the exact duration is shown on the AI Shield page and defaults to one hour), then deleted automatically. Failed and cancelled jobs are deleted immediately.</li>
          <li><strong>Deleting early.</strong> Use “Delete from server” on the result, or close the page: the page asks the server to delete your job when you leave.</li>
          <li><strong>Access control.</strong> Each job gets a random secret token that stays in your browser tab’s memory. Without it nobody, including other visitors, can read, download or delete the job.</li>
          <li><strong>Logging.</strong> The server logs errors and job outcomes using a shortened job identifier. It does not log file names, file contents or tokens. The hosting provider or network proxy in front of the server may log request metadata such as IP addresses; we do not control those logs.</li>
          <li><strong>Third parties.</strong> The application sends your file to no third-party service. It runs on infrastructure from a hosting provider, which technically handles the traffic.</li>
          <li><strong>No accounts, no analytics.</strong> AI Shield collects no personal information beyond what the network connection inherently reveals.</li>
          <li><strong>Not a guarantee.</strong> Experimental. Protection effectiveness has not been independently validated.</li>
        </ul>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
