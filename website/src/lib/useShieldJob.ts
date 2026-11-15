import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelJob, deleteJob, getJob, getOutput, getRecord, ShieldApiError } from './shieldApi';
import type { JobCreated, JobStatus, ProtectionRecord } from './shieldTypes';
import { TERMINAL_STATES } from './shieldTypes';

export type Phase = 'idle' | 'uploading' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export interface ShieldJobState {
  phase: Phase;
  status: JobStatus | null;
  error: string | null;
  outputUrl: string | null;
  outputName: string;
  record: ProtectionRecord | null;
  created: JobCreated | null;
}

const INITIAL: ShieldJobState = { phase: 'idle', status: null, error: null, outputUrl: null, outputName: '', record: null, created: null };
const POLL_MS = 1000;
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

/**
 * Drives one protection job: create -> poll real status -> fetch output + record -> optional delete.
 * Progress shown to the user is exactly what the server reports; nothing is simulated.
 * The owner token lives only in a ref (memory). Leaving the page deletes the server copy (best effort).
 */
export function useShieldJob() {
  const [state, setState] = useState<ShieldJobState>(INITIAL);
  const tokenRef = useRef<{ id: string; token: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const runRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const revokeUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const finish = useCallback(async (status: JobStatus, run: number) => {
    const ref = tokenRef.current;
    if (!ref || run !== runRef.current) return;
    if (status.state === 'succeeded') {
      try {
        const [{ blob, filename }, record] = await Promise.all([getOutput(ref.id, ref.token), getRecord(ref.id, ref.token)]);
        if (run !== runRef.current) return;
        revokeUrl();
        urlRef.current = URL.createObjectURL(blob);
        setState(s => ({ ...s, phase: 'succeeded', status, outputUrl: urlRef.current, outputName: filename, record, error: null }));
      } catch (e) {
        setState(s => ({ ...s, phase: 'failed', status, error: e instanceof Error ? e.message : 'The result could not be downloaded.' }));
      }
      return;
    }
    const phase: Phase = status.state === 'cancelled' ? 'cancelled' : 'failed';
    const message = status.error?.message ?? (status.state === 'timed_out' ? 'Processing exceeded the time limit.' : 'Processing failed.');
    setState(s => ({ ...s, phase, status, error: phase === 'cancelled' ? null : message }));
  }, []);

  const poll = useCallback((run: number, errors = 0) => {
    timerRef.current = window.setTimeout(async () => {
      const ref = tokenRef.current;
      if (!ref || run !== runRef.current) return;
      try {
        const status = await getJob(ref.id, ref.token);
        if (run !== runRef.current) return;
        setState(s => ({ ...s, status }));
        if (TERMINAL_STATES.includes(status.state)) await finish(status, run);
        else poll(run, 0);
      } catch (e) {
        if (run !== runRef.current) return;
        const notFound = e instanceof ShieldApiError && e.status === 404;
        if (notFound || errors + 1 >= MAX_CONSECUTIVE_POLL_ERRORS) {
          setState(s => ({ ...s, phase: 'failed', error: notFound ? 'The job is no longer available on the server.' : 'Lost contact with the server.' }));
        } else poll(run, errors + 1);
      }
    }, POLL_MS);
  }, [finish]);

  const start = useCallback(async (create: (signal: AbortSignal) => Promise<JobCreated>) => {
    clearTimer();
    revokeUrl();
    const run = ++runRef.current;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setState({ ...INITIAL, phase: 'uploading' });
    try {
      const created = await create(abortRef.current.signal);
      if (run !== runRef.current) return;
      tokenRef.current = { id: created.job_id, token: created.owner_token };
      setState(s => ({ ...s, phase: 'processing', created }));
      poll(run);
    } catch (e) {
      if (run !== runRef.current) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setState({ ...INITIAL, phase: 'failed', error: e instanceof Error ? e.message : 'The upload failed.' });
    }
  }, [poll]);

  const cancel = useCallback(async () => {
    const ref = tokenRef.current;
    abortRef.current?.abort();
    if (!ref) return;
    try {
      await cancelJob(ref.id, ref.token);
    } catch {
      /* the poll loop will report the real outcome */
    }
  }, []);

  /** Deletes the job (input, output, record) from the server, then resets the UI. */
  const remove = useCallback(async () => {
    const ref = tokenRef.current;
    clearTimer();
    runRef.current++;
    revokeUrl();
    tokenRef.current = null;
    setState(INITIAL);
    if (ref) {
      try {
        await deleteJob(ref.id, ref.token);
      } catch {
        /* already gone or unreachable: the server expires it automatically */
      }
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    runRef.current++;
    revokeUrl();
    setState(INITIAL);
  }, []);

  useEffect(() => {
    const onHide = () => {
      const ref = tokenRef.current;
      if (ref) void deleteJob(ref.id, ref.token, true).catch(() => undefined);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      clearTimer();
      abortRef.current?.abort();
      revokeUrl();
      const ref = tokenRef.current;
      runRef.current++;
      if (ref) void deleteJob(ref.id, ref.token, true).catch(() => undefined);
    };
  }, []);

  return { state, start, cancel, remove, reset };
}
