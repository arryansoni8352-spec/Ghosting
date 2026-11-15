import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const BASE = 'https://shield.test';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3, 4]);

const CAPS = {
  service: { name: 'ghosting-shield', version: '0.1.0' },
  experimental_notice: 'Experimental — protection effectiveness has not yet been independently validated.',
  access: { auth_mode: 'open', access_key_required: false },
  image: { ready: true, readiness: { ready: true, code: 'ready', message: 'ok' },
    presets: [{ id: 'low', epsilon: 0.0157, integer_budget_levels: 4, steps: 80 }, { id: 'balanced', epsilon: 0.031, integer_budget_levels: 8, steps: 120 }, { id: 'high', epsilon: 0.0627, integer_budget_levels: 16, steps: 160 }],
    input_formats: ['png'], output_formats: ['png'], limits: { max_upload_mb: 15, max_pixels: 262144, min_side_px: 32 } },
  video: { enabled: true, ready: true, ffmpeg_available: true, optical_flow_available: true, containers: ['mp4/mov'], video_codecs: ['h264'], audio_codecs: ['aac'],
    output_profiles: [{ id: 'compatible', container: 'mp4', codec: 'h264', lossless: false, note: '' }, { id: 'lossless', container: 'mkv', codec: 'ffv1', lossless: true, note: '' }],
    temporal_modes: [{ id: 'flow', available: true }, { id: 'static', available: true }],
    limits: { max_upload_mb: 50, max_duration_seconds: 10, max_pixels: 262144, max_fps: 30, max_frames: 300, max_protected_keyframes: 4 }, audio: 'First audio stream is preserved.' },
  retention: { job_ttl_seconds: 3600, statement: 's', deletion: 'd' },
  logging: 'The application logs errors and job outcomes. It does not log file names.',
  third_party_services: [], single_worker_notice: '',
};

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

async function mountPage() {
  vi.resetModules();
  vi.stubEnv('VITE_SHIELD_API_URL', BASE);
  const { AIShieldPage } = await import('../src/pages/AIShieldPage');
  return render(<AIShieldPage onNavigate={() => undefined} />);
}

describe('AI Shield page', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); sessionStorage.clear(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('is honest when no backend is configured and makes no network calls', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SHIELD_API_URL', '');
    const { AIShieldPage } = await import('../src/pages/AIShieldPage');
    render(<AIShieldPage onNavigate={() => undefined} />);
    expect(screen.getByText(/AI Shield is not enabled on this deployment/)).toBeInTheDocument();
    expect(screen.getByText(/Experimental — protection effectiveness has not yet been independently validated\./)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the upload disclosure and keeps uploads disabled until the user agrees', async () => {
    fetchMock.mockResolvedValue(json(CAPS));
    await mountPage();
    expect(await screen.findByText(/This feature uploads your file to a server/)).toBeInTheDocument();
    expect(screen.getByText(/cannot run on your device/)).toBeInTheDocument();
    expect(screen.getByText(/deleted automatically/)).toBeInTheDocument();
    expect(screen.getByText(/1 hour\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/none are used by the application/)).toBeInTheDocument();
    const choose = screen.getByRole('button', { name: 'Choose file' });
    expect(choose).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(choose).not.toBeDisabled();
    expect(screen.queryByText(/never leave your device/i)).not.toBeInTheDocument();
  });

  it('shows the engine-unavailable reason instead of pretending to work', async () => {
    fetchMock.mockResolvedValue(json({ ...CAPS, image: { ...CAPS.image, ready: false, readiness: { ready: false, code: 'model_not_installed', message: 'Model weights are not installed on this server.' } } }));
    await mountPage();
    expect(await screen.findByText(/Image Shield is unavailable: Model weights are not installed/)).toBeInTheDocument();
  });

  it('reports a server that cannot be reached and offers a retry', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await mountPage();
    expect(await screen.findByText(/Could not reach the AI Shield server/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('runs an image job end to end using only server-reported status', async () => {
    let polls = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/capabilities')) return json(CAPS);
      if (u.endsWith('/engines/style_shield/jobs') && init?.method === 'POST') return json({ job_id: 'J1', owner_token: 'TOK', state: 'queued' }, 202);
      if (u.endsWith('/jobs/J1') && (!init?.method || init.method === 'GET')) {
        polls++;
        const done = polls > 1;
        return json({ job_id: 'J1', engine: 'style_shield', kind: 'image', state: done ? 'succeeded' : 'running', stage: done ? 'completed' : 'cloaking', progress: done ? 1 : 0.4,
          created_at: 0, started_at: 0, finished_at: null, expires_at: null, error: null, output_available: done });
      }
      if (u.endsWith('/jobs/J1/record')) return json({ effectiveness: null, output: { budget_integer_levels: 8, max_change_after_encoding: 7, budget_satisfied_after_encoding: true } });
      if (u.endsWith('/jobs/J1/output')) return new Response(new Blob(['png']), { status: 200, headers: { 'Content-Disposition': 'attachment; filename="protected-x.png"' } });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return json({}, 404);
    });
    await mountPage();
    await screen.findByText(/This feature uploads your file/);
    fireEvent.click(screen.getByRole('checkbox'));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([PNG], 'art.png', { type: 'image/png' })] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Protect image' }));

    await waitFor(() => expect(screen.getByText('Optimising perturbation')).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');

    expect(await screen.findByText('Download protected image', {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getByText('±8 / 255')).toBeInTheDocument();
    expect(screen.getByText('Not measured')).toBeInTheDocument();

    const create = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/engines/style_shield/jobs'))!;
    expect((create[1].body as FormData).get('strength')).toBe('balanced');
    const statusCall = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/jobs/J1'))!;
    expect(statusCall[1].headers['X-Job-Token']).toBe('TOK');

    fireEvent.click(screen.getByRole('button', { name: /Delete from server/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(c => c[1]?.method === 'DELETE' && String(c[0]).endsWith('/jobs/J1'))).toBe(true));
  }, 15000);

  it('rejects a JPEG before uploading anything', async () => {
    fetchMock.mockResolvedValue(json(CAPS));
    await mountPage();
    await screen.findByText(/This feature uploads your file/);
    fireEvent.click(screen.getByRole('checkbox'));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], 'p.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByText(/JPEG is not supported/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(c => !String(c[0]).includes('/jobs'))).toBe(true);
  });

  it('surfaces a server-side failure message and lets the user retry', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/capabilities')) return json(CAPS);
      if (init?.method === 'POST') return json({ error: 'server_busy', message: 'The server is busy. Try again later.' }, 503);
      return json({}, 404);
    });
    await mountPage();
    await screen.findByText(/This feature uploads your file/);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [new File([PNG], 'a.png')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Protect image' }));
    expect(await screen.findByText('The server is busy. Try again later.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Protect image' })).toBeInTheDocument();
  });

  it('video tab states its limits and that video protection is unvalidated', async () => {
    fetchMock.mockResolvedValue(json(CAPS));
    await mountPage();
    await screen.findByText(/This feature uploads your file/);
    fireEvent.click(screen.getByRole('tab', { name: /Video Shield/ }));
    expect(screen.getByText(/Video protection has not been validated/)).toBeInTheDocument();
    expect(screen.getByText(/10 s/)).toBeInTheDocument();
    expect(screen.getByText(/First audio stream is preserved/)).toBeInTheDocument();
  });
});

describe('navigation and legal copy', () => {
  it('adds an AI Shield nav entry that routes to the page', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SHIELD_API_URL', '');
    window.location.hash = '#/ai-shield';
    const { App } = await import('../src/App');
    render(<App />);
    expect(within(screen.getByRole('navigation', { name: 'Main Navigation' })).getByRole('button', { name: 'AI Shield' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'GHOSTING AI Shield' })).toBeInTheDocument();
    window.location.hash = '';
  });

  it('privacy policy has a separate AI Shield section and no unqualified "never uploaded" claim', async () => {
    const { PrivacyPolicyPage } = await import('../src/pages/PrivacyPolicyPage');
    render(<PrivacyPolicyPage onNavigate={() => undefined} />);
    expect(screen.getByText(/AI Shield \(experimental\): files ARE uploaded/)).toBeInTheDocument();
    expect(screen.getByText(/does not change how the photo tools, the Video Studio or the\s+VeilGuard desktop application work/)).toBeInTheDocument();
    expect(screen.getByText(/one exception: see below/)).toBeInTheDocument();
  });
});
