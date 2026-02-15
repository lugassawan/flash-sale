import type { PurchaseRecord, ApiError } from '@/types/sale.types';
import type { PurchaseStatus } from '@/hooks/usePurchase';
import { ErrorCode } from '@/types/sale.types';

interface PurchaseResultProps {
  status: PurchaseStatus;
  purchase: PurchaseRecord | null;
  error: ApiError | null;
  onRetry: () => void;
}

const ERROR_CONFIG: Record<string, { icon: string; className: string }> = {
  [ErrorCode.SOLD_OUT]: { icon: '\u2715', className: 'result--sold-out' },
  [ErrorCode.ALREADY_PURCHASED]: { icon: '\u0021', className: 'result--already-purchased' },
  [ErrorCode.SALE_NOT_ACTIVE]: { icon: '\u25CB', className: 'result--not-active' },
  [ErrorCode.RATE_LIMITED]: { icon: '\u23F3', className: 'result--rate-limited' },
};

export function PurchaseResult({ status, purchase, error, onRetry }: PurchaseResultProps) {
  if (status === 'idle' || status === 'loading') return null;

  if (status === 'success' && purchase) {
    return (
      <div className="result result--success">
        <div className="result__icon">{'\u2713'}</div>
        <div className="result__content">
          <p className="result__title">Purchase confirmed</p>
          <p className="result__detail">
            Order <span className="result__mono">{purchase.purchaseNo}</span>
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error' && error) {
    const config = ERROR_CONFIG[error.code] ?? { icon: '!', className: 'result--error' };
    const canRetry =
      error.code !== ErrorCode.ALREADY_PURCHASED && error.code !== ErrorCode.SOLD_OUT;

    return (
      <div className={`result ${config.className}`}>
        <div className="result__icon">{config.icon}</div>
        <div className="result__content">
          <p className="result__title">{error.message}</p>
          {canRetry && (
            <button className="result__retry" onClick={onRetry} type="button">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
