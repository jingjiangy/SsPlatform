from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.deps import CurrentUser, DbDep
from app.models.user import TokenResponse, UserOut
from app.permissions import resolve_role_modules_and_permissions
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(body: dict, db: DbDep):
    username = body.get("username")
    password = body.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="用户名或密码不能为空")
    doc = await db["users"].find_one({"username": username})
    if not doc or not verify_password(password, doc["password"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    role_code = str(doc.get("role") or "")
    role_doc = await db["roles"].find_one({"code": role_code})
    modules, perms = resolve_role_modules_and_permissions(role_doc, role_code)
    token = create_access_token(
        {
            "sub": str(doc["_id"]),
            "username": doc["username"],
            "role": role_code,
            "modules": modules,
            "perms": perms,
        }
    )
    u = UserOut.from_doc(doc)
    return TokenResponse(
        access_token=token,
        user={
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "phone": u.phone,
            "modules": modules,
            "perms": perms,
        },
    )


@router.get("/me")
async def me(user: CurrentUser):
    return user
