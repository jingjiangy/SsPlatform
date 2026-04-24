from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.robot import RobotCreate, RobotOut, RobotUpdate
from app.permissions import P_ROBOT_READ, P_ROBOT_WRITE
from app.services.upload import delete_local_upload_media_fields
from app.services.user_display import (
    actor_label_from_payload,
    enrich_actor_fields,
    enrich_one,
    enrich_robot_device_models,
)

router = APIRouter(prefix="/robots", tags=["robots"])


async def _require_existing_device_model_id(db, raw_id: str) -> str:
    s = (raw_id or "").strip()
    if not s or not ObjectId.is_valid(s):
        raise HTTPException(400, "无效设备型号ID")
    oid = ObjectId(s)
    if not await db["device_models"].find_one({"_id": oid}, {"_id": 1}):
        raise HTTPException(400, "设备型号不存在，请先在设备型号中维护")
    return s


@router.get("")
async def list_robots(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_ROBOT_READ))],
    skip: int = 0,
    limit: int = 20,
):
    if limit < 1:
        limit = 20
    if limit > 200:
        limit = 200
    total = await db["robots"].count_documents({})
    cur = db["robots"].find().sort("_id", -1).skip(skip).limit(limit)
    items = []
    async for doc in cur:
        items.append(dict(doc))
    await enrich_robot_device_models(db, items)
    await enrich_actor_fields(db, items)
    return {"items": [RobotOut.from_doc(d).model_dump(by_alias=True) for d in items], "total": total}


@router.post("")
async def create_robot(
    body: RobotCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_ROBOT_WRITE))],
):
    now = beijing_now()
    dm_id = await _require_existing_device_model_id(db, body.device_model_id)
    doc = {
        "name": body.name.strip(),
        "device_model_id": dm_id,
        "status": body.status,
        "version": body.version,
        "details": (body.details or "").strip(),
        "created_at": now,
        "updated_at": now,
        "created_by": actor_label_from_payload(user),
        "updated_by": actor_label_from_payload(user),
    }
    r = await db["robots"].insert_one(doc)
    doc["_id"] = r.inserted_id
    await enrich_robot_device_models(db, [doc])
    await enrich_actor_fields(db, [doc])
    return RobotOut.from_doc(doc).model_dump(by_alias=True)


@router.get("/device-model-options")
async def device_model_options_for_robot_form(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_ROBOT_READ))],
    limit: int = 500,
):
    """机器人表单下拉：仅需机器人读权限即可选用设备型号（需在 /{rid} 之前声明）。"""
    cur = db["device_models"].find().sort("_id", -1).skip(0).limit(limit)
    items: list[dict] = []
    async for doc in cur:
        items.append(
            {
                "id": str(doc["_id"]),
                "name": str(doc.get("name") or ""),
                "status": str(doc.get("status") or ""),
            }
        )
    return {"items": items}


@router.get("/{rid}")
async def get_robot(
    rid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_ROBOT_READ))],
):
    try:
        oid = ObjectId(rid)
    except InvalidId:
        raise HTTPException(400, "无效机器人ID")
    doc = await db["robots"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "机器人不存在")
    d = dict(doc)
    await enrich_robot_device_models(db, [d])
    d2 = await enrich_one(db, d)
    return RobotOut.from_doc(d2).model_dump(by_alias=True)


@router.put("/{rid}")
async def update_robot(
    rid: str,
    body: RobotUpdate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_ROBOT_WRITE))],
):
    try:
        oid = ObjectId(rid)
    except InvalidId:
        raise HTTPException(400, "无效机器人ID")
    existing = await db["robots"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "机器人不存在")
    patch: dict = {"updated_at": beijing_now(), "updated_by": actor_label_from_payload(user)}
    body_dump = body.model_dump(exclude_unset=True)
    if "device_model_id" in body_dump and body_dump["device_model_id"] is not None:
        patch["device_model_id"] = await _require_existing_device_model_id(
            db, str(body_dump["device_model_id"])
        )
        del body_dump["device_model_id"]
    for k, v in body_dump.items():
        if v is None:
            continue
        if k in ("name", "details") and isinstance(v, str):
            patch[k] = v.strip()
        else:
            patch[k] = v
    r = await db["robots"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "机器人不存在")
    doc = await db["robots"].find_one({"_id": oid})
    d = dict(doc) if doc else None
    if d:
        await enrich_robot_device_models(db, [d])
    d2 = await enrich_one(db, d)
    return RobotOut.from_doc(d2).model_dump(by_alias=True)


@router.delete("/{rid}")
async def delete_robot(
    rid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_ROBOT_WRITE))],
):
    try:
        oid = ObjectId(rid)
    except InvalidId:
        raise HTTPException(400, "无效机器人ID")
    doc = await db["robots"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "机器人不存在")
    delete_local_upload_media_fields(doc)
    await db["robots"].delete_one({"_id": oid})
    return {"ok": True}
