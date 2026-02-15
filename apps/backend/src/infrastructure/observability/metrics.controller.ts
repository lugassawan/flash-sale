import { Controller, Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Res() reply: FastifyReply): Promise<void> {
    const metrics = await this.metrics.getMetrics();
    reply
      .header('Content-Type', this.metrics.getContentType())
      .header('Cache-Control', 'no-store')
      .send(metrics);
  }
}
