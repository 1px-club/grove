import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { DataSource } from 'typeorm';
import {
  countTransactions,
  getAccountBalanceMinor,
  getTransactionsSnapshot,
  prepareTestDatabase,
  resetTestDatabase,
  seedUsersAndAccounts,
} from '../helpers/test-db';
import { createE2eTestingModuleMetadata } from '../helpers/test-module';

type ApiSuccessResponse<T> = {
  code: number;
  message: string;
  data: T;
};

type ApiErrorResponse = {
  code: number;
  message: string | string[];
  data: null;
};

function createRequest(application: INestApplication) {
  return request(application.getHttpServer() as Parameters<typeof request>[0]);
}

describe('BalanceController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    await prepareTestDatabase();

    moduleRef = await Test.createTestingModule(
      createE2eTestingModuleMetadata(),
    ).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetTestDatabase(dataSource);
  });

  afterAll(async () => {
    await resetTestDatabase(dataSource);
    await app.close();
  });

  it('GET /balances/:userId 返回当前余额', async () => {
    await seedUsersAndAccounts(dataSource, [
      { userId: 1, balanceMinor: 12345n },
    ]);

    const response: Response = await createRequest(app)
      .get('/balances/1')
      .expect(200);
    const body = response.body as ApiSuccessResponse<{
      userId: number;
      balance: string;
    }>;

    expect(body).toEqual({
      code: 0,
      message: 'success',
      data: {
        userId: 1,
        balance: '123.45',
      },
    });
  });

  it('GET /balances/:userId 对非法参数返回 400', async () => {
    const response: Response = await createRequest(app)
      .get('/balances/0')
      .expect(400);
    const body = response.body as ApiErrorResponse;

    expect(body.code).toBe(400);
    expect(body.message).toContain('userId must not be less than 1');
    expect(body.data).toBeNull();
  });

  it('POST /balances/transactions 返回批量结果并落库', async () => {
    await seedUsersAndAccounts(dataSource, [
      { userId: 1, balanceMinor: 10000n },
      { userId: 2, balanceMinor: 20000n },
    ]);

    const response: Response = await createRequest(app)
      .post('/balances/transactions')
      .send({
        checkBalance: true,
        transactions: [
          { userId: 1, amount: '10.00' },
          { userId: 2, amount: '-20.00' },
          { userId: 1, amount: '5.50' },
        ],
      })
      .expect(201);
    const body = response.body as ApiSuccessResponse<{
      checkBalance: boolean;
      results: Array<{
        userId: number;
        amount: string;
        endingBalance: string;
      }>;
    }>;

    expect(body).toEqual({
      code: 0,
      message: 'success',
      data: {
        checkBalance: true,
        results: [
          { userId: 1, amount: '10.00', endingBalance: '110.00' },
          { userId: 2, amount: '-20.00', endingBalance: '180.00' },
          { userId: 1, amount: '5.50', endingBalance: '115.50' },
        ],
      },
    });

    await expect(getAccountBalanceMinor(dataSource, 1)).resolves.toBe(11550n);
    await expect(getAccountBalanceMinor(dataSource, 2)).resolves.toBe(18000n);

    await expect(getTransactionsSnapshot(dataSource, [1, 2])).resolves.toEqual([
      { userId: 1, amountMinor: '1000', endingBalanceMinor: '11000' },
      { userId: 2, amountMinor: '-2000', endingBalanceMinor: '18000' },
      { userId: 1, amountMinor: '550', endingBalanceMinor: '11550' },
    ]);
  });

  it('POST /balances/transactions 在账户缺失时回滚整批请求', async () => {
    await seedUsersAndAccounts(dataSource, [
      { userId: 1, balanceMinor: 10000n },
    ]);

    const response: Response = await createRequest(app)
      .post('/balances/transactions')
      .send({
        checkBalance: true,
        transactions: [
          { userId: 1, amount: '1.00' },
          { userId: 999, amount: '2.00' },
        ],
      })
      .expect(404);
    const body = response.body as ApiErrorResponse;

    expect(body.code).toBe(404);
    expect(body.message).toBe('Accounts not found for userIds 999');

    await expect(getAccountBalanceMinor(dataSource, 1)).resolves.toBe(10000n);
    await expect(countTransactions(dataSource)).resolves.toBe(0);
  });

  it('POST /balances/transactions 对非法请求体返回 400', async () => {
    const response: Response = await createRequest(app)
      .post('/balances/transactions')
      .send({
        checkBalance: true,
        transactions: [{ userId: 1, amount: '0.00', extra: 'x' }],
      })
      .expect(400);
    const body = response.body as ApiErrorResponse;

    expect(body.code).toBe(400);
    expect(body.message).toEqual(
      expect.arrayContaining([
        'transactions.0.property extra should not exist',
        'transactions.0.amount must not be zero',
      ]),
    );
  });
});
