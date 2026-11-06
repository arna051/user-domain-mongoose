import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { z } from 'zod';
import { isObjectIdOrHexString } from 'mongoose';
import { UserDomainError } from './errors.js';
import type { PhoneNormalizer } from './types.js';

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

export class E164PhoneNormalizer implements PhoneNormalizer {
  constructor(private readonly defaultCountry: CountryCode = 'IR') {}

  normalize(value: string): string {
    const trimmed = value.trim();
    const candidate =
      trimmed.startsWith('98') && !trimmed.startsWith('+') ? `+${trimmed}` : trimmed;
    const parsed = parsePhoneNumberFromString(candidate, this.defaultCountry);
    if (!parsed?.isValid()) throw new UserDomainError('INVALID_PHONE', 'Phone number is invalid');
    return parsed.number;
  }
}

export const avatarSchema = z
  .object({
    fileId: z.string().trim().min(1).max(200),
    storage: z.string().trim().min(1).max(80).optional(),
    version: z.number().int().nonnegative().optional(),
  })
  .strict();

export function normalizeName(value: string | null | undefined, max = 100): string | undefined {
  if (value == null) return undefined;
  const normalized = value.normalize('NFC').trim();
  if (!normalized) return undefined;
  if (normalized.length > max)
    throw new UserDomainError('INVALID_INPUT', `Name exceeds ${max} characters`);
  return normalized;
}

export function assertSafeObject(value: unknown, maxBytes: number): void {
  const seen = new WeakSet<object>();
  const visit = (node: unknown, depth: number): void => {
    if (depth > 12) throw new UserDomainError('INVALID_INPUT', 'Extra data is nested too deeply');
    if (node && typeof node === 'object') {
      if (seen.has(node))
        throw new UserDomainError('INVALID_INPUT', 'Extra data must not contain cycles');
      seen.add(node);
      if (
        !Array.isArray(node) &&
        Object.getPrototypeOf(node) !== Object.prototype &&
        Object.getPrototypeOf(node) !== null
      ) {
        throw new UserDomainError('INVALID_INPUT', 'Extra data must contain plain objects only');
      }
      for (const [key, child] of Object.entries(node)) {
        if (key.startsWith('$') || key.includes('.') || forbiddenKeys.has(key)) {
          throw new UserDomainError('INVALID_INPUT', `Unsafe extra key: ${key}`);
        }
        visit(child, depth + 1);
      }
    } else if (typeof node === 'number' && !Number.isFinite(node)) {
      throw new UserDomainError('INVALID_INPUT', 'Extra data must contain finite numbers');
    } else if (!['string', 'number', 'boolean'].includes(typeof node) && node !== null) {
      throw new UserDomainError('INVALID_INPUT', 'Extra data must be JSON-compatible');
    }
  };
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > maxBytes)
    throw new UserDomainError('INVALID_INPUT', 'Extra data is too large');
}

export function assertObjectId(value: string): void {
  if (!isObjectIdOrHexString(value)) throw new UserDomainError('NOT_FOUND', 'User not found');
}

export function assertBirthDate(value: Date | undefined): void {
  if (!value) return;
  if (Number.isNaN(value.getTime()) || value.getTime() > Date.now())
    throw new UserDomainError('INVALID_INPUT', 'Birth date must be a valid, non-future date');
}
