import { InvalidSKUError } from '../errors/invalid-sku.error';

export class SKU {
  private static readonly PATTERN = /^[A-Za-z0-9-]{1,64}$/;

  private constructor(private readonly _value: string) {}

  static create(value: string): SKU {
    if (!value || !SKU.PATTERN.test(value)) {
      throw new InvalidSKUError(value);
    }
    return new SKU(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: SKU): boolean {
    return this._value === other._value;
  }
}
