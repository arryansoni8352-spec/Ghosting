import React, { useEffect, useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { createImageJob } from '../../lib/shieldApi';
import type { ShieldCapabilities } from '../../lib/shieldTypes';
import { useShieldJob } from '../../lib/useShieldJob';
import { formatBytes, validateImageFile } from '../../lib/shieldValidation';
import { CompareView } from './CompareView';
import { DropZone, ErrorNote, OptionGroup, ProgressPanel, Stat } from './ShieldPrimitives';

interface Props {
  caps: ShieldCapabilities | null;
  consented: boolean;
}

const PRESET_COPY: Record<string, { title: string; detail: string }> = {
  low: { title: 'Low', detail: 'Smallest pixel change; least visible.' },
  balanced: { title: 'Balanced', detail: 'Default trade-off between visibility and strength.' },
  high: { title: 'High', detail: 'Largest allowed pixel change; most visible.' },
};

export const ImageShield: React.FC<Props> = ({ caps, consented }) => {
  const { state, start, cancel, remove, reset } = useShieldJob();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [strength, setStrength] = useState<'low' | 'balanced' | 'high'>('balanced');
  const [format, setFormat] = useState<'png' | 'webp'>('png');
  const originalUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }, [originalUrl]);

  const engineReady = caps ? caps.image.ready : true;
  const busy = state.phase === 'uploading' || state.phase === 'processing';
  const presets = caps?.image.presets ?? [];

  const choose = async (f: File) => {
    reset();
    const v = await validateImageFile(f, caps);
    if (!v.ok) { setFile(null); setFileError(v.message ?? 'Unsupported file.'); return; }
    setFileError(null);
    setFile(f);
  };

  const run = () => {
    if (!file) return;
    void start(signal => createImageJob(file, { strength, outputFormat: format }, signal));
  };

  const out = (state.record?.output ?? {}) as Record<string, unknown>;
  const budget = out['budget_integer_levels'];
  const maxChange = out['max_change_after_encoding'];
  const downloadName = file ? `${file.name.replace(/\.[^.]+$/, '')}-shielded.${format === 'png' ? 'png' : 'webp'}` : state.outputName;

  return (
    <div className="space-y-6">
      {!engineReady && caps && <ErrorNote message={`Image Shield is unavailable: ${caps.image.readiness.message}`} />}

      {!file ? (
        <DropZone accept="image/png,image/webp" disabled={!consented || !engineReady}
          label={consented ? 'Drop an image here' : 'Accept the upload notice above to enable uploads'}
          hint={`PNG or lossless WebP · up to ${caps?.image.limits.max_upload_mb ?? 15} MB · up to ${caps ? caps.image.limits.max_pixels.toLocaleString() : '262,144'} pixels · JPEG and lossy WebP are not supported`}
          onFile={c => void choose(c)} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs text-neutral-600">
            <span className="font-medium text-neutral-900 truncate">{file.name} <span className="text-neutral-400 font-normal">· {formatBytes(file.size)}</span></span>
            <button type="button" className="btn-secondary text-xs py-1.5 px-3" disabled={busy} onClick={() => { void remove(); setFile(null); }}>Choose another</button>
          </div>

          {state.phase === 'idle' || state.phase === 'failed' || state.phase === 'cancelled' ? (
            <div className="space-y-5">
              <OptionGroup legend="Protection preset" value={strength} onChange={v => setStrength(v as typeof strength)}
                options={['low', 'balanced', 'high'].map(id => {
                  const p = presets.find(x => x.id === id);
                  return { id, title: PRESET_COPY[id].title, detail: `${PRESET_COPY[id].detail}${p ? ` Max ±${p.integer_budget_levels}/255 per channel.` : ''}` };
                })} />
              <OptionGroup legend="Output format" value={format} onChange={v => setFormat(v as typeof format)}
                options={[{ id: 'png', title: 'PNG', detail: 'Lossless. Keeps transparency.' }, { id: 'webp', title: 'Lossless WebP', detail: 'Lossless, smaller files.' }]} />
              <p className="text-[11px] text-neutral-500">Lossy outputs (JPEG, lossy WebP) are not offered: compression would change pixels beyond the guaranteed budget.</p>
              <button type="button" className="btn-primary" disabled={!consented || !engineReady} onClick={run}>Protect image</button>
            </div>
          ) : null}

          {busy && <ProgressPanel status={state.status} uploading={state.phase === 'uploading'} onCancel={() => void cancel()} />}
          {state.phase === 'cancelled' && <p className="text-xs text-neutral-600">Processing was cancelled and the server copy was removed.</p>}
          {state.error && <ErrorNote message={state.error} />}

          {originalUrl && (
            <CompareView kind="image" originalUrl={originalUrl} protectedUrl={state.phase === 'succeeded' ? state.outputUrl : null} />
          )}

          {state.phase === 'succeeded' && state.outputUrl && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Pixel budget" value={typeof budget === 'number' ? `±${budget} / 255` : '—'} />
                <Stat label="Largest change" value={typeof maxChange === 'number' ? `${maxChange} levels` : '—'} />
                <Stat label="Budget met after encoding" value={out['budget_satisfied_after_encoding'] === true ? 'Yes (verified)' : 'No'} />
                <Stat label="Protection effectiveness" value="Not measured" />
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={state.outputUrl} download={downloadName} className="btn-primary text-xs py-2 px-4 space-x-1.5">
                  <Download className="w-3.5 h-3.5" aria-hidden="true" /><span>Download protected image</span>
                </a>
                <button type="button" className="btn-secondary text-xs py-2 px-4 space-x-1.5" onClick={() => { void remove(); }}>
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /><span>Delete from server</span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">Dimensions are preserved. EXIF and colour-profile metadata are not copied to the output.</p>
            </div>
          )}
        </div>
      )}
      {fileError && <ErrorNote message={fileError} />}
    </div>
  );
};
