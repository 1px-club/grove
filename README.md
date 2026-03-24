# Grove

## 概述

Grove 是一个基于 PostgreSQL 的 Nest.js 项目，当前仅包含 `balance` 模块实现。

`Grove` 意为一片小树林，强调项目作为承载各项业务的稳定基座。

支持以下功能：

- 查询用户当前余额
- 在单个请求中发放多笔余额交易
- 可选的 `checkBalance` 规则以阻止负余额
- 为每笔成功的交易记录 `endingBalance`
- 并发安全的余额更新

## 文档导航

- 首次拉取仓库，建议先阅读 [启动与运行指南](./README.setup.md)
- [实现补充说明](./README.notes.md)
- [启动与运行指南](./README.setup.md)
- [测试说明](./README.testing.md)
- [调试说明](./README.debug.md)
- [数据库管理与操作指南](./README.database.md)
- [架构设计说明](./README.architecture.md)
- [API 说明](./README.api.md)
