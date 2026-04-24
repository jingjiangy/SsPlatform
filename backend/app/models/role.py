from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.permissions import normalize_modules


class RoleCreate(BaseModel):
    name: str
    code: str
    description: str = ""
    modules: list[str] = Field(
        ...,
        description="系统模块：roles/users/materials/eval/robots/device_models/parts/fault_records/api_docs",
    )

    @field_validator("modules", mode="before")
    @classmethod
    def v_modules(cls, v: Any) -> list[str]:
        n = normalize_modules(v if isinstance(v, list) else [])
        if not n:
            raise ValueError("请至少勾选一个系统模块权限")
        return n


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    modules: Optional[list[str]] = None

    @field_validator("modules", mode="before")
    @classmethod
    def v_modules_upd(cls, v: Any) -> Optional[list[str]]:
        if v is None:
            return None
        n = normalize_modules(v if isinstance(v, list) else [])
        if not n:
            raise ValueError("请至少保留一个系统模块权限")
        return n


class RoleOut(BaseModel):
    id: str = Field(alias="_id")
    name: str
    code: str
    description: str
    modules: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "RoleOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        if "modules" not in d or d["modules"] is None:
            d["modules"] = []
        else:
            d["modules"] = normalize_modules(d["modules"])
        return cls.model_validate(d)
