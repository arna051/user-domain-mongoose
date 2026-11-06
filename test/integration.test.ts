import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserDomain, defineAccessControl } from '../src/index.js';

const mongoUri = process.env.MONGO_URI;
const integration = describe.runIf(Boolean(mongoUri));

integration('MongoDB integration', () => {
  const connection = mongoose.createConnection();
  const accessControl = defineAccessControl({
    permissions: {
      'users.read': { title: 'Read users' },
      'orders.cancel': { title: 'Cancel orders' },
    },
  });
  const users = createUserDomain({
    connection,
    accessControl,
    scope: { mode: 'required' },
    modelPrefix: `Integration${Date.now()}`,
  });

  beforeAll(async () => {
    await connection.openUri(`${mongoUri!}/user_domain_mongoose_test`);
    await connection.dropDatabase();
    await users.ensureIndexes();
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  it('enforces normalized phone uniqueness inside a scope while isolating tenants', async () => {
    const first = await users.create({ scopeId: 'tenant-a', phone: '09123456789' });
    await expect(
      users.create({ scopeId: 'tenant-a', phone: '+989123456789' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PHONE' });

    const otherTenant = await users.create({ scopeId: 'tenant-b', phone: '09123456789' });
    expect(otherTenant.id).not.toBe(first.id);
    expect(await users.findById(first.id, 'tenant-b')).toBeNull();
    expect(await users.findById(first.id, 'tenant-a')).toMatchObject({ id: first.id });
  });

  it('resolves role and direct permissions with deny precedence and atomic version bumps', async () => {
    const user = await users.create({ scopeId: 'tenant-a', phone: '09121111111' });
    await users.createRole('tenant-a', {
      key: 'operator',
      title: 'Operator',
      permissions: ['users.read', 'orders.cancel'],
      protected: false,
    });
    const assigned = await users.assignRole(user.id, 'operator', 'tenant-a');
    expect(assigned.authorizationVersion).toBe(user.authorizationVersion + 1);

    const overridden = await users.setPermissionOverrides(
      user.id,
      { allow: [], deny: ['orders.cancel'] },
      'tenant-a',
    );
    expect(overridden.authorizationVersion).toBe(assigned.authorizationVersion + 1);
    await expect(users.resolveAuthorization(user.id, 'tenant-b')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(users.resolveAuthorization(user.id, 'tenant-a')).resolves.toMatchObject({
      permissions: ['users.read'],
    });
    await expect(
      users.explainPermission(user.id, 'orders.cancel', 'tenant-a'),
    ).resolves.toMatchObject({ allowed: false });
  });

  it('rejects authorization resolution for disabled users', async () => {
    const user = await users.create({ scopeId: 'tenant-a', phone: '09122222222' });
    await users.setStatus(user.id, 'disabled', 'tenant-a');
    await expect(users.resolveAuthorization(user.id, 'tenant-a')).rejects.toMatchObject({
      code: 'USER_INACTIVE',
    });
  });
});
