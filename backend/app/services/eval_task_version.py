"""同一素材（material_id）下评测任务 version：首条 1.0，之后每条在「当前该素材下已有任务的最大 version」上 +0.1。"""

from __future__ import annotations

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.material_version import _bump, _parse


async def compute_next_eval_task_version_for_material(
    db: AsyncIOMotorDatabase, material_id: ObjectId
) -> str:
    cur = db["eval_tasks"].find({"material_id": material_id}, {"version": 1})
    vers: list[str] = []
    async for d in cur:
        v = d.get("version")
        if v is not None:
            vers.append(str(v))
    if not vers:
        return "1.0"
    used = set(vers)
    m, n = max(_parse(x) for x in vers)
    cand = _bump(m, n)
    while cand in used:
        m, n = _parse(cand)
        cand = _bump(m, n)
    return cand
