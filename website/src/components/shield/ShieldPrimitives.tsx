import React, { useCallback, useId, useRef, useState } from 'react';
import { AlertTriangle, FlaskConical, Loader2, Upload } from 'lucide-react';
import type { JobStatus } from '../../lib/shieldTypes';
import { stageLabel } from '../../lib/shieldValidation';

export const EXPERIMENTAL_TEXT = 'Experimental — protection effectiveness has not yet been independently validated.';

export const ExperimentalBanner: React.FC<{ extra?: string }> = ({ extra }) => (
  <div role="note" className="flex items-start space-x-3 rounded-xl border border-mint-300 bg-mint-50 px-4 py-3 text-xs text-neutral-700">
    <FlaskConical className="w-4 h-4 mt-0.5 flex-shrink-0 text-mint-700" aria-hidden="true" />
    <div className="space-y-1">
      <p className="font-semibold text-neutral-900">{EXPERIMENTAL_TEXT}</p>
      <p className="text-neutral-600 leading-relaxed">
        This tool does not guarantee protection, does not prevent AI training or style imitation, and has not been shown to
        resist any specific model. {extra}
      </p>
    </div>
  </div>
);

export const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="flex items-start space-x-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-xs text-neutral-800">
    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

interface DropZoneProps {
  accept: string;
  label: string;
  hint: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({ accept, label, hint, disabled, onFile }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();
  const take = useCallback((files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  }, [onFile]);
  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files); }}
      className={`rounded-2xl border border-dashed px-6 py-10 text-center transition-colors ${
        disabled ? 'border-neutral-200 bg-neutral-50 opacity-60' : over ? 'border-mint-500 bg-mint-50' : 'border-neutral-300 bg-white hover:border-neutral-400'
      }`}
    >
      <Upload className="w-6 h-6 mx-auto text-neutral-500" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-neutral-900">{label}</p>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
      <input id={id} ref={inputRef} type="file" accept={accept} className="sr-only" disabled={disabled}
        onChange={e => { take(e.target.files); e.target.value = ''; }} />
      <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="btn-secondary mt-4 text-xs py-2 px-4">
        Choose file
      </button>
    </div>
  );
};

export const ProgressPanel: React.FC<{ status: JobStatus | null; uploading: boolean; onCancel: () => void }> = ({ status, uploading, onCancel }) => {
  const pct = Math.round((status?.progress ?? 0) * 100);
  const label = uploading ? 'Uploading to the processing server' : status ? stageLabel(status.stage) : 'Starting';
  return (
    <div className="ghost-panel p-5 space-y-3" aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center space-x-2 font-medium text-neutral-900">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>{label}</span>
        </span>
        <span className="font-mono text-neutral-500">{uploading ? '—' : `${pct}%`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploading ? undefined : pct} aria-label="Processing progress">
        <div className="h-full bg-mint-500 transition-all duration-500 ease-out" style={{ width: uploading ? '4%' : `${Math.max(pct, 2)}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <span>Status: {status?.state ?? 'uploading'} — reported by the server, not estimated.</span>
        <button type="button" onClick={onCancel} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
      </div>
    </div>
  );
};

export const OptionGroup: React.FC<{
  legend: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; title: string; detail: string; disabled?: boolean }[];
  disabled?: boolean;
}> = ({ legend, value, onChange, options, disabled }) => (
  <fieldset className="space-y-2" disabled={disabled}>
    <legend className="text-xs font-semibold text-neutral-900 mb-1">{legend}</legend>
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map(o => (
        <label key={o.id} className={`rounded-xl border px-3 py-2.5 text-xs cursor-pointer transition-colors ${
          o.disabled ? 'opacity-50 cursor-not-allowed border-neutral-200' : value === o.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
        }`}>
          <input type="radio" name={legend} className="sr-only" checked={value === o.id} disabled={o.disabled || disabled} onChange={() => onChange(o.id)} />
          <span className="block font-semibold text-neutral-900">{o.title}</span>
          <span className="block mt-0.5 text-neutral-500 leading-snug">{o.detail}</span>
        </label>
      ))}
    </div>
  </fieldset>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
    <div className="text-xs font-semibold text-neutral-900 mt-0.5 break-words">{value}</div>
  </div>
);
