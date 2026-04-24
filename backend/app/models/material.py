from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.common import validate_version


class MaterialBase(BaseModel):
    name: str
    description: str = ""
    material_type: str
    status: str
    version: str = "1.0"
    device_model_id: str = Field(..., description="关联设备型号 Mongo _id（device_models 集合）")

    @field_validator("version")
    @classmethod
    def v_version(cls, v: str) -> str:
        return validate_version(v)


class MaterialCreate(MaterialBase):
    parent_id: Optional[str] = None


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    material_type: Optional[str] = None
    status: Optional[str] = None
    device_model_id: Optional[str] = None


class MaterialOut(BaseModel):
    id: str = Field(alias="_id")
    name: str
    description: str
    material_type: str
    status: str
    version: str
    video_url: Optional[str] = None
    cover_url: Optional[str] = None
    parent_id: Optional[str] = None
    child_count: int = Field(0, description="父级列表接口填充：直接子版本条数")
    device_model_id: Optional[str] = Field(None, description="关联 device_models._id")
    robot_device_model: Optional[str] = Field(
        None,
        description="设备型号名称（写入时从 device_models 冗余；兼容旧数据仅存文本时的展示）",
    )
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    class Config:
        populate_by_name = True

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "MaterialOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        pid = d.get("parent_id")
        if pid == "" or pid is None:
            d["parent_id"] = None
        else:
            d["parent_id"] = str(pid)

        # 新数据：device_model_id；旧数据：仅 robot_id + 已冗余的 robot_device_model 文本
        dmid = d.get("device_model_id")
        if dmid is not None and dmid != "":
            d["device_model_id"] = str(dmid) if not isinstance(dmid, str) else dmid
        else:
            d["device_model_id"] = None

        if "robot_device_model" not in d or d["robot_device_model"] is None:
            d["robot_device_model"] = None
        else:
            d["robot_device_model"] = str(d["robot_device_model"])
        return cls.model_validate(d)
