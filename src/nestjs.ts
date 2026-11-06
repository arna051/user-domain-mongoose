import { DynamicModule, Module, type FactoryProvider, type Provider } from '@nestjs/common';
import { createUserDomain } from './core/domain.js';
import type { PermissionCatalog, UserDomainOptions } from './core/types.js';
import type { z } from 'zod';

export const USER_DOMAIN = Symbol('USER_DOMAIN');
export const USER_DOMAIN_OPTIONS = Symbol('USER_DOMAIN_OPTIONS');

export interface UserDomainAsyncOptions<S extends z.ZodTypeAny, C extends PermissionCatalog> {
  imports?: DynamicModule['imports'];
  inject?: FactoryProvider['inject'];
  providers?: Provider[];
  useFactory: (
    ...dependencies: never[]
  ) => UserDomainOptions<S, C> | Promise<UserDomainOptions<S, C>>;
}

@Module({})
export class UserDomainModule {
  static forRoot<S extends z.ZodTypeAny, const C extends PermissionCatalog>(
    options: UserDomainOptions<S, C>,
  ): DynamicModule {
    return {
      module: UserDomainModule,
      providers: [
        { provide: USER_DOMAIN_OPTIONS, useValue: options },
        { provide: USER_DOMAIN, useFactory: () => createUserDomain(options) },
      ],
      exports: [USER_DOMAIN],
    };
  }

  static forRootAsync<S extends z.ZodTypeAny, const C extends PermissionCatalog>(
    options: UserDomainAsyncOptions<S, C>,
  ): DynamicModule {
    return {
      module: UserDomainModule,
      imports: options.imports ?? [],
      providers: [
        ...(options.providers ?? []),
        {
          provide: USER_DOMAIN_OPTIONS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        {
          provide: USER_DOMAIN,
          inject: [USER_DOMAIN_OPTIONS],
          useFactory: (config: UserDomainOptions<S, C>) => createUserDomain(config),
        },
      ],
      exports: [USER_DOMAIN],
    };
  }
}
