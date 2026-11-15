# Test Report (Phase 2, final)

## Commands executed

```bash
pytest -m "not model"   # offline group
pytest -m model          # model-dependent group
pytest --collect-only -q # overlap check
```

## Results (measured in this environment, fresh install)

| Group | Passed | Failed | Skipped | Unavailable |
|---|---|---|---|---|
| Offline (`not model`) | 114 | 0 | 0 | 0 |
| Model-dependent (`model`) | 32 | 0 | 0 | 0 |
| **Total (no overlap, confirmed by `--collect-only`)** | **146** | **0** | **0** | **0** |

No test is counted in both groups. No test is skipped. A model-dependent test that cannot
obtain verified weights FAILS with an explicit "MODEL UNAVAILABLE" message (`tests/conftest.py`);
none did so in this run, because the weights downloaded and verified successfully.

## New in this phase (by file)

| File | Tests | Covers |
|---|---|---|
| `tests/api/test_input_validation.py` | 10 | signature spoofing, decompression bomb, truncated/corrupt input, upload size, unknown engine |
| `tests/api/test_jobs_and_options.py` | 16 | job lifecycle, download, record, cleanup, expiry, invalid options, real WebP round trip, safe refusal |
| `tests/api/test_security.py` | 7 | auth on/off, production-mode startup refusal, rate limiting, constant-time key check |
| `tests/api/test_concurrency.py` | 4 | event-loop responsiveness during processing, capacity limits, measured timeout, cancellation |
| `tests/style_shield/test_weight_download_security.py` | 8 | checksum accept/reject, oversized download, declared-size refusal, stalled connection, unreachable host |
| `tests/infrastructure/test_backend_detection.py` | 2 | real JAX/GPU reporting (replaces the removed stale PyTorch-based module) |
| `tests/style_shield/test_engine.py` (expanded) | 17 | alpha (transparent/semi/opaque/mixed), grayscale, exact budget per preset, format rejection, determinism, cancellation, the JPEG/lossy-WebP budget finding, the transparent-pixel exclusion fix |

## Bugs found and fixed DURING this phase's own testing (not pre-existing from Phase 1)

1. **Status code bug**: the synchronous `/protect` endpoint hardcoded 422/500 for any failed job,
   discarding the error's real HTTP status (e.g. a corrupt image returned 422 instead of 400).
   Found by `test_truncated_image_rejected`. Fixed by propagating `exc.status_code` through the
   job record.
2. **NaN in JSON**: `size_ratio` was `NaN` when the original byte count was unknown, which is not
   valid JSON and broke the job-record endpoint. Found by `test_job_round_trip_real_png`. Fixed
   in `app/evaluation/compare.py` (`None` instead of `NaN`) and by threading the real input size
   through the pipeline.
3. **Rate-limiter staleness**: the limiter was a module-level singleton that ignored a changed
   `SHIELD_RATE_LIMIT_PER_MINUTE` after the first app instance. Found by `test_rate_limit_enforced`.
   Fixed by resetting it on each `create_app()`.
4. **Budget violated by lossy codecs**: see `docs/STYLE_SHIELD_TECHNICAL_REPORT.md` §9 — JPEG and
   lossy WebP could return output exceeding the configured budget by up to 4x. Found by the real
   end-to-end validation script, not by a unit test in isolation. Fixed with a pre-flight
   codec-noise check and a strict post-hoc refusal (`BudgetUnsatisfiableError`).
5. **Transparent-pixel false positive**: the budget check above, before its own fix, also flagged
   lossless WebP's legitimate discarding of colour at fully-transparent pixels as a violation.
   Found while fixing #4. Fixed by excluding `alpha == 0` pixels from the check.

## What a passing suite does NOT prove
- It does not show Style Shield protects against any AI model. See
  `docs/STYLE_SHIELD_TECHNICAL_REPORT.md` for the one controlled experiment performed (a null
  result) and what would be needed for a stronger claim.
- Model-dependent tests use the same MobileNetV1 extractor the cloak itself is optimised
  against (white-box); none test transfer to an independent architecture.
