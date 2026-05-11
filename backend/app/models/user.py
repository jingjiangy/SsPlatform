from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class UserBase(BaseModel):
    username: str
    role: str
    phone: str = ""


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None


class UserOut(BaseModel):
    id: str = Field(alias="_id")
    username: str
    role: str
    phone: str
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "UserOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        if "password" in d:
            del d["password"]
        return cls.model_validate(d)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
