import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

export class TransactionItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @Transform(({ value }) => String(value).trim())
  @IsString()
  @IsNotEmpty()
  @Matches(/^-?(0|[1-9]\d*)(\.\d{1,2})?$/, {
    message: 'amount must be a valid decimal with up to 2 decimal places',
  })
  @Matches(/^(?!-?0+(\.0+)?$).+$/, {
    message: 'amount must not be zero',
  })
  amount!: string;
}
