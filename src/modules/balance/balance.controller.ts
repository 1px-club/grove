import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { GetBalanceParamsDto } from './dto/get-balance-params.dto';
import { GetBalanceResponseDto } from './dto/get-balance-response.dto';
import { IssueTransactionsDto } from './dto/issue-transactions.dto';
import { IssueTransactionsResponseDto } from './dto/issue-transactions-response.dto';

@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Post('transactions')
  issueTransactions(
    @Body() dto: IssueTransactionsDto,
  ): Promise<IssueTransactionsResponseDto> {
    return this.balanceService.issueTransactions(dto);
  }

  @Get(':userId')
  getBalance(
    @Param() params: GetBalanceParamsDto,
  ): Promise<GetBalanceResponseDto> {
    return this.balanceService.getBalance(params.userId);
  }
}
