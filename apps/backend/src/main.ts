import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './presentation/http/rest/filters/domain-exception.filter';
import { ResponseWrapperInterceptor } from './presentation/http/rest/interceptors/response-wrapper.interceptor';
import { StructuredLogger } from './infrastructure/logging/structured-logger';
import { MetricsInterceptor } from './infrastructure/observability/metrics.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: new StructuredLogger(),
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const host = config.get<string>('HOST', '0.0.0.0');

  const metricsInterceptor = app.get(MetricsInterceptor);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseWrapperInterceptor(), metricsInterceptor);

  await app.listen(port, host);
  Logger.log(`Application listening on ${host}:${port}`, 'Bootstrap');
}

bootstrap();
