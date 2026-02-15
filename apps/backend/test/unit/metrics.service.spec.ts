import * as client from 'prom-client';
import { MetricsService } from '../../src/infrastructure/observability/metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    client.register.clear();
    service = new MetricsService();
  });

  describe('onModuleInit', () => {
    it('should not throw when registering default metrics', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return a string containing registered metric names', async () => {
      service.onModuleInit();

      const metrics = await service.getMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('http_errors_total');
      expect(metrics).toContain('http_request_duration_seconds');
      expect(metrics).toContain('purchase_outcomes_total');
      expect(metrics).toContain('sse_connections_active');
      expect(metrics).toContain('reconciliation_mismatches_total');
    });
  });

  describe('getContentType', () => {
    it('should return a content type string for prometheus metrics', () => {
      const contentType = service.getContentType();

      expect(typeof contentType).toBe('string');
      expect(
        contentType.includes('text/plain') || contentType.includes('application/openmetrics'),
      ).toBe(true);
    });
  });

  describe('httpRequestTotal', () => {
    it('should increment and appear in metrics output', async () => {
      service.httpRequestTotal.inc({ method: 'GET', route: '/api/v1/test', status_code: '200' });

      const metrics = await service.getMetrics();

      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('route="/api/v1/test"');
      expect(metrics).toContain('status_code="200"');
    });
  });

  describe('httpRequestDuration', () => {
    it('should observe a value and appear in metrics output', async () => {
      service.httpRequestDuration.observe(
        { method: 'POST', route: '/api/v1/purchases', status_code: '201' },
        0.042,
      );

      const metrics = await service.getMetrics();

      expect(metrics).toContain('http_request_duration_seconds_bucket');
      expect(metrics).toContain('http_request_duration_seconds_count');
      expect(metrics).toContain('method="POST"');
    });
  });

  describe('sseConnectionsGauge', () => {
    it('should increment and decrement the gauge', async () => {
      service.sseConnectionsGauge.inc();
      service.sseConnectionsGauge.inc();
      service.sseConnectionsGauge.dec();

      const metrics = await service.getMetrics();

      expect(metrics).toContain('sse_connections_active');
      expect(metrics).toContain('sse_connections_active 1');
    });
  });
});
