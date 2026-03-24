import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintColumnTransformer } from '../transformers/bigint-column.transformer';

@Entity({ name: 'accounts' })
export class Account {
  @PrimaryGeneratedColumn({
    name: 'id',
    type: 'bigint',
  })
  id: string;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  // 当前余额，统一使用"分"为单位持久化，避免浮点精度问题。
  @Column({
    name: 'current_balance_minor',
    type: 'bigint',
    default: 0,
    transformer: bigintColumnTransformer,
  })
  currentBalanceMinor: bigint;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
