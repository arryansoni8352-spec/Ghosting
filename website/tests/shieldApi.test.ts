import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE = 'https://shield.test';

async function load(url: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_SHIELD_API_URL', url ?? '');
  return import('../src/lib/shieldApi');
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('shieldApi', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); sessionStorage.clear(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('is disabled and never touches the network without a configured URL', async () => {
    const api = await load(undefined);
    expect(api.isShieldConfigured()).toBe(false);
    await expect(api.getCapabilities()).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the job token and access key as headers, never in the URL, and omits cookies', async () => {
    const api = await load(BASE + '/');
    api.setAccessKey('k-123');
    fetchMock.mockResolvedValue(json({ job_id: 'j', state: 'queued' }));
    await api.getJob('job-1', 'tok-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/jobs/job-1`);
    expect(String(url)).not.toContain('tok-1');
    expect(init.headers).toMatchObject({ 'X-Job-Token': 'tok-1', 'X-API-Key': 'k-123' });
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
  });

  it('uploads image options exactly as the backend expects', async () => {
    const api = await load(BASE);
    fetchMock.mockResolvedValue(json({ job_id: 'j', owner_token: 't', state: 'queued' }, 202));
    await api.createImageJob(new File([new Uint8Array(4)], 'a.png'), { strength: 'low', outputFormat: 'webp' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/engines/style_shield/jobs`);
    const form = init.body as FormData;
    expect(form.get('strength')).toBe('low');
    expect(form.get('output_format')).toBe('webp');
    expect(form.get('webp_lossless')).toBe('true');
  });

  it('uploads video options exactly as the backend expects', async () => {
    const api = await load(BASE);
    fetchMock.mockResolvedValue(json({ job_id: 'j', owner_token: 't', state: 'queued' }, 202));
    await api.createVideoJob(new File([new Uint8Array(4)], 'a.mp4'), { strength: 'low', outputProfile: 'lossless', temporalMode: 'static' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/video/jobs`);
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect([form.get('output_profile'), form.get('temporal_mode')]).toEqual(['lossless', 'static']);
  });

  it('turns server errors into readable messages', async () => {
    const api = await load(BASE);
    fetchMock.mockResolvedValue(json({ error: 'unsupported_image', message: 'JPEG uploads are not supported.' }, 400));
    await expect(api.createImageJob(new File([new Uint8Array(1)], 'a.png'), { strength: 'low', outputFormat: 'png' }))
      .rejects.toMatchObject({ code: 'unsupported_image', status: 400, message: 'JPEG uploads are not supported.' });
    fetchMock.mockResolvedValue(json({ error: 'rate_limited', message: 'x' }, 429, { 'Retry-After': '7' }));
    await expect(api.getCapabilities()).rejects.toThrow(/7 s/);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.getCapabilities()).rejects.toMatchObject({ code: 'network_error' });
  });

  it('fetches output as a blob with the token and reads the filename', async () => {
    const api = await load(BASE);
    fetchMock.mockResolvedValue(new Response(new Blob(['x']), { status: 200, headers: { 'Content-Disposition': 'attachment; filename="protected-ab12.png"' } }));
    const { blob, filename } = await api.getOutput('j', 'tok');
    expect(blob.size).toBe(1);
    expect(filename).toBe('protected-ab12.png');
    expect(fetchMock.mock.calls[0][1].headers['X-Job-Token']).toBe('tok');
  });

  it('keeps the access key in sessionStorage only', async () => {
    const api = await load(BASE);
    api.setAccessKey('abc');
    expect(sessionStorage.getItem('ghosting.shield.accessKey')).toBe('abc');
    expect(localStorage.length).toBe(0);
    api.setAccessKey('');
    expect(api.getAccessKey()).toBe('');
  });
});
