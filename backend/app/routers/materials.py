from __future__ import annotations

from typing import Annotated, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.material import MaterialCreate, MaterialOut, MaterialUpdate
from app.permissions import P_MATERIAL_READ, P_MATERIAL_WRITE
from app.services.material_version import compute_next_sub_version
from app.services.upload import ALLOWED_MATERIAL_VIDEO_EXT, delete_local_upload_media_fields, save_video_file
from app.services.user_display import actor_label_from_payload, enrich_actor_fields, enrich_one

router = APIRouter(prefix="/materials", tags=["materials"])

# 父级素材：null / 缺字段 / 空字符串 均视为无父级（Mongo 的 null 不匹配 ""）
_ROOT_PARENT_FILTER: dict = {"$or": [{"parent_id": None}, {"parent_id": ""}]}


async def _device_model_oid_and_label(db, raw_id: str) -> tuple[ObjectId, str]:
    try:
        oid = ObjectId(raw_id.strip())
    except InvalidId:
        raise HTTPException(400, "无效设备型号ID")
    doc = await db["device_models"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(400, "设备型号不存在，请先在「设备管理 → 设备型号」中维护")
    label = str(doc.get("name") or "").strip() or "—"
    return oid, label


@router.get("/device-model-options")
async def device_model_options_for_material(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_MATERIAL_READ))],
    limit: int = 500,
):
    """创建/编辑素材下拉：来自 device_models（需在 /{mid} 之前注册）。"""
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


@router.post("/upload-video")
async def upload_video(
    _: Annotated[dict, Depends(require_permission(P_MATERIAL_WRITE))],
    file: UploadFile = File(...),
):
    return await save_video_file(file, allowed_ext=ALLOWED_MATERIAL_VIDEO_EXT)


@router.get("")
async def list_materials(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_MATERIAL_READ))],
    parent_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
):
    if limit < 1:
        limit = 20
    if limit > 200:
        limit = 200
    q: dict = {}
    if parent_id:
        try:
            q["parent_id"] = ObjectId(parent_id)
        except InvalidId:
            raise HTTPException(400, "无效父素材ID")
        total = await db["materials"].count_documents(q)
        cur = db["materials"].find(q).sort("_id", -1).skip(skip).limit(limit)
        items = []
        async for doc in cur:
            items.append(dict(doc))
        await enrich_actor_fields(db, items)
        return {
            "items": [MaterialOut.from_doc(d).model_dump(by_alias=True) for d in items],
            "total": total,
        }

    total = await db["materials"].count_documents(_ROOT_PARENT_FILTER)
    cur = db["materials"].find(_ROOT_PARENT_FILTER).sort("_id", -1).skip(skip).limit(limit)
    parents = await cur.to_list(length=limit)
    if not parents:
        return {"items": [], "total": total}

    parent_ids = [p["_id"] for p in parents]
    cnt_map: dict[str, int] = {}
    agg = db["materials"].aggregate(
        [
            {"$match": {"parent_id": {"$in": parent_ids}}},
            {"$group": {"_id": "$parent_id", "child_count": {"$sum": 1}}},
        ]
    )
    async for g in agg:
        cnt_map[str(g["_id"])] = int(g["child_count"])

    items = []
    for doc in parents:
        d = dict(doc)
        d["child_count"] = cnt_map.get(str(doc["_id"]), 0)
        items.append(d)
    await enrich_actor_fields(db, items)
    return {"items": [MaterialOut.from_doc(d).model_dump(by_alias=True) for d in items], "total": total}


@router.get("/{mid}")
async def get_material(
    mid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_MATERIAL_READ))],
):
    try:
        oid = ObjectId(mid)
    except InvalidId:
        raise HTTPException(400, "无效素材ID")
    doc = await db["materials"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "素材不存在")
    d = await enrich_one(db, doc)
    return MaterialOut.from_doc(d).model_dump(by_alias=True)


@router.post("")
async def create_material(
    body: MaterialCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_MATERIAL_WRITE))],
):
    now = beijing_now()
    parent_oid = None
    if body.parent_id:
        try:
            parent_oid = ObjectId(body.parent_id)
        except InvalidId:
            raise HTTPException(400, "无效父素材ID")
    if parent_oid:
        version_str = await compute_next_sub_version(db, parent_oid)
    else:
        # 父级素材版本固定为 1.0，不接受请求体覆盖
        version_str = "1.0"
    dm_oid, dm_label = await _device_model_oid_and_label(db, body.device_model_id)
    doc = {
        "name": body.name,
        "description": body.description,
        "material_type": body.material_type,
        "status": body.status,
        "version": version_str,
        "device_model_id": dm_oid,
        "robot_device_model": dm_label,
        "video_url": None,
        "cover_url": None,
        "parent_id": parent_oid,
        "created_at": now,
        "updated_at": now,
        "created_by": actor_label_from_payload(user),
        "updated_by": actor_label_from_payload(user),
    }
    r = await db["materials"].insert_one(doc)
    doc["_id"] = r.inserted_id
    await enrich_actor_fields(db, [doc])
    return MaterialOut.from_doc(doc).model_dump(by_alias=True)


@router.put("/{mid}")
async def update_material(
    mid: str,
    body: MaterialUpdate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_MATERIAL_WRITE))],
):
    try:
        oid = ObjectId(mid)
    except InvalidId:
        raise HTTPException(400, "无效素材ID")
    existing = await db["materials"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "素材不存在")
    patch: dict = {"updated_at": beijing_now(), "updated_by": actor_label_from_payload(user)}
    body_dump = body.model_dump(exclude_unset=True)
    if "device_model_id" in body_dump and body_dump["device_model_id"] is not None:
        dm_oid, dm_label = await _device_model_oid_and_label(db, str(body_dump["device_model_id"]))
        patch["device_model_id"] = dm_oid
        patch["robot_device_model"] = dm_label
        del body_dump["device_model_id"]
    for k, v in body_dump.items():
        if v is not None:
            patch[k] = v
    r = await db["materials"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "素材不存在")
    doc = await db["materials"].find_one({"_id": oid})
    d = await enrich_one(db, doc)
    return MaterialOut.from_doc(d).model_dump(by_alias=True)


@router.delete("/{mid}")
async def delete_material(
    mid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_MATERIAL_WRITE))],
):
    try:
        oid = ObjectId(mid)
    except InvalidId:
        raise HTTPException(400, "无效素材ID")
    async for doc in db["materials"].find({"$or": [{"_id": oid}, {"parent_id": oid}]}):
        delete_local_upload_media_fields(doc)
    await db["materials"].delete_many({"parent_id": oid})
    r = await db["materials"].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "素材不存在")
    return {"ok": True}


@router.post("/{mid}/video")
async def attach_video(
    mid: str,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_MATERIAL_WRITE))],
    file: UploadFile = File(...),
    cover_url: Optional[str] = None,
):
    up = await save_video_file(file, allowed_ext=ALLOWED_MATERIAL_VIDEO_EXT)
    try:
        oid = ObjectId(mid)
    except InvalidId:
        raise HTTPException(400, "无效素材ID")
    await db["materials"].update_one(
        {"_id": oid},
        {
            "$set": {
                "video_url": up["video_url"],
                "cover_url": cover_url,
                "updated_at": beijing_now(),
                "updated_by": actor_label_from_payload(user),
            }
        },
    )
    doc = await db["materials"].find_one({"_id": oid})
    d = await enrich_one(db, doc)
    return MaterialOut.from_doc(d).model_dump(by_alias=True)


@router.post("/{mid}/sub-version")
async def add_sub_version(
    mid: str,
    body: MaterialCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_MATERIAL_WRITE))],
):
    """子版本：parent_id 指向父素材；版本号由服务端自增，忽略请求中的 version。"""
    return await create_material(
        MaterialCreate(
            name=body.name,
            description=body.description,
            material_type=body.material_type,
            status=body.status,
            version="1.0",
            device_model_id=body.device_model_id,
            parent_id=mid,
        ),
        db,
        user,
    )
