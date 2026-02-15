import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsDateString,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateSaleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9-]{1,64}$/, {
    message: 'SKU must be 1-64 alphanumeric characters or hyphens',
  })
  sku!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  productName!: string;

  @IsInt()
  @Min(0)
  initialStock!: number;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;
}
