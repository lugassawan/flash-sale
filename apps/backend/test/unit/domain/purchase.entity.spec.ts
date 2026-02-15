import { Purchase } from '../../../src/core/domain/purchase/entities/purchase.entity';
import { SKU } from '../../../src/core/domain/sale/value-objects/sku.vo';
import { UserId } from '../../../src/core/domain/purchase/value-objects/user-id.vo';

describe('Purchase Entity', () => {
  const sku = SKU.create('WIDGET-001');
  const userId = UserId.create('alice@test.com');

  describe('create', () => {
    it('should create a new purchase with generated purchase number', () => {
      const purchase = Purchase.create(sku, userId);
      expect(purchase.purchaseNo.value).toMatch(/^PUR-\d{8}-\d{4}$/);
      expect(purchase.sku.equals(sku)).toBe(true);
      expect(purchase.userId.equals(userId)).toBe(true);
      expect(purchase.purchasedAt).toBeInstanceOf(Date);
    });

    it('should generate unique purchase numbers', () => {
      const p1 = Purchase.create(sku, userId);
      const p2 = Purchase.create(sku, userId);
      expect(p1.purchaseNo.value).not.toBe(p2.purchaseNo.value);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute from stored data', () => {
      const purchasedAt = new Date('2026-02-15T10:30:00Z');
      const purchase = Purchase.reconstitute({
        purchaseNo: 'PUR-20260215-0001',
        sku: 'WIDGET-001',
        userId: 'alice@test.com',
        purchasedAt,
      });

      expect(purchase.purchaseNo.value).toBe('PUR-20260215-0001');
      expect(purchase.sku.value).toBe('WIDGET-001');
      expect(purchase.userId.value).toBe('alice@test.com');
      expect(purchase.purchasedAt).toEqual(purchasedAt);
    });
  });
});
