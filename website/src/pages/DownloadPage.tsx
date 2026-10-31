import React, { useState, useEffect } from 'react';
import {
  Download,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Terminal,
  Check,
  Copy,
  Info,
  RefreshCw,
} from 'lucide-react';
import { fetchGitHubReleases, GitHubRelease } from '../utils/githubReleases';

export const DownloadPage: React.FC = () => {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [copiedCloneCmd, setCopiedCloneCmd] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const loadReleases = async () => {
    setIsLoading(true);
    setApiError(null);
    const result = await fetchGitHubReleases();
    setReleases(result.releases);
    if (result.error) {
      setApiError(result.error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadReleases();
  }, []);

  const cloneSnippet = `git clone https://github.com/arryansoni8352-spec/veilguard.git
cd veilguard
npm install
cd engine
python -m venv .venv
# Windows PowerShell: .\\.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
cd ..
npm run dev`;

  const handleCopyClone = () => {
    navigator.clipboard.writeText(cloneSnippet);
    setCopiedCloneCmd(true);
    setTimeout(() => setCopiedCloneCmd(false), 2000);
  };

  const handleCopyChecksum = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 text-xs font-mono text-cyber-sky">
          <Download className="w-3.5 h-3.5" />
          <span>Official Distribution Channels • GitHub Releases Source of Truth</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Download & Installation
        </h1>
        <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
          VeilGuard distribution follows strict verification gates. All binary packages are audited against
          GitHub Releases API records. Never run unverified executable binaries from untrusted sources.
        </p>
      </div>

      {/* API Notice / Loading State */}
      {isLoading ? (
        <div className="glass-card rounded-xl p-8 text-center space-y-3 bg-navy-900/60 border border-navy-700/80">
          <RefreshCw className="w-6 h-6 animate-spin text-cyber-indigo mx-auto" />
          <div className="text-sm text-slate-300">
            Querying GitHub Releases API for verified binaries...
          </div>
        </div>
      ) : apiError ? (
        <div className="p-4 rounded-xl bg-navy-900 border border-navy-700 text-xs text-slate-300 flex items-start justify-between gap-4">
          <div className="flex items-start space-x-2">
            <Info className="w-4 h-4 text-cyber-sky flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">GitHub API Notice: </span>
              {apiError}
            </div>
          </div>
          <button
            onClick={loadReleases}
            className="text-cyber-sky hover:underline font-mono text-xs flex-shrink-0"
          >
            Retry Check
          </button>
        </div>
      ) : null}

      {/* STATE 1: NO VERIFIED RELEASES PUBLISHED YET (Current True State) */}
      {!isLoading && releases.length === 0 && (
        <section className="space-y-6">
          <div className="rounded-xl bg-navy-900/80 border border-cyber-amber/40 p-6 sm:p-8 space-y-4 shadow-card">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-cyber-amber/15 text-cyber-amber">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  No verified binary release published yet
                </h2>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Target: github.com/arryansoni8352-spec/veilguard/releases (0 assets published)
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              In accordance with VeilGuard's release checklist and security standards, pre-compiled binary installers
              are not published to GitHub Releases until formal Authenticode code-signing, clean-machine WDAC/SmartScreen
              verification, and reproducibility gates pass.
            </p>

            <div className="p-4 rounded-lg bg-navy-950 border border-navy-800 text-xs text-slate-300 space-y-2">
              <div className="font-semibold text-white flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-cyber-emerald" />
                <span>Auditable Alternative: Run Directly From Audited Source</span>
              </div>
              <p className="leading-relaxed text-slate-400">
                You can inspect, audit, and run the verified VeilGuard codebase directly on your machine.
                Running from source ensures zero closed-source binaries and complete execution transparency.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap gap-4">
              <a
                href="https://github.com/arryansoni8352-spec/veilguard"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-lg bg-cyber-indigo hover:bg-cyber-indigo/90 text-white font-medium text-xs transition-colors flex items-center space-x-2"
              >
                <span>View Source Repository on GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <a
                href="https://github.com/arryansoni8352-spec/veilguard/blob/main/docs/release-checklist.md"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-lg bg-navy-850 hover:bg-navy-800 text-slate-300 border border-navy-700 text-xs font-mono transition-colors flex items-center space-x-1.5"
              >
                <span>Release Checklist Docs</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
          </div>

          {/* Source Setup Walkthrough */}
          <div className="glass-card rounded-xl p-6 sm:p-8 bg-navy-900/60 border border-navy-700/80 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-cyber-sky" />
                <span>Quickstart: Developer & Research Source Setup</span>
              </h2>
              <button
                onClick={handleCopyClone}
                className="px-3 py-1.5 rounded-lg bg-navy-850 hover:bg-navy-800 text-slate-300 border border-navy-700 text-xs font-mono transition-colors flex items-center space-x-1"
              >
                {copiedCloneCmd ? <Check className="w-3.5 h-3.5 text-cyber-emerald" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedCloneCmd ? 'Copied Script!' : 'Copy Script'}</span>
              </button>
            </div>

            <div className="rounded-lg bg-navy-950 p-4 font-mono text-xs text-cyber-sky border border-navy-800 overflow-x-auto">
              <pre>{cloneSnippet}</pre>
            </div>

            <div className="text-xs text-slate-400 leading-relaxed">
              Prerequisites: Node.js 20+ and 64-bit Python 3.11.9 (AMD64) with PyTorch CPU.
            </div>
          </div>
        </section>
      )}

      {/* STATE 2: VERIFIED RELEASES FOUND IN GITHUB API */}
      {!isLoading && releases.length > 0 && (
        <section className="space-y-6">
          <div className="inline-flex items-center space-x-2 text-xs font-mono text-cyber-emerald">
            <ShieldCheck className="w-4 h-4" />
            <span>Verified GitHub Release Found</span>
          </div>

          {releases.map(rel => (
            <div
              key={rel.id}
              className="glass-card rounded-xl p-6 sm:p-8 bg-navy-900/80 border border-navy-700 space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-navy-800 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-white">{rel.name}</h2>
                    <span className="badge-tag bg-cyber-indigo/20 text-cyber-violet border border-cyber-indigo/40 font-mono text-xs">
                      {rel.tagName}
                    </span>
                    {rel.prerelease && (
                      <span className="badge-tag bg-cyber-amber/20 text-cyber-amber border border-cyber-amber/40 text-xs">
                        Pre-release
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Published: {new Date(rel.publishedAt).toLocaleDateString()}
                  </div>
                </div>

                <a
                  href={rel.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-cyber-sky hover:underline flex items-center space-x-1"
                >
                  <span>View on GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Asset List */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Verified Binary Assets
                </h3>
                {rel.assets.length === 0 ? (
                  <div className="text-xs text-slate-400 p-4 bg-navy-950 rounded border border-navy-800">
                    Source-only release. No compiled binary attachments.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {rel.assets.map((asset, aIdx) => (
                      <div
                        key={aIdx}
                        className="p-4 rounded-lg bg-navy-950 border border-navy-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="badge-tag bg-navy-800 text-slate-300 text-[10px]">
                              {asset.targetOs}
                            </span>
                            <span className="font-mono text-xs font-bold text-white">
                              {asset.name}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            Size: {(asset.size / (1024 * 1024)).toFixed(1)} MB • Downloads: {asset.downloadCount}
                          </div>
                          {asset.sha256 && (
                            <div className="flex items-center space-x-2 pt-1">
                              <span className="text-[10px] text-slate-400 font-mono">
                                SHA-256: {asset.sha256.substring(0, 16)}...
                              </span>
                              <button
                                onClick={() => handleCopyChecksum(asset.sha256!)}
                                className="text-[10px] text-cyber-sky hover:underline flex items-center space-x-0.5"
                              >
                                {copiedHash === asset.sha256 ? <Check className="w-3 h-3 text-cyber-emerald" /> : <Copy className="w-3 h-3" />}
                                <span>Copy</span>
                              </button>
                            </div>
                          )}
                        </div>

                        <a
                          href={asset.browserDownloadUrl}
                          className="px-4 py-2 rounded-lg bg-cyber-indigo hover:bg-cyber-indigo/90 text-white font-medium text-xs transition-colors flex items-center space-x-1.5 flex-shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Binary</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 3. MINIMUM SYSTEM REQUIREMENTS */}
      <section className="glass-card rounded-xl p-6 sm:p-8 bg-navy-900/60 border border-navy-700/80 space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-cyber-indigo" />
            <span>Minimum System Requirements</span>
          </h2>
          <p className="text-xs text-slate-400">
            Hardware and runtime prerequisites verified during Milestone 1 quality testing.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-navy-950 border border-navy-800 space-y-1">
            <div className="text-slate-400 font-mono">Operating System</div>
            <div className="font-bold text-white">Windows 10/11 (64-bit)</div>
            <div className="text-[11px] text-slate-400 pt-1">macOS 12+ and modern Linux support via source build.</div>
          </div>

          <div className="p-4 rounded-lg bg-navy-950 border border-navy-800 space-y-1">
            <div className="text-slate-400 font-mono">Python Runtime</div>
            <div className="font-bold text-white">Python 3.11.9 (AMD64)</div>
            <div className="text-[11px] text-slate-400 pt-1">Requires 64-bit AMD64 runtime with PyTorch and Pillow.</div>
          </div>

          <div className="p-4 rounded-lg bg-navy-950 border border-navy-800 space-y-1">
            <div className="text-slate-400 font-mono">System Memory (RAM)</div>
            <div className="font-bold text-white">4 GB Min (8 GB Rec)</div>
            <div className="text-[11px] text-slate-400 pt-1">Sufficient for CPU-based multi-layer feature maps.</div>
          </div>

          <div className="p-4 rounded-lg bg-navy-950 border border-navy-800 space-y-1">
            <div className="text-slate-400 font-mono">Free Disk Space</div>
            <div className="font-bold text-white">~1.75 GB Free</div>
            <div className="text-[11px] text-slate-400 pt-1">~250 MB app shell + ~1.5 GB persistent PyTorch venv.</div>
          </div>
        </div>
      </section>
    </div>
  );
};
