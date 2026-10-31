import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGitHubReleases } from '../src/utils/githubReleases';

describe('GitHub Releases API Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles empty release response correctly (current true repository state)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as any);

    const result = await fetchGitHubReleases();
    expect(result.releases).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('handles 404 response cleanly without throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as any);

    const result = await fetchGitHubReleases();
    expect(result.releases).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('handles 403 rate limit error with informative message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as any);

    const result = await fetchGitHubReleases();
    expect(result.releases).toEqual([]);
    expect(result.error).toContain('rate limit exceeded');
  });

  it('correctly maps published release assets, OS tags, and parses SHA-256 checksums', async () => {
    const mockApiResponse = [
      {
        id: 101,
        tag_name: 'v0.1.0-rc1',
        name: 'VeilGuard v0.1.0-rc1',
        published_at: '2026-10-31T00:00:00Z',
        body: 'Release candidate\nVeilGuard-Setup-0.1.0.exe SHA-256: C1D7CB40EA461F3DB60C4AD00625FEE9F2F25FF2605D7003352023AF93506CE0',
        html_url: 'https://github.com/arryansoni8352-spec/veilguard/releases/tag/v0.1.0-rc1',
        prerelease: true,
        assets: [
          {
            name: 'VeilGuard-Setup-0.1.0.exe',
            size: 88080384,
            browser_download_url: 'https://github.com/releases/download/VeilGuard-Setup-0.1.0.exe',
            download_count: 42,
          },
          {
            name: 'VeilGuard-0.1.0.AppImage',
            size: 90000000,
            browser_download_url: 'https://github.com/releases/download/VeilGuard-0.1.0.AppImage',
            download_count: 15,
          },
        ],
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    } as any);

    const result = await fetchGitHubReleases();
    expect(result.releases.length).toBe(1);

    const rel = result.releases[0];
    expect(rel.tagName).toBe('v0.1.0-rc1');
    expect(rel.prerelease).toBe(true);
    expect(rel.assets.length).toBe(2);

    const winAsset = rel.assets[0];
    expect(winAsset.name).toBe('VeilGuard-Setup-0.1.0.exe');
    expect(winAsset.targetOs).toBe('Windows');
    expect(winAsset.sha256).toBe('C1D7CB40EA461F3DB60C4AD00625FEE9F2F25FF2605D7003352023AF93506CE0');

    const linuxAsset = rel.assets[1];
    expect(linuxAsset.targetOs).toBe('Linux');
  });
});
