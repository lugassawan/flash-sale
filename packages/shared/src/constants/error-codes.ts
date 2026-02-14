export enum ErrorCode {
  // Purchase business rejections
  SALE_NOT_ACTIVE = 'SALE_NOT_ACTIVE',
  SOLD_OUT = 'SOLD_OUT',
  ALREADY_PURCHASED = 'ALREADY_PURCHASED',

  // Admin business rejections
  SALE_NOT_MODIFIABLE = 'SALE_NOT_MODIFIABLE',

  // Validation & auth errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',

  // Infrastructure errors
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}
