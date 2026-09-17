# Security

Package artifacts are untrusted. The CLI rejects malformed manifests, traversal, escaping symlinks, shell permissions, and missing evidence. It never invokes content or hooks, and the example has no executable tools. V1 does not provide cryptographic signing or remote fetching; operators should treat the local hash and receipt as provenance evidence, not an attestation.

The factory adds no trust to model output: candidate shape, names, permissions, paths, executable-like fields, hooks, commands, network, fetching, and secrets are rejected deterministically, and review is a second bounded model call. Candidate output is data-only JSON/markdown under the state directory. Bearer/session tokens are process-memory-only and never written to state, usage ledgers, JSON output, or logs. The systemd template runs as `ai-agent` with `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`, `PrivateTmp`, and explicit state `ReadWritePaths`. The shared `github-pages` registration is temporary; dedicated gateway project/origin registration is preferred.

Factory packages are strict bounded `.md`/`.json` data with exactly four false permissions, required README/eval JSON, deterministic hashes, and 0700 directories/0600 files under state only. No generated content is executed.
