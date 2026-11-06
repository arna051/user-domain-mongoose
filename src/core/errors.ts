export type UserDomainErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_PHONE'
  | 'DUPLICATE_PHONE'
  | 'NOT_FOUND'
  | 'SCOPE_REQUIRED'
  | 'INVALID_PERMISSION'
  | 'ROLE_ASSIGNED'
  | 'PROTECTED_ROLE'
  | 'USER_INACTIVE';

export class UserDomainError extends Error {
  constructor(
    public readonly code: UserDomainErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UserDomainError';
  }
}
