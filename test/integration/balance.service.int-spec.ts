import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BalanceService } from '../../src/modules/balance/balance.service';
import { IssueTransactionsResponseDto } from '../../src/modules/balance/dto/issue-transactions-response.dto';
import {
  countTransactions,
  getAccountBalanceMinor,
  getTransactionsSnapshot,
  prepareTestDatabase,
  resetTestDatabase,
  seedUsersAndAccounts,
} from '../helpers/test-db';
import { createIntegrationTestingModuleMetadata } from '../helpers/test-module';

describe('BalanceService (integration)', () => {
  let balanceService: BalanceService;
  let dataSource: DataSource;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    await prepareTestDatabase();

    moduleRef = await Test.createTestingModule(
      createIntegrationTestingModuleMetadata(),
    ).compile();

    balanceService = moduleRef.get(BalanceService);
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(async () => {
    await resetTestDatabase(dataSource);
  });

  afterAll(async () => {
    await resetTestDatabase(dataSource);
    await moduleRef.close();
  });

  it('返回用户当前余额', async () => {
    await seedUsersAndAccounts(dataSource, [
      { userId: 1, balanceMinor: 12345n },
    ]);

    await expect(balanceService.getBalance(1)).resolves.toEqual({
      userId: 1,
      balance: '123.45',
    });
  });

  it('按请求顺序处理同批多用户多笔交易', async () => {
    await seedUsersAndAccounts(dataSource, [
      { userId: 1, balanceMinor: 10000n },
      { userId: 2, balanceMinor: 20000n },
    ]);

    await expect(
      balanceService.issueTransactions({
        checkBalance: true,
        transactions: [
          { userId: 1, amount: '10.00' },
          { userId: 2, amount: '-20.00' },
          { userId: 1, amount: '5.50' },
        ],
      }),
    ).resolves.toEqual({
      checkBalance: true,
      results: [
        { userId: 1, amount: '10.00', endingBalance: '110.00' },
        { userId: 2, amount: '-20.00', endingBalance: '180.00' },
        { userId: 1, amount: '5.50', endingBalance: '115.50' },
      ],
    });

    await expect(getAccountBalanceMinor(dataSource, 1)).resolves.toBe(11550n);
    await expect(getAccountBalanceMinor(dataSource, 2)).resolves.toBe(18000n);

    await expect(getTransactionsSnapshot(dataSource, [1, 2])).resolves.toEqual([
      { userId: 1, amountMinor: '1000', endingBalanceMinor: '11000' },
      { userId: 2, amountMinor: '-2000', endingBalanceMinor: '18000' },
      { userId: 1, amountMinor: '550', endingBalanceMinor: '11550' },
    ]);
  });

  it('checkBalance=true 时任一交易会变负则整批回滚', async () => {
    await seedUsersAndAccounts(dataSource, [
      { userId: 2, balanceMinor: 20000n },
    ]);

    await expect(
      balanceService.issueTransactions({
        checkBalance: true,
        transactions: [
          { userId: 2, amount: '10.00' },
          { userId: 2, amount: '-1000.00' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(getAccountBalanceMinor(dataSource, 2)).resolves.toBe(20000n);
    await expect(countTransactions(dataSource, 2)).resolves.toBe(0);
  });

  it('账户缺失时抛出 404 并回滚已计算结果', async () => {
    await seedUsersAndAccounts(dataSource, [
      { userId: 1, balanceMinor: 10000n },
    ]);

    await expect(
      balanceService.issueTransactions({
        checkBalance: true,
        transactions: [
          { userId: 1, amount: '1.00' },
          { userId: 999, amount: '2.00' },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(getAccountBalanceMinor(dataSource, 1)).resolves.toBe(10000n);
    await expect(countTransactions(dataSource)).resolves.toBe(0);
  });

  it('checkBalance=false 时允许负余额并记录 endingBalance', async () => {
    await seedUsersAndAccounts(dataSource, [{ userId: 3, balanceMinor: 0n }]);

    await expect(
      balanceService.issueTransactions({
        checkBalance: false,
        transactions: [
          { userId: 3, amount: '-0.01' },
          { userId: 3, amount: '-1.99' },
        ],
      }),
    ).resolves.toEqual({
      checkBalance: false,
      results: [
        { userId: 3, amount: '-0.01', endingBalance: '-0.01' },
        { userId: 3, amount: '-1.99', endingBalance: '-2.00' },
      ],
    });

    await expect(getAccountBalanceMinor(dataSource, 3)).resolves.toBe(-200n);
    await expect(getTransactionsSnapshot(dataSource, [3])).resolves.toEqual([
      { userId: 3, amountMinor: '-1', endingBalanceMinor: '-1' },
      { userId: 3, amountMinor: '-199', endingBalanceMinor: '-200' },
    ]);
  });

  it('并发加款不会丢失更新', async () => {
    await seedUsersAndAccounts(dataSource, [{ userId: 5, balanceMinor: 0n }]);

    const requests = Array.from({ length: 10 }, () =>
      balanceService.issueTransactions({
        checkBalance: true,
        transactions: [{ userId: 5, amount: '1.00' }],
      }),
    );

    await expect(Promise.all(requests)).resolves.toHaveLength(10);
    await expect(getAccountBalanceMinor(dataSource, 5)).resolves.toBe(1000n);
    await expect(countTransactions(dataSource, 5)).resolves.toBe(10);
  });

  it('并发扣款在 checkBalance=true 下只允许一单成功', async () => {
    await seedUsersAndAccounts(dataSource, [
      { userId: 6, balanceMinor: 10000n },
    ]);

    const settledResults = await Promise.allSettled([
      balanceService.issueTransactions({
        checkBalance: true,
        transactions: [{ userId: 6, amount: '-80.00' }],
      }),
      balanceService.issueTransactions({
        checkBalance: true,
        transactions: [{ userId: 6, amount: '-80.00' }],
      }),
    ]);

    const fulfilledResults = settledResults.filter(
      (
        result,
      ): result is PromiseFulfilledResult<IssueTransactionsResponseDto> =>
        result.status === 'fulfilled',
    );
    const rejectedResults = settledResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilledResults).toHaveLength(1);
    expect(rejectedResults).toHaveLength(1);
    expect(rejectedResults[0].reason).toBeInstanceOf(BadRequestException);

    await expect(getAccountBalanceMinor(dataSource, 6)).resolves.toBe(2000n);
    await expect(countTransactions(dataSource, 6)).resolves.toBe(1);
    await expect(getTransactionsSnapshot(dataSource, [6])).resolves.toEqual([
      { userId: 6, amountMinor: '-8000', endingBalanceMinor: '2000' },
    ]);
  });
});
