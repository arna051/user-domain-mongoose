import type { Connection } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { createUserDomain, defineAccessControl, UserDomainError } from '../src/index.js';

const accessControl = defineAccessControl({
  permissions: {
    'users.read': { title: 'Read users' },
    'orders.cancel': { title: 'Cancel orders' },
  },
});

function document(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    _id: '507f1f77bcf86cd799439011',
    scopeKey: '__global__',
    normalizedPhone: '+989123456789',
    roles: [],
    permissionOverrides: { allow: [], deny: [] },
    status: 'active',
    authorizationVersion: 1,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(userOverrides: Record<string, unknown> = {}) {
  const created = document(userOverrides);
  const User = {
    create: vi.fn().mockResolvedValue(created),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    createIndexes: vi.fn().mockResolvedValue(undefined),
  };
  const Role = {
    create: vi.fn(),
    find: vi.fn(),
    exists: vi.fn(),
    createIndexes: vi.fn().mockResolvedValue(undefined),
  };
  const connection = {
    models: {},
    model: vi.fn((name: string) => (name.endsWith('User') ? User : Role)),
  } as unknown as Connection;
  return { connection, User, Role, created };
}

describe('UserDomain security boundaries', () => {
  it('enforces required scope before touching persistence', async () => {
    const { connection, User } = harness();
    const domain = createUserDomain({ connection, accessControl, scope: { mode: 'required' } });
    await expect(domain.create({ phone: '09123456789' })).rejects.toMatchObject({
      code: 'SCOPE_REQUIRED',
    });
    expect(User.create).not.toHaveBeenCalled();
  });

  it('always includes the resolved scope in an id lookup', async () => {
    const { connection, User } = harness();
    User.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const domain = createUserDomain({ connection, accessControl, scope: { mode: 'required' } });
    await domain.findById('507f1f77bcf86cd799439011', 'tenant-a');
    expect(User.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      scopeKey: 'tenant-a',
    });
  });

  it('rejects malformed ids without invoking Mongoose', async () => {
    const { connection, User } = harness();
    const domain = createUserDomain({ connection, accessControl });
    await expect(domain.findById('bad')).rejects.toEqual(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('rejects protected profile fields at runtime', async () => {
    const { connection, User } = harness();
    const domain = createUserDomain({ connection, accessControl });
    await expect(
      domain.updateProfile('507f1f77bcf86cd799439011', undefined, { roles: ['admin'] } as never),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not report a committed write as failed when an observer fails', async () => {
    const { connection } = harness();
    const onError = vi.fn();
    const domain = createUserDomain({
      connection,
      accessControl,
      observer: { onEvent: vi.fn().mockRejectedValue(new Error('telemetry unavailable')), onError },
    });
    await expect(domain.create({ phone: '09123456789' })).resolves.toMatchObject({
      phone: '+989123456789',
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'user.created');
  });

  it('validates permission override conflicts before persistence', async () => {
    const { connection, User } = harness();
    const domain = createUserDomain({ connection, accessControl });
    await expect(
      domain.setPermissionOverrides('507f1f77bcf86cd799439011', {
        allow: ['orders.cancel'],
        deny: ['orders.cancel'],
      }),
    ).rejects.toBeInstanceOf(UserDomainError);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
