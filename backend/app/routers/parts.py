from __future__ import annotations

from typing import Annotated, Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.part import PartCreate, PartDetailOut, PartListOut, PartUpdate
from app.permissions import P_PART_READ, P_PART_WRITE
from app.services.upload import delete_local_upload_file, save_image_file
from app.services.user_display import actor_label_from_payload, enrich_actor_fields, enrich_part_robots

router = APIRouter(prefix="/parts", tags=["parts"])

PARTS_COLL = "parts"


def _parse_oid(eid: str) -> ObjectId:
    try:
        return ObjectId(eid)
    except InvalidId:
        raise HTTPException(400, "无效配件ID")


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


def _robot_id_str_from_doc(robot_id: Any) -> str | None:
    if robot_id is None:
        return None
    if isinstance(robot_id, ObjectId):
        return str(robot_id)
    if isinstance(robot_id, str) and robot_id.strip() and ObjectId.is_valid(robot_id.strip()):
        return robot_id.strip()
    return None


@router.get("/robot-options")
async def part_robot_options(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_PART_READ))],
    limit: int = 500,
):
    """添加/编辑配件时：关联机器人下拉。"""
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
async def list_parts(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_PART_READ))],
    skip: int = 0,
    limit: int = 20,
    robot_id: Optional[str] = Query(
        None,
        description="按关联机器人筛选：不传为全部；__none__ 为未关联机器人；否则为 robots 文档 ObjectId",
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
    total = await db[PARTS_COLL].count_documents(q)
    cur = db[PARTS_COLL].find(q).sort("_id", -1).skip(skip).limit(limit)
    items = []
    async for doc in cur:
        items.append(dict(doc))
    await enrich_actor_fields(db, items)
    await enrich_part_robots(db, items)
    return {
        "items": [PartListOut.from_doc(d).model_dump(by_alias=True) for d in items],
        "total": total,
    }


@router.post("/upload-image")
async def upload_part_image(
    _: Annotated[dict, Depends(require_permission(P_PART_WRITE))],
    file: UploadFile = File(...),
):
    return await save_image_file(file)


@router.post("")
async def create_part(
    body: PartCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_PART_WRITE))],
):
    now = beijing_now()
    actor = actor_label_from_payload(user)
    qty = int(body.quantity)
    robot_oid = await _robot_oid_or_none(db, body.robot_id)
    desc = (body.description or "").strip()
    remark = (body.remark or "").strip()
    doc: dict[str, Any] = {
        "name": body.name.strip(),
        "description": desc,
        "remark": remark,
        "status": body.status,
        "quantity": qty,
        "image_url": (body.image_url or "").strip(),
        "created_at": now,
        "updated_at": now,
        "created_by": actor,
        "updated_by": actor,
        "inbound_history": [
            {"at": now, "by": actor, "executor": actor, "quantity": qty, "note": "创建入库", "kind": "in"}
        ],
        "update_history": [
            {
                "at": now,
                "by": actor,
                "executor": actor,
                "quantity": qty,
                "status": body.status,
                "remark": remark,
            }
        ],
    }
    if robot_oid is not None:
        doc["robot_id"] = robot_oid
    r = await db[PARTS_COLL].insert_one(doc)
    doc["_id"] = r.inserted_id
    await enrich_actor_fields(db, [doc])
    await enrich_part_robots(db, [doc])
    return PartDetailOut.from_doc(doc).model_dump(by_alias=True)


@router.get("/{eid}")
async def get_part(
    eid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_PART_READ))],
):
    oid = _parse_oid(eid)
    doc = await db[PARTS_COLL].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "配件不存在")
    d = dict(doc)
    await enrich_actor_fields(db, [d])
    await enrich_part_robots(db, [d])
    return PartDetailOut.from_doc(d).model_dump(by_alias=True)


@router.put("/{eid}")
async def update_part(
    eid: str,
    body: PartUpdate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_PART_WRITE))],
):
    oid = _parse_oid(eid)
    existing = await db[PARTS_COLL].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "配件不存在")
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        d = dict(existing)
        await enrich_actor_fields(db, [d])
        await enrich_part_robots(db, [d])
        return PartDetailOut.from_doc(d).model_dump(by_alias=True)

    now = beijing_now()
    actor = actor_label_from_payload(user)
    raw_ex = patch.get("executor")
    if "executor" in patch:
        exec_label = (str(raw_ex).strip() if raw_ex is not None else "") or actor
    else:
        exec_label = actor
    ex_in_patch = "executor" in patch

    new_name = patch.get("name", existing.get("name"))
    if isinstance(new_name, str):
        new_name = new_name.strip()
    new_desc = patch.get("description", existing.get("description"))
    if isinstance(new_desc, str):
        new_desc = new_desc.strip()
    new_remark = patch.get("remark", existing.get("remark"))
    if isinstance(new_remark, str):
        new_remark = new_remark.strip()
    else:
        new_remark = str(new_remark or "").strip()
    new_status = patch.get("status", existing.get("status"))
    new_qty = patch.get("quantity", existing.get("quantity"))
    if new_qty is not None:
        new_qty = int(new_qty)
    else:
        new_qty = int(existing.get("quantity") or 0)
    new_img = patch.get("image_url", existing.get("image_url"))
    if isinstance(new_img, str):
        new_img = new_img.strip()
    else:
        new_img = str(new_img or "")

    old_qty = int(existing.get("quantity") or 0)
    old_img = str(existing.get("image_url") or "").strip()
    old_robot = _robot_id_str_from_doc(existing.get("robot_id"))
    new_robot: str | None
    if "robot_id" in patch:
        rid_raw = patch.get("robot_id")
        if rid_raw is None or (isinstance(rid_raw, str) and not rid_raw.strip()):
            new_robot = None
        else:
            ro = await _robot_oid_or_none(db, str(rid_raw))
            new_robot = str(ro) if ro else None
    else:
        new_robot = old_robot

    set_doc: dict[str, Any] = {
        "updated_at": now,
        "updated_by": exec_label,
    }
    if "name" in patch:
        set_doc["name"] = new_name
    if "description" in patch:
        set_doc["description"] = new_desc
    if "remark" in patch:
        set_doc["remark"] = new_remark
    if "status" in patch:
        set_doc["status"] = new_status
    if "quantity" in patch:
        set_doc["quantity"] = new_qty
    if "image_url" in patch:
        set_doc["image_url"] = new_img
    unset_doc: dict[str, Any] = {}
    if "robot_id" in patch:
        if new_robot is None:
            unset_doc["robot_id"] = ""
        else:
            set_doc["robot_id"] = ObjectId(new_robot)

    push_ops: dict[str, Any] = {}
    changed = (
        ("name" in patch and new_name != (existing.get("name") or "").strip())
        or ("description" in patch and new_desc != (existing.get("description") or "").strip())
        or ("remark" in patch and new_remark != (existing.get("remark") or "").strip())
        or ("status" in patch and new_status != existing.get("status"))
        or ("quantity" in patch and new_qty != old_qty)
        or ("image_url" in patch and new_img != old_img)
        or ("robot_id" in patch and new_robot != old_robot)
        or (
            ex_in_patch
            and exec_label != str(existing.get("updated_by") or "").strip()
        )
    )
    if changed:
        st = new_status if isinstance(new_status, str) else str(new_status or "")
        push_ops["update_history"] = {
            "$each": [
                {
                    "at": now,
                    "by": exec_label,
                    "executor": exec_label,
                    "quantity": new_qty,
                    "status": st,
                    "remark": new_remark,
                }
            ],
            "$position": 0,
        }
    if "quantity" in patch and new_qty > old_qty:
        push_ops["inbound_history"] = {
            "$each": [
                {
                    "at": now,
                    "by": exec_label,
                    "executor": exec_label,
                    "quantity": new_qty - old_qty,
                    "note": "库存增加",
                    "kind": "in",
                }
            ],
            "$position": 0,
        }
    if "quantity" in patch and new_qty < old_qty:
        push_ops["inbound_history"] = {
            "$each": [
                {
                    "at": now,
                    "by": exec_label,
                    "executor": exec_label,
                    "quantity": old_qty - new_qty,
                    "note": "配件出库",
                    "kind": "out",
                }
            ],
            "$position": 0,
        }

    update_payload: dict[str, Any] = {"$set": set_doc}
    if unset_doc:
        update_payload["$unset"] = unset_doc
    if push_ops:
        update_payload["$push"] = push_ops

    await db[PARTS_COLL].update_one({"_id": oid}, update_payload)

    if "image_url" in patch and new_img != old_img:
        delete_local_upload_file(old_img)

    doc = await db[PARTS_COLL].find_one({"_id": oid})
    d = dict(doc or {})
    await enrich_actor_fields(db, [d])
    await enrich_part_robots(db, [d])
    return PartDetailOut.from_doc(d).model_dump(by_alias=True)


@router.delete("/{eid}")
async def delete_part(
    eid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_PART_WRITE))],
):
    oid = _parse_oid(eid)
    doc = await db[PARTS_COLL].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "配件不存在")
    delete_local_upload_file(doc.get("image_url"))
    r = await db[PARTS_COLL].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "配件不存在")
    return {"ok": True}
