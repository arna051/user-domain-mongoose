import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineAccessControl, E164PhoneNormalizer } from '../src/index.js';

describe('defineAccessControl', () => {
  it('preserves exact permission keys', () => {
    const access = defineAccessControl({
      permissions: {
        'users.read': { title: 'Read users' },
        'orders.cancel': { title: 'Cancel orders', category: 'orders' },
      },
    });
    expect(access.keys).toEqual(['users.read', 'orders.cancel']);
    expectTypeOf<(typeof access.keys)[number]>().toEqualTypeOf<'users.read' | 'orders.cancel'>();
  });
});

describe('E164PhoneNormalizer', () => {
  const normalizer = new E164PhoneNormalizer('IR');
  it.each(['09123456789', '989123456789', '+989123456789'])('normalizes %s', (phone) => {
    expect(normalizer.normalize(phone)).toBe('+989123456789');
  });
  it('rejects invalid numbers', () => expect(() => normalizer.normalize('123')).toThrow('invalid'));
});
