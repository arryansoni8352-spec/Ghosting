export interface ReleaseAsset {
  name: string;
  size: number;
  browserDownloadUrl: string;
  downloadCount: number;
  sha256?: string;
  targetOs?: 'Windows' | 'macOS' | 'Linux' | 'Other';
}

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string;
  publishedAt: string;
  body: string;
  htmlUrl: string;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

export interface ReleasesResponse {
  releases: GitHubRelease[];
  hasVerifiedReleases: boolean;
  isLoading: boolean;
  error?: string;
}

const REPO_OWNER = 'arryansoni8352-spec';
const REPO_NAME = 'veilguard';
const RELEASES_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`;

/**
 * Fetches verified releases from the official GitHub Releases API.
 */
export async function fetchGitHubReleases(): Promise<{ releases: GitHubRelease[]; error?: string }> {
  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { releases: [] };
      }
      if (response.status === 403) {
        return {
          releases: [],
          error: 'GitHub API rate limit exceeded. Please check releases directly on the GitHub repository.',
        };
      }
      return {
        releases: [],
        error: `GitHub API returned status ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return { releases: [] };
    }

    const releases: GitHubRelease[] = data.map((item: any) => {
      // Parse SHA-256 checksums from release notes body if present (e.g. SHA-256: [hash])
      const body = typeof item.body === 'string' ? item.body : '';

      const assets: ReleaseAsset[] = Array.isArray(item.assets)
        ? item.assets.map((asset: any) => {
            const name = String(asset.name || '');
            let targetOs: ReleaseAsset['targetOs'] = 'Other';
            if (/\.(exe|msi)$/i.test(name) || /win/i.test(name)) targetOs = 'Windows';
            else if (/\.(dmg|pkg)$/i.test(name) || /mac|darwin/i.test(name)) targetOs = 'macOS';
            else if (/\.(AppImage|deb|rpm|tar\.gz)$/i.test(name) || /linux/i.test(name)) targetOs = 'Linux';

            // Attempt to locate a checksum corresponding to this asset in the body
            let sha256: string | undefined;
            const checksumMatch = new RegExp(`${name}[^\\n]*?([a-fA-F0-9]{64})`, 'i').exec(body);
            if (checksumMatch) {
              sha256 = checksumMatch[1];
            }

            return {
              name,
              size: Number(asset.size) || 0,
              browserDownloadUrl: String(asset.browser_download_url || ''),
              downloadCount: Number(asset.download_count) || 0,
              sha256,
              targetOs,
            };
          })
        : [];

      return {
        id: Number(item.id),
        tagName: String(item.tag_name || ''),
        name: String(item.name || item.tag_name || 'Release'),
        publishedAt: String(item.published_at || ''),
        body,
        htmlUrl: String(item.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`),
        prerelease: Boolean(item.prerelease),
        assets,
      };
    });

    return { releases };
  } catch (err) {
    return {
      releases: [],
      error: err instanceof Error ? err.message : 'Network error connecting to GitHub API.',
    };
  }
}
