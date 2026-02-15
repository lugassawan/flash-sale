import { useState, useCallback, useEffect, useRef } from 'react';
import type { PurchaseRecord, ApiError } from '@/types/sale.types';
import { attemptPurchase, fetchPurchaseStatus, DEFAULT_SKU } from '@/services/api';

export type PurchaseStatus = 'idle' | 'loading' | 'success' | 'error';

interface UsePurchaseReturn {
  status: PurchaseStatus;
  purchase: PurchaseRecord | null;
  error: ApiError | null;
  submit: (userId: string, sku: string) => Promise<void>;
  reset: () => void;
}

const USER_ID_KEY = 'flash-sale-user-id';

export function usePurchase(): UsePurchaseReturn {
  const [status, setStatus] = useState<PurchaseStatus>('idle');
  const [purchase, setPurchase] = useState<PurchaseRecord | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const loadingRef = useRef(false);

  // Restore purchase state on mount if a userId was previously used
  useEffect(() => {
    const savedUserId = sessionStorage.getItem(USER_ID_KEY);
    if (!savedUserId) return;

    fetchPurchaseStatus(savedUserId, DEFAULT_SKU)
      .then((response) => {
        if (response.success) {
          setPurchase(response.data);
          setStatus('success');
        }
      })
      .catch(() => {
        // No prior purchase — that's fine
      });
  }, []);

  const submit = useCallback(async (userId: string, sku: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    setStatus('loading');
    setError(null);
    sessionStorage.setItem(USER_ID_KEY, userId);

    try {
      const response = await attemptPurchase(userId, sku);

      if (response.success) {
        setPurchase(response.data);
        setStatus('success');
      } else {
        setError(response.error);
        setStatus('error');
      }
    } catch {
      setError({
        code: 'NETWORK_ERROR',
        message: 'Connection failed. Please try again.',
      });
      setStatus('error');
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { status, purchase, error, submit, reset };
}
