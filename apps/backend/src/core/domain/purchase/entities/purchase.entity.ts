import { PurchaseNumber } from '../value-objects/purchase-number.vo';
import { SKU } from '../../sale/value-objects/sku.vo';
import { UserId } from '../value-objects/user-id.vo';

export class Purchase {
  private constructor(
    private readonly _purchaseNo: PurchaseNumber,
    private readonly _sku: SKU,
    private readonly _userId: UserId,
    private readonly _purchasedAt: Date,
  ) {}

  static create(sku: SKU, userId: UserId): Purchase {
    return new Purchase(PurchaseNumber.generate(), sku, userId, new Date());
  }

  static reconstitute(props: {
    purchaseNo: string;
    sku: string;
    userId: string;
    purchasedAt: Date;
  }): Purchase {
    return new Purchase(
      PurchaseNumber.from(props.purchaseNo),
      SKU.create(props.sku),
      UserId.create(props.userId),
      props.purchasedAt,
    );
  }

  get purchaseNo(): PurchaseNumber {
    return this._purchaseNo;
  }
  get sku(): SKU {
    return this._sku;
  }
  get userId(): UserId {
    return this._userId;
  }
  get purchasedAt(): Date {
    return this._purchasedAt;
  }
}
