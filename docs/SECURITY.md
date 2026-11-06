# Security and privacy model

Phone numbers remain queryable personal data. Protect MongoDB, restrict profile access, encrypt storage and backups, and avoid logging inputs. Transparent field encryption is not claimed; blind indexing requires application-specific key rotation and collision handling.

Public, self, and administrator DTOs must be mapped by the host. Never serialize a Mongoose document or return authorization internals from public endpoints. The package emits no HTTP controllers and assumes no permission hierarchy; the host must verify that an actor may delegate every requested role or permission.

`extra` accepts only values approved by the supplied schema and rejects unsafe keys, non-plain objects, excessive nesting, and oversized serialization. Prefer `.strict()` schemas and explicit application-owned indexes. Never index arbitrary extension keys.

Disabling blocks authorization resolution but does not erase data. Deleting is a recoverable status transition and is not anonymization or GDPR compliance. The default retains phone uniqueness. Applications must define retention, legal-record linkage, anonymization, purge, number-reuse, session revocation, and shared-avatar cleanup policies.

Stateless long-lived tokens cannot be revoked immediately by this package. Put `authorizationVersion` in short-lived token/session state and compare it on sensitive requests, or resolve authorization per request with a version-keyed cache.

Report vulnerabilities privately using the instructions in the root `SECURITY.md`.
