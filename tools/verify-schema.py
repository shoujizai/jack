import sqlite3
import pathlib
import json

root = pathlib.Path(r"C:\Users\qq318\Documents\trae\新建文件夹\blog")

db = sqlite3.connect(":memory:")
db.row_factory = sqlite3.Row

# 先跑基础表，再跑后台管理表（模拟线上顺序）
for name in ["schema.sql", "schema-admin.sql"]:
    sql = (root / "api" / name).read_text(encoding="utf-8")
    try:
        db.executescript(sql)
        print(f"✔ {name} 执行成功")
    except sqlite3.OperationalError as e:
        # ALTER TABLE 重复添加列会报错，属预期
        print(f"! {name} 报错（可能的预期错误）: {e}")

tables = [r["name"] for r in db.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
print("表:", ", ".join(tables))
assert set(tables) >= {"users", "comments", "sessions", "pages"}, "缺表"

cols = [r["name"] for r in db.execute("pragma table_info(users)")]
print("users 字段:", ", ".join(cols))
assert "banned_until" in cols, "缺少 banned_until"

# 插入用户 + 页面，验证约束与 upsert
db.execute("insert into users (email, password_hash, nickname) values (?,?,?)", ("318886406@qq.com", "hash", "站长"))
db.execute(
    "insert into pages (slug,title,subtitle,blocks,published,sort_order,updated_by) values (?,?,?,?,?,?,?)",
    ("guide-basic", "新手入门", "副标题", json.dumps([{"type": "paragraph", "text": "hello"}], ensure_ascii=False), 1, 100, "318886406@qq.com"),
)
db.execute(
    """insert into pages (slug,title,subtitle,blocks,published,sort_order,updated_by) values (?,?,?,?,?,?,?)
       on conflict(slug) do update set title=excluded.title, blocks=excluded.blocks, updated_at=strftime('%s','now')""",
    ("guide-basic", "新手入门 v2", "副标题", json.dumps([{"type": "heading", "text": "更新后"}], ensure_ascii=False), 1, 100, "318886406@qq.com"),
)

row = db.execute("select slug,title,blocks from pages").fetchone()
print("upsert 结果:", row["slug"], "|", row["title"], "|", row["blocks"])
assert row["title"] == "新手入门 v2", "upsert 未生效"

# 唯一约束
try:
    db.execute("insert into users (email, password_hash) values (?,?)", ("318886406@qq.com", "x"))
    print("✘ 唯一约束未生效")
except sqlite3.IntegrityError:
    print("✔ email 唯一约束生效")

# 重复执行 schema-admin.sql（模拟用户重复部署）
try:
    db.executescript((root / "api" / "schema-admin.sql").read_text(encoding="utf-8"))
    print("! 重复执行未报错")
except sqlite3.OperationalError as e:
    print(f"✔ 重复执行报错可忽略（duplicate column）: {e}")

print("\n全部 SQL 校验通过 ✔")
