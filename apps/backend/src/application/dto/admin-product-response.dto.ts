import { SaleState } from '@/core/domain/sale/value-objects/sale-state.vo';

export class AdminProductResponseDto {
  sku!: string;
  productName!: string;
  initialStock!: number;
  startTime!: string;
  endTime!: string;
  state!: SaleState;
  createdAt!: string;

  static from(data: {
    sku: string;
    productName: string;
    initialStock: number;
    startTime: string;
    endTime: string;
    state: SaleState;
    createdAt: string;
  }): AdminProductResponseDto {
    const dto = new AdminProductResponseDto();
    dto.sku = data.sku;
    dto.productName = data.productName;
    dto.initialStock = data.initialStock;
    dto.startTime = data.startTime;
    dto.endTime = data.endTime;
    dto.state = data.state;
    dto.createdAt = data.createdAt;
    return dto;
  }
}

export class AdminProductDetailResponseDto extends AdminProductResponseDto {
  currentStock!: number;
  totalPurchases!: number;

  static fromDetail(data: {
    sku: string;
    productName: string;
    initialStock: number;
    currentStock: number;
    startTime: string;
    endTime: string;
    state: SaleState;
    totalPurchases: number;
    createdAt: string;
  }): AdminProductDetailResponseDto {
    const dto = new AdminProductDetailResponseDto();
    dto.sku = data.sku;
    dto.productName = data.productName;
    dto.initialStock = data.initialStock;
    dto.currentStock = data.currentStock;
    dto.startTime = data.startTime;
    dto.endTime = data.endTime;
    dto.state = data.state;
    dto.totalPurchases = data.totalPurchases;
    dto.createdAt = data.createdAt;
    return dto;
  }
}
