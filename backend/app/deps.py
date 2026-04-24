from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.permissions import role_has
from app.security import decode_token

security = HTTPBearer(auto_error=False)


async def get_current_user_payload(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效令牌")
    return payload


def require_permission(permission: str):
    async def checker(payload: Annotated[dict, Depends(get_current_user_payload)]) -> dict:
        perms = payload.get("perms")
        if isinstance(perms, list):
            if permission not in perms:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
            return payload
        role = payload.get("role")
        if not role_has(role, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
        return payload

    return checker


DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]
CurrentUser = Annotated[dict, Depends(get_current_user_payload)]
