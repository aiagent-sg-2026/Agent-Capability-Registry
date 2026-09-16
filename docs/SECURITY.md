# Security

Package artifacts are untrusted. The CLI rejects malformed manifests, traversal, escaping symlinks, shell permissions, and missing evidence. It never invokes content or hooks, and the example has no executable tools. V1 does not provide cryptographic signing or remote fetching; operators should treat the local hash and receipt as provenance evidence, not an attestation.
