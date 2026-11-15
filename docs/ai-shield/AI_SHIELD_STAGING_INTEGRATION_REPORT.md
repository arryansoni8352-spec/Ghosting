# AI Shield — Staging Integration Report

**Branch:** `feature/ai-shield-staging` (commit `8aad3e1`, off `main` = `68e8c74`)
**Date:** 2026-11-15
**Status:** Integrated. NOT deployed. No push to GitHub.

---

## Files added / modified

| Category | Count | Key paths |
|---|---|---|
| Backend (new) | 76 | `shield-backend/app/`, `tests/`, `Dockerfile`, `docker-compose.yml` |
| Website (new) | 10 | `src/pages/AIShieldPage.tsx`, `src/lib/*.ts`, `src/components/shield/*.tsx`, `tests/shield*.test.ts` |
| Website (modified) | 8 | `App.tsx`, `Navbar.tsx`, `Footer.tsx`, `AboutPage.tsx`, `SecurityPolicyPage.tsx`, `PrivacyPolicyPage.tsx`, `tailwind.config.js`, `vite.config.ts` |
| Docs | 10 | `docs/ai-shield/GHOSTING_AI_SHIELD_*.md`, `ANTIGRAVITY_AI_SHIELD_HANDOFF.md`, `GHOSTING_AI_SHIELD_FINAL_AUDIT.md` |
| **Total** | **163 files, 14 687 lines added, 19 deleted** | |

Untouched: `apps/desktop/`, `engine/`, `packages/`, `VideoStudioPage.tsx`, `PrivacyToolsPage.tsx`, `HomePage.tsx`, `.github/workflows/`.

---

## Conflicts resolved

None. The patch applied cleanly to `main`. The working tree already contained all changes from the previous session; they were committed directly to the new branch without conflicts.

---

## Tests executed

| Suite | Command | Result | Mock? |
|---|---|---|---|
| Backend offline | `pytest -m "not model" -q -p no:cacheprovider` | **209 passed, 42 deselected, 0 failed** (86 s) | Stub engine (no weights) |
| Backend log privacy | `pytest tests/api/test_logging_privacy.py -v` | **2 passed** | Stub engine |
| Website | `npx vitest run` | **130 passed, 14 files, 0 failed** | Mocked fetch |
| Website build (no URL) | `npm run build` | **✓ 7.4 s**, CSP `connect-src 'none'` | — |
| Website build (with URL) | `VITE_SHIELD_API_URL=https://shield-staging.example.com npm run build` | **✓ 6.6 s**, CSP `connect-src https://shield-staging.example.com` | — |
| `pytest -m model` (42 tests) | — | **NOT RUN** — weights absent, licence unresolved | Real engine |
| Docker build | — | **NOT TESTED** — Docker unavailable in sandbox | — |

**All 209 offline tests use a stub engine.** Real protection has never executed. The 42 model tests are the
only ones that exercise actual JAX inference; they require verified weights and must be run after resolving
the licence.

---

## API endpoint verification (live TestClient, no weights)

| Endpoint | Expected | Result |
|---|---|---|
| `GET /health` | 200 `{"status":"ok"}` | ✓ |
| `GET /capabilities` | 200, `image.ready: false`, `model_not_installed` | ✓ |
| `POST /engines/style_shield/jobs` (PNG, no weights) | 503 `model_unavailable` | ✓ |
| `POST /engines/style_shield/jobs` (GIF magic bytes) | 400 `unsupported_image` | ✓ |
| `POST /engines/style_shield/jobs` (16 MB body) | 413 `upload_too_large` | ✓ |
| `POST /video/jobs` (bad container) | 415 `unsupported_video` | ✓ |
| `GET /jobs/<unknown>` | 404 | ✓ |
| Security headers on all responses | `nosniff`, `no-store`, `no-referrer` | ✓ |
| `SHIELD_CORS_ORIGINS=*` | `ValidationError` at startup | ✓ |
| Leftover job dirs after failed upload | 0 | ✓ |

---

## Feature gating verified

- `VITE_SHIELD_API_URL` absent → page shows "AI Shield is not enabled", zero network calls, CSP `connect-src 'none'`.
- `SHIELD_PRODUCTION_MODE=true` → `_check_production()` raises `RuntimeError` if `auth_mode=disabled`; engine `readiness()` returns `model_licence_unconfirmed`.
- Experimental notice (`"...has not yet been independently validated."`) is in `ShieldPrimitives.tsx` and rendered on every AI Shield screen via `ExperimentalBanner`.
- Consent checkbox gates all uploads; upload buttons disabled until ticked.

---

## Security findings status

| # | Severity | Issue | Status |
|---|---|---|---|
| S1 | Medium | CORS wildcard accepted | **Fixed** — `field_validator` in `settings.py`; `*` raises `ValidationError` |
| S2 | Low | Filename not explicitly sanitised | Accepted — Starlette `quote()` handles it |
| S3 | Low | Empty CORS = no middleware (footgun) | Documented in deployment guide |
| S4 | Low | `Content-Length: -1` skips header check | Accepted — streaming counter catches it |
| S5 | Info | Single-process in-memory state | Documented; `--workers 1` pinned in Dockerfile |

No new findings from this integration pass.

---

## Docker status

Dockerfile is present and syntactically valid. Build not executed (Docker unavailable in sandbox). Must be
verified by Antigravity on the target host before staging deployment.

---

## Remaining blockers

1. **MobileNetV1 licence unresolved** — real Image/Video Shield cannot execute legally.
2. **Docker image never built** — must be built and smoke-tested on target host.
3. **Real-engine performance unmeasured** — CPU/RAM per job unknown.
4. **`deploy-pages.yml` not updated** — `VITE_SHIELD_API_URL` repository variable not added.
5. **Home page "Zero Network Calls"** — still reads site-wide; needs owner decision.

---

## Reproduce

```bash
git clone https://github.com/arryansoni8352-spec/Ghosting
git checkout feature/ai-shield-staging

# Backend
cd shield-backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-ml.txt -r requirements-video.txt -r requirements-dev.txt
pytest -m "not model" -q -p no:cacheprovider
# expect: 209 passed, 42 deselected

# Website
cd ../website && npm ci
npx vitest run
# expect: 130 passed
npm run build
# expect: ✓ built, connect-src 'none'
```
