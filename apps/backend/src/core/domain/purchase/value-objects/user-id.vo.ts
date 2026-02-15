import { InvalidUserIdError } from '../../sale/errors/invalid-user-id.error';

export class UserId {
  private constructor(private readonly _value: string) {}

  static create(value: string): UserId {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.length === 0) {
      throw new InvalidUserIdError('User ID must be a non-empty string');
    }
    if (trimmed.length > 255) {
      throw new InvalidUserIdError('User ID must not exceed 255 characters');
    }
    return new UserId(trimmed);
  }

  get value(): string {
    return this._value;
  }

  equals(other: UserId): boolean {
    return this._value === other._value;
  }
}
