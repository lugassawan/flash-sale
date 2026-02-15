import { InvalidStockError } from '../errors/invalid-stock.error';
import { SoldOutError } from '../errors/sold-out.error';

export class Stock {
  private constructor(private readonly _value: number) {}

  static create(quantity: number): Stock {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new InvalidStockError(quantity);
    }
    return new Stock(quantity);
  }

  get value(): number {
    return this._value;
  }

  get isZero(): boolean {
    return this._value === 0;
  }

  decrement(): Stock {
    if (this._value <= 0) {
      throw new SoldOutError();
    }
    return new Stock(this._value - 1);
  }

  equals(other: Stock): boolean {
    return this._value === other._value;
  }
}
