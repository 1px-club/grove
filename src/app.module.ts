import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appProviders } from './common/providers/app.providers';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { BalanceModule } from './modules/balance/balance.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    UsersModule,
    BalanceModule,
  ],
  providers: [...appProviders],
})
export class AppModule {}
