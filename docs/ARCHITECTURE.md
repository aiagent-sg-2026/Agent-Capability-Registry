# Architecture

Packages are separated into schema, runner, evaluator, registry API, factory, and CLI. The factory reads curated seeds, deterministically deduplicates them, makes one strict-JSON proposal call and one strict-JSON review call, then writes only `CANDIDATE_ONLY` JSON under its state directory after deterministic security checks and review PASS. It never installs, publishes, pushes, mutates the repository, runs generated commands, fetches package code, or executes candidate content.

The demo gateway is `https://gpt.yapweijun1996.com/demo`: `/session` receives `{project_id}` with `Origin`, and `/v1/chat/completions` receives Bearer, `Origin`, content type, and model (default `demo-auto`). Session tokens are memory-only. The default `github-pages` project is a temporary shared registration, not a dedicated identity; dedicated gateway project/origin registration is preferred.

Defaults: `ACR_FACTORY_BASE_URL`, `ACR_FACTORY_ORIGIN`, `ACR_FACTORY_PROJECT_ID`, `ACR_FACTORY_MODEL`, `ACR_FACTORY_DAILY_TOKEN_BUDGET=1000000`, `ACR_FACTORY_MIN_REMAINING_FOR_CALL=10000`, and state directory `/srv/agent-workstation/state/agent-capability-registry-factory`. The 1M value is only the local admission budget, not gateway quota. Usage JSONL is append-only and counted by Singapore calendar day. 429 skips cleanly, 401 refreshes once, 403 blocks configuration, and three transient failures trigger a two-hour cooldown. A lock prevents overlap.

`once` performs one real bounded cycle when admitted; `status` prints safe budget/circuit/latest-cycle JSON; `canary` and `dry-run` are offline. JSON is printed for every command. The service and timer templates in `ops/systemd/` are not installed automatically; the timer is every 15 minutes with `Persistent=true`.

The opportunity queue is append-only JSONL under state; historical IDs/titles and candidate index records provide deduplication and consumption. Discovery is capped at eight opportunities and occurs at most once per cycle. Proposal and review calls are admitted independently; usage purposes are `discover`, `proposal`, and `review`. Status reports queued, discovered, and candidate-package counts.
