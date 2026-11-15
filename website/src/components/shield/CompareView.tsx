import React, { useState } from 'react';

interface Props {
  kind: 'image' | 'video';
  originalUrl: string;
  protectedUrl: string | null;
  protectedNote?: string;
}

/** Original vs processed. Images: draggable split. Videos: two players side by side. */
export const CompareView: React.FC<Props> = ({ kind, originalUrl, protectedUrl, protectedNote }) => {
  const [split, setSplit] = useState(50);
  if (kind === 'video') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <figure className="space-y-1.5">
          <video src={originalUrl} controls muted playsInline className="w-full rounded-xl bg-neutral-900" aria-label="Original video" />
          <figcaption className="text-[11px] text-neutral-500">Original</figcaption>
        </figure>
        <figure className="space-y-1.5">
          {protectedUrl ? (
            <video src={protectedUrl} controls muted playsInline className="w-full rounded-xl bg-neutral-900" aria-label="Processed video" />
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-xs text-neutral-500">{protectedNote ?? 'No preview available.'}</div>
          )}
          <figcaption className="text-[11px] text-neutral-500">Processed (experimental)</figcaption>
        </figure>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 select-none">
        <img src={originalUrl} alt="Original" className="block w-full h-auto" draggable={false} />
        {protectedUrl && (
          <img src={protectedUrl} alt="Protected" className="absolute inset-0 w-full h-full object-contain" draggable={false}
            style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
        )}
        {protectedUrl && <div className="absolute inset-y-0 w-px bg-white shadow" style={{ left: `${split}%` }} aria-hidden="true" />}
      </div>
      {protectedUrl && (
        <div className="flex items-center space-x-3 text-[11px] text-neutral-500">
          <span>Original</span>
          <input type="range" min={0} max={100} value={split} onChange={e => setSplit(Number(e.target.value))} className="flex-1 accent-neutral-900" aria-label="Comparison position between original and protected" />
          <span>Protected</span>
        </div>
      )}
      <p className="text-[11px] text-neutral-500">The perturbation is intentionally small; differences are hard to see by eye.</p>
    </div>
  );
};
