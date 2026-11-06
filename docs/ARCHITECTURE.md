# Architecture

The public factory binds caller-owned Mongoose connections to collision-resistant user and role models. `modelPrefix` permits multiple independent package instances on one connection. The core exposes plain Node.js services; the optional `nestjs` export only adds dependency injection.

Users store a canonical E.164 phone and internal `scopeKey`. The compound unique index `{ scopeKey, normalizedPhone }` avoids MongoDB null-index ambiguity. Roles are unique per scope. Every read and mutation resolves and filters by the same scope key.

Profile writes parse a developer-supplied strict Zod schema for `extra`, reject operator/dotted/prototype keys, enforce depth and byte limits, and construct update documents from an allowlist. Authorization mutations increment `authorizationVersion` atomically. Effective permission resolution is `roles ∪ allow − deny`.

Schema version 1 embeds bounded role keys and overrides in the user document. A future migration can move assignments to a separate collection if resource-scoped or high-cardinality assignments become necessary. Migrations must be explicit; package import never rewrites documents.

## Events

The observer is for redacted telemetry and simple hooks. It is intentionally not described as durable. Applications requiring reliable session revocation, avatar cleanup, or indexing should write a transactional outbox in the same MongoDB session through an application-owned orchestration layer, then consume it idempotently.
