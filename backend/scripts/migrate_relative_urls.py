"""
migrate_relative_urls.py
把数据库里所有 http(s)://xxx/static/uploads/... 绝对 URL 转成相对路径
/static/uploads/...，使视频链接不再依赖固定 IP/hostname。

用法：
  cd backend
  python scripts/migrate_relative_urls.py          # dry-run，只打印不修改
  python scripts/migrate_relative_urls.py --apply  # 实际写入
"""
from __future__ import annotations

import asyncio
import re
import sys
from urllib.parse import urlparse

sys.path.insert(0, ".")

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

# 需要检查的集合和字段
TARGETS: list[tuple[str, list[str]]] = [
    ("eval_records",  ["video_url"]),
    ("materials",     ["video_url", "cover_url"]),
    ("model_ss_parts",["image_url"]),
]

_STATIC_PREFIX = "/static/uploads/"


def to_relative(url: str) -> str | None:
    """把绝对 URL 转成相对路径；已经是相对路径则返回 None（无需修改）。"""
    s = url.strip()
    if not s or not s.startswith(("http://", "https://")):
        return None
    path = urlparse(s).path or ""
    if _STATIC_PREFIX not in path:
        return None
    idx = path.index(_STATIC_PREFIX)
    return path[idx:]


async def run(apply: bool) -> None:
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.mongodb_db]

    total_found = 0
    total_updated = 0

    for col_name, fields in TARGETS:
        col = db[col_name]
        # 查找任意字段包含绝对 URL 的文档
        query = {"$or": [{f: re.compile(r"^https?://")} for f in fields]}
        async for doc in col.find(query):
            patch: dict[str, str] = {}
            for f in fields:
                val = doc.get(f)
                if isinstance(val, str):
                    rel = to_relative(val)
                    if rel:
                        patch[f] = rel
            if not patch:
                continue
            total_found += 1
            print(f"[{col_name}] _id={doc['_id']}")
            for f, rel in patch.items():
                print(f"  {f}: {doc[f]!r}  →  {rel!r}")
            if apply:
                await col.update_one({"_id": doc["_id"]}, {"$set": patch})
                total_updated += 1

    print()
    if apply:
        print(f"完成：共更新 {total_updated} 条文档。")
    else:
        print(f"Dry-run：发现 {total_found} 条需要迁移的文档（加 --apply 参数执行实际更新）。")

    client.close()


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    asyncio.run(run(apply))
