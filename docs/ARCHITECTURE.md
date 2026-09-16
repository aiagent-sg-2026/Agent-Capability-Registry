# Architecture

Packages are separated into schema, runner, evaluator, registry API, factory, and CLI. A package is parsed and checked as untrusted files; verification combines manifest validation, path/security checks, deterministic integrity hashing, and golden evaluation. Installation stages a local copy, atomically renames it, and writes a receipt. V1 uses no network or package execution.
