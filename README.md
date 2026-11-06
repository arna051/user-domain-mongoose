# user-domain-mongoose

Backend-only user profiles and code-first authorization for Mongoose, with scoped phone identity, typed Zod extensions, role-based permissions, direct allow/deny overrides, and optional NestJS injection.

> Pre-1.0: review the documented security and deletion policies before production use.

## Install

```sh
npm install user-domain-mongoose mongoose zod
```

Node.js 20.11+ and Mongoose 8 or 9 are supported. NestJS is optional.

## Quick start

```ts
import { z } from 'zod';
import { createUserDomain, defineAccessControl } from 'user-domain-mongoose';

const accessControl = defineAccessControl({
  permissions: {
    'users.read': { title: 'مشاهده کاربران' },
    'orders.cancel': { title: 'لغو سفارش', category: 'orders' },
  },
});

const users = createUserDomain({
  connection: mongoose.connection,
  accessControl,
  scope: { mode: 'required' },
  extraSchema: z.object({ preferredLanguage: z.enum(['fa', 'en']).optional() }).strict(),
});

await users.ensureIndexes();
const user = await users.create({
  scopeId: 'business-1',
  phone: '09123456789',
  firstName: 'Ali',
  extra: { preferredLanguage: 'fa' },
});
```

Permission keys and `extra` are inferred exactly. Phone values are normalized to E.164 and uniquely indexed by scope. Scope is mandatory in `required` mode, forbidden in `global` mode, and optional in `optional` mode.

## Deliberate boundaries

This package does not implement login, OTP, sessions, SMS, file storage, frontend UI, commerce models, or resource-level policy rules. Avatar values are immutable file references; use `avatarPolicy` to validate ownership and image approval. Use `asAuthUserRepository()` to integrate an authentication package without coupling it here.

Profile mutation is separate from authorization mutation. `updateProfile` allowlists profile fields and never accepts roles, permissions, status, phone, scope, or system fields. Explicit deny takes precedence over role and direct allow.

The package never opens a Mongoose connection and never creates indexes implicitly. Call `ensureIndexes()` during a controlled deployment step. All lookups include the resolved scope key.

## NestJS

```ts
import { Inject } from '@nestjs/common';
import { USER_DOMAIN, UserDomainModule } from 'user-domain-mongoose/nestjs';

@Module({ imports: [UserDomainModule.forRoot(options)] })
class AppModule {}

class UsersService {
  constructor(@Inject(USER_DOMAIN) private readonly users: typeof domain) {}
}
```

`forRootAsync` is also available. No controllers or guards are installed: the host owns authentication, route authorization, DTO exposure, and policy checks.

## Operational policy

- `setStatus(..., 'deleted')` preserves the normalized phone and its unique claim. This conservative default prevents recycled numbers from inheriting an old identity. Anonymization/reuse requires an application migration and identity policy.
- Observers receive event names, IDs, scope, changed field names, and optional actor/correlation IDs—not raw phone or `extra` snapshots. Observer delivery is not transactional; reliable external side effects require a host transactional outbox.
- Role arrays are suitable for bounded application roles. Resource ACLs and unbounded assignments belong in a separate package/model.
- MongoDB transactions are the host's responsibility when composing package operations with other writes; use a replica set.

See [Security](./docs/SECURITY.md) and [Architecture](./docs/ARCHITECTURE.md).

## Development

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

## License

MIT
