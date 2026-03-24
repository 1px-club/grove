FROM node:20-alpine AS base

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 开发阶段
FROM base AS development
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "start:dev"]

# 构建阶段
FROM base AS builder
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# 生产阶段
FROM base AS production
ENV NODE_ENV=production
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/main"]
