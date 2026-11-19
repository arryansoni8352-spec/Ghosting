# Staging Hardening Report

**Branch:** `feature/ai-shield-staging`  
**Date:** 2026-11-15  
**Starting commit:** `777ad43` (pre-deployment verification docs)

---

## Starting git state

```
Branch:  feature/ai-shield-staging
Commits: 3 ahead of main (68e8c74)
Status:  clean working tree
main:    68e8c74ef4a4ad426cc34b67a5791a1170410ad5
```

Verified: no unrelated changes, no model weights, no secrets, desktop app untouched.

---

## Recovery ZIP integration

ZIP `GHOSTING_AI_SHIELD_RECOVERY.zip` verified against SHA-256
`0babd3ace5ad7ea4a224c3da80ca6aeb31cda6c7cfbd23f253b179ad3caccb7e` — exact match.

Comparison between ZIP `ai-shield-src/` and working tree:

| Area | Difference | Resolution |
|---|---|---|
| `shield-backend/app/config/settings.py` | Working tree has CORS wildcard validator; ZIP does not | Keep working-tree version (more advanced) |
| All other backend files | Identical | No action needed |
| All website files | Identical | No action needed |
| Recovery reports (7 `.md` files) | Present in ZIP only | Copied to `docs/ai-shield/RECOVERY_*.md` |

---

## Changes made

### D1 — Trusted proxy configuration (Medium)

**Problem:** `--forwarded-allow-ips *` in the Docker CMD trusted forwarded headers from all
sources, allowing any client to spoof the IP used for rate limiting and logging.

**Fix:** Replaced the CMD with an `ENTRYPOINT` (`docker-entrypoint.sh`) that:
- Reads `SHIELD_FORWARDED_ALLOW_IPS` from the environment.
- Explicitly rejects `*` and variations with an error message and non-zero exit.
- Passes no `--forwarded-allow-ips` flag when the variable is unset (safest default).
- Passes `--proxy-headers --forwarded-allow-ips <value>` only when a specific IP/CIDR is set.
- Always passes `--workers 1` and `--no-access-log`.

**Tests added:** `tests/infrastructure/test_entrypoint.py` — 9 tests covering wildcard
rejection, empty default, valid CIDR/IP, single-worker enforcement, no-access-log enforcement.

**Files changed:** `Dockerfile`, `docker-entrypoint.sh` (new), `docker-compose.yml`,
`.env.example`

### D5 — Docker Compose port binding

**Problem:** `8080:8080` bound the service port to all network interfaces, exposing it
directly to the public internet if no firewall was in place.

**Fix:** Changed to `127.0.0.1:8080:8080` in `docker-compose.yml`. The service is now
only reachable from the host's loopback interface; a reverse proxy connects to it locally.

### D6 — Health check start period (Low)

**Problem:** `start-period=40s` may be too short for JAX cold initialisation on a fresh host.

**Fix:** Raised to `start-period=90s` in the Dockerfile `HEALTHCHECK` directive.

### Vitest upgrade (Critical/High CVEs remediated)

**Problem:** vitest `^3.2.3` carried CVEs in `tinypool` (critical: prototype pollution → RCE),
`@vitest/mocker` (moderate: path traversal), and `picomatch` (high: ReDoS). The critical/moderate
CVEs were specific to vitest's worker pool and mock-redirect infrastructure — only triggerable
when running tests, never in the production bundle.

**Fix:**
- Upgraded `vitest` from `^3.2.3` to `^5.1.0` (installed: `5.1.0`).
- Upgraded `vite` from `^6.3.5` to `^6.4.6` (required by vitest 5).
- Updated `@testing-library/jest-dom` import in `tests/setup.ts` from generic to
  `@testing-library/jest-dom/vitest` (required by vitest 5's changed matcher typing).

**Result:** 2 critical CVEs and 1 moderate CVE resolved. 130 website tests still pass.
Build succeeds with and without `VITE_SHIELD_API_URL`.

**Remaining:** 12 high-severity advisories remain, all tracing to `picomatch` ReDoS
(GHSA-fc5q-39xc-vjpf) in build tools (vite, tailwindcss) and test tools (vitest).
Confirmed absent from production bundle (`dist/`). No patched `picomatch` release is
available yet. Applying `--force` would downgrade vite below the installed version.
Not applied. Documented in `DEPENDENCY_SECURITY_REPORT.md`.

### CORS wildcard validator (already in working tree from previous session)

`field_validator` on `cors_origins` in `settings.py` rejects `*` with a `ValidationError`.
Verified: `Settings(cors_origins='*')` raises, `Settings(cors_origins='https://ghosting.site')`
succeeds.

### Recovery reports integrated

7 reports from the recovery ZIP copied to `docs/ai-shield/RECOVERY_*.md` as supplementary
audit material.

### Licence request document

`docs/ai-shield/MOBILENETV1_LICENCE_REQUEST.md` — draft enquiry to `opensource@google.com`,
awaiting owner review before sending.

---

## Regression results

| Suite | Before hardening | After hardening |
|---|---|---|
| Backend offline | 209 passed | **218 passed** (+9 entrypoint tests) |
| Backend model tests | 42 not run | 42 not run (licence unresolved) |
| Website tests | 130 passed | **130 passed** |
| Build (no backend URL) | ✓ | **✓** CSP `connect-src 'none'` |
| Build (with backend URL) | ✓ | **✓** CSP `connect-src https://...` |

---

## Outstanding work

1. Docker build on a real host (Docker unavailable in sandbox) — see `DOCKER_STAGING_READINESS.md`.
2. MobileNetV1 licence — send `MOBILENETV1_LICENCE_REQUEST.md` or swap backbone.
3. 12 remaining picomatch ReDoS advisories — awaiting upstream patch.
4. `deploy-pages.yml` workflow update — intentionally deferred, needs owner approval.
5. Home page "Zero Network Calls" copy — owner decision pending.
6. `trivy image` scan — Docker required.
7. Real-engine performance measurement — model licence first.

---

## Commit details

| Commit | Contents |
|---|---|
| `fix(docker): harden entrypoint, raise health-check start period` | `docker-entrypoint.sh`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `tests/infrastructure/test_entrypoint.py` |
| `fix(deps): upgrade vitest 3→5, fix jest-dom matcher types` | `website/package.json`, `website/package-lock.json`, `website/tests/setup.ts` |
| `docs(staging): hardening reports, licence request, recovery docs` | All `docs/ai-shield/` additions |
