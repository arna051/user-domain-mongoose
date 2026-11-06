import { Schema } from 'mongoose';
import type { z } from 'zod';
import { UserDomainError } from './errors.js';
import {
  assertBirthDate,
  assertObjectId,
  assertSafeObject,
  avatarSchema,
  E164PhoneNormalizer,
  normalizeName,
} from './validation.js';
import type {
  AuthorizationResolution,
  CreateUserInput,
  DomainEvent,
  MutationContext,
  PermissionCatalog,
  PermissionExplanation,
  PermissionKey,
  ProfilePatch,
  Role,
  UserDomainOptions,
  UserProfile,
} from './types.js';

type AnyDoc = Record<string, any>;
type ExtraOf<S extends z.ZodTypeAny> = z.infer<S>;
const DEFAULT_SCOPE = '__global__';

export class UserDomain<S extends z.ZodTypeAny, C extends PermissionCatalog> {
  private readonly User: any;
  private readonly RoleModel: any;
  private readonly scopeMode;
  private readonly defaultScopeId;
  private readonly normalizer;
  private readonly permissionKeys: Set<string>;
  private readonly extraBytes: number;
  private readonly nameLength: number;

  constructor(private readonly options: UserDomainOptions<S, C>) {
    this.scopeMode = options.scope?.mode ?? 'global';
    this.defaultScopeId = options.scope?.defaultScopeId;
    this.normalizer =
      options.phone?.normalizer ?? new E164PhoneNormalizer(options.phone?.defaultCountry ?? 'IR');
    this.permissionKeys = new Set(options.accessControl.keys);
    this.extraBytes = options.limits?.extraBytes ?? 16_384;
    this.nameLength = options.limits?.nameLength ?? 100;
    const prefix = options.modelPrefix ?? 'UserDomain';

    const userSchema = new Schema(
      {
        scopeKey: { type: String, required: true, immutable: true },
        scopeId: String,
        normalizedPhone: { type: String, required: true },
        firstName: String,
        lastName: String,
        birthDate: Date,
        gender: String,
        avatar: { fileId: String, storage: String, version: Number },
        roles: { type: [String], default: [] },
        permissionOverrides: {
          allow: { type: [String], default: [] },
          deny: { type: [String], default: [] },
        },
        extra: Schema.Types.Mixed,
        status: { type: String, enum: ['active', 'disabled', 'deleted'], default: 'active' },
        authorizationVersion: { type: Number, default: 1 },
        schemaVersion: { type: Number, default: 1 },
      },
      { timestamps: true, optimisticConcurrency: true, strict: 'throw', minimize: false },
    );
    userSchema.index(
      { scopeKey: 1, normalizedPhone: 1 },
      { unique: true, name: 'uniq_scope_phone' },
    );
    userSchema.index({ scopeKey: 1, status: 1, _id: 1 }, { name: 'users_scope_status' });

    const roleSchema = new Schema(
      {
        scopeKey: { type: String, required: true, immutable: true },
        scopeId: String,
        key: { type: String, required: true },
        title: { type: String, required: true },
        description: String,
        permissions: { type: [String], default: [] },
        protected: { type: Boolean, default: false },
      },
      { timestamps: true, strict: 'throw' },
    );
    roleSchema.index({ scopeKey: 1, key: 1 }, { unique: true, name: 'uniq_scope_role' });

    this.User =
      options.connection.models[`${prefix}User`] ??
      options.connection.model(`${prefix}User`, userSchema);
    this.RoleModel =
      options.connection.models[`${prefix}Role`] ??
      options.connection.model(`${prefix}Role`, roleSchema);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([this.User.createIndexes(), this.RoleModel.createIndexes()]);
  }

  private scope(scopeId?: string): { scopeId?: string; scopeKey: string } {
    const resolved = scopeId ?? this.defaultScopeId;
    if (this.scopeMode === 'required' && !resolved)
      throw new UserDomainError('SCOPE_REQUIRED', 'scopeId is required');
    if (this.scopeMode === 'global' && resolved)
      throw new UserDomainError('INVALID_INPUT', 'scopeId is not allowed in global mode');
    return resolved ? { scopeId: resolved, scopeKey: resolved } : { scopeKey: DEFAULT_SCOPE };
  }

  private validatePermissions(values: readonly string[]): void {
    const unknown = values.find((key) => !this.permissionKeys.has(key));
    if (unknown)
      throw new UserDomainError('INVALID_PERMISSION', `Undeclared permission: ${unknown}`);
  }

  private parseExtra(value: unknown): ExtraOf<S> | undefined {
    if (value === undefined) return undefined;
    if (!this.options.extraSchema)
      throw new UserDomainError(
        'INVALID_INPUT',
        'extra is disabled unless extraSchema is configured',
      );
    assertSafeObject(value, this.extraBytes);
    return this.options.extraSchema.parse(value) as ExtraOf<S>;
  }

  private mapUser(doc: AnyDoc): UserProfile<ExtraOf<S>, PermissionKey<C>> {
    const object = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
      id: String(object._id),
      ...(object.scopeId ? { scopeId: object.scopeId } : {}),
      phone: object.normalizedPhone,
      ...(object.firstName ? { firstName: object.firstName } : {}),
      ...(object.lastName ? { lastName: object.lastName } : {}),
      ...(object.birthDate ? { birthDate: object.birthDate } : {}),
      ...(object.gender ? { gender: object.gender } : {}),
      ...(object.avatar?.fileId ? { avatar: object.avatar } : {}),
      roles: [...object.roles],
      permissionOverrides: {
        allow: [...object.permissionOverrides.allow],
        deny: [...object.permissionOverrides.deny],
      },
      ...(object.extra !== undefined ? { extra: object.extra } : {}),
      status: object.status,
      authorizationVersion: object.authorizationVersion,
      schemaVersion: object.schemaVersion,
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
    };
  }

  private async emit(
    type: string,
    doc: AnyDoc,
    context?: MutationContext,
    changedFields?: string[],
  ): Promise<void> {
    if (!this.options.observer) return;
    const event: DomainEvent = {
      type,
      userId: String(doc._id),
      ...(doc.scopeId ? { scopeId: doc.scopeId } : {}),
      ...(context?.actorId ? { actorId: context.actorId } : {}),
      ...(context?.correlationId ? { correlationId: context.correlationId } : {}),
      ...(changedFields ? { changedFields } : {}),
      occurredAt: new Date(),
    };
    try {
      await this.options.observer.onEvent(event);
    } catch (error) {
      await this.options.observer.onError?.(error, type);
    }
  }

  async create(
    input: CreateUserInput<ExtraOf<S>>,
    context?: MutationContext,
  ): Promise<UserProfile<ExtraOf<S>, PermissionKey<C>>> {
    const scoped = this.scope(input.scopeId);
    const phone = this.normalizer.normalize(input.phone);
    assertBirthDate(input.birthDate);
    const extra = this.parseExtra(input.extra);
    if (input.avatar) {
      avatarSchema.parse(input.avatar);
      await this.options.avatarPolicy?.validate(input.avatar, scoped);
    }
    try {
      const doc = await this.User.create({
        ...scoped,
        normalizedPhone: phone,
        firstName: normalizeName(input.firstName, this.nameLength),
        lastName: normalizeName(input.lastName, this.nameLength),
        birthDate: input.birthDate,
        gender: normalizeName(input.gender, 80),
        avatar: input.avatar,
        extra,
      });
      await this.emit('user.created', doc, context);
      return this.mapUser(doc);
    } catch (error: any) {
      if (error?.code === 11000)
        throw new UserDomainError(
          'DUPLICATE_PHONE',
          'A user with this phone already exists',
          error,
        );
      throw error;
    }
  }

  async findOrCreateByPhone(input: CreateUserInput<ExtraOf<S>>, context?: MutationContext) {
    try {
      return await this.create(input, context);
    } catch (error) {
      if (!(error instanceof UserDomainError) || error.code !== 'DUPLICATE_PHONE') throw error;
      const found = await this.findByPhone(input.phone, input.scopeId);
      if (!found) throw error;
      return found;
    }
  }

  async findById(id: string, scopeId?: string) {
    assertObjectId(id);
    const doc = await this.User.findOne({ _id: id, scopeKey: this.scope(scopeId).scopeKey }).lean();
    return doc ? this.mapUser(doc) : null;
  }

  async findByPhone(phone: string, scopeId?: string) {
    const doc = await this.User.findOne({
      scopeKey: this.scope(scopeId).scopeKey,
      normalizedPhone: this.normalizer.normalize(phone),
    }).lean();
    return doc ? this.mapUser(doc) : null;
  }

  async updateProfile(
    id: string,
    scopeId: string | undefined,
    patch: ProfilePatch<ExtraOf<S>>,
    context?: MutationContext,
  ) {
    assertObjectId(id);
    const allowed = ['firstName', 'lastName', 'birthDate', 'gender', 'avatar', 'extra'] as const;
    const unknown = Object.keys(patch).find((key) => !allowed.includes(key as never));
    if (unknown)
      throw new UserDomainError('INVALID_INPUT', `Protected or unknown profile field: ${unknown}`);
    assertBirthDate(patch.birthDate ?? undefined);
    const update: AnyDoc = {};
    for (const field of ['firstName', 'lastName', 'gender'] as const)
      if (field in patch)
        update[field] =
          normalizeName(patch[field], field === 'gender' ? 80 : this.nameLength) ?? null;
    if ('birthDate' in patch) update.birthDate = patch.birthDate;
    if ('extra' in patch) update.extra = patch.extra === null ? null : this.parseExtra(patch.extra);
    if ('avatar' in patch) {
      if (patch.avatar) {
        avatarSchema.parse(patch.avatar);
        await this.options.avatarPolicy?.validate(patch.avatar, {
          ...(scopeId ? { scopeId } : {}),
          userId: id,
        });
      }
      update.avatar = patch.avatar;
    }
    const doc = await this.User.findOneAndUpdate(
      { _id: id, scopeKey: this.scope(scopeId).scopeKey },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!doc) throw new UserDomainError('NOT_FOUND', 'User not found');
    await this.emit('user.profile_updated', doc, context, Object.keys(update));
    return this.mapUser(doc);
  }

  async createRole(
    scopeId: string | undefined,
    role: Omit<Role<PermissionKey<C>>, 'scopeId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Role<PermissionKey<C>>> {
    this.validatePermissions(role.permissions);
    const scoped = this.scope(scopeId);
    const doc = await this.RoleModel.create({ ...scoped, ...role });
    return this.mapRole(doc);
  }

  private mapRole(doc: AnyDoc): Role<PermissionKey<C>> {
    const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
      key: o.key,
      title: o.title,
      ...(o.description ? { description: o.description } : {}),
      permissions: [...o.permissions],
      protected: o.protected,
      ...(o.scopeId ? { scopeId: o.scopeId } : {}),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    } as Role<PermissionKey<C>>;
  }

  async assignRole(userId: string, roleKey: string, scopeId?: string, context?: MutationContext) {
    assertObjectId(userId);
    const scopeKey = this.scope(scopeId).scopeKey;
    const role = await this.RoleModel.exists({ scopeKey, key: roleKey });
    if (!role) throw new UserDomainError('NOT_FOUND', 'Role not found');
    const doc = await this.User.findOneAndUpdate(
      { _id: userId, scopeKey, roles: { $ne: roleKey } },
      { $addToSet: { roles: roleKey }, $inc: { authorizationVersion: 1 } },
      { new: true },
    );
    const current = doc ?? (await this.User.findOne({ _id: userId, scopeKey }));
    if (!current) throw new UserDomainError('NOT_FOUND', 'User not found');
    if (doc) await this.emit('user.role_assigned', doc, context, ['roles']);
    return this.mapUser(current);
  }

  async removeRole(userId: string, roleKey: string, scopeId?: string, context?: MutationContext) {
    assertObjectId(userId);
    const scopeKey = this.scope(scopeId).scopeKey;
    const doc = await this.User.findOneAndUpdate(
      { _id: userId, scopeKey, roles: roleKey },
      { $pull: { roles: roleKey }, $inc: { authorizationVersion: 1 } },
      { new: true },
    );
    const current = doc ?? (await this.User.findOne({ _id: userId, scopeKey }));
    if (!current) throw new UserDomainError('NOT_FOUND', 'User not found');
    if (doc) await this.emit('user.role_removed', doc, context, ['roles']);
    return this.mapUser(current);
  }

  async setPermissionOverrides(
    userId: string,
    overrides: { allow: PermissionKey<C>[]; deny: PermissionKey<C>[] },
    scopeId?: string,
    context?: MutationContext,
  ) {
    assertObjectId(userId);
    this.validatePermissions([...overrides.allow, ...overrides.deny]);
    if (overrides.allow.some((key) => overrides.deny.includes(key)))
      throw new UserDomainError('INVALID_INPUT', 'A permission cannot be both allowed and denied');
    const doc = await this.User.findOneAndUpdate(
      { _id: userId, scopeKey: this.scope(scopeId).scopeKey },
      { $set: { permissionOverrides: overrides }, $inc: { authorizationVersion: 1 } },
      { new: true },
    );
    if (!doc) throw new UserDomainError('NOT_FOUND', 'User not found');
    await this.emit('user.permission_overrides_changed', doc, context, ['permissionOverrides']);
    return this.mapUser(doc);
  }

  async resolveAuthorization(
    userId: string,
    scopeId?: string,
  ): Promise<AuthorizationResolution<PermissionKey<C>>> {
    assertObjectId(userId);
    const scopeKey = this.scope(scopeId).scopeKey;
    const user = await this.User.findOne({ _id: userId, scopeKey }).lean();
    if (!user) throw new UserDomainError('NOT_FOUND', 'User not found');
    if (user.status !== 'active') throw new UserDomainError('USER_INACTIVE', 'User is not active');
    const roles = await this.RoleModel.find({ scopeKey, key: { $in: user.roles } }).lean();
    const effective = new Set<string>();
    for (const role of roles) for (const permission of role.permissions) effective.add(permission);
    for (const permission of user.permissionOverrides.allow) effective.add(permission);
    for (const permission of user.permissionOverrides.deny) effective.delete(permission);
    return {
      userId,
      roles: [...user.roles],
      permissions: [...effective].sort() as PermissionKey<C>[],
      authorizationVersion: user.authorizationVersion,
    };
  }

  async explainPermission(
    userId: string,
    permission: PermissionKey<C>,
    scopeId?: string,
  ): Promise<PermissionExplanation> {
    assertObjectId(userId);
    this.validatePermissions([permission]);
    const scopeKey = this.scope(scopeId).scopeKey;
    const user = await this.User.findOne({ _id: userId, scopeKey }).lean();
    if (!user) throw new UserDomainError('NOT_FOUND', 'User not found');
    const sources: PermissionExplanation['sources'] = [];
    const roles = await this.RoleModel.find({
      scopeKey,
      key: { $in: user.roles },
      permissions: permission,
    }).lean();
    for (const role of roles) sources.push({ type: 'role', key: role.key });
    if (user.permissionOverrides.allow.includes(permission))
      sources.push({ type: 'direct-allow', key: permission });
    if (user.permissionOverrides.deny.includes(permission))
      sources.push({ type: 'direct-deny', key: permission });
    return {
      allowed:
        sources.some((s) => s.type !== 'direct-deny') &&
        !sources.some((s) => s.type === 'direct-deny'),
      sources,
    };
  }

  async setStatus(
    userId: string,
    status: 'active' | 'disabled' | 'deleted',
    scopeId?: string,
    context?: MutationContext,
  ) {
    assertObjectId(userId);
    const doc = await this.User.findOneAndUpdate(
      { _id: userId, scopeKey: this.scope(scopeId).scopeKey },
      { $set: { status }, $inc: { authorizationVersion: 1 } },
      { new: true },
    );
    if (!doc) throw new UserDomainError('NOT_FOUND', 'User not found');
    await this.emit(`user.${status === 'active' ? 'reactivated' : status}`, doc, context, [
      'status',
    ]);
    return this.mapUser(doc);
  }

  asAuthUserRepository() {
    return {
      findOrCreateByPhone: (phone: string, scopeId?: string) =>
        this.findOrCreateByPhone({ phone, ...(scopeId ? { scopeId } : {}) } as CreateUserInput<
          ExtraOf<S>
        >),
      findById: (id: string, scopeId?: string) => this.findById(id, scopeId),
      resolveAuthorization: (id: string, scopeId?: string) =>
        this.resolveAuthorization(id, scopeId),
    };
  }
}

export function createUserDomain<
  S extends z.ZodTypeAny = z.ZodNever,
  const C extends PermissionCatalog = PermissionCatalog,
>(options: UserDomainOptions<S, C>): UserDomain<S, C> {
  return new UserDomain(options);
}
