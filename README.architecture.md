# Grove 架构设计说明

## 技术栈

- Nest.js：应用框架
- TypeORM：ORM 和 migration 管理
- PostgreSQL：关系型数据库
- class-validator / class-transformer：请求参数校验与转换
- Docker Compose：本地开发环境编排

## 应用结构

### 模块划分

- `AppModule`：装配配置系统、数据库模块、业务模块和全局 providers
- `config`：统一环境变量校验与运行时配置映射
- `common`：横切能力与跨模块复用内容，如异常过滤器、响应拦截器、全局 provider
- `infrastructure/database`：数据库模块、TypeORM DataSource 和 migration
- `modules/users`：用户实体归属模块
- `modules/balance`：余额业务模块，聚合 controller、service、entity、dto、utils

### 请求流转

以发交易接口为例，请求链路如下：

1. `BalanceController` 接收请求
2. `ValidationPipe` 校验并转换 DTO
3. `BalanceService` 执行业务逻辑和数据库事务
4. `ResponseInterceptor` 包装成功响应
5. `HttpExceptionFilter` 统一格式化错误响应

## 数据模型

### `users`

用户基础表，为账户提供外键来源。

- `id`
- `created_at`
- `updated_at`

### `accounts`

账户当前余额表，每行表示一个用户的一个账户。

- `id`
- `user_id`
- `current_balance_minor`
- `created_at`
- `updated_at`

当前版本通过 `accounts.user_id` 唯一约束明确一用户一账户。

### `account_transactions`

账户流水表，记录每笔余额变化以及该笔交易后的余额。

- `id`
- `account_id`
- `user_id`
- `amount_minor`
- `ending_balance_minor`
- `created_at`

其中 `user_id` 是冗余字段，用于减少查询时的额外关联；数据库通过组合外键保证它与 `account_id` 对应的账户保持一致。

## 余额模块核心设计

### 金额建模

- 对外 API 使用十进制字符串
- 服务层和数据库内部统一使用最小货币单位整数
- 这样可以避免 JavaScript 浮点计算误差

### 并发控制

批量发起交易时，服务会：

1. 在单个数据库事务中处理整批请求
2. 锁住本批次涉及的账户行
3. 按请求顺序逐笔计算余额
4. 在同一事务中更新账户余额并写入流水

这样可以保证：

- 并发写同一账户时不会互相覆盖
- `endingBalance` 与请求顺序一致
- 任意一笔失败时整批回滚

## 扩展性考虑

当前 API 以 `userId` 为入口，适合“一用户一账户”的场景。

如果未来需要支持一用户多账户，主要变化会在三处：

1. API 需要引入 `accountId` 或默认账户概念
2. Service 的定位和加锁逻辑从 `userId` 切换为 `accountId`
3. migration 需要移除 `accounts.user_id` 唯一约束并补齐索引
