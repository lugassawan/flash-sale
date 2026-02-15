import { PurchaseNumber } from '../../../src/core/domain/purchase/value-objects/purchase-number.vo';

describe('PurchaseNumber Value Object', () => {
  it('should generate with PUR-YYYYMMDD-NNNN format', () => {
    const pn = PurchaseNumber.generate();
    expect(pn.value).toMatch(/^PUR-\d{8}-\d{4}$/);
  });

  it('should generate sequential numbers', () => {
    const pn1 = PurchaseNumber.generate();
    const pn2 = PurchaseNumber.generate();
    expect(pn1.value).not.toBe(pn2.value);
  });

  it('should reconstitute from existing value', () => {
    const original = 'PUR-20260215-0042';
    const pn = PurchaseNumber.from(original);
    expect(pn.value).toBe(original);
  });

  it('should support equality comparison', () => {
    const a = PurchaseNumber.from('PUR-20260215-0001');
    const b = PurchaseNumber.from('PUR-20260215-0001');
    const c = PurchaseNumber.from('PUR-20260215-0002');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
