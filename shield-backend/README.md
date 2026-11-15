# GHOSTING Shield

Experimental, standalone image-protection service. Two planned engines:

- **Style Shield — implemented, Glaze-inspired, not an exact reproduction.** A bounded,
  gradient-based perturbation that nudges an artwork's features toward a style-transferred
  version of itself. **Its controlled proxy experiment showed no measurable protective effect**
  (the baseline was already 100% recognised, so the test had no room to show a drop). No
  protection is claimed or guaranteed. See `docs/STYLE_SHIELD_TECHNICAL_REPORT.md`.
- **Face Shield — not implemented.** `POST /engines/face_shield/protect` returns `501`.

This service never promises complete or permanent protection against any AI model, trained now
or in the future.

## Status summary

| Area | Status |
|---|---|
| Style Shield processing (real PNG/JPEG/WebP, RGB/RGBA/L/LA) | **Implemented**, tested end to end |
| Style Shield protection effectiveness | **Not demonstrated.** One controlled experiment, null result |
| Face Shield | **Not implemented** (501) |
| Job queue, status, download, cancellation, expiry | **Implemented** |
| Authentication, rate limiting | **Implemented** (shared API key + token bucket); not a full identity system |
| Model weight licence (MobileNetV1 checkpoint) | **Unresolved** — see `docs/MODEL_LICENSING_REPORT.md` |

## Installation

```bash
cd ghosting-shield
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt -r requirements-ml.txt   # ML stack required for Style Shield
```

### CPU (default)
No extra setup. JAX's CPU wheel has no CUDA dependency.

### GPU (optional, not tested in development)
See JAX's installation guide for a CUDA-enabled `jaxlib` build (e.g. `pip install jax[cuda12]`).
Set `SHIELD_DEVICE=gpu` to make the intent explicit; `/health` reports whether a GPU device is
actually visible — installing CUDA packages alone does not make `gpu_available` true.

### Model weights
Weights are downloaded on first use (17 MB) from a pinned GitHub release URL and verified by
SHA-256 before use. To check or pre-fetch them explicitly:

```bash
python -m app.cli check-models              # report status; never downloads
python -m app.cli check-models --download   # download (bounded, timed-out, checksummed) if missing
```

**Licence note:** the MobileNetV1 checkpoint's own licence statement could not be located (the
code around it is MIT/Apache-2.0; the trained weight values are not separately licensed by
either source found). See `docs/MODEL_LICENSING_REPORT.md`. In `SHIELD_PRODUCTION_MODE=true`,
the model refuses to load until this is resolved.

## Running

```bash
uvicorn app.main:app --reload --port 8080
```

- `/health` — status, JAX backend, model verification status, job counts
- `/version` — service version and per-engine implementation status
- `/docs` — interactive API documentation

By default authentication is **disabled** (development only); the server logs a warning on
startup. See "Authentication and rate limiting" below.

## Tests

Two explicit groups (never conflated):

```bash
pytest -m "not model"   # offline: no network, no model weights needed
pytest -m model          # model-dependent: requires verified weights (downloaded automatically)
pytest                   # both
```

As of this phase: **113 offline + 30 model-dependent = 143 tests, 0 failed, 0 skipped**, run
in a fresh environment. A model-dependent test FAILS loudly (not skips) if weights cannot be
obtained — see `tests/conftest.py`.

## API usage

### Start a job (recommended)
```bash
curl -F "file=@art.png" -F "strength=balanced" -F "output_format=png" \
     http://localhost:8080/engines/style_shield/jobs
# -> 202 {"job_id": "...", "state": "queued", "status_url": "...", ...}
```

### Poll status, then fetch the record and output
```bash
curl http://localhost:8080/jobs/<job_id>
curl http://localhost:8080/jobs/<job_id>/record
curl -o out.png http://localhost:8080/jobs/<job_id>/output
```

### Synchronous convenience endpoint
```bash
curl -F "file=@art.png" -F "strength=low" http://localhost:8080/engines/style_shield/protect
```
Waits up to `SHIELD_SYNC_WAIT_SECONDS` (default 60); if the job is still running, returns `202`
with the job id instead of blocking indefinitely, so the caller can fall back to polling.

### Cancel / delete
```bash
curl -X POST   http://localhost:8080/jobs/<job_id>/cancel
curl -X DELETE http://localhost:8080/jobs/<job_id>
```

## Options (`ProtectOptions`)

| Field | Values | Default | Notes |
|---|---|---|---|
| `strength` | `low`, `balanced`, `high` | `balanced` | Changes real optimisation parameters (budget, steps, learning rate) |
| `output_format` | `png`, `jpeg`, `webp` | `png` | JPEG cannot carry transparency; refused upfront if the input has alpha |
| `quality` | 1–100 | 92 | JPEG/WebP only; ignored for PNG |
| `seed` | integer | 0 | Target-style selection only (deterministic) |
| `max_steps` | 1–1000 | preset default | Overrides the cloak's optimisation step count |
| `webp_lossless` | true/false | false | Lossless WebP: exact budget, larger file. See the format table below. |

Advanced optimiser internals (`epsilon`, learning rate, loss weights) are **not** exposed through
the API; they are fixed per preset pending further validation.

## Supported formats

| Format | Input | Output | Transparency | Budget-satisfiable? |
|---|---|---|---|---|
| PNG | yes | yes | yes (RGBA/LA), lossless | **Always** (lossless; exact) |
| WebP, `webp_lossless=true` | yes | yes | yes, lossless | **Always** (exact) |
| WebP, lossy (default) | yes | yes | yes, lossy | **Currently never**, at any preset (measured) |
| JPEG | yes | yes | **no** — rejected if the source has alpha | **Currently never**, at any preset (measured) |

Grayscale (`L`/`LA`) input is preserved as grayscale for PNG and JPEG. **WebP has no grayscale
mode**; grayscale input written as WebP comes back as RGB with equal channels. Documented, not a
defect — see `docs/STYLE_SHIELD_DESIGN.md`.

### Important: JPEG and lossy WebP currently cannot satisfy the perturbation budget

**Measured finding, not a bug in the usual sense:** JPEG's and lossy WebP's own compression —
independent of any perturbation Style Shield applies — changes pixels by up to 29–30 of 255
levels at image edges, even at maximum quality. This exceeds every preset's budget (low: 4,
balanced: 8, high: 16 levels). Per this project's rule of never silently exceeding the
requested budget, **a request for JPEG or plain (non-lossless) WebP output is refused with
`422 budget_unsatisfiable` before any optimisation runs**, rather than returning an
out-of-budget image.

**To get a protected image today, use `output_format=png` or `output_format=webp` with
`webp_lossless=true`.** Both give an exact, enforced budget. JPEG and lossy WebP remain
supported input formats, and are kept as output options for when wider presets or a different
budget definition are introduced; right now, requesting them as output always fails safely.
See `docs/STYLE_SHIELD_TECHNICAL_REPORT.md` for the measurements.

## Upload and processing limits

| Limit | Default | Setting |
|---|---|---|
| Upload size | 15 MB | `SHIELD_MAX_UPLOAD_MB` |
| Input pixels | 262,144 (e.g. 512×512) | `SHIELD_MAX_INPUT_PIXELS` |
| Minimum side | 32 px | `SHIELD_MIN_SIDE_PX` |
| Concurrent jobs | 1 | `SHIELD_MAX_CONCURRENT_JOBS` |
| Queued jobs | 4 | `SHIELD_MAX_QUEUED_JOBS` |
| Job timeout | 1800 s | `SHIELD_JOB_TIMEOUT_SECONDS` |
| Job output retention | 3600 s after completion | `SHIELD_JOB_TTL_SECONDS` |

Processing is CPU-bound and currently slow: roughly 70 seconds per 128px image at the balanced
preset on one core (measured; see `docs/STYLE_SHIELD_TECHNICAL_REPORT.md`).

## Job lifecycle

`queued → running → succeeded | failed | cancelled | timed_out`

Job IDs are unpredictable (43-character random tokens). The original uploaded image is held in
memory only until processing finishes, then discarded; it is never written to disk. The
protected output is written to a per-job directory under a controlled temp root and is deleted
on failure, cancellation, or after `SHIELD_JOB_TTL_SECONDS` past completion.

## Authentication and rate limiting

- `SHIELD_AUTH_MODE=disabled` (default): no check. **Development only** — a startup warning is
  logged, and `SHIELD_PRODUCTION_MODE=true` refuses to start with this setting.
- `SHIELD_AUTH_MODE=api_key`: requests must send `X-API-Key`; only SHA-256 digests of valid keys
  are configured (`SHIELD_API_KEY_SHA256`, comma-separated), never raw keys.
- `SHIELD_RATE_LIMIT_PER_MINUTE` (default 30, 0 disables): a per-client token bucket.
- Both are **integration points for a single-instance deployment**, not a full identity system
  and not a distributed rate limiter. See `docs/SECURITY.md`.

## Known limitations

- Style Shield's protective effect is **not demonstrated**; see the technical report for the
  experiment and its null result, and for what a stronger evaluation would need.
- MobileNetV1's checkpoint licence is unresolved (see `docs/MODEL_LICENSING_REPORT.md`).
- The optimiser targets one frozen feature extractor (white-box). Transfer to other
  architectures, and to generative models in particular, is untested.
- Job state, uploaded-weight checksums cache, and the rate limiter are in-process only; a
  multi-instance deployment needs shared storage.
- CPU processing is slow; no GPU was available to test GPU execution.

## Project layout

```
app/
  api/            routes (health, models, engines/jobs), transport-level body limit
  cli.py          model weight check/download command
  config/         settings (SHIELD_* environment variables)
  core/           engine contract, job manager, security, errors
  engines/
    style_shield/ engine, JAX MobileNetV1 port, optimiser, budget enforcement, weights
    face_shield/  stub only
  evaluation/     Phase 2 quality metrics, synthetic/procedural test images
  schemas/        Pydantic request/response models
  utils/          image I/O (format-safe), bounded upload reading
docs/
  RESEARCH.md                        Fawkes/Glaze findings and licence notes
  ARCHITECTURE.md                    design and phase history
  STYLE_SHIELD_DESIGN.md             Style Shield specification and substitutions from Glaze
  STYLE_SHIELD_TECHNICAL_REPORT.md   implemented algorithm and the experiment's null result
  MODEL_LICENSING_REPORT.md          every model/dependency licence, verified
  SECURITY.md                        threat model and what is/isn't mitigated
  experiments/                       raw experiment output
scripts/          baseline/experiment/reference-fixture generators, model reference script
tests/
  infrastructure/ API skeleton, schemas, backend detection (offline)
  evaluation/     Phase 2 metrics, codecs, baselines (offline)
  style_shield/   port verification, cloak, engine, weight-download security (model-dependent
                  except test_components.py)
  api/            real end-to-end API tests: input validation, jobs, security, concurrency
```

## Integration with the GHOSTING website (not built in this phase)

This remains a standalone project. See `docs/GHOSTING_INTEGRATION.md` for the planned
integration contract. No change has been made to the GHOSTING website or its repository.
