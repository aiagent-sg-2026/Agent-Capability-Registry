# Agent Capability Registry V1

A small, local-first TypeScript monorepo for packaging, validating, evaluating, verifying, and installing untrusted Codex-compatible capabilities. Package content is never executed; installs are atomic and receipts are evidence-bearing.

```sh
npm install && npm run build && npm test
npm run cap -- validate examples/postgresql-query-reviewer
npm run cap -- verify examples/postgresql-query-reviewer
npm run cap -- install examples/postgresql-query-reviewer --target /tmp/cap-target
npm run cap -- resolve "postgres query"
npm run cap -- use "postgres query" --max-bytes 32768
```

V1 uses deterministic heuristics and file-backed APIs. The additive Package Factory is bounded and candidate-only: `npm run factory -- status`, `npm run factory -- once`, or `npm run factory -- canary`. It never installs, publishes, edits this repository, runs generated commands, fetches package code, or executes candidate content.

Configuration uses `ACR_FACTORY_*` environment variables (see [ARCHITECTURE](docs/ARCHITECTURE.md)). The default `github-pages` gateway registration is temporary and shared, not a dedicated project identity; dedicated gateway project/origin registration is preferred.

For systemd, build this checkout, verify the runtime path with `command -v node` (the template currently requires `/usr/local/bin/node`; edit `ExecStart` if the preflight reports another absolute path), and pre-create the writable state directory as the service user: `install -d -m 700 -o ai-agent -g ai-agent /srv/agent-workstation/state/agent-capability-registry-factory`. Review absolute paths and non-secret environment overrides, then copy/link both files in `ops/systemd/` into `/etc/systemd/system/`, run `systemctl daemon-reload`, and enable the timer with `systemctl enable --now agent-capability-registry-factory.timer`. This project does not install systemd units itself.

Continuous Factory V1 maintains an append-only opportunity queue, performs one bounded discovery refill when exhausted, and materializes only reviewed data-only markdown/JSON packages under state. No production deployment is claimed.

## Local Registry Search

Generated candidate packages are discoverable without executing them:

```sh
npm run cap -- search "postgres query"
npm run cap -- search "json" --category json-analysis --limit 10
npm run cap -- info postgres-query-reviewer
```

`cap search` and `cap info` read the Factory candidate index and verified `manifest.json` metadata from `ACR_FACTORY_STATE_DIR` (or the default local state directory). Results remain `CANDIDATE_ONLY`; search does not install, execute, or promote trust.

Agent Resolution V1 chains Registry Search → exact info lookup → deterministic selection → a bounded context-only use bundle. Candidate content is never executed or installed by `cap use`.
