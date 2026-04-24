from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from app.deps import DbDep, require_permission
from app.models.api_config import ApiConfigCreate, ApiConfigOut, ApiConfigUpdate
from app.models.common import beijing_now
from app.permissions import P_API_READ, P_API_WRITE

router = APIRouter(prefix="/apis", tags=["apis"])


@router.get("")
async def list_apis(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_API_READ))],
):
    cur = db["api_configs"].find().sort("_id", -1)
    items = []
    async for doc in cur:
        items.append(ApiConfigOut.from_doc(doc).model_dump(by_alias=True))
    return {"items": items}


@router.post("")
async def create_api(
    body: ApiConfigCreate,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_API_WRITE))],
):
    now = beijing_now()
    doc = {
        "name": body.name,
        "base_url": body.base_url,
        "method": body.method,
        "description": body.description,
        "headers_json": body.headers_json,
        "created_at": now,
        "updated_at": now,
    }
    r = await db["api_configs"].insert_one(doc)
    doc["_id"] = r.inserted_id
    return ApiConfigOut.from_doc(doc).model_dump(by_alias=True)


@router.put("/{aid}")
async def update_api(
    aid: str,
    body: ApiConfigUpdate,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_API_WRITE))],
):
    try:
        oid = ObjectId(aid)
    except InvalidId:
        raise HTTPException(400, "无效ID")
    patch: dict = {"updated_at": beijing_now()}
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            patch[k] = v
    r = await db["api_configs"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "不存在")
    doc = await db["api_configs"].find_one({"_id": oid})
    return ApiConfigOut.from_doc(doc).model_dump(by_alias=True)


@router.delete("/{aid}")
async def delete_api(
    aid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_API_WRITE))],
):
    try:
        oid = ObjectId(aid)
    except InvalidId:
        raise HTTPException(400, "无效ID")
    r = await db["api_configs"].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "不存在")
    return {"ok": True}
