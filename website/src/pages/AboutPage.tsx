import React from 'react';
import {
  Shield,
  CheckCircle2,
  ArrowRight,
  EyeOff,
  Compass,
} from 'lucide-react';
import { PageRoute } from '../components/Navbar';
import { GhostMascot } from '../components/GhostLogo';

interface AboutPageProps {
  onNavigate: (page: PageRoute) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 text-xs font-medium text-neutral-600 bg-neutral-50 px-3 py-1 rounded-full border border-neutral-200">
          <GhostMascot size={14} />
          <span>About GHOSTING</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
          About GHOSTING
        </h1>
        <p className="text-sm sm:text-base text-neutral-500 max-w-xl leading-relaxed">
          GHOSTING is a minimalist, local-first photo privacy utility built to strip hidden tracking data,
          device fingerprints, and precise geolocation markers from your photographs.
        </p>
      </div>

      {/* 1. MISSION & ETHICAL PRINCIPLES */}
      <section className="ghost-card p-6 sm:p-8 bg-white border border-neutral-200 space-y-6 rounded-xl">
        <h2 className="text-lg font-bold text-neutral-900 flex items-center space-x-2">
          <Shield className="w-4 h-4 text-neutral-900" />
          <span>Core Principles</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-neutral-600">
          <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1.5">
            <div className="font-semibold text-neutral-900 text-xs">1. Absolute Local Privacy</div>
            <p className="leading-relaxed text-neutral-500">
              Photographs never leave your device. All processing occurs 100% inside your local browser memory.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1.5">
            <div className="font-semibold text-neutral-900 text-xs">2. Transparent Utility</div>
            <p className="leading-relaxed text-neutral-500">
              We focus on guaranteed metadata sanitization. We inspect every container tag and wipe all identifying records completely.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1.5">
            <div className="font-semibold text-neutral-900 text-xs">3. Zero Telemetry</div>
            <p className="leading-relaxed text-neutral-500">
              Zero user tracking, zero analytics cookies, zero diagnostic beacons.
            </p>
          </div>
        </div>
      </section>

      {/* 2. THREE PILLARS */}
      <section className="ghost-card p-6 sm:p-8 bg-white border border-neutral-200 space-y-6 rounded-xl">
        <h2 className="text-lg font-bold text-neutral-900">
          Product Architecture
        </h2>

        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1">
            <div className="flex items-center space-x-2 text-neutral-900 font-semibold text-xs">
              <EyeOff className="w-4 h-4 text-neutral-800" />
              <span>Full Metadata Eradication</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Strips EXIF, GPS location coordinates, camera serial numbers, lens profiles, and device identifiers from JPEG, PNG, and WebP images.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1">
            <div className="flex items-center space-x-2 text-neutral-900 font-semibold text-xs">
              <Compass className="w-4 h-4 text-neutral-800" />
              <span>Lossless Orientation Normalization</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Handles all 8 EXIF orientation specifications so your photos always export right-side up without needing EXIF tags.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1">
            <div className="flex items-center space-x-2 text-neutral-900 font-semibold text-xs">
              <CheckCircle2 className="w-4 h-4 text-neutral-900" />
              <span>100% Client-Side Execution</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              No server processing, no cloud accounts, and zero bytes uploaded over the internet.
            </p>
          </div>
        </div>
      </section>

      {/* 3. CTA */}
      <section className="p-6 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="font-semibold text-sm text-neutral-900">Experience Photo Privacy</h3>
          <p className="text-xs text-neutral-500 max-w-md">
            Clean your first photo in seconds. No sign-up required.
          </p>
        </div>
        <button
          onClick={() => onNavigate('privacy-tools')}
          className="btn-primary flex items-center space-x-1.5 text-xs font-semibold flex-shrink-0"
        >
          <span>Open Privacy Tools</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </section>
    </div>
  );
};

export default AboutPage;
