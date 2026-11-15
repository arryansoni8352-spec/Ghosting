/**
 * Basic client-side checks so obvious mistakes fail fast. The BACKEND re-validates everything from the
 * file's bytes; nothing here is a security control.
 */
import type { ShieldCapabilities } from './shieldTypes';

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

const fail = (message: string): ValidationResult => ({ ok: false, message });
const startsWith = (b: Uint8Array, sig: number[], offset = 0): boolean => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, start: number, len: number): string => String.fromCharCode(...Array.from(b.slice(start, start + len)));

/** True only when the WebP bitstream is VP8L (lossless). Looks at the first chunk(s) of the RIFF container. */
export function isLosslessWebp(head: Uint8Array): boolean {
  let pos = 12;
  while (pos + 8 <= head.length) {
    const fourcc = ascii(head, pos, 4);
    const size = head[pos + 4] | (head[pos + 5] << 8) | (head[pos + 6] << 16) | (head[pos + 7] << 24);
    if (fourcc === 'VP8L') return true;
    if (fourcc === 'VP8 ') return false;
    pos += 8 + size + (size & 1);
  }
  return false;
}

export async function validateImageFile(file: File, caps: ShieldCapabilities | null): Promise<ValidationResult> {
  const maxMb = caps?.image.limits.max_upload_mb ?? 15;
  if (file.size === 0) return fail('The file is empty.');
  if (file.size > maxMb * 1024 * 1024) return fail(`The file is larger than the ${maxMb} MB limit.`);
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return fail('JPEG is not supported. Image Shield accepts PNG and lossless WebP only, because it can only guarantee its perturbation budget on lossless files.');
  }
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true };
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') {
    return isLosslessWebp(head) ? { ok: true } : fail('This WebP is lossy. Use PNG or lossless WebP.');
  }
  return fail('Unsupported file. Choose a PNG or lossless WebP image.');
}

export async function validateVideoFile(file: File, caps: ShieldCapabilities | null): Promise<ValidationResult> {
  const maxMb = caps?.video.limits.max_upload_mb ?? 50;
  if (file.size === 0) return fail('The file is empty.');
  if (file.size > maxMb * 1024 * 1024) return fail(`The file is larger than the ${maxMb} MB limit.`);
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const isMp4 = ascii(head, 4, 4) === 'ftyp';
  const isWebm = startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]);
  if (!isMp4 && !isWebm) return fail('Unsupported file. Choose an MP4/MOV (H.264) or WebM (VP8/VP9) video.');
  return { ok: true };
}

export const formatBytes = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export const STAGE_LABELS: Record<string, string> = {
  queued: 'Waiting in queue',
  starting: 'Starting',
  selecting_target: 'Selecting target style',
  style_transfer: 'Computing style target',
  cloaking: 'Optimising perturbation',
  quantising: 'Applying exact pixel budget',
  encoding: 'Encoding output',
  verifying: 'Verifying output',
  done: 'Done',
  probing: 'Inspecting video',
  extracting_frames: 'Extracting frames',
  detecting_scenes: 'Detecting scene changes',
  propagating: 'Applying perturbation across frames',
  validating: 'Validating exported video',
  completed: 'Completed',
};

export function stageLabel(stage: string): string {
  const key = /^protecting_keyframe_(\d+)_of_(\d+)$/.exec(stage);
  if (key) return `Protecting keyframe ${key[1]} of ${key[2]}`;
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ');
}
