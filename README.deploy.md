# Grove 生产部署说明

## 部署方式

当前项目采用“本地构建，本地 SSH 推送到服务器”的方式部署：

1. 本地执行格式、ESLint 和 TypeScript 检查
2. 本地构建 `linux/amd64` 生产镜像
3. 通过 `scp` 将镜像包、生产编排文件和生产环境变量上传到服务器
4. 服务器确保公共网关网络存在
5. 服务器加载镜像并执行 migration
6. 服务器使用 `docker compose` 启动 PostgreSQL 和应用

GitHub Actions 继续保留为代码质量检查，不参与正式发布。

## 首次准备

### 1. 本地准备部署配置

复制部署配置模板：

```bash
cp .env.deploy.example .env.deploy
cp .env.production.example .env.production
```

需要重点确认的字段：

- `.env.deploy`
  - `SERVER_IP`：服务器公网 IP
  - `SERVER_USER`：当前腾讯云 Docker CE 镜像默认是 `ubuntu`
  - `PROJECT_PATH`：建议使用 `/home/ubuntu/grove`
- `.env.production`
  - `DB_PASSWORD`：改成强密码
  - `APP_HOST`：当前默认使用 `api.1px.website`
  - `APP_PUBLIC_URL`：当前默认使用 `https://api.1px.website`
  - `APP_IP_ACCESS_HOST`：备案审核期间用于临时 IP 访问，默认填服务器公网 IP
  - `TRAEFIK_NETWORK`：默认 `atmosphere_network`
  - `TRAEFIK_CERT_RESOLVER`：默认为 `letsencrypt`

说明：

- 部署脚本支持密码 SSH 登录
- 但为了避免每次部署输入密码，仍然建议尽快配置 SSH 密钥

### 2. 服务器准备

当前腾讯云 Docker CE 镜像已经预装 Docker 和 Docker Compose。

建议确认以下端口已经在轻量服务器防火墙中放行：

- `22`
- `80`
- `443`

如果你已经接入 `atmosphere` 网关，不再需要额外开放 `3000` 到公网。

DNS 需要提前配置：

- `api.1px.website` 的 `A` 记录指向你的公网 IP

## 部署命令

手动部署：

```bash
pnpm deploy:prod
```

## 部署脚本会做什么

[`scripts/deploy.sh`](./scripts/deploy.sh) 会依次完成：

1. 检测 SSH 连通性
2. 本地运行 `pnpm format:check`
3. 本地运行 `pnpm lint`
4. 本地运行 `pnpm typecheck`
5. 构建生产镜像并打包上传
6. 在服务器上加载镜像
7. 上传 [`docker-compose.prod.yml`](./docker-compose.prod.yml) 和 `.env.production`
8. 创建并复用 `atmosphere_network`
9. 启动 PostgreSQL
10. 执行 `pnpm migration:run:prod`
11. 启动应用并等待健康检查通过

## 网关接入约定（Atmosphere）

- 主路由使用 `websecure`，并强制 `tls=true`
- Router 命名采用 `grove-api-main`（主域名）和 `grove-api-ip-main`（IP 临时访问）
- Service 命名采用 `grove-api-main`
- 默认挂载通用中间件：`security-headers@file,compress@file`

## 健康检查

项目新增了 `GET /health` 接口，返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "ok"
  }
}
```

部署完成后可以直接验证：

```bash
curl https://api.1px.website/health
```

如果域名还在备案审核中（或被平台拦截），可先使用 IP 访问验证：

```bash
curl https://101.35.247.165/health
```
