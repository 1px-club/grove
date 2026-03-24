# Grove 数据库管理与操作指南

如果你只是想把项目启动起来，请先阅读 [`README.setup.md`](./README.setup.md)。

## 环境变量

项目通过 `AppModule -> DatabaseModule` 中的 `TypeOrmModule.forRootAsync(...)` 连接 PostgreSQL，配置由 `@nestjs/config` 统一加载并校验。

可配置的环境变量如下：

- `DB_HOST`：数据库主机地址
- `DB_PORT`：数据库端口
- `DB_USERNAME`：数据库用户名
- `DB_PASSWORD`：数据库密码
- `DB_NAME`：数据库名称

示例配置见 [`.env.example`](./.env.example)。

## 数据库变更策略与管理

本项目已接入 TypeORM migration，生产环境和开发环境都建议使用 migration 管理表结构变更。

常用命令：

```bash
# 查看 migration 状态
pnpm migration:show

# 执行未应用的 migration
pnpm migration:run

# 回滚最后一次 migration
pnpm migration:revert
```

说明：

- 应用运行时关闭 `synchronize`
- 数据库结构变更统一走 migration
- migration 由人工或发布流程显式执行，不在应用启动时自动执行
- [`init.sql`](./init.sql) 仅用于本地示例数据准备，建表仍通过 migration 完成

## Docker 场景下的数据库操作

本节所有 Docker 命令均基于 [`docker-compose.dev.yml`](./docker-compose.dev.yml)。

### Docker 启动时系统做了什么

在当前项目里，Docker Compose 会自动完成以下事情：

1. 启动 PostgreSQL 容器
2. 根据 [`docker-compose.dev.yml`](./docker-compose.dev.yml) 中的 `POSTGRES_DB` 自动创建数据库 `grove`
3. 启动 NestJS 应用，并通过环境变量连接数据库

也就是说，Docker 方式下不需要你手动创建数据库。

但表结构（`users / accounts / account_transactions`）仍需要你手动执行 migration 创建。

### 创建表结构（使用 [`docker-compose.dev.yml`](./docker-compose.dev.yml)）

容器启动后，执行：

```bash
docker compose -f docker-compose.dev.yml exec app pnpm migration:run
```

查看 migration 状态：

```bash
docker compose -f docker-compose.dev.yml exec app pnpm migration:show
```

如果你更倾向一次性命令（不依赖已启动的 app 容器），也可以使用：

```bash
docker compose -f docker-compose.dev.yml run --rm app pnpm migration:run
```

### 导入示例数据（使用 [`init.sql`](./init.sql)）

当前 Docker 流程不会自动执行 [`init.sql`](./init.sql)。如果你需要示例账户和余额数据，可手动导入：

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d grove < init.sql
```

### 重置数据库（使用 [`docker-compose.dev.yml`](./docker-compose.dev.yml)）

如果需要删除数据库卷并重建：

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build -d
```

重建完成后，请重新执行 migration；如果你还想复用成功示例，再重新导入一次 [`init.sql`](./init.sql)。

## 本地 PostgreSQL 准备

如果你使用本地原生启动方式，需要先在 macOS 本机准备 PostgreSQL。

### 1. 安装 PostgreSQL

```bash
brew install postgresql@17
brew services start postgresql@17
```

说明：

- `postgresql@17` 在 Homebrew 中是 `keg-only`
- 如果安装完成后仍提示找不到 `psql`、`pg_isready`、`createuser` 或 `createdb`，可执行：

```bash
echo 'export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

确认 PostgreSQL 已启动：

```bash
pg_isready
```

### 2. 创建数据库用户和数据库

当前项目的默认本地配置来自 [`.env.example`](./.env.example)：

- 用户名：`postgres`
- 密码：`postgres`
- 数据库名：`grove`

为了让 [`.env.example`](./.env.example) 可以直接使用，推荐在本地 PostgreSQL 中创建同名用户和数据库。

如果你本机已经有一个现成的 PostgreSQL 实例，且它使用不同的端口、用户名、密码或数据库名，也可以直接修改 [`.env`](./.env) 中的 `DB_*` 配置，不必强制创建一套与示例完全一致的本地配置。

#### 2.1 创建 `postgres` 用户

```bash
createuser -s postgres
```

如果提示用户已存在，可以跳过这一步。

#### 2.2 设置 `postgres` 用户密码

```bash
psql -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

#### 2.3 创建数据库 `grove`

```bash
createdb -O postgres grove
```

如果提示数据库已存在，可以跳过这一步。

### 3. 执行 migration（基于 [`.env.example`](./.env.example) 完成本地环境变量准备）

执行前请先确认：

- 已基于 [`.env.example`](./.env.example) 生成本地环境变量文件
- 已执行 `pnpm install`

```bash
pnpm migration:run
```

### 4. 导入示例数据（可选，使用 [`init.sql`](./init.sql)）

同样建议在本地环境变量和依赖准备完成后再执行。

```bash
psql -h localhost -U postgres -d grove -f init.sql
```

如果你修改过 [`.env`](./.env) 中的数据库连接信息，请把命令里的主机、用户名和数据库名替换成你的实际值。

## [`init.sql`](./init.sql) 做了什么

[`init.sql`](./init.sql) 是示例数据脚本，不负责建表，包含：

1. 插入 3 条示例用户
2. 对齐 `users.id` 序列
3. 插入 3 条示例账户余额

因此：

- Docker 方式：需要手动执行
- 本地原生方式：需要手动执行

## 使用 pgAdmin 4 可视化查看表结构

### 1. 安装 pgAdmin 4（macOS）

- [官方下载页](https://www.pgadmin.org/download/pgadmin-4-macos/)

### 2. 按 9.3 界面注册服务器

以下步骤按 pgAdmin 4 9.3 桌面版界面描述。

打开 pgAdmin 后，在 `Dashboard` 页的 `Quick Links` 中点击 `Add New Server`。

这会打开 `Register - Server` 对话框。

先在 `General` 页签填写：

- `Name`：`grove-local`（可自定义）

再切到 `Connection` 页签填写：

- `Host name/address`：`localhost`
- `Port`：`5432`
- `Maintenance database`：`grove`
- `Username`：`postgres`
- `Password`：`postgres`

如果你修改过本地环境变量，请以你自己的实际值为准。

填写完成后点击 `Save`。

### 3. 打开并连接服务器

保存后，左侧 `Object Explorer` 会出现你刚注册的服务器，例如 `grove-local`。

如果服务器节点没有自动展开，可以双击该节点或点击展开图标发起连接。

### 4. 查看表结构

连接成功后，在左侧树展开：

`Servers -> grove-local -> Databases -> grove -> Schemas -> public -> Tables`

你会看到（在执行 migration 后）：

- `users`
- `accounts`
- `account_transactions`

点击任意表：

- `Properties` 查看表基础信息
- `Columns` 查看字段与类型
- `Constraints` 查看主键、外键和唯一约束
- `Indexes` 查看索引
