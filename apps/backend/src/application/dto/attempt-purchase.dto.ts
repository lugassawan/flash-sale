import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AttemptPurchaseDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9-]{1,64}$/, {
    message: 'SKU must be 1-64 alphanumeric characters or hyphens',
  })
  sku!: string;
}
