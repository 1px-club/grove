-- 示例数据脚本（仅用于本地开发/联调）
-- 前置条件：请先执行 migration 建好表结构

-- 插入示例用户
INSERT INTO users (id) VALUES (1), (2), (3)
    ON CONFLICT (id) DO NOTHING;

-- 对齐 users.id 的序列，避免后续默认插入与显式种子 ID 冲突
SELECT setval(
    pg_get_serial_sequence('users', 'id'),
    COALESCE((SELECT MAX(id) FROM users), 1),
    true
);

-- 插入示例账户
INSERT INTO accounts (user_id, current_balance_minor) VALUES
    (1, 10000),
    (2, 20000),
    (3, 30000)
    ON CONFLICT (user_id) DO NOTHING;
