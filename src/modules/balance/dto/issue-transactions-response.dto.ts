import { IssuedTransactionResultDto } from './issued-transaction-result.dto';

export class IssueTransactionsResponseDto {
  checkBalance!: boolean;
  results!: IssuedTransactionResultDto[];
}
