export interface PurchaseAttemptResult {
  purchaseNo?: string;
  purchasedAt?: string;
}

export interface PurchaseRecord {
  purchaseNo: string;
  purchasedAt: string;
}

export interface PurchaseRequest {
  sku: string;
  qty: number;
}
