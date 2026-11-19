# Release Readiness Matrix

**Branch:** `feature/ai-shield-staging`  
**Date:** 2026-11-15  
**Status values:** PASS · PARTIAL · FAIL · BLOCKED · NOT TESTED

---

## 1. Website integration

| Item | Status | Evidence |
|---|---|---|
| AI Shield page loads (`#/ai-shield`) | PASS | Route present in `App.tsx`; test `aiShieldPage.test.tsx` |
| Feature disabled when `VITE_SHIELD_API_URL` absent | PASS | Build test: CSP `connect-src 'none'`; page shows honest error |
| Consent disclosure shown before upload | PASS | `ConsentPanel.tsx`; test asserts uploads disabled until ticked |
| Image Shield tab renders | PASS | `ImageShield.tsx`; test covers full job flow |
| Video Shield tab renders | PASS | `VideoShield.tsx`; test covers limits and states |
| Experimental notice on every screen | PASS | `ExperimentalBanner` in `ShieldPrimitives.tsx`; test asserts text |
| `VideoStudioPage` unaffected | PASS | 0 changed lines; existing tests pass |
| `PrivacyToolsPage` unaffected | PASS | 0 changed lines; existing tests pass |
| `HomePage` unaffected | PASS | 0 changed lines; existing tests pass |
| Privacy Policy AI Shield section | PASS | Added to `PrivacyPolicyPage.tsx`; test asserts section present |
| CSP `connect-src` = backend origin only | PASS | Verified both build variants |
| No hardcoded secrets in bundle | PASS | Regex scan: 0 hits; `credentials: 'omit'` in all requests |
| Owner token in memory only (not localStorage) | PASS | Test `test_keeps_the_access_key_in_sessionStorage_only` |
| 130 website tests pass | PASS | `npx vitest run`: 130 passed, 0 failed |
| Production build succeeds | PASS | `npm run build`: ✓ 6.0 s |

**Website integration: PASS**

---

## 2. Backend infrastructure

| Item | Status | Evidence |
|---|---|---|
| `/health` returns 200 | PASS | TestClient + runtime simulation |
| `/capabilities` correct (no weights) | PASS | `image.ready: false`, `model_licence_unconfirmed` |
| Job ownership tokens issued and enforced | PASS | 5 ownership tests; uniform 404 on wrong token |
| CORS wildcard rejected at startup | PASS | `Settings(cors_origins='*')` raises `ValidationError` |
| CORS restricted to configured origin | PASS | `test_cors_allows_only_configured_origin` |
| Rate limiting: upload and read buckets separate | PASS | `test_status_polling_is_not_throttled_…` |
| File signature validation (image) | PASS | GIF magic → 400; oversized → 413 |
| File signature validation (video) | PASS | Bad container → 415; corrupt → 400 |
| Upload size limits enforced | PASS | 413 `upload_too_large` verified |
| Temporary file cleanup after failure/cancel | PASS | 0 leftover dirs verified |
| Security headers on every response | PASS | `nosniff`, `no-store`, `no-referrer` |
| Logging: no filenames or tokens in logs | PASS | `test_logging_privacy` (2 tests) |
| Production mode blocks `auth_mode=disabled` | PASS | `RuntimeError` in lifespan |
| Production mode blocks empty API key digests | PASS | `RuntimeError` in lifespan |
| In-memory single-worker limitation documented | PASS | Dockerfile + compose + deployment docs |
| 218 backend offline tests pass | PASS | `pytest -m "not model"`: 218 passed, 42 deselected |

**Backend infrastructure: PASS**

---

## 3. Docker

| Item | Status | Evidence |
|---|---|---|
| Dockerfile static analysis (13 checks) | PASS | Automated checks in pre-deployment verification |
| `docker-compose.yml` static analysis (10 checks) | PASS | Automated checks |
| Entrypoint wildcard rejection | PASS | `test_entrypoint.py`: 9 tests pass |
| Port bound to loopback only (`127.0.0.1:8080`) | PASS | `docker-compose.yml` updated |
| Health check `start-period=90s` | PASS | `Dockerfile` updated |
| `--forwarded-allow-ips *` removed | PASS | Replaced by `docker-entrypoint.sh` + env var |
| `--no-install-recommends` on ffmpeg | PASS | Present in `Dockerfile` |
| Non-root user (`shield` UID 10001) | PASS | Static analysis |
| Docker image builds successfully | NOT TESTED | Docker unavailable in sandbox |
| Container starts and `/health` responds | NOT TESTED | Docker unavailable in sandbox |
| `trivy image` scan | NOT TESTED | Docker required |

**Docker: PARTIAL** — static analysis and entrypoint logic verified; build and runtime not executed.

---

## 4. Security

| Item | Status | Evidence |
|---|---|---|
| CORS wildcard blocked | PASS | Pydantic validator; test |
| Trusted proxy wildcard blocked | PASS | Entrypoint exit 1 on `*`; 9 entrypoint tests |
| Authentication enforced in production mode | PASS | `RuntimeError` on disabled; TestClient verified |
| Upload validation (image: sig, size, format) | PASS | Tests |
| Upload validation (video: sig, codec, limits) | PASS | Tests |
| Path containment for job output | PASS | `self._root in path.parents` check |
| No secrets in git diff | PASS | Regex scan: 0 hits |
| No model weights committed | PASS | `.gitignore` coverage; diff check |
| Log redaction (filenames, tokens) | PASS | `test_logging_privacy` |
| vitest critical CVEs (tinypool, mocker) | PASS | Upgraded to vitest 5.1.0 |
| picomatch ReDoS (12 high) | PARTIAL | In build/test tools only; not in production bundle; no patch available |
| pip-audit: direct AI Shield deps | PASS | 0 vulnerabilities in AI Shield requirements |
| pip-audit: system/transitive deps | PARTIAL | 9 packages; none in AI Shield code path |
| `trivy image` scan | NOT TESTED | Docker required |
| `pip-audit` / `npm audit` on clean host | PARTIAL | Run in sandbox; system packages vary |

**Security: PARTIAL** — all exploitable paths closed; residual advisories in build tools only.

---

## 5. Model licensing

| Item | Status | Evidence |
|---|---|---|
| MobileNetV1 weight-file licence located | FAIL | No explicit licence found at any source |
| Commercial use established | FAIL | Not established |
| Redistribution rights confirmed | FAIL | Not established |
| Licence gate `licence_confirmed=False` | PASS | Code enforced; production refuses to load |
| Weights absent from repository | PASS | `.gitignore`; diff scan |
| Weights absent from Docker image | PASS | No `COPY models` in Dockerfile |
| Licence request draft prepared | PASS | `MOBILENETV1_LICENCE_REQUEST.md` |
| Licence request sent | FAIL | Not yet sent; awaiting owner approval |
| MobileNetV2 as confirmed replacement | FAIL | Same weight-licence ambiguity applies |

**Model licensing: BLOCKED** — gate is closed and enforced; rights not yet established.

---

## 6. Image Shield inference

| Item | Status | Evidence |
|---|---|---|
| Engine integration (API, job management) | PASS | 218 offline tests; stub engine |
| Honest 503 when weights absent | PASS | Verified via TestClient |
| Budget enforcement (lossless formats) | PASS | Existing engine tests (stub) |
| Real image protected with actual engine | NOT TESTED | Weights absent; licence gate closed |
| 42 model-dependent tests | NOT TESTED | Deselected; require verified weights |
| Effectiveness evaluation | NOT TESTED | Prior null result; not re-run |

**Image Shield inference: BLOCKED** — infrastructure ready; no inference possible without licence.

---

## 7. Video Shield inference

| Item | Status | Evidence |
|---|---|---|
| Frame extraction (real FFmpeg) | PASS | 22 pipeline tests with real FFmpeg |
| Audio preservation and sync | PASS | Bit-exact copy verified; sync tests |
| Temporal consistency (synthetic) | PASS | `evaluate_video_temporal.py` measurements |
| Scene detection | PASS | Tests |
| Lossless output budget verified | PASS | FFV1 round-trip test |
| H.264 budget honestly reported | PASS | `budget_satisfied_after_encoding: false` when exceeded |
| Real video + AI keyframe protection | NOT TESTED | Model licence gate closed |
| Transfer of perturbation across segments | NOT TESTED | Untested even conceptually |
| Video protection effectiveness | NOT TESTED | No data |

**Video Shield inference: PARTIAL** — pipeline fully tested; AI step blocked on licence.

---

## 8. Performance

| Item | Status | Evidence |
|---|---|---|
| Pipeline-only frame processing speed | PASS (synthetic) | `evaluate_video_temporal.py` on 96×64 clips |
| Real-engine image processing time | NOT TESTED | Weights absent |
| Real-engine video processing time | NOT TESTED | Weights absent |
| Memory consumption per job | NOT TESTED | Unmeasured |
| Resource limits in Docker | PARTIAL | 4g/2 CPU set; not validated against real jobs |
| Job timeout tuning | NOT TESTED | Default 1800s; unmeasured against real jobs |

**Performance: NOT TESTED** — cannot measure until model licence is resolved.

---

## 9. Privacy

| Item | Status | Evidence |
|---|---|---|
| Consent required before upload | PASS | ConsentPanel; test |
| Remote processing disclosed | PASS | ConsentPanel copy |
| File deleted after TTL (default 1h) | PASS | TTL cleanup in `jobs.py`; test |
| File deleted immediately on cancel/failure | PASS | Cleanup tests |
| File deleted on user request | PASS | DELETE endpoint + ownership test |
| `pagehide` sends delete request | PASS | `useShieldJob.ts` |
| No filenames in logs | PASS | Log privacy tests |
| No tokens in browser storage | PASS | Test |
| `credentials: omit` on all requests | PASS | Code review |
| AI Shield privacy section in Privacy Policy | PASS | Test asserts section present |
| Hosting provider named in Privacy Policy | FAIL | Not yet named; depends on host choice |
| Home page "Zero Network Calls" copy | FAIL | Still reads site-wide; owner decision pending |
| Proxy log retention disclosed | FAIL | Depends on host; not yet documented |

**Privacy: PARTIAL** — technical controls pass; hosting-dependent disclosures pending.

---

## 10. Public launch

| Item | Status | Evidence |
|---|---|---|
| All above PASS or PARTIAL | — | See above |
| Model licence confirmed | FAIL | Blocker |
| Docker build verified on target host | NOT TESTED | Blocker |
| `trivy image` clean (no critical CVEs) | NOT TESTED | Blocker |
| Real-engine tests pass (`pytest -m model`) | NOT TESTED | Blocker |
| Real-job performance measured | NOT TESTED | Blocker |
| Resource limits tuned to measured data | NOT TESTED | Blocker |
| Hosting provider chosen and provisioned | FAIL | Not yet chosen |
| Privacy Policy names the provider | FAIL | Not yet possible |
| Home page copy decided | FAIL | Owner pending |
| `deploy-pages.yml` updated | FAIL | Owner approval required |
| `pip-audit` / `npm audit` on clean host | PARTIAL | System packages vary by host |

**Public launch: BLOCKED** — 5 hard technical blockers + 4 operational blockers.

---

## Summary

| Readiness level | Verdict | Blocking issues |
|---|---|---|
| **Infrastructure staging** | **READY** | Docker build must be verified on target host |
| **Real AI model testing** | **BLOCKED** | MobileNetV1 licence must be established; `pytest -m model` never run |
| **Public launch** | **BLOCKED** | Licence + Docker + trivy + real tests + performance + provider + Privacy Policy + Home page copy |
