import { SaleState } from '@/types/sale.types';
import { useSaleEvents } from '@/hooks/useSaleEvents';
import { usePurchase } from '@/hooks/usePurchase';
import { SaleStatus } from '@/components/SaleStatus';
import { Countdown } from '@/components/Countdown';
import { StockCounter } from '@/components/StockCounter';
import { PurchaseForm } from '@/components/PurchaseForm';
import { PurchaseResult } from '@/components/PurchaseResult';
import '@/styles/app.css';

export function App() {
  const { sale, connected, jitterReady, endReason } = useSaleEvents();
  const { status, purchase, error, submit, reset } = usePurchase();

  if (!sale) {
    return (
      <div className="app">
        <div className="app__loading">
          <span className="app__loading-dot" />
          <span className="app__loading-dot" />
          <span className="app__loading-dot" />
        </div>
      </div>
    );
  }

  const isActive = sale.state === SaleState.ACTIVE;
  const canPurchase = isActive && jitterReady;

  return (
    <div className="app">
      <div className="app__card">
        <SaleStatus state={sale.state} productName={sale.productName} reason={endReason} />

        {sale.state === SaleState.UPCOMING && <Countdown startTime={sale.startTime} />}

        {sale.state !== SaleState.UPCOMING && (
          <StockCounter stock={sale.stock} initialStock={sale.initialStock} />
        )}

        <PurchaseForm
          saleActive={canPurchase}
          purchaseStatus={status}
          onSubmit={submit}
          sku={sale.sku}
        />

        <div aria-live="polite">
          <PurchaseResult status={status} purchase={purchase} error={error} onRetry={reset} />
        </div>
      </div>

      <div className="app__connection">
        <span
          className={`app__connection-dot ${connected ? 'app__connection-dot--connected' : ''}`}
        />
        {connected ? 'Live' : 'Reconnecting\u2026'}
      </div>
    </div>
  );
}
