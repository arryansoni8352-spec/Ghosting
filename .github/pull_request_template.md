## Description
Describe your changes and the rationale behind them.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New research adapter / algorithm
- [ ] Documentation update
- [ ] Performance optimization / build pipeline

## Testing & Quality Checklist
- [ ] `pytest tests/ -v` passes (in `engine/`)
- [ ] `npm test` passes (in `apps/desktop/`)
- [ ] `npm run typecheck` passes with 0 errors
- [ ] $L_\infty$ bounds are mathematically verified and preserved on disk
- [ ] No remote network calls or telemetry are introduced
- [ ] Third-party licenses and research attributions are updated in `THIRD_PARTY_NOTICES.md`
