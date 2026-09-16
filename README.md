# Agent Capability Registry V1

A small, local-first TypeScript monorepo for packaging, validating, evaluating, verifying, and installing untrusted Codex-compatible capabilities. Package content is never executed; installs are atomic and receipts are evidence-bearing.

```sh
npm install && npm run build && npm test
npm run cap -- validate examples/postgresql-query-reviewer
npm run cap -- verify examples/postgresql-query-reviewer
npm run cap -- install examples/postgresql-query-reviewer --target /tmp/cap-target
```

V1 uses deterministic heuristics and file-backed APIs. Remote registries, package hooks, database execution, and LLM evaluation are deliberately deferred.
