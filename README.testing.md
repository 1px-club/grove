# Grove 测试说明

## 概述

项目已补齐两层自动化测试：

- `E2E`：从 HTTP 接口入口验证请求校验、状态码、响应结构与真实落库结果
- `Integration`：直接验证 `BalanceService + TypeORM + PostgreSQL` 的事务、回滚与并发安全

当前测试均基于真实 PostgreSQL 执行，不使用内存数据库。

## 测试覆盖范围

### E2E

E2E 主要验证 HTTP 入口的真实行为，包括路由、校验、响应格式、状态码与数据库最终结果。

当前覆盖场景如下：

1. `GET /balances/:userId` 查询已存在账户余额成功
   - 验证返回 `200`
   - 验证响应体统一包装格式
   - 验证余额以两位小数字符串返回

2. `GET /balances/:userId` 参数非法时返回 `400`
   - 例如 `userId = 0`
   - 验证 `ValidationPipe` 的参数校验生效

3. `POST /balances/transactions` 成功处理批量交易
   - 单次请求内覆盖多用户、多笔交易
   - 验证成功状态码为 `201`
   - 验证响应中的 `results` 顺序与请求顺序一致
   - 验证每笔 `endingBalance` 计算正确
   - 验证账户余额与流水表真实落库结果一致

4. `POST /balances/transactions` 在存在缺失账户时整批回滚
   - 验证返回 `404`
   - 验证已存在账户余额不被部分更新
   - 验证不会写入任何流水

5. `POST /balances/transactions` 请求体非法时返回 `400`
   - 验证 DTO 白名单校验（额外字段不允许）
   - 验证金额为 `0` 的规则校验
   - 验证错误响应格式正确

### Integration

Integration 主要直接验证 `BalanceService + TypeORM + PostgreSQL` 的事务、锁、回滚和并发行为。

当前覆盖场景如下：

1. `getBalance` 返回标准余额
   - 验证 service 返回值中的金额格式正确

2. 单批次多用户、多笔交易按请求顺序处理
   - 同时覆盖“同一用户同批多笔”的场景
   - 验证每一步 `endingBalance`
   - 验证流水表中的 `amount_minor` 与 `ending_balance_minor`

3. `checkBalance = true` 时，任一交易导致负余额则整批回滚
   - 验证抛出 `BadRequestException`
   - 验证账户余额保持不变
   - 验证失败批次不写流水

4. 批量交易中存在缺失账户时整批回滚
   - 验证抛出 `NotFoundException`
   - 验证前面已计算的账户也不会被部分更新
   - 验证流水表不产生脏数据

5. `checkBalance = false` 时允许负余额
   - 验证账户余额可以变成负数
   - 验证负数 `endingBalance` 返回正确
   - 验证流水表中的负数金额与负数余额都正确持久化

6. 并发加款不会丢失更新
   - 对同一账户并发发起多次加款请求
   - 验证全部成功
   - 验证最终余额等于所有请求金额之和
   - 验证流水条数与成功请求数一致

7. 并发扣款在 `checkBalance = true` 下防止超扣
   - 对同一账户并发发起两次会互相竞争余额的扣款
   - 验证只有一单成功，另一单失败
   - 验证最终余额正确
   - 验证只写入一条成功流水
   - 验证成功流水的 `endingBalance` 正确

## 当前用例总览

当前自动化测试共覆盖 `12` 个用例：

- E2E：`5` 个
- Integration：`7` 个

如果按业务能力拆分，已经覆盖：

- 余额查询
- 参数校验
- 批量多用户交易
- 同用户单批多笔交易
- `checkBalance` 开启时的负余额保护
- `checkBalance` 关闭时的负余额放行
- `endingBalance` 返回值正确
- `endingBalance` 数据库存储正确
- 账户缺失时的事务回滚
- 失败批次不落部分数据
- 并发加款一致性
- 并发扣款防超扣

## 运行前准备

### 0. 安装依赖

如果是首次拉取仓库，请先安装依赖：

```bash
pnpm install
```

### 1. 准备环境变量

测试会自动读取 [`.env`](./.env) 中的数据库地址、端口、用户名和密码。

如果本地还没有 [`.env`](./.env)，可先基于示例文件创建：

```bash
cp .env.example .env
```

如果本机的 `5432` 已被占用，请先修改 [`.env`](./.env) 中的 `DB_PORT`，再继续下一步。

另外：

- 测试运行时会自动把 `DB_NAME` 覆盖为测试库
- 默认测试库名为 `grove_test`
- 如需自定义，可额外设置 `TEST_DB_NAME`

示例：

```bash
TEST_DB_NAME=grove_balance_test pnpm test
```

### 2. 准备 PostgreSQL

测试依赖可访问的 PostgreSQL 实例。最简单的方式是直接复用项目自带 Docker：

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

启动后，建议先确认数据库已经 ready：

```bash
docker compose -f docker-compose.dev.yml ps
```

其中 `postgres` 应显示为 `healthy`，再继续运行测试。

## 测试脚本

```bash
# 运行全部测试
pnpm test

# 仅运行集成测试
pnpm test:int

# 仅运行 E2E 测试
pnpm test:e2e

# 运行覆盖率
pnpm test:cov

# 代码质量检查
pnpm lint
pnpm format:check
pnpm typecheck
```

注意：

- `pnpm test`、`pnpm test:int`、`pnpm test:e2e` 请串行执行
- 不建议在多个终端并行执行这些命令，因为它们会共享同一个测试库

## 数据库生命周期

测试 helper 会自动完成以下动作：

1. 检查测试库是否存在，不存在则自动创建
2. 执行 migration，确保表结构与正式代码一致
3. 每个测试用例执行前清空：
   - `account_transactions`
   - `accounts`
   - `users`
4. 测试结束后再次清空，确保不残留测试数据

因此：

- 不需要手动导入 `init.sql`
- 不会污染开发库 `grove`
- 测试之间彼此隔离

## 目录结构

```text
test/
├── e2e/
│   └── balance.e2e-spec.ts
├── integration/
│   └── balance.service.int-spec.ts
├── helpers/
│   ├── test-db.ts
│   └── test-module.ts
└── setup-env.ts
```

## 设计说明

- 测试统一串行执行（`--runInBand`），避免共享测试库时相互干扰
- 并发安全场景仍在单个测试用例内部并发触发，以验证悲观锁和事务行为
- 测试复用正式 migration，而不是维护一套独立 SQL，避免结构漂移
