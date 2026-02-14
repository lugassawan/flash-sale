import { SaleState } from '../constants/sale-states';

export interface SaleStatus {
  sku: string;
  state: SaleState;
  stock: number;
  initialStock: number;
  productName: string;
  startTime: string;
  endTime: string;
}

export interface SaleEvent {
  sku: string;
}

export interface SaleInitialEvent extends SaleEvent {
  state: SaleState;
  stock: number;
  startTime: string;
  endTime: string;
}

export interface SaleStockUpdateEvent extends SaleEvent {
  stock: number;
}

export interface SaleStateChangeEvent extends SaleEvent {
  state: SaleState.ACTIVE | SaleState.ENDED;
  reason?: string;
}
