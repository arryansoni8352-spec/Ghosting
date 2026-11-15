import React from 'react';
import { Server } from 'lucide-react';
import type { ShieldCapabilities } from '../../lib/shieldTypes';

interface Props {
  caps: ShieldCapabilities | null;
  accepted: boolean;
  onChange: (v: boolean) => void;
}

const ttlText = (s: number): string => (s >= 3600 ? `${Math.round(s / 360) / 10} hour(s)` : `${Math.round(s / 60)} minute(s)`);

/** Disclosure shown BEFORE any upload. Every number comes from the server's /capabilities, not from this file. */
export const ConsentPanel: React.FC<Props> = ({ caps, accepted, onChange }) => (
  <section aria-labelledby="shield-disclosure" className="ghost-card p-5 space-y-3">
    <h2 id="shield-disclosure" className="flex items-center space-x-2 text-sm font-bold text-neutral-900">
      <Server className="w-4 h-4" aria-hidden="true" />
      <span>This feature uploads your file to a server</span>
    </h2>
    <p className="text-xs text-neutral-600 leading-relaxed">
      Unlike GHOSTING’s photo and video privacy tools, which run entirely in your browser, AI Shield cannot run on your device.
      Your file is transmitted over HTTPS to GHOSTING’s processing server.
    </p>
    <ul className="text-xs text-neutral-600 space-y-1.5 list-disc pl-5 leading-relaxed">
      <li>While a job runs, your file is held in the server’s memory and temporary storage.</li>
      <li>
        The result is kept for {caps ? ttlText(caps.retention.job_ttl_seconds) : 'a limited time'} after processing, then deleted automatically.
        You can delete it sooner with the “Delete from server” button.
      </li>
      <li>
        Third-party services: {caps && caps.third_party_services.length === 0 ? 'none are used by the application' : 'see the Privacy Policy'}.
        The hosting provider may log request metadata such as IP addresses.
      </li>
      <li>{caps?.logging ?? 'The server logs errors and job outcomes. It does not log file names or file contents.'}</li>
      <li>Only you can access your job: access requires a secret token that stays in this browser tab.</li>
    </ul>
    <label className="flex items-start space-x-2 text-xs text-neutral-900 cursor-pointer pt-1">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-neutral-900" checked={accepted} onChange={e => onChange(e.target.checked)} />
      <span>I understand that my file will be uploaded to GHOSTING’s processing server.</span>
    </label>
  </section>
);
