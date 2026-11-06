import type { CountryCode } from 'libphonenumber-js';
import type { Connection } from 'mongoose';
import type { z } from 'zod';

export type UserStatus = 'active' | 'disabled' | 'deleted';
export type ScopeMode = 'global' | 'optional' | 'required';
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface AvatarReference {
  fileId: string;
  storage?: string;
  version?: number;
}

export interface PermissionDefinition {
  title: string;
  description?: string;
  category?: string;
}

export type PermissionCatalog = Record<string, PermissionDefinition>;
export type PermissionKey<T extends PermissionCatalog> = Extract<keyof T, string>;

export interface AccessControl<T extends PermissionCatalog> {
  readonly permissions: T;
  readonly keys: readonly PermissionKey<T>[];
}

export interface PermissionOverrides<P extends string> {
  allow: P[];
  deny: P[];
}

export interface UserProfile<TExtra, P extends string> {
  id: string;
  scopeId?: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  birthDate?: Date;
  gender?: string;
  avatar?: AvatarReference;
  roles: string[];
  permissionOverrides: PermissionOverrides<P>;
  extra?: TExtra;
  status: UserStatus;
  authorizationVersion: number;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput<TExtra> {
  scopeId?: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  birthDate?: Date;
  gender?: string;
  avatar?: AvatarReference;
  extra?: TExtra;
}

export interface ProfilePatch<TExtra> {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: Date | null;
  gender?: string | null;
  avatar?: AvatarReference | null;
  extra?: TExtra | null;
}

export interface Role<P extends string> {
  key: string;
  title: string;
  description?: string;
  permissions: P[];
  protected: boolean;
  scopeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainEvent {
  type: string;
  userId?: string;
  scopeId?: string;
  actorId?: string;
  correlationId?: string;
  changedFields?: string[];
  occurredAt: Date;
}

export interface MutationContext {
  actorId?: string;
  correlationId?: string;
}

export interface PhoneNormalizer {
  normalize(value: string): string;
}

export interface DomainObserver {
  onEvent(event: Readonly<DomainEvent>): void | Promise<void>;
  onError?(error: unknown, operation: string): void | Promise<void>;
}

export interface AvatarPolicy {
  validate(
    reference: AvatarReference,
    context: { scopeId?: string; userId?: string },
  ): Promise<void>;
}

export interface UserDomainOptions<
  TExtraSchema extends z.ZodTypeAny,
  TPermissions extends PermissionCatalog,
> {
  connection: Connection;
  extraSchema?: TExtraSchema;
  accessControl: AccessControl<TPermissions>;
  scope?: { mode: ScopeMode; defaultScopeId?: string };
  phone?: { defaultCountry?: CountryCode; normalizer?: PhoneNormalizer };
  limits?: { extraBytes?: number; nameLength?: number };
  modelPrefix?: string;
  observer?: DomainObserver;
  avatarPolicy?: AvatarPolicy;
}

export interface AuthorizationResolution<P extends string> {
  userId: string;
  roles: string[];
  permissions: P[];
  authorizationVersion: number;
}

export interface PermissionExplanation {
  allowed: boolean;
  sources: Array<{ type: 'role' | 'direct-allow' | 'direct-deny'; key: string }>;
}
