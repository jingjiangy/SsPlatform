from __future__ import annotations

from typing import Annotated, Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.fault_record import FaultRecordCreate, FaultRecordOut, FaultRecordUpdate
from app.permissions import P_FAULT_RECORD_READ, P_FAULT_RECORD_WRITE
from app.services.upload import delete_local_upload_file, save_image_file
from app.services.user_display import actor_label_from_payload, enrich_actor_fields, enrich_part_robots

router = APIRouter(prefix="/fault-records", tags=["fault-records"])

FAULT_COLL = "fault_records"


def _parse_oid(eid: str) -> ObjectId:
    try:
        return ObjectId(eid)
    except InvalidId:
        raise HTTPException(400, "无效故障ID")


async def _robot_oid_or_none(db, raw: str | None) -> ObjectId | None:
    s = (raw or "").strip()
    if not s:
        return None
    if not ObjectId.is_valid(s):
        raise HTTPException(400, "无效机器人ID")
    oid = ObjectId(s)
    if not await db["robots"].find_one({"_id": oid}, {"_id": 1}):
        raise HTTPException(400, "机器人不存在")
    return oid


@router.get("/robot-options")
async def fault_robot_options(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_FAULT_RECORD_READ))],
    limit: int = 500,
):
    if limit < 1:
        limit = 500
    if limit > 500:
        limit = 500
    cur = db["robots"].find().sort("_id", -1).skip(0).limit(limit)
    items: list[dict] = []
    async for doc in cur:
        items.append({"id": str(doc["_id"]), "name": str(doc.get("name") or "")})
    return {"items": items}


@router.get("")
async def list_fault_records(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_FAULT_RECORD_READ))],
    skip: int = 0,
    limit: int = 20,
    robot_id: Optional[str] = Query(
        None,
        description="按关联机器人筛选：不传为全部；__none__ 为未关联",
    ),
):
    if limit < 1:
        limit = 20
    if limit > 500:
        limit = 500
    q: dict[str, Any] = {}
    if robot_id is not None and str(robot_id).strip():
        rs = str(robot_id).strip()
        if rs == "__none__":
            q = {"$or": [{"robot_id": None}, {"robot_id": {"$exists": False}}]}
        else:
            if not ObjectId.is_valid(rs):
                raise HTTPException(400, "无效机器人筛选 ID")
            q = {"robot_id": ObjectId(rs)}
    total = await db[FAULT_COLL].count_documents(q)
    cur = db[FAULT_COLL].find(q).sort("_id", -1).skip(skip).limit(limit)
    items = []
    async for doc in cur:
        items.append(dict(doc))
    await enrich_actor_fields(db, items)
    await enrich_part_robots(db, items)
    return {
        "items": [FaultRecordOut.from_doc(d).model_dump(by_alias=True) for d in items],
        "total": total,
    }


@router.post("/upload-image")
async def upload_fault_image(
    _: Annotated[dict, Depends(require_permission(P_FAULT_RECORD_WRITE))],
    file: UploadFile = File(...),
):
    return await save_image_file(file)


@router.post("")
async def create_fault_record(
    body: FaultRecordCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_FAULT_RECORD_WRITE))],
):
    now = beijing_now()
    actor = actor_label_from_payload(user)
    robot_oid = await _robot_oid_or_none(db, body.robot_id)
    doc: dict[str, Any] = {
        "name": body.name.strip(),
        "description": (body.description or "").strip(),
        "status": body.status,
        "image_url": (body.image_url or "").strip(),
        "maintainer": (body.maintainer or "").strip(),
        "created_at": now,
        "updated_at": now,
        "created_by": actor,
        "updated_by": actor,
    }
    if robot_oid is not None:
        doc["robot_id"] = robot_oid
    r = await db[FAULT_COLL].insert_one(doc)
    doc["_id"] = r.inserted_id
    await enrich_actor_fields(db, [doc])
    await enrich_part_robots(db, [doc])
    return FaultRecordOut.from_doc(doc).model_dump(by_alias=True)


@router.get("/{eid}")
async def get_fault_record(
    eid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_FAULT_RECORD_READ))],
):
    oid = _parse_oid(eid)
    doc = await db[FAULT_COLL].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "故障记录不存在")
    d = dict(doc)
    await enrich_actor_fields(db, [d])
    await enrich_part_robots(db, [d])
    return FaultRecordOut.from_doc(d).model_dump(by_alias=True)


@router.put("/{eid}")
async def update_fault_record(
    eid: str,
    body: FaultRecordUpdate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_FAULT_RECORD_WRITE))],
):
    oid = _parse_oid(eid)
    existing = await db[FAULT_COLL].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "故障记录不存在")
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        d = dict(existing)
        await enrich_actor_fields(db, [d])
        await enrich_part_robots(db, [d])
        return FaultRecordOut.from_doc(d).model_dump(by_alias=True)

    now = beijing_now()
    actor = actor_label_from_payload(user)
    set_doc: dict[str, Any] = {"updated_at": now, "updated_by": actor}
    if "name" in patch:
        set_doc["name"] = str(patch.get("name") or "").strip()
    if "description" in patch:
        set_doc["description"] = str(patch.get("description") or "").strip()
    if "status" in patch:
        set_doc["status"] = patch.get("status")
    if "image_url" in patch:
        new_img = str(patch.get("image_url") or "").strip()
        set_doc["image_url"] = new_img
    if "maintainer" in patch:
        set_doc["maintainer"] = str(patch.get("maintainer") or "").strip()
    unset_doc: dict[str, Any] = {}
    if "robot_id" in patch:
        rid_raw = patch.get("robot_id")
        if rid_raw is None or (isinstance(rid_raw, str) and not str(rid_raw).strip()):
            unset_doc["robot_id"] = ""
        else:
            ro = await _robot_oid_or_none(db, str(rid_raw))
            if ro is not None:
                set_doc["robot_id"] = ro

    old_img = str(existing.get("image_url") or "").strip()
    update_payload: dict[str, Any] = {"$set": set_doc}
    if unset_doc:
        update_payload["$unset"] = unset_doc
    await db[FAULT_COLL].update_one({"_id": oid}, update_payload)

    if "image_url" in patch:
        new_img = str(patch.get("image_url") or "").strip()
        if new_img != old_img:
            delete_local_upload_file(old_img)

    doc = await db[FAULT_COLL].find_one({"_id": oid})
    d = dict(doc or {})
    await enrich_actor_fields(db, [d])
    await enrich_part_robots(db, [d])
    return FaultRecordOut.from_doc(d).model_dump(by_alias=True)


@router.delete("/{eid}")
async def delete_fault_record(
    eid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_FAULT_RECORD_WRITE))],
):
    oid = _parse_oid(eid)
    doc = await db[FAULT_COLL].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "故障记录不存在")
    delete_local_upload_file(doc.get("image_url"))
    r = await db[FAULT_COLL].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "故障记录不存在")
    return {"ok": True}
