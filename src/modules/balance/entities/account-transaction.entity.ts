import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintColumnTransformer } from '../transformers/bigint-column.transformer';

@Entity({ name: 'account_transactions' })
export class AccountTransaction {
  @PrimaryGeneratedColumn({
    name: 'id',
    type: 'bigint',
  })
  id: string;

  @Column({
    name: 'account_id',
    type: 'bigint',
    transformer: bigintColumnTransformer,
  })
  accountId: bigint;

  // 冗余用户 ID，便于按 userId 直接查询流水。
  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  // 本笔交易变更金额（分），可正可负。
  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: bigintColumnTransformer,
  })
  amountMinor: bigint;

  // 该笔交易执行后的账户余额（分）。
  @Column({
    name: 'ending_balance_minor',
    type: 'bigint',
    transformer: bigintColumnTransformer,
  })
  endingBalanceMinor: bigint;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
