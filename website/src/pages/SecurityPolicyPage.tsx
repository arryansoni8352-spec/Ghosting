import React from 'react';
import { Shield, Lock, AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { PageRoute } from '../components/Navbar';

interface SecurityPolicyPageProps {
  onNavigate: (page: PageRoute) => void;
}

export const SecurityPolicyPage: React.FC<SecurityPolicyPageProps> = ({ onNavigate }) => {
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
        <div className="inline-flex items-center space-x-2 text-xs font-mono text-cyber-violet">
          <Shield className="w-3.5 h-3.5" />
          <span>Coordinated Vulnerability Disclosure</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Security Policy & Reporting
        </h1>
        <p className="text-xs text-slate-400 font-mono">
          Last updated: October 2026 • Aligned with repository SECURITY.md
        </p>
      </div>

      <div className="glass-card rounded-xl p-6 sm:p-8 bg-navy-900/60 border border-navy-700/80 space-y-8 text-sm text-slate-300 leading-relaxed">
        {/* Supported Versions */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-cyber-emerald" />
            <span>Supported Versions</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-navy-950 border-b border-navy-700 text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Security Updates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                <tr>
                  <td className="py-2.5 px-3 text-white font-bold">v0.1.0-rc1</td>
                  <td className="py-2.5 px-3 text-cyber-emerald">Current Release Candidate</td>
                  <td className="py-2.5 px-3 text-cyber-emerald">Supported</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-white font-bold">main (branch)</td>
                  <td className="py-2.5 px-3 text-cyber-sky">Active Development</td>
                  <td className="py-2.5 px-3 text-cyber-emerald">Supported</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* How to Report */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-cyber-amber" />
            <span>Reporting a Vulnerability</span>
          </h2>
          <div className="p-4 rounded-lg bg-navy-950 border border-cyber-amber/30 text-xs space-y-2">
            <p className="text-cyber-amber font-semibold">
              Do not open a public GitHub issue for undisclosed security vulnerabilities.
            </p>
            <p className="text-slate-300">
              To report a suspected security vulnerability or sensitive privacy issue:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 pt-1">
              <li>Email our security team directly at <code className="text-white font-mono">arryansoni8352@gmail.com</code>.</li>
              <li>Include technical details, reproduction steps, and potential impact.</li>
              <li>We will acknowledge receipt promptly and coordinate remediation before public disclosure.</li>
            </ol>
          </div>
        </section>

        {/* Hardening Guarantees */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Lock className="w-4 h-4 text-cyber-indigo" />
            <span>Application Hardening Architecture</span>
          </h2>
          <ul className="space-y-2 text-xs text-slate-300">
            <li className="p-3 bg-navy-950 rounded border border-navy-800">
              <strong className="text-white">Strict Content Security Policy (CSP):</strong> Connect-src is restricted to <code>'none'</code> in the desktop app, preventing unauthorized external requests.
            </li>
            <li className="p-3 bg-navy-950 rounded border border-navy-800">
              <strong className="text-white">Process Boundaries:</strong> The Electron shell enforces <code>contextIsolation: true</code>, <code>nodeIntegration: false</code>, and <code>sandbox: true</code>.
            </li>
            <li className="p-3 bg-navy-950 rounded border border-navy-800">
              <strong className="text-white">IPC Allowlisting:</strong> All inter-process communication is validated against strict schemas to prevent path traversal and null-byte injections.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};
