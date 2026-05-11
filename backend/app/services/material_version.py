"""子素材（有 parent_id）的版本号规则（与 validate_version 一致：一位小数，如 1.0、1.1）。

- 当前还没有任何子版本：第一个子版本 = 父版本号 + 0.1（例如父 1.0 → 子 1.1）。
- 已有子版本：新子版本 = 现有子版本号中的最大值 + 0.1（只比较子文档，不含父文档）。
"""

from __future__ import annotations

import re
from typing import Iterable

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

_VM = re.compile(r"^(\d+)\.(\d)$")


def _parse(v: str) -> tuple[int, int]:
    m = _VM.match((v or "").strip())
    if not m:
        return (1, 0)
    return int(m.group(1)), int(m.group(2))


def _bump(major: int, minor: int) -> str:
    """在一位小数规则下 +0.1；minor 为 9 时进位到下一主版本 .0。"""
    if minor < 9:
        return f"{major}.{minor + 1}"
    return f"{major + 1}.0"


def _first_sub_from_parent(parent_version: str) -> str:
    """尚无子版本：父版本 + 0.1。"""
    m, n = _parse(parent_version)
    return _bump(m, n)


def _next_sub_from_siblings(sibling_versions: Iterable[str]) -> str:
    """已有子版本：最大子版本号 + 0.1（仅根据子文档 version 列表）。"""
    sibs = [s for s in sibling_versions if s]
    if not sibs:
        raise ValueError("sibling_versions 不能为空，请改用 _first_sub_from_parent")
    tuples = [_parse(s) for s in sibs]
    m, n = max(tuples)
    return _bump(m, n)


async def compute_next_sub_version(db: AsyncIOMotorDatabase, parent_oid: ObjectId) -> str:
    parent = await db["materials"].find_one({"_id": parent_oid})
    parent_v = str(parent.get("version") or "1.0") if parent else "1.0"
    cur = db["materials"].find({"parent_id": parent_oid}, {"version": 1})
    sibs: list[str] = []
    async for d in cur:
        v = d.get("version")
        if v is not None:
            sibs.append(str(v))
    used = set(sibs)
    if not sibs:
        cand = _first_sub_from_parent(parent_v)
    else:
        cand = _next_sub_from_siblings(sibs)
    # 与已有子版本号冲突时继续 +0.1，直到空闲（兼容历史重复号）
    while cand in used:
        m, n = _parse(cand)
        cand = _bump(m, n)
    return cand
