# Contributing to VeilGuard

Thank you for your interest in contributing. VeilGuard is a research application and contributions must meet high standards for security, privacy and research integrity.

## Before You Start

1. Read [`SECURITY.md`](SECURITY.md) and [`PRIVACY.md`](PRIVACY.md).
2. Check the [project plan](docs/architecture.md) to understand the current milestone.
3. For significant changes, open a discussion or issue before submitting a pull request.

## Development Setup

See [`README.md`](README.md) → Quick Start.

## Code Standards

- **TypeScript** — strict mode enabled; no `any` types without justification
- **Python** — type hints required; formatted with `black`, checked with `ruff`
- **Tests required** — all new features need tests; all bug fixes need a regression test
- **No fake results** — never simulate protection output or display success states before an operation completes
- **No secrets in code** — use `.env` files (listed in `.gitignore`)

## Research Contributions

- Cite the source paper and repository for any research algorithm
- Clearly label algorithm status: `PRODUCTION_READY`, `EXPERIMENTAL`, `RESEARCH_ONLY`, `BLOCKED`
- Verify the license of any model weights before including them
- Document effectiveness limitations honestly

## Pull Request Process

1. Fork the repository and create a feature branch
2. Run `npm test` and `pytest engine/tests/ -v` and ensure both pass
3. Run `npm run lint` and `npm run typecheck`
4. Update `docs/` if you change architecture or add algorithms
5. Submit a PR with a clear description of what changed and why

## Dependency Policy

- Add only dependencies that are actively maintained and have compatible licenses
- Pin versions in lock files
- Justify each new dependency in the PR description

## Conduct

Contributions must comply with our code of conduct (to be added). Respect other contributors, users and the research community.
