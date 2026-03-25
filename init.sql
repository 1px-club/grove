-- 示例数据脚本（仅用于本地开发/联调）
-- 前置条件：请先执行 migration 建好表结构

-- 插入 10 个示例用户，对齐 Canopy 演示环境
INSERT INTO users (id) VALUES
    (1),
    (2),
    (3),
    (4),
    (5),
    (6),
    (7),
    (8),
    (9),
    (10)
    ON CONFLICT (id) DO NOTHING;

-- 对齐 users.id 的序列，避免后续默认插入与显式种子 ID 冲突
SELECT setval(
    pg_get_serial_sequence('users', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM users), 1), 10),
    true
);

-- 插入 10 个示例账户余额，对齐 Canopy 当前演示用账号
INSERT INTO accounts (user_id, current_balance_minor) VALUES
    (1, 10000),
    (2, 20000),
    (3, 30000),
    (4, 45000),
    (5, 60000),
    (6, 125000),
    (7, 7500),
    (8, 98000),
    (9, 150000),
    (10, 250000)
    ON CONFLICT (user_id) DO UPDATE
    SET current_balance_minor = EXCLUDED.current_balance_minor,
        updated_at = NOW();
