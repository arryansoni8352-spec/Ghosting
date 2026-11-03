import React from 'react';
import { Home, ArrowRight } from 'lucide-react';
import { PageRoute } from '../components/Navbar';
import { GhostMascot } from '../components/GhostLogo';

interface NotFoundPageProps {
  onNavigate: (page: PageRoute) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onNavigate }) => {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center space-y-6">
      <div className="w-16 h-16 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-center mx-auto">
        <GhostMascot size={32} />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider font-semibold">
          404 • Page Not Found
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">
          Resource Does Not Exist
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed max-w-sm mx-auto">
          The requested page could not be located. You can return to the overview or open privacy tools.
        </p>
      </div>

      <div className="pt-2 flex flex-wrap justify-center gap-3">
        <button
          onClick={() => onNavigate('home')}
          className="btn-primary space-x-1.5 text-xs font-semibold"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Return to Home</span>
        </button>

        <button
          onClick={() => onNavigate('privacy-tools')}
          className="btn-secondary space-x-1.5 text-xs font-semibold"
        >
          <span>Open Privacy Tools</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default NotFoundPage;
