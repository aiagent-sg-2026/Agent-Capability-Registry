# Package standard

Every package has `capability.json` conforming to `capability/v0.1`, declared content, explicit fail-closed permissions, compatibility, provenance, and an eval contract. Integrity is SHA-256 over `capability.json` plus all declared content files, sorted by relative filename, with filenames, NUL separators, and bytes included deterministically. Golden cases are JSON `{sql, expect}` records for the frozen evaluator. A missing manifest, provenance, eval, declared file, or trustworthy evidence is not PASS.
