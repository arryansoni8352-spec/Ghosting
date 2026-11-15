/**
 * Client for the separately hosted GHOSTING AI Shield backend.
 *
 * - The backend URL comes from VITE_SHIELD_API_URL at build time. No URL = the feature is disabled.
 * - No secrets live here. The optional access key is typed by the user and kept in sessionStorage only.
 * - Each job has an owner token (issued once by the server) sent as X-Job-Token. It is kept in memory.
 */
import type { JobCreated, JobStatus, ProtectionRecord, ShieldCapabilities } from './shieldTypes';

export const SHIELD_API_URL: string = ((import.meta.env.VITE_SHIELD_API_URL as string | undefined) ?? '').replace(/\/+$/, '');
export const isShieldConfigured = (): boolean => SHIELD_API_URL.length > 0;

const ACCESS_KEY_STORAGE = 'ghosting.shield.accessKey';

export class ShieldApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ShieldApiError';
    this.code = code;
    this.status = status;
  }
}

export function getAccessKey(): string {
  try {
    return sessionStorage.getItem(ACCESS_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setAccessKey(key: string): void {
  try {
    if (key) sessionStorage.setItem(ACCESS_KEY_STORAGE, key);
    else sessionStorage.removeItem(ACCESS_KEY_STORAGE);
  } catch {
    /* storage unavailable: the key simply is not remembered */
  }
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {};
  const key = getAccessKey();
  if (key) h['X-API-Key'] = key;
  if (token) h['X-Job-Token'] = token;
  return h;
}

async function toError(res: Response): Promise<ShieldApiError> {
  let code = 'request_failed';
  let message = `The server returned an error (${res.status}).`;
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string') message = body.message;
    if (body && typeof body.error === 'string') code = body.error;
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 429) {
    const wait = res.headers.get('Retry-After');
    message = `Too many requests. ${wait ? `Try again in ${wait} s.` : 'Please wait a moment.'}`;
  }
  return new ShieldApiError(message, code, res.status);
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isShieldConfigured()) {
    throw new ShieldApiError('AI Shield is not configured for this deployment.', 'not_configured', 0);
  }
  let res: Response;
  try {
    res = await fetch(`${SHIELD_API_URL}${path}`, { ...init, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ShieldApiError('Could not reach the AI Shield server. Check your connection and try again.', 'network_error', 0);
  }
  if (!res.ok) throw await toError(res);
  return res;
}

export async function getCapabilities(signal?: AbortSignal): Promise<ShieldCapabilities> {
  const res = await call('/capabilities', { headers: headers(), signal });
  return (await res.json()) as ShieldCapabilities;
}

export interface ImageJobOptions {
  strength: 'low' | 'balanced' | 'high';
  outputFormat: 'png' | 'webp';
}

export async function createImageJob(file: File, opts: ImageJobOptions, signal?: AbortSignal): Promise<JobCreated> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('strength', opts.strength);
  form.append('output_format', opts.outputFormat);
  if (opts.outputFormat === 'webp') form.append('webp_lossless', 'true');
  const res = await call('/engines/style_shield/jobs', { method: 'POST', body: form, headers: headers(), signal });
  return (await res.json()) as JobCreated;
}

export interface VideoJobOptions {
  strength: 'low' | 'balanced' | 'high';
  outputProfile: 'compatible' | 'lossless';
  temporalMode: 'flow' | 'static';
}

export async function createVideoJob(file: File, opts: VideoJobOptions, signal?: AbortSignal): Promise<JobCreated> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('strength', opts.strength);
  form.append('output_profile', opts.outputProfile);
  form.append('temporal_mode', opts.temporalMode);
  const res = await call('/video/jobs', { method: 'POST', body: form, headers: headers(), signal });
  return (await res.json()) as JobCreated;
}

export async function getJob(jobId: string, token: string, signal?: AbortSignal): Promise<JobStatus> {
  const res = await call(`/jobs/${encodeURIComponent(jobId)}`, { headers: headers(token), signal });
  return (await res.json()) as JobStatus;
}

export async function getRecord(jobId: string, token: string): Promise<ProtectionRecord> {
  const res = await call(`/jobs/${encodeURIComponent(jobId)}/record`, { headers: headers(token) });
  return (await res.json()) as ProtectionRecord;
}

/** Output files are fetched with the token header, so they become a Blob (an <img>/<video> tag cannot send headers). */
export async function getOutput(jobId: string, token: string): Promise<{ blob: Blob; filename: string }> {
  const res = await call(`/jobs/${encodeURIComponent(jobId)}/output`, { headers: headers(token) });
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return { blob: await res.blob(), filename: match ? match[1] : 'ghosting-protected' };
}

export async function cancelJob(jobId: string, token: string): Promise<void> {
  await call(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', headers: headers(token) });
}

export async function deleteJob(jobId: string, token: string, keepalive = false): Promise<void> {
  await call(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE', headers: headers(token), keepalive });
}
