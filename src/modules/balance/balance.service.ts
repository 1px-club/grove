import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { GetBalanceResponseDto } from './dto/get-balance-response.dto';
import { IssueTransactionsDto } from './dto/issue-transactions.dto';
import { IssueTransactionsResponseDto } from './dto/issue-transactions-response.dto';
import { IssuedTransactionResultDto } from './dto/issued-transaction-result.dto';
import { Account } from './entities/account.entity';
import { AccountTransaction } from './entities/account-transaction.entity';
import { decimalToMinorUnit, minorUnitToDecimal } from './utils/money.util';

@Injectable()
export class BalanceService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  /**
   * 查询指定用户的当前余额。
   * @param userId 用户 ID。
   * @returns 用户当前余额，返回值中的 balance 为十进制字符串。
   * @throws {NotFoundException} 当账户不存在时抛出。
   */
  async getBalance(userId: number): Promise<GetBalanceResponseDto> {
    const account = await this.accountRepository.findOne({
      where: { userId },
    });

    if (!account) {
      throw new NotFoundException(`Account not found for userId ${userId}`);
    }

    return {
      userId: account.userId,
      balance: minorUnitToDecimal(account.currentBalanceMinor),
    };
  }

  /**
   * 原子性地处理一批余额交易，并返回每笔交易的结果。
   * @param dto 批量交易请求，包含 checkBalance 和交易列表。
   * @returns 每笔交易的金额与 endingBalance，返回值中的金额为十进制字符串。
   * @throws {NotFoundException} 当任一用户没有对应账户时抛出。
   * @throws {BadRequestException} 当 checkBalance 为 true 且交易会产生负余额时抛出。
   */
  async issueTransactions(
    dto: IssueTransactionsDto,
  ): Promise<IssueTransactionsResponseDto> {
    // 提取请求中的 userId，并去重。
    const requestUserIds = [
      ...new Set(dto.transactions.map((item) => item.userId)),
    ];

    return this.dataSource.transaction(async (manager) => {
      const accountRepository = manager.getRepository(Account);
      const accountTransactionRepository =
        manager.getRepository(AccountTransaction);

      // 在事务里按 userId 升序锁住相关账户，降低死锁风险。
      const lockedAccounts = await accountRepository.find({
        where: { userId: In(requestUserIds) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      // 按 userId 建索引，便于后续逐笔找到对应账户。
      const lockedAccountMap = new Map<number, Account>();
      for (const account of lockedAccounts) {
        lockedAccountMap.set(account.userId, account);
      }

      this.ensureAccountsExist(requestUserIds, lockedAccountMap);

      // 保存每笔交易的结果，后续用于写入流水和返回响应。
      const preparedTransactions: Array<{
        accountId: bigint;
        userId: number;
        amountMinor: bigint;
        endingBalanceMinor: bigint;
      }> = [];

      // 按请求顺序逐笔计算，确保 endingBalance 与请求顺序一致。
      for (const transactionItem of dto.transactions) {
        const account = lockedAccountMap.get(transactionItem.userId)!;
        const amountMinor = decimalToMinorUnit(transactionItem.amount);
        const endingBalanceMinor = account.currentBalanceMinor + amountMinor;

        if (dto.checkBalance && endingBalanceMinor < 0n) {
          throw new BadRequestException(
            `Transaction would result in a negative balance for userId ${transactionItem.userId}`,
          );
        }

        // 把这笔交易后的余额写回锁住的账户实体。
        account.currentBalanceMinor = endingBalanceMinor;

        // 保存本笔交易结果，后续统一插入流水。
        preparedTransactions.push({
          accountId: BigInt(account.id),
          userId: transactionItem.userId,
          amountMinor,
          endingBalanceMinor,
        });
      }

      await accountRepository.save(lockedAccounts);
      await accountTransactionRepository.insert(preparedTransactions);

      const results: IssuedTransactionResultDto[] = preparedTransactions.map(
        ({ userId, amountMinor, endingBalanceMinor }) => ({
          userId,
          amount: minorUnitToDecimal(amountMinor),
          endingBalance: minorUnitToDecimal(endingBalanceMinor),
        }),
      );

      return {
        checkBalance: dto.checkBalance,
        results,
      };
    });
  }

  /**
   * 校验请求中的 userId 是否都有对应的账户。
   * @param userIdsToCheck 需要校验的 userId 列表。
   * @param lockedAccountMap 已查询并加锁成功的账户映射，key 为 userId。
   * @throws {NotFoundException} 当存在缺失的账户时抛出。
   */
  private ensureAccountsExist(
    userIdsToCheck: number[],
    lockedAccountMap: Map<number, Account>,
  ): void {
    const missingUserIds: number[] = [];

    for (const userId of userIdsToCheck) {
      if (lockedAccountMap.has(userId)) {
        continue;
      }

      missingUserIds.push(userId);
    }

    if (missingUserIds.length > 0) {
      throw new NotFoundException(
        `Accounts not found for userIds ${missingUserIds.join(', ')}`,
      );
    }
  }
}
