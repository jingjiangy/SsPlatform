from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.user import UserCreate, UserOut, UserUpdate
from app.permissions import P_USER_READ, P_USER_WRITE
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


async def _assert_role_exists(db: AsyncIOMotorDatabase, code: str) -> None:
    if not code or not str(code).strip():
        raise HTTPException(400, "角色编码无效")
    if not await db["roles"].find_one({"code": str(code).strip()}):
        raise HTTPException(400, "角色编码不存在，请先在角色管理中创建该角色")


@router.get("")
async def list_users(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_USER_READ))],
    skip: int = 0,
    limit: int = 20,
):
    if limit < 1:
        limit = 20
    if limit > 200:
        limit = 200
    total = await db["users"].count_documents({})
    cur = db["users"].find().sort("_id", -1).skip(skip).limit(limit)
    items = []
    async for doc in cur:
        items.append(UserOut.from_doc(doc).model_dump(by_alias=True))
    return {"items": items, "total": total}


@router.post("")
async def create_user(
    body: UserCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_USER_WRITE))],
):
    exists = await db["users"].find_one({"username": body.username})
    if exists:
        raise HTTPException(400, "用户名已存在")
    await _assert_role_exists(db, body.role)
    now = beijing_now()
    doc = {
        "username": body.username,
        "password": hash_password(body.password),
        "role": body.role,
        "phone": body.phone,
        "created_at": now,
        "updated_at": now,
    }
    r = await db["users"].insert_one(doc)
    doc["_id"] = r.inserted_id
    return UserOut.from_doc(doc).model_dump(by_alias=True)


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_USER_WRITE))],
):
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(400, "无效用户ID")
    patch: dict = {"updated_at": beijing_now()}
    if body.username is not None:
        patch["username"] = body.username
    if body.password is not None:
        patch["password"] = hash_password(body.password)
    if body.role is not None:
        await _assert_role_exists(db, body.role)
        patch["role"] = body.role
    if body.phone is not None:
        patch["phone"] = body.phone
    r = await db["users"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "用户不存在")
    doc = await db["users"].find_one({"_id": oid})
    return UserOut.from_doc(doc).model_dump(by_alias=True)


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_USER_WRITE))],
):
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(400, "无效用户ID")
    r = await db["users"].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "用户不存在")
    return {"ok": True}
