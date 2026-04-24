from __future__ import annotations

from typing import Sequence

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


def _robot_device_model_id_str(doc: dict) -> str | None:
    v = doc.get("device_model_id")
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, str) and v.strip() and ObjectId.is_valid(v.strip()):
        return v.strip()
    return None


async def resolve_robot_device_model_display_name(
    db: AsyncIOMotorDatabase,
    rdoc: dict,
) -> str:
    """优先根据 device_model_id 查设备型号名称；兼容旧数据仅存 device_model 文本。"""
    sid = _robot_device_model_id_str(rdoc)
    if sid:
        mdoc = await db["device_models"].find_one({"_id": ObjectId(sid)}, {"name": 1})
        if mdoc:
            return str(mdoc.get("name") or "").strip() or "—"
        return "—"
    return str(rdoc.get("device_model") or "").strip()


async def enrich_part_robots(
    db: AsyncIOMotorDatabase,
    docs: Sequence[dict],
) -> None:
    """将配件文档中的 robot_id 解析为 robot_name 展示名（原地修改）。"""
    if not docs:
        return
    oid_list: list[ObjectId] = []
    seen: set[str] = set()
    for d in docs:
        rid = d.get("robot_id")
        if isinstance(rid, ObjectId):
            s = str(rid)
        elif isinstance(rid, str) and rid.strip() and ObjectId.is_valid(rid.strip()):
            s = rid.strip()
        else:
            d["robot_name"] = ""
            continue
        if s not in seen:
            seen.add(s)
            oid_list.append(ObjectId(s))
    if not oid_list:
        for d in docs:
            if "robot_name" not in d:
                d["robot_name"] = ""
        return
    oid_to_name: dict[str, str] = {}
    async for r in db["robots"].find({"_id": {"$in": oid_list}}, {"name": 1}):
        oid_to_name[str(r["_id"])] = str(r.get("name") or "").strip() or "—"
    for d in docs:
        rid = d.get("robot_id")
        if isinstance(rid, ObjectId):
            s = str(rid)
        elif isinstance(rid, str) and rid.strip() and ObjectId.is_valid(rid.strip()):
            s = rid.strip()
        else:
            d["robot_name"] = ""
            continue
        d["robot_name"] = oid_to_name.get(s, "—")


async def enrich_robot_device_models(
    db: AsyncIOMotorDatabase,
    docs: Sequence[dict],
) -> None:
    """将 robots 文档中的 device_model_id 解析为 device_model 展示名（原地修改）；无 id 则保留原 device_model 文本。"""
    if not docs:
        return
    oid_list: list[ObjectId] = []
    seen: set[str] = set()
    for d in docs:
        sid = _robot_device_model_id_str(d)
        if sid and sid not in seen:
            seen.add(sid)
            oid_list.append(ObjectId(sid))
    if not oid_list:
        return
    oid_to_name: dict[str, str] = {}
    async for m in db["device_models"].find({"_id": {"$in": oid_list}}, {"name": 1}):
        oid_to_name[str(m["_id"])] = str(m.get("name") or "").strip()
    for d in docs:
        sid = _robot_device_model_id_str(d)
        if sid and sid in oid_to_name:
            d["device_model"] = oid_to_name[sid] or "—"
        elif sid:
            d["device_model"] = "—"


def actor_label_from_payload(user: dict) -> str:
    """写入库时优先用登录名；兼容旧 token 无 username。"""
    name = user.get("username")
    if isinstance(name, str) and name.strip():
        return name.strip()
    return str(user.get("sub") or "").strip() or "—"


async def enrich_actor_fields(
    db: AsyncIOMotorDatabase,
    docs: Sequence[dict],
    fields: tuple[str, ...] = ("created_by", "updated_by"),
) -> None:
    """将文档中的用户 ObjectId 字符串替换为 users 表中的 username（原地修改）。"""
    if not docs:
        return
    ids: set[str] = set()
    for d in docs:
        for f in fields:
            v = d.get(f)
            if isinstance(v, str) and v.strip():
                ids.add(v.strip())
    if not ids:
        return
    oid_list: list[ObjectId] = []
    for s in ids:
        if ObjectId.is_valid(s):
            try:
                oid_list.append(ObjectId(s))
            except Exception:
                pass
    if not oid_list:
        return
    oid_to_name: dict[str, str] = {}
    async for u in db["users"].find({"_id": {"$in": oid_list}}, {"username": 1}):
        uid = str(u["_id"])
        un = u.get("username")
        oid_to_name[uid] = (str(un).strip() if isinstance(un, str) else "") or uid
    for d in docs:
        for f in fields:
            v = d.get(f)
            if not isinstance(v, str) or not v.strip():
                continue
            s = v.strip()
            if s in oid_to_name:
                d[f] = oid_to_name[s]


async def enrich_one(
    db: AsyncIOMotorDatabase,
    doc: dict | None,
    fields: tuple[str, ...] = ("created_by", "updated_by"),
) -> dict | None:
    if not doc:
        return doc
    d = dict(doc)
    await enrich_actor_fields(db, [d], fields=fields)
    return d
