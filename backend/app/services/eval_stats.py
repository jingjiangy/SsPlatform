from __future__ import annotations

from typing import Any, Mapping

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.common import beijing_now


def eval_record_included_in_task_stats(rec: Mapping[str, Any]) -> bool:
    """为 True 时参与任务级汇总：成功/失败/总数/成功率/平均视频时长/评测步骤均分(avg_total_score)。"""
    return (rec.get("status") or "有效") != "剔除"


async def recalc_task_stats(db: AsyncIOMotorDatabase, task_oid: ObjectId) -> None:
    """按「有效」记录重算 eval_tasks 上 success_count、total_count、success_rate 等；「剔除」一律不计入。"""
    cursor = db["eval_records"].find({"task_id": task_oid})
    total = 0
    success = 0
    duration_sum = 0
    video_count = 0
    total_score_sum = 0.0
    total_score_count = 0
    async for r in cursor:
        if not eval_record_included_in_task_stats(r):
            continue
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
