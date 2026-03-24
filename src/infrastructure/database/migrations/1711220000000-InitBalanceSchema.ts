import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初始化余额模块的三张核心表：
 * - users：用户
 * - accounts：账户当前余额
 * - account_transactions：账户流水
 *
 * 这份 migration 主要解决四件事：
 * 1. 建表
 * 2. 建立主键和外键
 * 3. 明确“一用户一账户”
 * 4. 保证流水表里冗余的 user_id 不会写错
 */
export class InitBalanceSchema1711220000000 implements MigrationInterface {
  name = 'InitBalanceSchema1711220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建 users 表。
    // 这张表只提供用户主键，供 accounts.user_id 引用。
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_users_id" PRIMARY KEY ("id")
      )
    `);

    // 2. 创建 accounts 表。
    // 每条记录表示一个用户的资金账户，current_balance_minor 保存当前余额。
    // user_id 外键到 users.id，说明账户必须属于一个已存在的用户。
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" BIGSERIAL NOT NULL,
        "user_id" integer NOT NULL,
        "current_balance_minor" bigint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_accounts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);

    // 3. 限制一用户一账户。
    // accounts.user_id 唯一，表示同一个 user_id 在 accounts 中只能出现一次。
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_accounts_user_id" ON "accounts" ("user_id")
    `);

    // 4. 创建 account_transactions 表。
    // 这张表记录每笔余额变动，以及这笔变动后的 ending_balance_minor。
    // account_id 外键到 accounts.id，说明流水必须属于一个已存在的账户。
    await queryRunner.query(`
      CREATE TABLE "account_transactions" (
        "id" BIGSERIAL NOT NULL,
        "account_id" bigint NOT NULL,
        "user_id" integer NOT NULL,
        "amount_minor" bigint NOT NULL,
        "ending_balance_minor" bigint NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_account_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_account_transactions_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
      )
    `);

    // 5. 给流水表建立常用查询索引。
    // 便于按 account_id 查流水，并按 created_at 排序。
    await queryRunner.query(`
      CREATE INDEX "idx_account_transactions_account_id_created_at"
      ON "account_transactions" ("account_id", "created_at")
    `);

    // 6. 为后面的组合外键准备唯一目标。
    // PostgreSQL 要求“被引用的一组列”本身必须是唯一的，
    // 所以这里要额外给 (id, user_id) 建一个联合唯一索引【在 accounts 表里，(id, user_id) 这一组值是唯一的】
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_accounts_id_user_id" ON "accounts" ("id", "user_id")
    `);

    // 7. 保护流水表里冗余 user_id 的正确性。
    // account_transactions 冗余保存了 user_id，优点是查询时更方便，
    // 但风险是 account_id 和 user_id 可能被错误地写成不匹配的组合。
    //
    // 例如：
    // - accounts 中存在 (id=5, user_id=100)
    // - 代码却错误写入 (account_id=5, user_id=999)
    //
    // 只校验 account_id 存在还不够，因此这里增加组合外键：
    // 要求 account_transactions 表里的 (account_id, user_id) 必须去匹配 accounts 表里的 (id, user_id)。
    await queryRunner.query(`
      ALTER TABLE "account_transactions"
      ADD CONSTRAINT "fk_account_transactions_account_user"
      FOREIGN KEY ("account_id", "user_id")
      REFERENCES "accounts"("id", "user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚时按相反顺序删除，先删依赖，再删表，避免约束冲突。

    // 1. 删除 account_transactions -> accounts 的组合外键。
    await queryRunner.query(`
      ALTER TABLE "account_transactions"
      DROP CONSTRAINT IF EXISTS "fk_account_transactions_account_user"
    `);

    // 2. 删除 accounts(id, user_id) 的联合唯一索引。
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_accounts_id_user_id"
    `);

    // 3. 删除流水查询索引。
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_account_transactions_account_id_created_at"
    `);

    // 4. 删除 account_transactions 表。
    await queryRunner.query(`
      DROP TABLE IF EXISTS "account_transactions"
    `);

    // 5. 删除“一用户一账户”唯一索引。
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_accounts_user_id"
    `);

    // 6. 删除 accounts 表。
    await queryRunner.query(`
      DROP TABLE IF EXISTS "accounts"
    `);

    // 7. 删除 users 表。
    await queryRunner.query(`
      DROP TABLE IF EXISTS "users"
    `);
  }
}
