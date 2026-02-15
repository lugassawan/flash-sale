import { SaleState } from '@/types/sale.types';

interface SaleStatusProps {
  state: SaleState;
  productName: string;
  reason?: string;
}

const STATE_CONFIG: Record<SaleState, { label: string; className: string }> = {
  [SaleState.UPCOMING]: { label: 'Upcoming', className: 'badge--upcoming' },
  [SaleState.ACTIVE]: { label: 'Live Now', className: 'badge--active' },
  [SaleState.ENDED]: { label: 'Ended', className: 'badge--ended' },
};

export function SaleStatus({ state, productName, reason }: SaleStatusProps) {
  const config = STATE_CONFIG[state];

  return (
    <div className="sale-status">
      <div className="sale-status__header">
        <span className={`badge ${config.className}`}>
          {state === SaleState.ACTIVE && <span className="badge__pulse" />}
          {config.label}
        </span>
      </div>
      <h1 className="sale-status__title">{productName || 'Flash Sale'}</h1>
      {state === SaleState.ENDED && reason && (
        <p className="sale-status__reason">
          {reason === 'SOLD_OUT' ? 'All items have been sold' : 'Sale time has expired'}
        </p>
      )}
    </div>
  );
}
