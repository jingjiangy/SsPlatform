from __future__ import annotations

from typing import Annotated, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.evaluation import (
    EvalRecordCreate,
    EvalRecordOut,
    EvalRecordUpdate,
    EvalTaskCreate,
    EvalTaskOut,
    EvalTaskUpdate,
)
from app.permissions import P_EVAL_READ, P_EVAL_WRITE
from app.services.eval_task_version import compute_next_eval_task_version_for_material
from app.services.upload import (
    delete_local_upload_file,
    delete_local_upload_media_fields,
    save_video_file,
)
from app.services.eval_stats import recalc_task_stats
from app.services.user_display import actor_label_from_payload, enrich_actor_fields, enrich_one

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


@router.get("/tasks")
async def list_tasks(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_READ))],
    material_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
):
    if limit < 1:
        limit = 20
    if limit > 200:
        limit = 200
    q: dict = {}
    if material_id:
        try:
            q["material_id"] = ObjectId(material_id)
        except InvalidId:
            raise HTTPException(400, "无效素材ID")
    total = await db["eval_tasks"].count_documents(q)
    # $lookup 用 localField/foreignField 时类型须一致；material_id 若存成字符串则关联不上。
    # 用 let + $convert 同时兼容 ObjectId / 合法 24 位 hex 字符串。
    pipeline = [
        {"$match": q},
        {"$sort": {"_id": -1}},
        {"$skip": skip},
        {"$limit": limit},
        {
            "$lookup": {
                "from": "materials",
                "let": {"mid": "$material_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$ne": ["$$mid", None]},
                                    {
                                        "$eq": [
                                            "$_id",
                                            {
                                                "$convert": {
                                                    "input": "$$mid",
                                                    "to": "objectId",
                                                    "onError": None,
                                                    "onNull": None,
                                                }
                                            },
                                        ]
                                    },
                                ]
                            }
                        }
                    }
                ],
                "as": "_mat",
            }
        },
    ]
    items_raw: list[dict] = []
    async for doc in db["eval_tasks"].aggregate(pipeline):
        d = dict(doc)
        mats = d.pop("_mat", [])
        mid_raw = d.get("material_id")
        if not mats and mid_raw is not None:
            try:
                oid = mid_raw if isinstance(mid_raw, ObjectId) else ObjectId(str(mid_raw))
                m0 = await db["materials"].find_one({"_id": oid})
                if m0:
                    mats = [m0]
            except (InvalidId, TypeError, ValueError):
                pass
        if mats:
            m0 = mats[0]
            mv = m0.get("version")
            d["material_version"] = str(mv) if mv is not None else None
            pid = m0.get("parent_id")
            d["material_parent_id"] = str(pid) if pid else None
        else:
            d["material_version"] = None
            d["material_parent_id"] = None
        items_raw.append(d)
    await enrich_actor_fields(db, items_raw)
    items = [EvalTaskOut.from_doc(d).model_dump(by_alias=True) for d in items_raw]
    return {"items": items, "total": total}


@router.post("/tasks")
async def create_task(
    body: EvalTaskCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    now = beijing_now()
    mid = None
    if body.material_id:
        try:
            mid = ObjectId(body.material_id)
        except InvalidId:
            raise HTTPException(400, "无效素材ID")
    if mid:
        version_str = await compute_next_eval_task_version_for_material(db, mid)
    else:
        version_str = body.version
    doc = {
        "description": body.description,
        "task_type": body.task_type,
        "status": body.status,
        "version": version_str,
        "success_count": 0,
        "total_count": 0,
        "success_rate": 0.0,
        "avg_video_seconds": 0.0,
        "material_id": mid,
        "material_name": body.material_name,
        "created_at": now,
        "updated_at": now,
        "created_by": actor_label_from_payload(user),
        "updated_by": actor_label_from_payload(user),
    }
    r = await db["eval_tasks"].insert_one(doc)
    doc["_id"] = r.inserted_id
    await enrich_actor_fields(db, [doc])
    return EvalTaskOut.from_doc(doc).model_dump(by_alias=True)


@router.get("/tasks/{tid}")
async def get_task(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_READ))],
):
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    doc = await db["eval_tasks"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "评测任务不存在")
    d = await enrich_one(db, doc)
    return EvalTaskOut.from_doc(d).model_dump(by_alias=True)


@router.put("/tasks/{tid}")
async def update_task(
    tid: str,
    body: EvalTaskUpdate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    existing = await db["eval_tasks"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "评测任务不存在")
    patch: dict = {"updated_at": beijing_now(), "updated_by": actor_label_from_payload(user)}
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            if k == "version" and existing.get("material_id"):
                continue
            patch[k] = v
    r = await db["eval_tasks"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "评测任务不存在")
    doc = await db["eval_tasks"].find_one({"_id": oid})
    d = await enrich_one(db, doc)
    return EvalTaskOut.from_doc(d).model_dump(by_alias=True)


@router.delete("/tasks/{tid}")
async def delete_task(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    async for rec in db["eval_records"].find({"task_id": oid}):
        delete_local_upload_media_fields(rec)
    await db["eval_records"].delete_many({"task_id": oid})
    r = await db["eval_tasks"].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "评测任务不存在")
    return {"ok": True}


@router.get("/tasks/{tid}/records")
async def list_records(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_READ))],
    skip: int = 0,
    limit: int = 20,
):
    if limit < 1:
        limit = 20
    if limit > 200:
        limit = 200
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    _q = {"task_id": oid}
    total = await db["eval_records"].count_documents(_q)
    cur = db["eval_records"].find(_q).sort("_id", -1).skip(skip).limit(limit)
    items = []
    async for doc in cur:
        items.append(dict(doc))
    await enrich_actor_fields(db, items, fields=("created_by",))
    return {
        "items": [EvalRecordOut.from_doc(d).model_dump(by_alias=True) for d in items],
        "total": total,
    }


@router.post("/tasks/{tid}/records")
async def create_record(
    tid: str,
    body: EvalRecordCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        task_oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    task = await db["eval_tasks"].find_one({"_id": task_oid})
    if not task:
        raise HTTPException(404, "评测任务不存在")
    now = beijing_now()
    doc = {
        "task_id": task_oid,
        "action_description": body.action_description,
        "video_url": body.video_url,
        "cover_url": body.cover_url,
        "result": body.result,
        "duration_seconds": body.duration_seconds,
        "created_at": now,
        "created_by": actor_label_from_payload(user),
    }
    r = await db["eval_records"].insert_one(doc)
    doc["_id"] = r.inserted_id
    await recalc_task_stats(db, task_oid)
    await enrich_actor_fields(db, [doc], fields=("created_by",))
    return EvalRecordOut.from_doc(doc).model_dump(by_alias=True)


@router.post("/tasks/{tid}/records/upload-video")
async def upload_record_video(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
    file: UploadFile = File(...),
):
    try:
        ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    return await save_video_file(file)


@router.put("/records/{rid}")
async def update_record(
    rid: str,
    body: EvalRecordUpdate,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        oid = ObjectId(rid)
    except InvalidId:
        raise HTTPException(400, "无效记录ID")
    doc = await db["eval_records"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "记录不存在")
    patch = body.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        raise HTTPException(400, "无更新内容")
    if "video_url" in patch and patch["video_url"] != doc.get("video_url"):
        if doc.get("video_url"):
            delete_local_upload_file(doc.get("video_url"))
    if "cover_url" in patch and patch.get("cover_url") != doc.get("cover_url"):
        if doc.get("cover_url"):
            delete_local_upload_file(doc.get("cover_url"))
    r = await db["eval_records"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "记录不存在")
    task_id = doc["task_id"]
    await recalc_task_stats(db, task_id)
    updated = await db["eval_records"].find_one({"_id": oid})
    if not updated:
        raise HTTPException(404, "记录不存在")
    await enrich_actor_fields(db, [updated], fields=("created_by",))
    return EvalRecordOut.from_doc(updated).model_dump(by_alias=True)


@router.delete("/records/{rid}")
async def delete_record(
    rid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        oid = ObjectId(rid)
    except InvalidId:
        raise HTTPException(400, "无效记录ID")
    doc = await db["eval_records"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "记录不存在")
    task_id = doc["task_id"]
    delete_local_upload_media_fields(doc)
    await db["eval_records"].delete_one({"_id": oid})
    await recalc_task_stats(db, task_id)
    return {"ok": True}
