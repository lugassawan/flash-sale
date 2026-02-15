import { PurchasePersistenceProducer } from '../../src/infrastructure/messaging/bullmq/purchase-persistence.producer';
import { PurchaseJobData } from '../../src/application/ports/purchase-persistence.port';

describe('PurchasePersistenceProducer', () => {
  let producer: PurchasePersistenceProducer;
  let mockQueue: { add: jest.Mock };

  const jobData: PurchaseJobData = {
    purchaseNo: 'PUR-001',
    sku: 'WIDGET-001',
    userId: 'user-123',
    purchasedAt: '2026-02-15T10:00:00.000Z',
  };

  beforeEach(() => {
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    producer = new PurchasePersistenceProducer(mockQueue as any);
  });

  it('should call queue.add with correct job name "persist-purchase"', async () => {
    await producer.enqueue(jobData);

    expect(mockQueue.add).toHaveBeenCalledWith(
      'persist-purchase',
      expect.anything(),
      expect.anything(),
    );
  });

  it('should pass job data as second argument', async () => {
    await producer.enqueue(jobData);

    expect(mockQueue.add).toHaveBeenCalledWith(expect.anything(), jobData, expect.anything());
  });

  it('should set jobId to purchase-${purchaseNo}', async () => {
    await producer.enqueue(jobData);

    expect(mockQueue.add).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      jobId: 'purchase-PUR-001',
    });
  });
});
