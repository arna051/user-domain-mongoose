import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertObjectId, assertSafeObject, normalizeName } from '../src/core/validation.js';

describe('safe profile values', () => {
  it('normalizes whitespace and empty names', () => {
    expect(normalizeName('  Ali  ')).toBe('Ali');
    expect(normalizeName('   ')).toBeUndefined();
  });
  it('rejects unsafe extra keys', () => {
    for (const value of [{ $set: 1 }, { 'a.b': 1 }, { constructor: { polluted: true } }]) {
      expect(() => assertSafeObject(value, 1000)).toThrow();
    }
  });
  it('rejects deeply nested and oversized extras', () => {
    const value: Record<string, unknown> = {};
    let cursor = value;
    for (let i = 0; i < 14; i++) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    expect(() => assertSafeObject(value, 1000)).toThrow('deeply');
    expect(() => assertSafeObject({ value: 'x'.repeat(100) }, 10)).toThrow('large');
  });
  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])('rejects non-JSON value %s', (value) =>
    expect(() => assertSafeObject({ value }, 1000)).toThrow(),
  );
  it('maps malformed identifiers to a stable not-found error', () => {
    try {
      assertObjectId('not-an-object-id');
      expect.fail('Expected invalid identifier to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'NOT_FOUND' });
    }
  });
  it('supports strict developer schemas', () => {
    const schema = z.object({ language: z.enum(['fa', 'en']) }).strict();
    expect(() => schema.parse({ language: 'fa', admin: true })).toThrow();
  });
});
