import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { AccountTransaction } from './entities/account-transaction.entity';
import { Account } from './entities/account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Account, AccountTransaction])],
  controllers: [BalanceController],
  providers: [BalanceService],
})
export class BalanceModule {}
