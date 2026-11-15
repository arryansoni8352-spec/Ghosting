import React, { useEffect, useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { createVideoJob } from '../../lib/shieldApi';
import type { ShieldCapabilities } from '../../lib/shieldTypes';
import { useShieldJob } from '../../lib/useShieldJob';
import { formatBytes, validateVideoFile } from '../../lib/shieldValidation';
import { CompareView } from './CompareView';
import { DropZone, ErrorNote, OptionGroup, ProgressPanel, Stat } from './ShieldPrimitives';

interface Props {
  caps: ShieldCapabilities | null;
  consented: boolean;
}

type Rec = Record<string, any>;

export const VideoShield: React.FC<Props> = ({ caps, consented }) => {
  const { state, start, cancel, remove, reset } = useShieldJob();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [strength, setStrength] = useState<'low' | 'balanced' | 'high'>('low');
  const [profile, setProfile] = useState<'compatible' | 'lossless'>('compatible');
  const [mode, setMode] = useState<'flow' | 'static'>('static');
  const originalUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }, [originalUrl]);

  const v = caps?.video;
  const ready = v ? v.enabled && v.ready : true;
  const busy = state.phase === 'uploading' || state.phase === 'processing';
  const flowOk = v ? v.temporal_modes.find(m => m.id === 'flow')?.available ?? false : true;
  const info = state.created?.input ?? null;
  const rec = (state.record ?? {}) as Rec;
  const o: Rec = rec.output ?? {};
  const tc: Rec = rec.temporal_consistency ?? {};
  const frames: Rec = rec.frames ?? {};

  
  const choose = async (f: File) => {
    reset();
    const r = await validateVideoFile(f, caps);
    if (!r.ok) { setFile(null); setFileError(r.message ?? 'Unsupported file.'); return; }
    setFileError(null);
    setFile(f);
  };

  return (
    <div className="space-y-6">
      {v && !ready && <ErrorNote message={!v.enabled ? 'Video Shield is disabled on this server.' : !v.ffmpeg_available ? 'Video Shield is unavailable: video tools are not installed on the server.' : `Video Shield is unavailable: ${caps?.image.readiness.message ?? 'the image engine is not ready.'}`} />}

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600 space-y-1.5">
        <p className="font-semibold text-neutral-900">How Video Shield works, and what it does not show</p>
        <p className="leading-relaxed">
          Frames are extracted, a few keyframes are protected by the image engine, and that perturbation is shared across neighbouring frames
          (reset at scene changes; optionally following motion) so the video does not flicker. Sharing one frame’s perturbation across a
          segment is untested as protection. Video protection has not been validated.
        </p>
        {v && (
          <p className="text-neutral-500">
            Limits: MP4/MOV (H.264) or WebM (VP8/VP9) · up to {v.limits.max_upload_mb} MB · {v.limits.max_duration_seconds} s · {v.limits.max_fps} fps ·
            {' '}{v.limits.max_pixels.toLocaleString()} pixels per frame · {v.limits.max_protected_keyframes} protected keyframes. {v.audio}
          </p>
        )}
      </div>

      {!file ? (
        <DropZone accept="video/mp4,video/quicktime,video/webm" disabled={!consented || !ready}
          label={consented ? 'Drop a video here' : 'Accept the upload notice above to enable uploads'}
          hint="MP4/MOV (H.264) or WebM (VP8/VP9) · short clips only" onFile={c => void choose(c)} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs text-neutral-600">
            <span className="font-medium text-neutral-900 truncate">{file.name} <span className="text-neutral-400 font-normal">· {formatBytes(file.size)}</span></span>
            <button type="button" className="btn-secondary text-xs py-1.5 px-3" disabled={busy} onClick={() => { void remove(); setFile(null); }}>Choose another</button>
          </div>

          {info && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Resolution" value={`${info.width}×${info.height}`} />
              <Stat label="Duration" value={`${info.duration_seconds.toFixed(1)} s · ${info.frame_rate.toFixed(2)} fps`} />
              <Stat label="Codec" value={`${info.video_codec}${info.audio ? ` + ${info.audio.codec}` : ' (no audio)'}`} />
              <Stat label="Frames" value={`~${info.estimated_frames}`} />
            </div>
          )}
          {info?.notes.map(n => <p key={n} className="text-[11px] text-neutral-500">{n}</p>)}

          {(state.phase === 'idle' || state.phase === 'failed' || state.phase === 'cancelled') && (
            <div className="space-y-5">
              <OptionGroup legend="Protection preset" value={strength} onChange={x => setStrength(x as typeof strength)}
                options={[{ id: 'low', title: 'Low', detail: 'Smallest change. Recommended for video.' }, { id: 'balanced', title: 'Balanced', detail: 'More visible.' }, { id: 'high', title: 'High', detail: 'Most visible.' }]} />
              <OptionGroup legend="Output" value={profile} onChange={x => setProfile(x as typeof profile)}
                options={(v?.output_profiles ?? [{ id: 'compatible', note: '' }, { id: 'lossless', note: '' }]).map(p => ({
                  id: p.id,
                  title: p.id === 'compatible' ? 'Compatible MP4' : 'Lossless archive',
                  detail: p.id === 'compatible' ? 'Plays everywhere. H.264 compression usually weakens the perturbation and breaks the pixel budget.' : 'Exact budget, verified. Large .mkv file; no in-browser preview.',
                }))} />
              <OptionGroup legend="Temporal consistency" value={mode} onChange={x => setMode(x as typeof mode)}
                options={[{ id: 'static', title: 'Fixed overlay', detail: 'Default. Same perturbation on every frame of a segment.' },
                          { id: 'flow', title: 'Follow motion (experimental)', detail: 'Moves the perturbation with the content. Not shown to help in tests.', disabled: !flowOk }]} />
              <button type="button" className="btn-primary" disabled={!consented || !ready}
                onClick={() => void start(signal => createVideoJob(file, { strength, outputProfile: profile, temporalMode: mode }, signal))}>
                Process video
              </button>
            </div>
          )}

          {busy && <ProgressPanel status={state.status} uploading={state.phase === 'uploading'} onCancel={() => void cancel()} />}
          {state.phase === 'cancelled' && <p className="text-xs text-neutral-600">Processing was cancelled and the server copy was removed.</p>}
          {state.error && <ErrorNote message={state.error} />}

          {originalUrl && (
            <CompareView kind="video" originalUrl={originalUrl}
              protectedUrl={state.phase === 'succeeded' && profile === 'compatible' ? state.outputUrl : null}
              protectedNote={state.phase === 'succeeded' ? 'The lossless .mkv file cannot be previewed in the browser. Download it to view it in a media player.' : 'The processed video appears here when processing finishes.'} />
          )}

          {state.phase === 'succeeded' && state.outputUrl && (
            <div className="space-y-4">
              {o.budget_satisfied_after_encoding === false && (
                <ErrorNote message="The pixel-change budget is NOT satisfied in this file: video compression changed pixels more than the budget allows. Choose the lossless output to keep it exact." />
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Frames / scenes / keyframes" value={`${frames.count} / ${frames.scene_count} / ${frames.keyframes}`} />
                <Stat label="Budget met after encoding" value={o.budget_satisfied_after_encoding ? 'Yes (verified)' : 'No'} />
                <Stat label="Largest change" value={`${o.max_change_vs_original_after_encoding} of ±${o.budget_integer_levels}`} />
                <Stat label="Flicker (lower = steadier)" value={tc.flicker_excess_within_segment ?? '—'} />
                <Stat label="Audio" value={rec.audio?.present ? 'Preserved' : 'None in input'} />
                <Stat label="Audio/video sync" value={rec.validation?.audio_video_sync_ok ? 'Verified' : rec.audio?.present ? 'Not verified' : '—'} />
                <Stat label="Output size" value={formatBytes(Number(o.bytes ?? 0))} />
                <Stat label="Protection effectiveness" value="Not measured" />
              </div>
              {rec.audio?.handling && <p className="text-[11px] text-neutral-500">{String(rec.audio.handling)}.</p>}
              <div className="flex flex-wrap gap-2">
                <a href={state.outputUrl} download={`${file.name.replace(/\.[^.]+$/, '')}-shielded${profile === 'compatible' ? '.mp4' : '.mkv'}`} className="btn-primary text-xs py-2 px-4 space-x-1.5">
                  <Download className="w-3.5 h-3.5" aria-hidden="true" /><span>Download processed video</span>
                </a>
                <button type="button" className="btn-secondary text-xs py-2 px-4 space-x-1.5" onClick={() => { void remove(); }}>
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /><span>Delete from server</span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">Original container metadata (title, location, etc.) is not copied to the output.</p>
            </div>
          )}
        </div>
      )}
      {fileError && <ErrorNote message={fileError} />}
    </div>
  );
};
