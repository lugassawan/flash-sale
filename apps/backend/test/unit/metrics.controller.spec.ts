import { MetricsController } from '../../src/infrastructure/observability/metrics.controller';
import { MetricsService } from '../../src/infrastructure/observability/metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockMetrics: { getMetrics: jest.Mock; getContentType: jest.Mock };
  let mockReply: { header: jest.Mock; send: jest.Mock };

  beforeEach(() => {
    mockMetrics = {
      getMetrics: jest.fn(),
      getContentType: jest.fn(),
    };
    mockReply = {
      header: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    controller = new MetricsController(mockMetrics as unknown as MetricsService);
  });

  it('should call getMetrics on the service', async () => {
    mockMetrics.getMetrics.mockResolvedValue('# HELP http_requests_total\n');
    mockMetrics.getContentType.mockReturnValue('text/plain');

    await controller.getMetrics(mockReply as any);

    expect(mockMetrics.getMetrics).toHaveBeenCalledTimes(1);
  });

  it('should set Content-Type header from getContentType', async () => {
    const contentType = 'text/plain; version=0.0.4; charset=utf-8';
    mockMetrics.getMetrics.mockResolvedValue('');
    mockMetrics.getContentType.mockReturnValue(contentType);

    await controller.getMetrics(mockReply as any);

    expect(mockReply.header).toHaveBeenCalledWith('Content-Type', contentType);
  });

  it('should set Cache-Control to no-store', async () => {
    mockMetrics.getMetrics.mockResolvedValue('');
    mockMetrics.getContentType.mockReturnValue('text/plain');

    await controller.getMetrics(mockReply as any);

    expect(mockReply.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('should send the metrics string via reply.send', async () => {
    const metricsOutput =
      '# HELP http_requests_total Total HTTP requests\nhttp_requests_total 42\n';
    mockMetrics.getMetrics.mockResolvedValue(metricsOutput);
    mockMetrics.getContentType.mockReturnValue('text/plain');

    await controller.getMetrics(mockReply as any);

    expect(mockReply.send).toHaveBeenCalledWith(metricsOutput);
  });
});
