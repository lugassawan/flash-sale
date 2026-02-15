export const PURCHASE_PERSISTENCE = Symbol('PURCHASE_PERSISTENCE');

export interface PurchaseJobData {
  purchaseNo: string;
  sku: string;
  userId: string;
  purchasedAt: string;
}

export interface PurchasePersistencePort {
  enqueue(job: PurchaseJobData): Promise<void>;
}
