import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../../src/config/database.config';
import { getValidatedEnv } from '../../src/config/env.validation';
import { createTypeOrmDataSourceOptions } from '../../src/infrastructure/database/typeorm.config';
import { Account } from '../../src/modules/balance/entities/account.entity';
import { AccountTransaction } from '../../src/modules/balance/entities/account-transaction.entity';

export type AccountSeed = {
  userId: number;
  balanceMinor?: bigint;
};

export type TransactionSnapshot = {
  userId: number;
  amountMinor: string;
  endingBalanceMinor: string;
};

function getTestDatabaseName(): string {
  return process.env.TEST_DB_NAME ?? 'grove_test';
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function getAdminClient(): Client {
  const databaseConfig = getDatabaseConfig(
    getValidatedEnv({
      ...process.env,
      DB_NAME: 'postgres',
    }),
  );

  return new Client({
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.username,
    password: databaseConfig.password,
    database: databaseConfig.database,
  });
}

function getStandaloneDataSourceOptions() {
  const baseOptions = createTypeOrmDataSourceOptions(
    getDatabaseConfig(
      getValidatedEnv({
        ...process.env,
        DB_NAME: getTestDatabaseName(),
      }),
    ),
  );

  if (baseOptions.type !== 'postgres') {
    throw new Error('Test database only supports PostgreSQL');
  }

  return baseOptions;
}

async function withStandaloneDataSource<T>(
  callback: (dataSource: DataSource) => Promise<T>,
): Promise<T> {
  const dataSource = new DataSource(getStandaloneDataSourceOptions());

  await dataSource.initialize();

  try {
    return await callback(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

async function truncateAllTables(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE "account_transactions", "accounts", "users" RESTART IDENTITY CASCADE',
  );
}

export async function prepareTestDatabase(): Promise<void> {
  const client = getAdminClient();
  const databaseName = getTestDatabaseName();

  await client.connect();

  try {
    const existingDatabase = await client.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [databaseName],
    );

    if (existingDatabase.rowCount === 0) {
      await client.query(
        `CREATE DATABASE ${quoteIdentifier(databaseName)} WITH ENCODING 'UTF8'`,
      );
    }
  } finally {
    await client.end();
  }

  await withStandaloneDataSource(async (dataSource) => {
    await dataSource.runMigrations();
    await truncateAllTables(dataSource);
  });
}

export async function resetTestDatabase(
  dataSource?: DataSource,
): Promise<void> {
  if (dataSource) {
    await truncateAllTables(dataSource);
    return;
  }

  await withStandaloneDataSource(async (standaloneDataSource) => {
    await truncateAllTables(standaloneDataSource);
  });
}

export async function seedUsersAndAccounts(
  dataSource: DataSource,
  accountSeeds: AccountSeed[],
): Promise<void> {
  if (accountSeeds.length === 0) {
    return;
  }

  await dataSource.transaction(async (manager) => {
    for (const { userId } of accountSeeds) {
      await manager.query('INSERT INTO "users" ("id") VALUES ($1)', [userId]);
    }

    for (const { userId, balanceMinor = 0n } of accountSeeds) {
      await manager.query(
        `
          INSERT INTO "accounts" ("user_id", "current_balance_minor")
          VALUES ($1, $2)
        `,
        [userId, balanceMinor.toString()],
      );
    }
  });
}

export async function getAccountBalanceMinor(
  dataSource: DataSource,
  userId: number,
): Promise<bigint> {
  const account = await dataSource.getRepository(Account).findOneBy({ userId });

  if (!account) {
    throw new Error(`Account not found for userId ${userId}`);
  }

  return account.currentBalanceMinor;
}

export async function countTransactions(
  dataSource: DataSource,
  userId?: number,
): Promise<number> {
  const repository = dataSource.getRepository(AccountTransaction);

  if (typeof userId === 'number') {
    return repository.countBy({ userId });
  }

  return repository.count();
}

export async function getTransactionsSnapshot(
  dataSource: DataSource,
  userIds?: number[],
): Promise<TransactionSnapshot[]> {
  const rows =
    userIds && userIds.length > 0
      ? await dataSource.query<
          Array<{
            user_id: number;
            amount_minor: string;
            ending_balance_minor: string;
          }>
        >(
          `
          SELECT
            user_id,
            amount_minor::text,
            ending_balance_minor::text
          FROM account_transactions
          WHERE user_id = ANY($1::int[])
          ORDER BY id ASC
        `,
          [userIds],
        )
      : await dataSource.query<
          Array<{
            user_id: number;
            amount_minor: string;
            ending_balance_minor: string;
          }>
        >(
          `
          SELECT
            user_id,
            amount_minor::text,
            ending_balance_minor::text
          FROM account_transactions
          ORDER BY id ASC
        `,
        );

  return rows.map((row) => ({
    userId: row.user_id,
    amountMinor: row.amount_minor,
    endingBalanceMinor: row.ending_balance_minor,
  }));
}
