/** Types for the GHOSTING AI Shield backend API (see docs/ai-shield/GHOSTING_AI_SHIELD_API.md). */

export interface ShieldPreset {
  id: 'low' | 'balanced' | 'high';
  epsilon: number;
  integer_budget_levels: number;
  steps: number;
}

export interface ShieldCapabilities {
  service: { name: string; version: string };
  experimental_notice: string;
  access: { auth_mode: string; access_key_required: boolean };
  image: {
    ready: boolean;
    readiness: { ready: boolean; code: string; message: string };
    presets: ShieldPreset[];
    input_formats: string[];
    output_formats: string[];
    limits: { max_upload_mb: number; max_pixels: number; min_side_px: number };
  };
  video: {
    enabled: boolean;
    ready: boolean;
    ffmpeg_available: boolean;
    optical_flow_available: boolean;
    containers: string[];
    video_codecs: string[];
    audio_codecs: string[];
    output_profiles: { id: 'compatible' | 'lossless'; container: string; codec: string; lossless: boolean; note: string }[];
    temporal_modes: { id: 'flow' | 'static'; available: boolean }[];
    limits: {
      max_upload_mb: number;
      max_duration_seconds: number;
      max_pixels: number;
      max_fps: number;
      max_frames: number;
      max_protected_keyframes: number;
    };
    audio: string;
  };
  retention: { job_ttl_seconds: number; statement: string; deletion: string };
  logging: string;
  third_party_services: string[];
  single_worker_notice: string;
}

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';

export interface JobStatus {
  job_id: string;
  engine: string;
  kind: 'image' | 'video';
  state: JobState;
  stage: string;
  progress: number;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  expires_at: number | null;
  error: { code: string; message: string } | null;
  output_available: boolean;
}

export interface JobCreated {
  job_id: string;
  owner_token: string;
  state: JobState;
  input?: VideoInputInfo;
}

export interface VideoInputInfo {
  container: string;
  video_codec: string;
  width: number;
  height: number;
  rotation_applied: number;
  frame_rate: number;
  variable_frame_rate: boolean;
  duration_seconds: number;
  estimated_frames: number;
  audio: { codec: string; channels: number | null; sample_rate: number | null } | null;
  notes: string[];
}

/** The protection record. Only the fields the UI shows are typed; everything else is passed through. */
export interface ProtectionRecord {
  effectiveness: null;
  output: Record<string, unknown>;
  [key: string]: unknown;
}

export const TERMINAL_STATES: JobState[] = ['succeeded', 'failed', 'cancelled', 'timed_out'];
