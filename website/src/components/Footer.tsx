import React from 'react';
import { PageRoute } from './Navbar';
import { GhostLogo } from './GhostLogo';

interface FooterProps {
  onNavigate: (page: PageRoute) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="border-t border-neutral-200 bg-white text-neutral-500 text-sm mt-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand & Purpose */}
          <div className="md:col-span-2 space-y-4">
            <GhostLogo height={28} />
            <p className="text-neutral-500 text-sm leading-relaxed max-w-sm">
              Minimalist photo privacy. Strip hidden metadata, GPS tags, and camera serial numbers directly in your browser.
            </p>
            <div className="text-xs text-neutral-400">
              Zero network transmissions • 100% Client-side execution
            </div>
          </div>

          {/* Product & Tools */}
          <div>
            <h3 className="text-neutral-900 font-semibold text-xs uppercase tracking-wider mb-4">
              Product
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() => onNavigate('privacy-tools')}
                  className="text-neutral-500 hover:text-neutral-900 transition-colors text-left"
                >
                  Photo Privacy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('video-studio')}
                  className="text-neutral-500 hover:text-neutral-900 transition-colors text-left"
                >
                  Video Studio
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('home')}
                  className="text-neutral-500 hover:text-neutral-900 transition-colors text-left"
                >
                  Overview
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="text-neutral-500 hover:text-neutral-900 transition-colors text-left"
                >
                  About
                </button>
              </li>
            </ul>
          </div>

          {/* Privacy & Trust */}
          <div>
            <h3 className="text-neutral-900 font-semibold text-xs uppercase tracking-wider mb-4">
              Trust
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() => onNavigate('privacy')}
                  className="text-neutral-500 hover:text-neutral-900 transition-colors text-left"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('security')}
                  className="text-neutral-500 hover:text-neutral-900 transition-colors text-left"
                >
                  Security Architecture
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-neutral-200 flex flex-col sm:flex-row justify-between items-center text-xs text-neutral-400 gap-4">
          <p>© {new Date().getFullYear()} GHOSTING. All rights reserved.</p>
          <p>Local-First Photo Privacy</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
