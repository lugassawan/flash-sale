import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  SaleStatus,
  SaleInitialEvent,
  SaleStockUpdateEvent,
  SaleStateChangeEvent,
} from '@/types/sale.types';
import { SaleState } from '@/types/sale.types';
import { fetchSaleStatus, DEFAULT_SKU } from '@/services/api';

interface UseSaleEventsReturn {
  sale: SaleStatus | null;
  connected: boolean;
  jitterReady: boolean;
  endReason?: string;
}

export function useSaleEvents(): UseSaleEventsReturn {
  const [sale, setSale] = useState<SaleStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [jitterReady, setJitterReady] = useState(false);
  const [endReason, setEndReason] = useState<string | undefined>();
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jitterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyJitter = useCallback((state: SaleState) => {
    if (jitterTimerRef.current) {
      clearTimeout(jitterTimerRef.current);
      jitterTimerRef.current = null;
    }
    if (state === SaleState.ACTIVE) {
      setJitterReady(false);
      const delay = Math.random() * 500;
      jitterTimerRef.current = setTimeout(() => {
        setJitterReady(true);
      }, delay);
    } else {
      setJitterReady(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;

    const poll = async () => {
      try {
        const response = await fetchSaleStatus(DEFAULT_SKU);
        if (response.success) {
          setSale((prev: SaleStatus | null) => {
            if (!prev || prev.state !== response.data.state) {
              applyJitter(response.data.state);
            }
            return response.data;
          });
        }
      } catch {
        // Silently retry on next interval
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 2000);
  }, [applyJitter]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    const sku = DEFAULT_SKU;
    const es = new EventSource(`/api/v1/sales/events?sku=${encodeURIComponent(sku)}`);
    eventSourceRef.current = es;

    es.addEventListener('initial', (e: MessageEvent) => {
      let data: SaleInitialEvent;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      setSale((prev: SaleStatus | null) => ({
        sku: data.sku,
        state: data.state,
        stock: data.stock,
        initialStock: prev?.initialStock ?? data.stock,
        productName: prev?.productName ?? '',
        startTime: data.startTime,
        endTime: data.endTime,
      }));
      applyJitter(data.state);
      setConnected(true);
      stopPolling();
    });

    es.addEventListener('stock-update', (e: MessageEvent) => {
      let data: SaleStockUpdateEvent;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      setSale((prev: SaleStatus | null) => (prev ? { ...prev, stock: data.stock } : prev));
    });

    es.addEventListener('state-change', (e: MessageEvent) => {
      let data: SaleStateChangeEvent;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      setSale((prev: SaleStatus | null) => (prev ? { ...prev, state: data.state } : prev));
      if (data.reason) setEndReason(data.reason);
      applyJitter(data.state);
    });

    es.onerror = () => {
      setConnected(false);
      startPolling();
    };

    // Fetch full sale status for fields not in SSE initial event (productName, initialStock)
    fetchSaleStatus(sku)
      .then((response) => {
        if (response.success) {
          setSale((prev: SaleStatus | null) => {
            if (prev) {
              return { ...response.data, state: prev.state, stock: prev.stock };
            }
            applyJitter(response.data.state);
            return response.data;
          });
        }
      })
      .catch(() => {
        // SSE will handle state; this is supplementary
      });

    return () => {
      es.close();
      eventSourceRef.current = null;
      stopPolling();
      if (jitterTimerRef.current) {
        clearTimeout(jitterTimerRef.current);
      }
    };
  }, [applyJitter, startPolling, stopPolling]);

  return { sale, connected, jitterReady, endReason };
}
