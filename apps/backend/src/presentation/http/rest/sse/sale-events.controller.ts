import { Controller, Inject, Logger, MessageEvent, Query, Sse } from '@nestjs/common';
import { Observable, concat, defer, filter, finalize, map } from 'rxjs';
import { RedisPubSubAdapter, SaleEvent } from '@/infrastructure/messaging/redis-pubsub.adapter';
import { SALE_REPOSITORY, SaleRepository } from '@/core/domain/sale/repositories/sale.repository';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';

@Controller('api/v1/sales')
export class SaleEventsController {
  private readonly logger = new Logger(SaleEventsController.name);
  private activeConnections = 0;

  constructor(
    private readonly pubSub: RedisPubSubAdapter,
    @Inject(SALE_REPOSITORY) private readonly saleRepository: SaleRepository,
  ) {}

  get connectionCount(): number {
    return this.activeConnections;
  }

  @Sse('events')
  streamEvents(@Query('sku') sku: string): Observable<MessageEvent> {
    const skuVo = SKU.create(sku);

    const initial$ = defer(async () => {
      const status = await this.saleRepository.getSaleStatus(skuVo);
      return status;
    }).pipe(map((status): MessageEvent => ({ type: 'initial', data: status })));

    const live$ = this.pubSub.getEventStream().pipe(
      filter((event: SaleEvent) => event.data?.sku === sku),
      map((event: SaleEvent): MessageEvent => ({ type: event.event, data: event.data })),
    );

    return defer(() => {
      this.activeConnections++;
      this.logger.log(`SSE client connected for SKU ${sku} (active: ${this.activeConnections})`);
      return concat(initial$, live$);
    }).pipe(
      finalize(() => {
        this.activeConnections--;
        this.logger.log(
          `SSE client disconnected for SKU ${sku} (active: ${this.activeConnections})`,
        );
      }),
    );
  }
}
