import { z } from 'zod';
import type { AccessControl, PermissionCatalog } from './types.js';

export function defineAccessControl<const T extends PermissionCatalog>(config: {
  permissions: T;
}): AccessControl<T> {
  const definition = z.object({
    title: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    category: z.string().max(80).optional(),
  });
  z.record(z.string().min(1).max(120), definition).parse(config.permissions);
  return Object.freeze({
    permissions: Object.freeze(config.permissions),
    keys: Object.freeze(Object.keys(config.permissions)),
  }) as AccessControl<T>;
}
