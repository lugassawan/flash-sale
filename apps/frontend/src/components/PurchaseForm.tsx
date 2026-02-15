import { useState, type FormEvent } from 'react';
import type { PurchaseStatus } from '@/hooks/usePurchase';

interface PurchaseFormProps {
  saleActive: boolean;
  purchaseStatus: PurchaseStatus;
  onSubmit: (userId: string, sku: string) => void;
  sku: string;
}

export function PurchaseForm({ saleActive, purchaseStatus, onSubmit, sku }: PurchaseFormProps) {
  const [userId, setUserId] = useState('');
  const [validationError, setValidationError] = useState('');

  const isDisabled = !saleActive || purchaseStatus === 'loading' || purchaseStatus === 'success';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const trimmed = userId.trim();
    if (!trimmed) {
      setValidationError('Please enter your user ID');
      return;
    }

    setValidationError('');
    onSubmit(trimmed, sku);
  };

  return (
    <form className="purchase-form" onSubmit={handleSubmit}>
      <div className="purchase-form__field">
        <label className="purchase-form__label" htmlFor="userId">
          User ID
        </label>
        <input
          id="userId"
          type="text"
          className={`purchase-form__input ${validationError ? 'purchase-form__input--error' : ''}`}
          placeholder="Enter your identifier"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            if (validationError) setValidationError('');
          }}
          disabled={purchaseStatus === 'success'}
          autoComplete="off"
        />
        {validationError && <p className="purchase-form__error">{validationError}</p>}
      </div>
      <button type="submit" className="purchase-form__button" disabled={isDisabled}>
        {purchaseStatus === 'loading' ? (
          <span className="purchase-form__spinner" />
        ) : purchaseStatus === 'success' ? (
          'Purchased'
        ) : (
          'Buy Now'
        )}
      </button>
    </form>
  );
}
