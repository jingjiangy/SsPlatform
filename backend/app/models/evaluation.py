from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.common import validate_version


class EvalTaskBase(BaseModel):
    description: str = ""
    task_type: str
    status: str
    version: str = "1.0"

    @field_validator("version")
    @classmethod
    def v_version(cls, v: str) -> str:
        return validate_version(v)


class EvalTaskCreate(EvalTaskBase):
    material_id: Optional[str] = None
    material_name: Optional[str] = None


class EvalTaskUpdate(BaseModel):
    description: Optional[str] = None
    task_type: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = Field(
        None, description="未关联素材时可改；已关联素材时 PUT 忽略此字段"
    )

    @field_validator("version")
    @classmethod
    def v_version(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return validate_version(v)


class EvalTaskOut(BaseModel):
    id: str = Field(alias="_id")
    description: str
    task_type: str
    status: str
    version: str
    success_count: int = 0
    total_count: int = 0
    success_rate: float = 0.0
    avg_video_seconds: float = 0.0
    material_id: Optional[str] = None
    material_name: Optional[str] = None
    material_version: Optional[str] = Field(None, description="关联素材 version，列表 $lookup 填充")
    material_parent_id: Optional[str] = Field(
        None, description="关联素材为子版本时的 parent_id，用于前端跳转"
    )
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    class Config:
        populate_by_name = True

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "EvalTaskOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        if d.get("material_id"):
            d["material_id"] = str(d["material_id"])
        return cls.model_validate(d)


class EvalRecordCreate(BaseModel):
    action_description: str = ""
    video_url: Optional[str] = None
    cover_url: Optional[str] = None
    result: str
    duration_seconds: int = 0


class EvalRecordUpdate(BaseModel):
    action_description: Optional[str] = None
    result: Optional[str] = None
    duration_seconds: Optional[int] = None
    video_url: Optional[str] = None
    cover_url: Optional[str] = None


class EvalRecordOut(BaseModel):
    id: str = Field(alias="_id")
    task_id: str
    action_description: str
    video_url: Optional[str] = None
    cover_url: Optional[str] = None
    result: str
    duration_seconds: int
    created_at: datetime
    created_by: Optional[str] = None

    class Config:
        populate_by_name = True

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "EvalRecordOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        d["task_id"] = str(d["task_id"])
        return cls.model_validate(d)
