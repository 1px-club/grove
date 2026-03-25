# Grove 压测方案（2C2G 预发布环境）

> 环境：`2 核 CPU / 2GB 内存` 的自建服务器，按预发布环境（staging）使用。

## 1. 目标

- 验证 `Grove` 在真实部署环境下的读写性能上限与稳定区间。
- 验证并发事务下的数据一致性（不超扣、不脏写、失败整批回滚）。
- 输出可用于性能评估与复盘的量化结果（`RPS`、`p95/p99`、错误率、锁竞争表现）。

## 2. 压测原则

- 优先压测 `Grove` 直连入口，不经过 `Canopy` 页面链路，避免混入前端渲染影响。
- 本方案默认该服务器为预发布环境，可完整执行读压测、写压测与热账户竞争测试。
- 所有写压测统一使用独立测试账户（如 `900001+`），避免污染业务数据。
- 阶梯升压：从低并发开始，出现明显抖动或错误率上升即停止继续加压。

## 3. 测试范围

### 场景 A：读基线（必须）

- 接口：`GET /balances/:userId`
- 目标：拿到稳定吞吐区间和延迟拐点
- 并发档位：`20 / 50 / 100`
- 单档时长：`30s`
- 说明：并发档位表示“同一时刻有多少个并行请求”；例如 `c=50` 表示同时 50 个请求打接口。
- 说明：单档时长表示“每个并发档位持续多久”；例如 `30s` 表示该档持续 30 秒后再切换下一档。
- 说明：稳定吞吐区间表示某一段并发范围内 `RPS` 基本稳定、错误率低、`p95/p99` 未明显恶化。
- 说明：延迟拐点表示并发继续上升时 `p95/p99` 突然明显变差的位置，通常对应资源瓶颈或排队效应。

### 场景 B：多账户并发写（必须）

- 接口：`POST /balances/transactions`
- 目标：验证低竞争情况下的事务吞吐和延迟
- 并发档位：`20 / 50 / 100`（总并发）
- 单档时长：`30s`
- 说明：多账户并发写是“并发请求打向账户池中的不同账户”，用于测纯写入能力，不重点制造锁冲突。
- 说明：事务语义是“整批要么全部成功，要么全部失败”；压测时不仅看快慢，也看失败时是否整批回滚。

### 场景 C：热账户竞争（必须）

- 接口：`POST /balances/transactions`（同一 `userId` 高频并发）
- 目标：观察行锁竞争下的延迟、错误、以及一致性
- 并发档位：`10 / 20 / 30`
- 单档时长：`30s`
- 说明：热账户（Hot Account）是指短时间内被大量请求集中访问的同一账户（同一 `userId`）。
- 说明：该场景用于验证高竞争下的一致性，重点关注“不超扣、不脏写、失败整批回滚”。

### 场景 D：混合并发（建议）

- 接口：`POST /balances/transactions`
- 目标：模拟真实流量（多数请求分散账户 + 少量请求打热账户）
- 负载模型：`80%` 多账户并发写 + `20%` 热账户并发
- 单档时长：`30s`
- 说明：混合并发比单一场景更接近真实业务流量形态。

### 场景 E：长稳压测（可选）

- 读写混合（建议读 80% + 写 20%）
- 时长：`30min`
- 目标：验证长时间运行下的稳定性（连接泄漏、延迟漂移）
- 说明：长稳压测（Soak Test）主要看系统是否“越跑越慢”，例如连接池泄漏、内存增长、p99 持续上升。

## 4. 执行前准备

1. 本地建立 SSH 隧道：

```bash
ssh -N -L 3000:127.0.0.1:3000 ubuntu@101.35.247.165
```

2. 本机探活：

```bash
curl -s http://127.0.0.1:3000/health
```

3. 准备测试账户（一次性）：

```sql
-- 以下 SQL 在预发布数据库执行，确保压测账号存在。
INSERT INTO users (id)
SELECT id
FROM generate_series(900001, 900220) AS id
ON CONFLICT DO NOTHING;

INSERT INTO accounts (user_id, current_balance_minor)
SELECT id, 100000
FROM generate_series(900001, 900220) AS id
ON CONFLICT (user_id) DO NOTHING;
```

## 5. 执行命令（autocannon）

> 说明：以下命令在本地执行，流量通过 SSH 隧道打到服务器上的 `Grove`。本方案不落盘本地文件，结果在终端即时分析输出。

先设置基础变量：

```bash
BASE_URL="http://127.0.0.1:3000"
```

### 5.1 读基线（场景 A）

```bash
for c in 20 50 100; do
  npx autocannon -j -d 30 -c "$c" "$BASE_URL/balances/1"
done
```

### 5.2 多账户并发写（场景 B）

> 实现方式：按 5 个账户分片并行发压，每个分片打不同账户组，合并后形成总并发。

```bash
for total in 20 50 100; do
  per=$(( total / 5 ))
  for shard in 0 1 2 3 4; do
    u1=$(( 900001 + shard * 2 ))
    body=$(printf '{"checkBalance":true,"transactions":[{"userId":%d,"amount":"1.00"},{"userId":%d,"amount":"-1.00"}]}' "$u1" "$u1")
    npx autocannon -j -d 30 -c "$per" \
      -m POST \
      -H "content-type: application/json" \
      -b "$body" \
      "$BASE_URL/balances/transactions" &
  done
  wait
done
```

### 5.3 热账户竞争（场景 C）

```bash
HOT='{"checkBalance":true,"transactions":[{"userId":900200,"amount":"0.01"},{"userId":900200,"amount":"-0.01"}]}'
for c in 10 20 30; do
  npx autocannon -j -d 30 -c "$c" \
    -m POST \
    -H "content-type: application/json" \
    -b "$HOT" \
    "$BASE_URL/balances/transactions"
done
```

### 5.4 混合并发（场景 D）

```bash
for total in 20 50 100; do
  # 80% 多账户并发写（4 个分片）
  per_pool=$(( (total * 8 / 10) / 4 ))
  for shard in 0 1 2 3; do
    u1=$(( 900101 + shard * 2 ))
    body=$(printf '{"checkBalance":true,"transactions":[{"userId":%d,"amount":"1.00"},{"userId":%d,"amount":"-1.00"}]}' "$u1" "$u1")
    npx autocannon -j -d 30 -c "$per_pool" \
      -m POST \
      -H "content-type: application/json" \
      -b "$body" \
      "$BASE_URL/balances/transactions" &
  done

  # 20% 热账户竞争（1 个分片）
  per_hot=$(( total - per_pool * 4 ))
  hot='{"checkBalance":true,"transactions":[{"userId":900210,"amount":"0.01"},{"userId":900210,"amount":"-0.01"}]}'
  npx autocannon -j -d 30 -c "$per_hot" \
    -m POST \
    -H "content-type: application/json" \
    -b "$hot" \
    "$BASE_URL/balances/transactions" &

  wait
done
```

## 6. 压测后即时分析（基于实测数据，不落盘）

```bash
node <<'NODE'
const { execFileSync } = require('child_process');

function runAutocannon(args) {
  const out = execFileSync('npx', ['--yes', 'autocannon', '-j', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out.trim());
}

function metrics(result) {
  const ok = result['2xx'] || 0;
  const sent = (result.requests && result.requests.sent) || 0;
  return {
    ok,
    sent,
    success: sent ? (ok / sent) * 100 : 0,
    rps: (result.requests && result.requests.average) || 0,
    p95: (result.latency && (result.latency.p95 || result.latency.p97_5)) || 0,
    p99: (result.latency && result.latency.p99) || 0,
    timeouts: result.timeouts || 0,
    errors: result.errors || 0,
    non2xx: result.non2xx || 0,
  };
}

function merge(rows) {
  const sent = rows.reduce((a, x) => a + x.sent, 0);
  const ok = rows.reduce((a, x) => a + x.ok, 0);
  const weighted = (key) =>
    sent ? rows.reduce((a, x) => a + x[key] * x.sent, 0) / sent : 0;
  return {
    ok,
    sent,
    success: sent ? (ok / sent) * 100 : 0,
    rps: rows.reduce((a, x) => a + x.rps, 0),
    p95: weighted('p95'),
    p99: weighted('p99'),
    timeouts: rows.reduce((a, x) => a + x.timeouts, 0),
    errors: rows.reduce((a, x) => a + x.errors, 0),
    non2xx: rows.reduce((a, x) => a + x.non2xx, 0),
  };
}

const base = 'http://127.0.0.1:3000';
const rows = [];

for (const c of [20, 50, 100]) {
  const r = metrics(runAutocannon(['-d', '30', '-c', String(c), `${base}/balances/1`]));
  rows.push({ scene: 'read', c, ...r });
}

for (const c of [10, 20, 30]) {
  const hot = '{"checkBalance":true,"transactions":[{"userId":900200,"amount":"0.01"},{"userId":900200,"amount":"-0.01"}]}';
  const r = metrics(
    runAutocannon([
      '-d',
      '30',
      '-c',
      String(c),
      '-m',
      'POST',
      '-H',
      'content-type: application/json',
      '-b',
      hot,
      `${base}/balances/transactions`,
    ]),
  );
  rows.push({ scene: 'hot', c, ...r });
}

for (const total of [20, 50, 100]) {
  const per = Math.floor(total / 5);
  const shardRows = [];
  for (const shard of [0, 1, 2, 3, 4]) {
    const u = 900001 + shard * 2;
    const body = `{"checkBalance":true,"transactions":[{"userId":${u},"amount":"1.00"},{"userId":${u},"amount":"-1.00"}]}`;
    shardRows.push(
      metrics(
        runAutocannon([
          '-d',
          '30',
          '-c',
          String(per),
          '-m',
          'POST',
          '-H',
          'content-type: application/json',
          '-b',
          body,
          `${base}/balances/transactions`,
        ]),
      ),
    );
  }
  rows.push({ scene: 'write_pool', c: total, ...merge(shardRows) });
}

for (const total of [20, 50, 100]) {
  const perPool = Math.floor((total * 0.8) / 4);
  const shardRows = [];
  for (const shard of [0, 1, 2, 3]) {
    const u = 900101 + shard * 2;
    const body = `{"checkBalance":true,"transactions":[{"userId":${u},"amount":"1.00"},{"userId":${u},"amount":"-1.00"}]}`;
    shardRows.push(
      metrics(
        runAutocannon([
          '-d',
          '30',
          '-c',
          String(perPool),
          '-m',
          'POST',
          '-H',
          'content-type: application/json',
          '-b',
          body,
          `${base}/balances/transactions`,
        ]),
      ),
    );
  }
  const hotC = total - perPool * 4;
  const hot = '{"checkBalance":true,"transactions":[{"userId":900210,"amount":"0.01"},{"userId":900210,"amount":"-0.01"}]}';
  const hotRow = metrics(
    runAutocannon([
      '-d',
      '30',
      '-c',
      String(hotC),
      '-m',
      'POST',
      '-H',
      'content-type: application/json',
      '-b',
      hot,
      `${base}/balances/transactions`,
    ]),
  );
  rows.push({ scene: 'mix', c: total, ...merge([...shardRows, hotRow]) });
}

console.log('scene\tc\tsuccess%\trps\tp95\tp99\tnon2xx\ttimeouts\terrors');
for (const r of rows) {
  console.log(
    `${r.scene}\t${r.c}\t${r.success.toFixed(2)}\t${r.rps.toFixed(2)}\t${r.p95.toFixed(1)}\t${r.p99.toFixed(1)}\t${r.non2xx}\t${r.timeouts}\t${r.errors}`,
  );
}

const readRows = rows.filter((r) => r.scene === 'read');
const stable = readRows.filter((r) => r.success >= 98 && r.p99 < 1200).sort((a, b) => a.c - b.c);
if (stable.length) {
  const best = stable[stable.length - 1];
  console.log(
    `结论：读场景稳定并发上限为 c=${best.c}，RPS=${best.rps.toFixed(2)}，p99=${best.p99.toFixed(1)}ms，success=${best.success.toFixed(2)}%。`,
  );
} else {
  console.log('结论：读场景未达到稳定阈值（success>=98% 且 p99<1200ms），需回看资源瓶颈。');
}
NODE
```

## 7. 判定标准（2C2G 建议阈值）

- 读接口（`GET /balances/:userId`）：
  - `success >= 98%`
  - `p99 < 1200ms`
  - 无连续 timeout 峰值
- 写接口（普通事务）：
  - `success >= 97%`
  - `p99 < 2000ms`
  - `5xx` 不持续增长
- 热账户竞争：
  - 允许业务型失败（如余额不足）
  - 不允许数据不一致（超扣、部分提交）

## 8. 压测后总结要求（必做）

- 压测跑完后，直接基于终端输出给出总结，不落盘本地文件。
- 结论以实测数据为准，不使用预设文案。
- 总结至少包含：稳定并发区间、延迟拐点位置、失败/超时增长区间、下一步优化建议。

### 8.1 本次实测结果（2026-03-25）

- 测试入口：`http://127.0.0.1:33000`（SSH 隧道转发到服务器 `127.0.0.1:3000`）
- 单档时长：`30s`

| 场景       | 并发 c | success |     RPS | p95(ms) | p99(ms) | non2xx | timeouts | errors |
| ---------- | -----: | ------: | ------: | ------: | ------: | -----: | -------: | -----: |
| read       |     20 |  99.81% |  359.40 |    84.0 |    97.0 |      0 |        0 |      0 |
| read       |     50 |  99.81% |  893.00 |    98.0 |   111.0 |      0 |        0 |      0 |
| read       |    100 |  99.69% | 1083.24 |   153.0 |   181.0 |      0 |        0 |      0 |
| write_pool |     20 |  99.79% |  321.46 |   103.8 |   115.6 |      0 |        0 |      0 |
| write_pool |     50 |  99.73% |  615.15 |   126.6 |   143.0 |      0 |        0 |      0 |
| write_pool |    100 |  99.44% |  589.43 |   236.6 |   259.4 |      0 |        0 |      0 |
| hot        |     10 |  99.79% |  158.77 |    88.0 |    98.0 |      0 |        0 |      0 |
| hot        |     20 |  99.80% |  328.14 |    90.0 |    99.0 |      0 |        0 |      0 |
| hot        |     30 |  99.70% |  330.80 |   124.0 |   142.0 |      0 |        0 |      0 |
| mix        |     20 |  99.81% |  349.49 |    83.0 |   100.2 |      0 |        0 |      0 |
| mix        |     50 |  99.69% |  529.65 |   139.8 |   151.6 |      0 |        0 |      0 |
| mix        |    100 |  99.38% |  533.85 |   244.4 |   271.8 |      0 |        0 |      0 |

实测结论：读场景在 `c=100` 仍保持稳定（`RPS=1083.24`，`p99=181ms`，`success=99.69%`）；写与混合场景在更高并发下出现吞吐增幅变小且长尾延迟上升（如 `write_pool c=50→100`，`RPS 615.15→589.43`、`p99 143.0→259.4ms`）；全程 `non2xx=0`、`timeouts=0`、`errors=0`，整体稳定性良好。

压测后清理校验：`account_transactions=0`、`accounts=0`、`users=0`（`900001-900220` 测试区间）。

## 9. 风险与注意事项

- 预发布环境也应使用独立测试账户，测试结束后统一清理测试数据。
- 本地压测机性能也会影响结果，建议固定本机环境并多次复测取中位值。
- 压测期间同步观察服务器：`docker stats`、CPU、内存、磁盘 IO、PostgreSQL 锁等待。

### 9.1 压测后清理（必选）

```sql
DELETE FROM account_transactions WHERE user_id BETWEEN 900001 AND 900220;
DELETE FROM accounts WHERE user_id BETWEEN 900001 AND 900220;
DELETE FROM users WHERE id BETWEEN 900001 AND 900220;
```

## 10. 术语速查表

- `2C2G`：`2 核 CPU + 2GB 内存`，代表机器资源上限较低，压测时需保守升压。
- `预发布环境（staging）`：接近生产配置但允许做完整测试（含写压测和清理）。
- `压测（Load Test）`：在可控流量下验证性能、稳定性和一致性。
- `读基线`：用读接口先测出基础容量和延迟水平，作为后续比较基准。
- `写事务压测`：针对写接口和数据库事务行为的性能与正确性验证。
- `热账户竞争`：并发请求集中访问同一 `userId`，用来放大锁竞争问题。
- `长稳压测（Soak Test）`：在中等负载下长时间运行，观察是否出现性能漂移和资源泄漏。
- `并发档位`：每轮测试的并发连接数（如 `20/50/100`）。
- `单档时长`：每个并发档位的持续时间（如 `30s`）。
- `阶梯升压`：从低并发逐步升到高并发，逐步定位系统容量边界。
- `吞吐`：单位时间处理请求能力，常用 `RPS` 表示。
- `RPS`：每秒请求数（Requests Per Second）。
- `延迟（Latency）`：请求从发出到收到响应的时间。
- `p95`：95% 请求的响应时间不超过该值。
- `p99`：99% 请求的响应时间不超过该值，用于观察长尾。
- `稳定吞吐区间`：吞吐稳定且错误率、延迟都在可接受范围内的并发区间。
- `延迟拐点`：并发上升后延迟开始明显恶化的转折点。
- `成功率`：`2xx / sent * 100%`，反映请求成功比例。
- `错误率`：失败请求占比，通常包含非 2xx、连接错误、超时等。
- `timeout`：请求超过等待时间未完成，被压测工具判定为超时。
- `5xx`：服务端错误响应，通常意味着后端或依赖异常。
- `事务（Transaction）`：一组操作的原子执行单元，要么全成功要么全失败。
- `整批回滚`：批量交易中任一步失败时，整批变更全部撤销。
- `数据一致性`：数据始终满足业务约束，不出现相互矛盾状态。
- `不超扣`：并发扣减时不会突破业务允许的余额边界。
- `脏写`：并发写入时数据被错误覆盖或污染。
- `行锁（Row Lock）`：数据库对单行数据加锁，防止并发写冲突。
- `锁竞争`：多个事务争抢同一把锁，导致等待和延迟上升。
- `锁等待`：事务因拿不到锁而排队的等待时间。
- `SSH 隧道`：将本地端口转发到服务器内网端口，用于安全直连服务。
- `探活（Health Check）`：压测前用轻量请求确认服务可用。
- `autocannon`：Node.js 生态常用 HTTP 压测工具。
- `sent`：压测工具实际发送的请求总数。
- `2xx`：成功响应总数。
- `errors`：网络或连接层错误数。
- `docker stats`：查看容器 CPU、内存、网络和 I/O 实时指标的命令。
- `磁盘 IO`：磁盘读写负载，数据库写压测时常见瓶颈之一。
- `ON CONFLICT DO NOTHING`：插入冲突时跳过，不报错。
