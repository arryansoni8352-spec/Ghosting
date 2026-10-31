import React from 'react';
import { AlertCircle, Home, Wrench } from 'lucide-react';
import { PageRoute } from '../components/Navbar';

interface NotFoundPageProps {
  onNavigate: (page: PageRoute) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onNavigate }) => {
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-6">
      <div className="w-16 h-16 rounded-full bg-navy-900 border border-navy-700 flex items-center justify-center mx-auto text-cyber-amber">
        <AlertCircle className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-cyber-violet uppercase tracking-wider">
          404 • Page Not Found
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Resource Does Not Exist
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          The requested URL path was not found on the VeilGuard portal.
          Please select a destination below:
        </p>
      </div>

      <div className="pt-4 flex flex-wrap justify-center gap-3">
        <button
          onClick={() => onNavigate('home')}
          className="px-5 py-2.5 rounded-lg bg-cyber-indigo hover:bg-cyber-indigo/90 text-white font-medium text-xs transition-colors flex items-center space-x-1.5"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Return to Home</span>
        </button>

        <button
          onClick={() => onNavigate('privacy-tools')}
          className="px-5 py-2.5 rounded-lg bg-navy-850 hover:bg-navy-800 text-slate-300 border border-navy-700 text-xs font-medium transition-colors flex items-center space-x-1.5"
        >
          <Wrench className="w-3.5 h-3.5 text-slate-400" />
          <span>Open Privacy Tools</span>
        </button>
      </div>
    </div>
  );
};
