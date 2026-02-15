import { SKU } from '../value-objects/sku.vo';
import { SaleState } from '../value-objects/sale-state.vo';
import { UserId } from '../../purchase/value-objects/user-id.vo';
import { Sale } from '../entities/sale.entity';

export const SALE_REPOSITORY = Symbol('SALE_REPOSITORY');

export interface SaleRepository {
  attemptPurchase(sku: SKU, userId: UserId): Promise<PurchaseAttemptResult>;
  getSaleStatus(sku: SKU): Promise<SaleStatus>;
  initializeSale(sale: Sale): Promise<void>;
  transitionState(sku: SKU, now: Date): Promise<string>;
  deleteSale(sku: SKU): Promise<void>;
}

export type PurchaseAttemptResult =
  | {
      status: 'success';
      remainingStock: number;
      purchaseNo: string;
      purchasedAt: string;
    }
  | {
      status: 'rejected';
      code: 'SALE_NOT_ACTIVE' | 'SOLD_OUT' | 'ALREADY_PURCHASED';
    };

export interface SaleStatus {
  sku: string;
  state: SaleState;
  stock: number;
  initialStock: number;
  productName: string;
  startTime: string;
  endTime: string;
}
