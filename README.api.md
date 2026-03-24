# Grove API 说明

## 响应约定

所有成功响应都会被统一包装为：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

所有错误响应都会通过全局异常过滤器格式化。

## 接口列表

- `GET /balances/:userId`：查询指定用户余额
- `POST /balances/transactions`：批量发放交易并返回每笔 `endingBalance`

## 示例前置条件

下文的成功示例默认基于以下前置条件：

- 已执行 migration
- 已导入 [`init.sql`](./init.sql) 示例数据

如果你没有导入示例数据，那么示例中的 `userId = 1`、`userId = 2` 可能返回不同余额，或者直接返回 `404`。

## `GET /balances/:userId`

返回指定用户当前余额。

请求示例：

```bash
curl http://localhost:3000/balances/1
```

响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userId": 1,
    "balance": "120.00"
  }
}
```

说明：

- `userId` 必须是正整数
- 如果账户不存在，返回 `404`

## `POST /balances/transactions`

原子性地发放一批交易。

请求体字段：

- `checkBalance`：布尔值；为 `true` 时，不允许交易后余额为负
- `transactions`：交易数组；至少一项

每项交易包含：

- `userId`
- `amount`

其中：

- `amount` 使用十进制字符串
- 最多支持两位小数
- 可以为正数或负数
- `0` 不允许

请求示例：

```bash
curl -X POST http://localhost:3000/balances/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "checkBalance": true,
    "transactions": [
      { "userId": 2, "amount": "100.00" },
      { "userId": 1, "amount": "50.00" },
      { "userId": 2, "amount": "-30.00" }
    ]
  }'
```

响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "checkBalance": true,
    "results": [
      { "userId": 2, "amount": "100.00", "endingBalance": "300.00" },
      { "userId": 1, "amount": "50.00", "endingBalance": "150.00" },
      { "userId": 2, "amount": "-30.00", "endingBalance": "270.00" }
    ]
  }
}
```

## 校验规则

- `transactions` 必须至少包含一项
- `userId` 必须是正整数
- `amount` 必须是最多两位小数的十进制字符串
- `amount = 0` 不允许

## 业务语义

- 整批交易在单个事务中执行
- 同一批次内按请求顺序逐笔计算余额
- 响应中的 `endingBalance` 与该顺序保持一致
- 如果任一交易失败，整批请求回滚
