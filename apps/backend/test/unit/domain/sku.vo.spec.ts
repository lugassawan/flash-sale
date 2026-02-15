import { SKU } from '../../../src/core/domain/sale/value-objects/sku.vo';
import { InvalidSKUError } from '../../../src/core/domain/sale/errors/invalid-sku.error';

describe('SKU Value Object', () => {
  it('should create with valid alphanumeric value', () => {
    const sku = SKU.create('WIDGET-001');
    expect(sku.value).toBe('WIDGET-001');
  });

  it('should accept lowercase letters', () => {
    const sku = SKU.create('widget-abc');
    expect(sku.value).toBe('widget-abc');
  });

  it('should accept hyphens', () => {
    const sku = SKU.create('A-B-C');
    expect(sku.value).toBe('A-B-C');
  });

  it('should accept single character', () => {
    const sku = SKU.create('A');
    expect(sku.value).toBe('A');
  });

  it('should accept exactly 64 characters', () => {
    const value = 'A'.repeat(64);
    const sku = SKU.create(value);
    expect(sku.value).toBe(value);
  });

  it('should reject empty string', () => {
    expect(() => SKU.create('')).toThrow(InvalidSKUError);
  });

  it('should reject string longer than 64 characters', () => {
    expect(() => SKU.create('A'.repeat(65))).toThrow(InvalidSKUError);
  });

  it('should reject special characters', () => {
    expect(() => SKU.create('WIDGET@001')).toThrow(InvalidSKUError);
  });

  it('should reject spaces', () => {
    expect(() => SKU.create('WIDGET 001')).toThrow(InvalidSKUError);
  });

  it('should support equality comparison', () => {
    const a = SKU.create('WIDGET-001');
    const b = SKU.create('WIDGET-001');
    const c = SKU.create('WIDGET-002');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
