# Grove 启动与运行指南

如果你想先了解项目背景和架构设计，请先阅读 [`README.md`](./README.md) 和 [`README.architecture.md`](./README.architecture.md)。

如果你需要执行 migration、准备本地 PostgreSQL、导入示例数据或查看表结构，请阅读 [`README.database.md`](./README.database.md)。

如果你需要运行自动化测试，请阅读 [`README.testing.md`](./README.testing.md)。

## 先选一种启动方式

本项目提供两种启动方式：

- **推荐：Docker Compose 开发环境**
  - 优点：不需要单独安装 PostgreSQL，适合当前开发阶段
  - 适合：日常写代码、联调、VS Code 断点调试
- **可选：本地原生启动**
  - 优点：完全使用本机环境运行，便于对照容器外行为
  - 适合：已经熟悉 macOS 本地 Node.js / PostgreSQL 开发环境的场景

## 方式 A：使用 Docker Compose 开发环境（推荐）

### 前置条件

请先在 macOS 上安装并启动 Docker Desktop。

下文 Docker 命令统一使用 `docker compose`。如果你的环境只有旧版 `docker-compose`，请将其中的 `docker compose` 替换为 `docker-compose`。

安装完成后，确认以下命令至少有一个可用：

```bash
docker compose version
```

### 启动步骤

#### 1. 复制环境变量文件（基于 [`.env.example`](./.env.example)）

```bash
cp .env.example .env
```

常用可调配置：

- `APP_PORT`：应用端口，默认 `3000`

#### 2. 启动开发环境（使用 [`docker-compose.dev.yml`](./docker-compose.dev.yml)）

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

#### 3. 等待服务启动完成

启动成功后，默认会有两个服务：

- `postgres`：PostgreSQL 数据库
- `app`：NestJS 应用

默认端口：

- 应用：`http://localhost:3000`
- PostgreSQL：`localhost:5432`

可执行以下命令确认服务状态：

```bash
docker compose -f docker-compose.dev.yml ps
```

其中：

- `postgres` 应显示为 `healthy`
- `app` 应显示为 `Up`

如果你希望实时查看应用日志，可另开一个终端执行：

```bash
docker compose -f docker-compose.dev.yml logs -f app
```

如果本机的 `3000` 或 `5432` 已被占用，请先修改 [`.env`](./.env) 中的 `APP_PORT`、`DB_PORT`，再重新执行上面的 `up --build -d`。

#### 4. 初始化数据库结构

Docker 方式下，PostgreSQL 容器启动时会自动创建数据库 `grove`。

但表结构不会自动创建，所以需要手动执行 migration：

```bash
docker compose -f docker-compose.dev.yml exec app pnpm migration:run
```

#### 5. 导入示例数据（如需按下文成功示例验证）

如果你希望直接使用下方的成功示例，请先导入 [`init.sql`](./init.sql)：

```bash
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d grove < init.sql
```

### 如何验证项目已跑起来

完成上面的 migration 和示例数据导入后，可以在另一个终端执行：

```bash
curl http://localhost:3000/balances/1
```

如果一切正常，会返回类似结果：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userId": 1,
    "balance": "100.00"
  }
}
```

也可以验证发交易接口：

```bash
curl -X POST http://localhost:3000/balances/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "checkBalance": true,
    "transactions": [
      { "userId": 1, "amount": "10.00" },
      { "userId": 2, "amount": "-20.00" }
    ]
  }'
```

### 常用停止命令（使用 [`docker-compose.dev.yml`](./docker-compose.dev.yml)）

停止服务：

```bash
docker compose -f docker-compose.dev.yml down
```

如果你需要删除数据库卷并重建开发数据库，请参考 [`README.database.md`](./README.database.md)。

## 断点调试

如果你需要在 VS Code 中调试 Docker 开发环境，请阅读 [`README.debug.md`](./README.debug.md)。

## 方式 B：本地原生启动（不依赖 Docker）

### 前置条件

本方式需要你在 macOS 本机安装：

- Node.js
- pnpm
- PostgreSQL

### 1. 安装 Xcode Command Line Tools

如果机器是接近空白环境，先安装命令行工具：

```bash
xcode-select --install
```

### 2. 安装 Homebrew

如果尚未安装 Homebrew，可参考官方文档：

- Homebrew 安装文档：
  [https://docs.brew.sh/Installation.html](https://docs.brew.sh/Installation.html)

安装完成后，确认：

```bash
brew -v
```

### 3. 安装 Node.js

为了和项目内的 Docker 环境尽量保持一致，推荐使用 Node.js 20。

```bash
brew install node@20
```

说明：

- `node@20` 在 Homebrew 中是 `keg-only`
- 如果安装完成后 `node -v` 仍提示找不到命令，可执行：

```bash
echo 'export PATH="$(brew --prefix)/opt/node@20/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

确认版本：

```bash
node -v
```

### 4. 启用 Corepack 并准备 pnpm

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

确认版本：

```bash
pnpm -v
```

### 5. 准备本地 PostgreSQL

本地原生启动前，请先参考 [`README.database.md`](./README.database.md) 完成：

- PostgreSQL 安装与启动
- 本地数据库用户和数据库创建

如果你本机已经有可用的 PostgreSQL，也可以直接修改 [`.env`](./.env) 中的 `DB_HOST`、`DB_PORT`、`DB_USERNAME`、`DB_PASSWORD`、`DB_NAME`，不必强制使用默认的 `postgres / grove` 组合。

### 6. 复制环境变量（基于 [`.env.example`](./.env.example)）

```bash
cp .env.example .env
```

### 7. 安装依赖

```bash
pnpm install
```

### 8. 初始化数据库结构

完成本地环境变量和依赖准备后，请参考 [`README.database.md`](./README.database.md) 执行：

- migration
- 示例数据导入（如需按下文成功示例验证）

### 9. 启动应用

```bash
pnpm start:dev
```

启动成功后，默认访问地址：

- 应用：`http://localhost:3000`

### 如何验证项目已跑起来

在完成 migration 和示例数据导入后，在另一个终端执行：

```bash
curl http://localhost:3000/balances/1
```

如果能返回成功响应，说明本地原生启动完成。

如果你修改过 [`.env`](./.env) 中的 `APP_PORT`，请把上面的 `3000` 替换为你的实际端口。
