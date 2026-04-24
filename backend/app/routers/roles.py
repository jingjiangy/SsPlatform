from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from app.database import get_db
from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.role import RoleCreate, RoleOut, RoleUpdate
from app.permissions import P_ROLE_READ, P_ROLE_WRITE

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("")
async def list_roles(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_ROLE_READ))],
    skip: int = 0,
    limit: int = 50,
):
    if limit < 1:
        limit = 50
    if limit > 200:
        limit = 200
    total = await db["roles"].count_documents({})
    cur = db["roles"].find().sort("_id", -1).skip(skip).limit(limit)
    items = []
    async for doc in cur:
        items.append(RoleOut.from_doc(doc).model_dump(by_alias=True))
    return {"items": items, "total": total}


@router.post("")
async def create_role(
    body: RoleCreate,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_ROLE_WRITE))],
):
    exists = await db["roles"].find_one({"$or": [{"name": body.name}, {"code": body.code}]})
    if exists:
        raise HTTPException(400, "角色名或编码已存在")
    now = beijing_now()
    doc = {
        "name": body.name,
        "code": body.code,
        "description": body.description,
        "modules": body.modules,
        "created_at": now,
        "updated_at": now,
    }
    r = await db["roles"].insert_one(doc)
    doc["_id"] = r.inserted_id
    return RoleOut.from_doc(doc).model_dump(by_alias=True)


@router.put("/{role_id}")
async def update_role(
    role_id: str,
    body: RoleUpdate,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_ROLE_WRITE))],
):
    try:
        oid = ObjectId(role_id)
    except InvalidId:
        raise HTTPException(400, "无效角色ID")
    patch: dict = {"updated_at": beijing_now()}
    if body.name is not None:
        patch["name"] = body.name
    if body.description is not None:
        patch["description"] = body.description
    if body.modules is not None:
        patch["modules"] = body.modules
    r = await db["roles"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "角色不存在")
    doc = await db["roles"].find_one({"_id": oid})
    return RoleOut.from_doc(doc).model_dump(by_alias=True)


@router.delete("/{role_id}")
async def delete_role(
    role_id: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_ROLE_WRITE))],
):
    try:
        oid = ObjectId(role_id)
    except InvalidId:
        raise HTTPException(400, "无效角色ID")
    doc = await db["roles"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "角色不存在")
    code = str(doc.get("code") or "")
    if await db["users"].find_one({"role": code}):
        raise HTTPException(400, "仍有用户使用该角色编码，无法删除")
    r = await db["roles"].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "角色不存在")
    return {"ok": True}
