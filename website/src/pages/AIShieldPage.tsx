import React, { useEffect, useState } from 'react';
import { ArrowLeft, Film, Image as ImageIcon, KeyRound } from 'lucide-react';
import { PageRoute } from '../components/Navbar';
import { ImageShield } from '../components/shield/ImageShield';
import { VideoShield } from '../components/shield/VideoShield';
import { ConsentPanel } from '../components/shield/ConsentPanel';
import { ErrorNote, ExperimentalBanner } from '../components/shield/ShieldPrimitives';
import { getAccessKey, getCapabilities, isShieldConfigured, setAccessKey } from '../lib/shieldApi';
import type { ShieldCapabilities } from '../lib/shieldTypes';

interface Props {
  onNavigate: (page: PageRoute) => void;
}

type Tab = 'image' | 'video';

export const AIShieldPage: React.FC<Props> = ({ onNavigate }) => {
  const configured = isShieldConfigured();
  const [tab, setTab] = useState<Tab>('image');
  const [caps, setCaps] = useState<ShieldCapabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [accessKey, setKey] = useState(getAccessKey());
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!configured) return;
    const ctl = new AbortController();
    setCapsError(null);
    getCapabilities(ctl.signal).then(setCaps).catch(e => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setCaps(null);
      setCapsError(e instanceof Error ? e.message : 'Could not reach the AI Shield server.');
    });
    return () => ctl.abort();
  }, [configured, reload]);

  const tabClass = (t: Tab) => `flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    tab === t ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      <button onClick={() => onNavigate('home')} className="text-xs text-neutral-500 hover:text-neutral-900 flex items-center space-x-1.5 font-medium transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /><span>Back to Home</span>
      </button>

      <header className="space-y-3">
        <span className="badge-ghost">Experimental · server-processed</span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">GHOSTING AI Shield</h1>
        <p className="text-sm text-neutral-600 max-w-2xl leading-relaxed">
          Adds a small, bounded pixel perturbation to images (and, experimentally, to short videos) as a research-stage attempt to make
          them harder for some AI systems to learn from. Image Shield and Video Shield are separate tools. Neither is the same as Video Studio,
          which edits metadata in your browser.
        </p>
      </header>

      <ExperimentalBanner extra="Results vary by model and may not work at all; an earlier controlled test showed no measurable effect." />

      {!configured && (
        <ErrorNote message="AI Shield is not enabled on this deployment (no processing server is configured). The rest of GHOSTING works as usual." />
      )}

      {configured && capsError && (
        <div className="space-y-2">
          <ErrorNote message={capsError} />
          <button type="button" className="btn-secondary text-xs py-1.5 px-3" onClick={() => setReload(n => n + 1)}>Retry</button>
        </div>
      )}

      {configured && !capsError && (
        <>
          <ConsentPanel caps={caps} accepted={consented} onChange={setConsented} />

          {caps?.access.access_key_required && (
            <div className="ghost-panel p-4 flex items-center space-x-3">
              <KeyRound className="w-4 h-4 text-neutral-500 flex-shrink-0" aria-hidden="true" />
              <label className="flex-1 text-xs text-neutral-700">
                <span className="block font-semibold text-neutral-900 mb-1">Access key</span>
                <input type="password" autoComplete="off" value={accessKey} onChange={e => { setKey(e.target.value); setAccessKey(e.target.value); }}
                  className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs" placeholder="Required by this server" />
              </label>
            </div>
          )}

          <div role="tablist" aria-label="AI Shield tools" className="flex space-x-2">
            <button role="tab" aria-selected={tab === 'image'} className={tabClass('image')} onClick={() => setTab('image')}>
              <ImageIcon className="w-4 h-4" aria-hidden="true" /><span>Image Shield</span>
            </button>
            <button role="tab" aria-selected={tab === 'video'} className={tabClass('video')} onClick={() => setTab('video')}>
              <Film className="w-4 h-4" aria-hidden="true" /><span>Video Shield</span>
            </button>
          </div>

          <section role="tabpanel" className="ghost-card p-5 sm:p-7">
            {tab === 'image' ? <ImageShield caps={caps} consented={consented} /> : <VideoShield caps={caps} consented={consented} />}
          </section>
        </>
      )}

      <p className="text-[11px] text-neutral-400 leading-relaxed">
        AI Shield makes no claim of guaranteed protection, of preventing AI training or style imitation, or of equivalence to any other product.
        See the <button className="underline" onClick={() => onNavigate('privacy')}>Privacy Policy</button> for how uploaded files are handled.
      </p>
    </div>
  );
};

export default AIShieldPage;
