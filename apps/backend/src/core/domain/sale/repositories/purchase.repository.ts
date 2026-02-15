import { SKU } from '../value-objects/sku.vo';
import { UserId } from '../../purchase/value-objects/user-id.vo';
import { Purchase } from '../../purchase/entities/purchase.entity';

export const PURCHASE_REPOSITORY = Symbol('PURCHASE_REPOSITORY');

export interface PurchaseRepository {
  findByUser(sku: SKU, userId: UserId): Promise<Purchase | null>;
  persist(purchase: Purchase): Promise<void>;
}
