export class PurchaseNumber {
  private static _counter = 0;

  private constructor(private readonly _value: string) {}

  static generate(): PurchaseNumber {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    PurchaseNumber._counter = (PurchaseNumber._counter + 1) % 10000;
    const seqPart = String(PurchaseNumber._counter).padStart(4, '0');
    return new PurchaseNumber(`PUR-${datePart}-${seqPart}`);
  }

  static from(value: string): PurchaseNumber {
    return new PurchaseNumber(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: PurchaseNumber): boolean {
    return this._value === other._value;
  }
}
