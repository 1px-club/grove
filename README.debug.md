# Grove 调试说明

## Docker 开发调试

项目已经提供一套面向 Docker 开发环境的 VS Code 调试配置：

- [`.vscode/launch.json`](./.vscode/launch.json)
- [`.vscode/tasks.json`](./.vscode/tasks.json)
- [`docker-compose.dev.yml`](./docker-compose.dev.yml)
- [`docker-compose.dev.debug.yml`](./docker-compose.dev.debug.yml)
- `pnpm start:debug:docker`

其中：

- [`docker-compose.dev.yml`](./docker-compose.dev.yml) 用于普通开发环境
- [`docker-compose.dev.debug.yml`](./docker-compose.dev.debug.yml) 只覆盖调试相关行为
- `start:debug:docker` 会在容器内以 `0.0.0.0:9229` 启动 Node Inspector，并在应用入口处等待调试器附加后再继续执行

## 调试方式 1：一键启动并附加

1. 在 VS Code 打开 `Run and Debug`
2. 选择 `Docker Dev: 启动并附加 Grove`
3. 按 `F5`

VS Code 会基于 [`docker-compose.dev.yml`](./docker-compose.dev.yml) 和 [`docker-compose.dev.debug.yml`](./docker-compose.dev.debug.yml) 自动执行：

- `docker compose -f docker-compose.dev.yml -f docker-compose.dev.debug.yml up --build -d`
- 附加到 `localhost:9229`
- 由于 attach 配置启用了 `continueOnAttach`，连接成功后会自动继续运行应用

停止调试后会自动执行对应的 `down` 命令。

如需观察应用日志，可运行 VS Code 任务 `Docker Debug: Grove 日志`，或基于 [`docker-compose.dev.yml`](./docker-compose.dev.yml) 和 [`docker-compose.dev.debug.yml`](./docker-compose.dev.debug.yml) 直接执行：

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.dev.debug.yml logs -f app
```

## 断点位置

可直接在 [`src`](./src) 下的 TypeScript 文件中打断点，例如：

- [`src/main.ts`](./src/main.ts)
- [`src/modules/balance/balance.service.ts`](./src/modules/balance/balance.service.ts)
- [`src/modules/balance/balance.controller.ts`](./src/modules/balance/balance.controller.ts)

当前 attach 配置已经处理了本地工作区和容器内 `/app` 的路径映射，并显式指定了编译产物的 source map 搜索范围，因此改名后仍会按当前工作区路径解析断点。
