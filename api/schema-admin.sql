-- ============================================================
-- 后台管理所需的表结构（在 D1 控制台或 wrangler 里执行一次）
-- ============================================================

-- 页面表：每个页面 = 一组"方块"（blocks 存 JSON 数组）
CREATE TABLE IF NOT EXISTS pages (
    slug        TEXT PRIMARY KEY,          -- 页面地址，如 guide-basic
    title       TEXT NOT NULL,             -- 大标题
    subtitle    TEXT,                      -- 副标题/说明
    blocks      TEXT NOT NULL DEFAULT '[]',-- 方块 JSON 数组
    published   INTEGER DEFAULT 1,         -- 1=已发布 0=草稿
    sort_order  INTEGER DEFAULT 100,       -- 列表排序
    created_at  INTEGER DEFAULT (strftime('%s','now')),
    updated_at  INTEGER DEFAULT (strftime('%s','now')),
    updated_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_pages_published ON pages(published);

-- 用户表新增封禁字段（如果提示 duplicate column name，说明已经加过了，忽略即可）
ALTER TABLE users ADD COLUMN banned_until INTEGER;
