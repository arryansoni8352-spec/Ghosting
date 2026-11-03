import React, { useState, useRef } from 'react';
import {
  ArrowRight,
  ShieldCheck,
  MapPinOff,
  Compass,
  Upload,
} from 'lucide-react';
import { PageRoute } from '../components/Navbar';
import { GhostMascot } from '../components/GhostLogo';

interface HomePageProps {
  onNavigate: (page: PageRoute) => void;
  onFileSelect?: (file: File) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (onFileSelect) {
      onFileSelect(file);
    } else {
      onNavigate('privacy-tools');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-24 sm:space-y-32 py-12 sm:py-20">
      {/* 1. HERO SECTION & PROMINENT UPLOAD AREA */}
      <section className="max-w-3xl mx-auto text-center space-y-10 px-4 sm:px-6">
        <div className="space-y-4">
          {/* Subtle Tag */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-50 border border-neutral-200 text-xs text-neutral-600">
            <GhostMascot size={14} />
            <span>Local-First Photo Privacy</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl font-bold text-neutral-900 tracking-tight leading-[1.08] max-w-2xl mx-auto">
            The invisible layer of privacy for your photos
          </h1>

          {/* Subtitle */}
          <p className="max-w-lg mx-auto text-base sm:text-lg text-neutral-500 leading-relaxed">
            Strip hidden GPS coordinates, camera serial numbers, and device fingerprints directly in your browser. Zero server uploads.
          </p>
        </div>

        {/* PROMINENT FILE UPLOAD AREA */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 sm:p-14 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-neutral-900 bg-neutral-50'
              : 'border-neutral-200 hover:border-neutral-900 bg-white hover:bg-neutral-50/50 shadow-subtle'
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label="Upload photo to sanitize metadata"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.tiff,.tif,.bmp,image/*"
            onChange={handleInputChange}
            className="hidden"
            id="homepage-file-input"
          />

          <div className="max-w-sm mx-auto space-y-4 pointer-events-none">
            <div className="w-12 h-12 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-center mx-auto text-neutral-700">
              <Upload className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <div className="text-base font-semibold text-neutral-900">
                Drop your photo here, or click to browse
              </div>
              <p className="text-xs text-neutral-500">
                Supports JPEG, PNG, and WebP (up to 50 MB)
              </p>
            </div>

            <div className="pt-2">
              <span className="btn-primary pointer-events-auto text-xs px-6 py-2.5">
                Select Photo
              </span>
            </div>
          </div>
        </div>

        {/* Supporting Trust Row */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-500">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-900" />
            <span>Zero Network Calls</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <MapPinOff className="w-3.5 h-3.5 text-neutral-900" />
            <span>Exact GPS Removal</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Compass className="w-3.5 h-3.5 text-neutral-900" />
            <span>Upright EXIF Orientation</span>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS (3 Simple Steps) */}
      <section id="how-it-works" className="max-w-3xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="text-center space-y-1.5 max-w-md mx-auto">
          <div className="text-xs uppercase tracking-wider font-semibold text-neutral-400">Process</div>
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">
            How GHOSTING Works
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            A frictionless client-side workflow that strips metadata without altering visual pixels.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="ghost-card p-6 space-y-2.5 bg-white">
            <div className="text-xs font-mono font-semibold text-neutral-400">01</div>
            <h3 className="text-sm font-semibold text-neutral-900">Select Photo</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Drop any photo into the browser. The file is held locally in memory and never leaves your device.
            </p>
          </div>

          <div className="ghost-card p-6 space-y-2.5 bg-white">
            <div className="text-xs font-mono font-semibold text-neutral-400">02</div>
            <h3 className="text-sm font-semibold text-neutral-900">Strip Metadata</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              GHOSTING inspects all embedded tags, wipes geolocation and camera serials, and normalizes visual EXIF orientation.
            </p>
          </div>

          <div className="ghost-card p-6 space-y-2.5 bg-white">
            <div className="text-xs font-mono font-semibold text-neutral-400">03</div>
            <h3 className="text-sm font-semibold text-neutral-900">Download Clean</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Save your sanitized photo with all technical markers removed, ready to share securely anywhere.
            </p>
          </div>
        </div>
      </section>

      {/* 3. CORE PRIVACY GUARANTEES */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="text-center space-y-1.5 max-w-md mx-auto">
          <div className="text-xs uppercase tracking-wider font-semibold text-neutral-400">Architecture</div>
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">
            Designed for Real Privacy
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            No accounts. No subscriptions. No cloud servers.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
            <h3 className="text-sm font-semibold text-neutral-900">Zero Server Uploads</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Every operation takes place directly on your computer or phone using standard client-side Web APIs.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
            <h3 className="text-sm font-semibold text-neutral-900">Precise GPS Erasure</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Smartphones embed latitude and longitude coordinates in every photo. GHOSTING scrubs these tags entirely.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
            <h3 className="text-sm font-semibold text-neutral-900">Upright Orientation</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Handles all 8 EXIF orientation tags so your photos always export upright.
            </p>
          </div>
        </div>
      </section>

      {/* 4. UNDERSTATED BOTTOM SECTION */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="p-8 sm:p-10 rounded-2xl bg-neutral-50 border border-neutral-200 text-center space-y-4">
          <div className="space-y-1 max-w-sm mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
              Clean your photos in seconds
            </h2>
            <p className="text-xs text-neutral-500">
              No account required. Fast, private, and 100% offline.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onNavigate('privacy-tools')}
              className="btn-primary px-6 py-2.5 text-xs font-medium space-x-1.5 w-full sm:w-auto"
            >
              <span>Clean Photos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate('video-studio')}
              className="btn-secondary px-6 py-2.5 text-xs font-medium space-x-1.5 w-full sm:w-auto"
            >
              <span>Open Video Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
