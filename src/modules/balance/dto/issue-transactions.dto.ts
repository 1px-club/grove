import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { TransactionItemDto } from './transaction-item.dto';

export class IssueTransactionsDto {
  @IsBoolean()
  checkBalance!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  transactions!: TransactionItemDto[];
}
