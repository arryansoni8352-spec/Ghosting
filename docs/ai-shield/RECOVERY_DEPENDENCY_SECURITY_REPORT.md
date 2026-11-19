# DEPENDENCY_SECURITY_REPORT

## Vitest (dev only)
- Prior pin: `^3.2.3`
- Updated target: `^3.2.7` (lockfile resolved to 3.2.7 in the successful test run)
- Reason: multiple critical/moderate advisories on Vitest 3.x UI / browser / API surfaces (including GHSA-5xrq-8626-4rwp, patched from 3.2.6)
- Production exposure: none (devDependency; not present in the production bundle)
- Regression: website test suite **130 passed** after the bump

## Other
- Full `npm audit` / `pip-audit` not completed in the interrupted session.
- Production runtime dependencies still require a clean audit on the target host.
- Do not claim the project is free of advisories.
