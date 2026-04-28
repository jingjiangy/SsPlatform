from __future__ import annotations

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.common import beijing_now


async def recalc_task_stats(db: AsyncIOMotorDatabase, task_oid: ObjectId) -> None:
    cursor = db["eval_records"].find({"task_id": task_oid})
    total = 0
    success = 0
    duration_sum = 0
    video_count = 0
    total_score_sum = 0.0
    total_score_count = 0
    async for r in cursor:
        total += 1
        if r.get("result") == "成功":
            success += 1
        ds = int(r.get("duration_seconds") or 0)
        if r.get("video_url") and ds > 0:
            duration_sum += ds
            video_count += 1
        if "total_score" in r and r.get("total_score") is not None:
            try:
                total_score_sum += float(r.get("total_score") or 0)
                total_score_count += 1
            except Exception:
                pass
    rate = (success / total * 100.0) if total else 0.0
    avg = (duration_sum / video_count) if video_count else 0.0
    avg_total_score = (total_score_sum / total_score_count) if total_score_count else 0.0
    await db["eval_tasks"].update_one(
        {"_id": task_oid},
        {
            "$set": {
                "success_count": success,
                "total_count": total,
                "success_rate": round(rate, 2),
                "avg_video_seconds": round(avg, 2),
                "avg_total_score": round(avg_total_score, 2),
                "updated_at": beijing_now(),
            }
        },
    )
