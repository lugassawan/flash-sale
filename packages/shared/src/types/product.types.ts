import { SaleState } from '../constants/sale-states';

export interface ProductCreateRequest {
  sku: string;
  productName: string;
  initialStock: number;
  startTime: string;
  endTime: string;
}

export interface ProductResponse {
  sku: string;
  productName: string;
  initialStock: number;
  startTime: string;
  endTime: string;
  state: SaleState;
  createdAt: string;
}

export interface ProductDetail {
  sku: string;
  productName: string;
  initialStock: number;
  currentStock: number;
  startTime: string;
  endTime: string;
  state: SaleState;
  totalPurchases: number;
  createdAt: string;
}

export type ProductUpdateRequest = Partial<Omit<ProductCreateRequest, 'sku'>>;

export interface DeleteProductResponse {
  message: string;
}
