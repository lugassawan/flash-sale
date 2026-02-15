import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  // Rate
  readonly httpRequestTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
  });

  // Errors
  readonly httpErrorTotal = new client.Counter({
    name: 'http_errors_total',
    help: 'Total HTTP errors (4xx/5xx)',
    labelNames: ['method', 'route', 'status_code'] as const,
  });

  // Duration
  readonly httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  });

  // Business metrics
  readonly purchaseOutcomeTotal = new client.Counter({
    name: 'purchase_outcomes_total',
    help: 'Purchase outcomes by result',
    labelNames: ['outcome'] as const,
  });

  readonly sseConnectionsGauge = new client.Gauge({
    name: 'sse_connections_active',
    help: 'Active SSE connections',
  });

  readonly reconciliationMismatches = new client.Counter({
    name: 'reconciliation_mismatches_total',
    help: 'Redis/PostgreSQL mismatches found during reconciliation',
  });

  onModuleInit(): void {
    client.collectDefaultMetrics({ prefix: 'flashsale_' });
  }

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }

  getContentType(): string {
    return client.register.contentType;
  }
}
