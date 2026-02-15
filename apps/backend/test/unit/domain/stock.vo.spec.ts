import { Stock } from '../../../src/core/domain/sale/value-objects/stock.vo';
import { InvalidStockError } from '../../../src/core/domain/sale/errors/invalid-stock.error';
import { SoldOutError } from '../../../src/core/domain/sale/errors/sold-out.error';

describe('Stock Value Object', () => {
  it('should create with valid positive integer', () => {
    const stock = Stock.create(100);
    expect(stock.value).toBe(100);
  });

  it('should reject negative values', () => {
    expect(() => Stock.create(-1)).toThrow(InvalidStockError);
  });

  it('should reject non-integer values', () => {
    expect(() => Stock.create(1.5)).toThrow(InvalidStockError);
  });

  it('should reject NaN', () => {
    expect(() => Stock.create(NaN)).toThrow(InvalidStockError);
  });

  it('should allow zero (valid state after all sold)', () => {
    const stock = Stock.create(0);
    expect(stock.isZero).toBe(true);
  });

  it('should report non-zero stock correctly', () => {
    const stock = Stock.create(5);
    expect(stock.isZero).toBe(false);
  });

  it('should decrement correctly', () => {
    const stock = Stock.create(5);
    const decremented = stock.decrement();
    expect(decremented.value).toBe(4);
    // Original is immutable
    expect(stock.value).toBe(5);
  });

  it('should throw SoldOutError when decrementing zero', () => {
    const stock = Stock.create(0);
    expect(() => stock.decrement()).toThrow(SoldOutError);
    expect(() => stock.decrement()).toThrow('all items have been sold');
  });

  it('should support equality comparison', () => {
    const a = Stock.create(10);
    const b = Stock.create(10);
    const c = Stock.create(5);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
