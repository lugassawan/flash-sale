import { SaleState } from '@/core/domain/sale/value-objects/sale-state.vo';

export class SaleStatusResponseDto {
  sku!: string;
  state!: SaleState;
  stock!: number;
  initialStock!: number;
  productName!: string;
  startTime!: string;
  endTime!: string;

  static from(data: {
    sku: string;
    state: SaleState;
    stock: number;
    initialStock: number;
    productName: string;
    startTime: string;
    endTime: string;
  }): SaleStatusResponseDto {
    const dto = new SaleStatusResponseDto();
    dto.sku = data.sku;
    dto.state = data.state;
    dto.stock = data.stock;
    dto.initialStock = data.initialStock;
    dto.productName = data.productName;
    dto.startTime = data.startTime;
    dto.endTime = data.endTime;
    return dto;
  }
}
