interface StockCounterProps {
  stock: number;
  initialStock: number;
}

export function StockCounter({ stock, initialStock }: StockCounterProps) {
  const percentage = initialStock > 0 ? (stock / initialStock) * 100 : 0;
  const isLow = percentage <= 20;

  return (
    <div className="stock-counter">
      <div className="stock-counter__numbers">
        <span className={`stock-counter__current ${isLow ? 'stock-counter__current--low' : ''}`}>
          {stock}
        </span>
        <span className="stock-counter__separator">/</span>
        <span className="stock-counter__total">{initialStock}</span>
      </div>
      <p className="stock-counter__label">items remaining</p>
      <div className="stock-counter__bar">
        <div
          className={`stock-counter__fill ${isLow ? 'stock-counter__fill--low' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
