#!/usr/bin/env python3
"""
Migrate absolute video_url / cover_url / image_url values stored in MongoDB
to relative /static/uploads/<filename> paths.

Run from the backend directory:
    python scripts/migrate_video_urls.py [--dry-run]
"""
from __future__ import annotations

import asyncio
import re
import sys
from urllib.parse import urlparse

import motor.motor_asyncio

sys.path.insert(0, ".")
from app.config import settings  # noqa: E402

URL_FIELDS = ["video_url", "cover_url", "image_url"]
STATIC_PREFIX = "/static/uploads/"
ABS_PATTERN = re.compile(r"^https?://", re.IGNORECASE)


def to_relative(url: str) -> str | None:
    """Convert an absolute /static/uploads/... URL to a relative path.
    Returns None if the URL is already relative or not a /static/uploads/ path.
    """
    if not ABS_PATTERN.match(url):
        return None  # already relative or empty
    path = urlparse(url).path or ""
    if STATIC_PREFIX not in path:
        return None  # not an upload URL we manage
    idx = path.index(STATIC_PREFIX)
    return path[idx:]  # e.g. /static/uploads/abc123.webm


async def migrate(dry_run: bool = False) -> None:
    client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.mongodb_db]

    collections = await db.list_collection_names()
    total_updated = 0

    for col_name in collections:
        col = db[col_name]
        # Find docs that have at least one absolute URL field
        query = {"$or": [{f: {"$regex": "^https?://"}} for f in URL_FIELDS]}
        cursor = col.find(query)
        docs = await cursor.to_list(length=None)

        if not docs:
            continue

        print(f"\n[{col_name}] {len(docs)} document(s) to migrate")
        for doc in docs:
            updates: dict = {}
            for field in URL_FIELDS:
                val = doc.get(field)
                if not isinstance(val, str):
                    continue
                rel = to_relative(val)
                if rel and rel != val:
                    updates[field] = rel
                    print(f"  _id={doc['_id']}  {field}: {val!r} -> {rel!r}")

            if updates:
                if not dry_run:
                    await col.update_one({"_id": doc["_id"]}, {"$set": updates})
                total_updated += 1

    client.close()
    action = "Would update" if dry_run else "Updated"
    print(f"\n{action} {total_updated} document(s) total.")
    if dry_run:
        print("(dry-run — no changes written)")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    asyncio.run(migrate(dry_run=dry))
