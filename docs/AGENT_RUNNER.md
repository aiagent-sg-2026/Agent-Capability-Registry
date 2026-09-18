# Agent runner integration

`cap agent` resolves a task against the factory catalog, selects one validated candidate, builds a bounded context-only bundle, and passes that reference to a real local runner. Candidate package files are read as data; no candidate command, hook, installer, or tool is executed.

```sh
cap agent codex "review the SQL query in this workspace" --cwd .
cap agent pi "explain the failing test" --cwd . --mode workspace --model sonnet
cap agent codex "review" --state-dir /path/to/factory-state --dry-run
```

The default mode is read-only and the default context limit is 32 KiB (allowed range 1–64 KiB). Use `--mode workspace` only when the runner should be allowed to edit the selected working directory. `--dry-run` prints resolution and invocation metadata while omitting the composed prompt/context. If no capability matches, the command exits without starting a runner.

Runner executable overrides for deterministic tests or local wrappers are `ACR_CODEX_RUNNER` and `ACR_PI_RUNNER`; no API secrets are read by this integration.

Natural-language tasks are reduced deterministically to catalog-relevant terms only when the full task does not match directly. This lets control words such as `please`, `workspace`, or unrelated output wording stay out of capability selection while the original full task is still sent unchanged to the runner.
