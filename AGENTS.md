# Agent instructions

## About this repository

[osloer-industries/markdown-link-check](https://github.com/osloer-industries/markdown-link-check) is Osloer’s fork of [tcort/markdown-link-check](https://github.com/tcort/markdown-link-check). It keeps upstream single-file Markdown link checking while adding repository-wide validation that resolves relative paths on disk and still uses `link-check` for `http(s)` links. It targets **Node.js 24+** (`engines` in `package.json`, `.nvmrc`). Consumers depend on **git release tags** (`github:osloer-industries/markdown-link-check#v…`); there is no separate build step after install (`npm ci --ignore-scripts` is supported). See [README.md](./README.md) (“Osloer fork”) and [NOTICE.md](./NOTICE.md) for upstream attribution.

## Build, test, and release

**Setup:** use Node 24 (e.g. `nvm use`), then `npm ci`.

**Lint and tests (run locally before every push):**

- `npm test` — ESLint (`pretest`) plus Mocha unit tests.
- `npm run test:repo` — Node native test runner with coverage for `index.mjs` and `check-repo.mjs`.

CI (`.github/workflows/ci.yml`) runs the same commands on Ubuntu, Windows, and macOS, plus a small CLI integration smoke test.

**Release:** create a GitHub **Release**; the [Release workflow](.github/workflows/release.yml) publishes the package to npm (when configured) and builds/pushes Docker images to `ghcr.io`.

---

## Agent workflow (org-wide, keep identical across osloer-industries repos)

These rules apply to every agent (Cursor, Grok Bot, any other) working in this repo.

### Quality
- Never cut corners on quality or architecture. Fix root causes. No `continue-on-error`, `|| true`, skipped or deleted tests, lowered thresholds, ignore or suppress comments, `NOSONAR`, exclusions, new lint/Sonar rule exceptions or overrides, audit ignores, `--legacy-peer-deps`, or `--force`.
- SonarCloud issues are resolved only by fixing code, never by marking them false positive or won't-fix.
- Scripts are TypeScript on Node 24, never Python.
- `AGENTS.md` is the only agent instruction file; never add `CLAUDE.md` or tool-specific rule files.

### CI and workflows
- Pin GitHub Actions by full commit SHA with an accurate version comment. Org reusables from `osloer-industries/.github` are pinned `@<full sha> # v0.x.y` (a release tag, never `# main`).
- Every CI job feeds the single `ci-passed` aggregate job, including Workflow security, CodeQL and the SonarCloud zero-issues job. `ci-passed` is the only required status check.
- Only Dependabot patch/minor bumps and patch/minor release PRs auto-merge. Majors (or pre-1.0 breaking changes) never auto-merge; they wait for a human.
- Run the repo's linters, tests and pre-commit checks locally before pushing. The pre-commit hook is never skipped (`--no-verify` is not allowed).
- Push, then stop: do not wait on, watch or poll CI. Failures are handed back to you.

### Pull requests
- Keep PRs focused and reviewable, link the issues they close, and prefer simplification (less code, fewer dependencies, removed duplication).
- Resolve conflicts by merging the base branch in. Never rebase a pushed branch, never force-push, never bypass branch protection.
- A PR is ready for review only when all of these hold: it has no conflicts and is up to date with `main`; every check on the current head is green (pending is not ready); and it has no unresolved review threads, requested changes or open SonarCloud issues. Fix anything short of that yourself. Ask a human only when a real decision or ambiguity needs one.
- Never touch secrets, permissions, repo settings or rulesets without explicit human approval.