from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.device_model import DeviceModelCreate, DeviceModelOut, DeviceModelUpdate
from app.permissions import P_DEVICE_MODEL_READ, P_DEVICE_MODEL_WRITE
from app.services.user_display import actor_label_from_payload, enrich_actor_fields, enrich_one

router = APIRouter(prefix="/device-models", tags=["device-models"])


@router.get("")
async def list_device_models(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_DEVICE_MODEL_READ))],
    skip: int = 0,
    limit: int = 20,
):
    if limit < 1:
        limit = 20
    if limit > 500:
        limit = 500
    total = await db["device_models"].count_documents({})
    cur = db["device_models"].find().sort("_id", -1).skip(skip).limit(limit)
    items = []
    async for doc in cur:
        items.append(dict(doc))
    await enrich_actor_fields(db, items)
    return {
        "items": [DeviceModelOut.from_doc(d).model_dump(by_alias=True) for d in items],
        "total": total,
    }


@router.get("/{eid}")
async def get_device_model(
    eid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_DEVICE_MODEL_READ))],
):
    try:
        oid = ObjectId(eid)
    except InvalidId:
        raise HTTPException(400, "无效设备型号ID")
    doc = await db["device_models"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "设备型号不存在")
    d = await enrich_one(db, doc)
    return DeviceModelOut.from_doc(d).model_dump(by_alias=True)


@router.post("")
async def create_device_model(
    body: DeviceModelCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_DEVICE_MODEL_WRITE))],
):
    now = beijing_now()
    doc = {
        "name": body.name.strip(),
        "description": (body.description or "").strip(),
        "status": body.status,
        "created_at": now,
        "updated_at": now,
        "created_by": actor_label_from_payload(user),
        "updated_by": actor_label_from_payload(user),
    }
    r = await db["device_models"].insert_one(doc)
    doc["_id"] = r.inserted_id
    await enrich_actor_fields(db, [doc])
    return DeviceModelOut.from_doc(doc).model_dump(by_alias=True)


@router.put("/{eid}")
async def update_device_model(
    eid: str,
    body: DeviceModelUpdate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_DEVICE_MODEL_WRITE))],
):
    try:
        oid = ObjectId(eid)
    except InvalidId:
        raise HTTPException(400, "无效设备型号ID")
    existing = await db["device_models"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "设备型号不存在")
    patch: dict = {"updated_at": beijing_now(), "updated_by": actor_label_from_payload(user)}
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None:
            continue
        if k == "description" and isinstance(v, str):
            patch[k] = v.strip()
        elif k == "name" and isinstance(v, str):
            patch[k] = v.strip()
        else:
            patch[k] = v
    await db["device_models"].update_one({"_id": oid}, {"$set": patch})
    doc = await db["device_models"].find_one({"_id": oid})
    d = await enrich_one(db, doc)
    return DeviceModelOut.from_doc(d).model_dump(by_alias=True)


@router.delete("/{eid}")
async def delete_device_model(
    eid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_DEVICE_MODEL_WRITE))],
):
    try:
        oid = ObjectId(eid)
    except InvalidId:
        raise HTTPException(400, "无效设备型号ID")
    r = await db["device_models"].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "设备型号不存在")
    return {"ok": True}
