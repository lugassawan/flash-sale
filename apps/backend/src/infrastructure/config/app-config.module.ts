import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ validate: () => validateEnv(), isGlobal: true })],
  exports: [ConfigModule],
})
export class AppConfigModule {}
