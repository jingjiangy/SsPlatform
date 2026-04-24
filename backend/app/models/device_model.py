"""设备型号（model_ss：设备型号模块）"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

DEVICE_MODEL_STATUSES = ("启用", "停用")


class DeviceModelCreate(BaseModel):
    name: str = Field(..., min_length=1, description="设备型号名称")
    description: str = ""
    status: str = Field(..., description="启用 / 停用")

    @field_validator("status")
    @classmethod
    def v_status(cls, v: str) -> str:
        s = (v or "").strip()
        if s not in DEVICE_MODEL_STATUSES:
            raise ValueError(f"状态须为：{'、'.join(DEVICE_MODEL_STATUSES)}")
        return s


class DeviceModelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def v_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in DEVICE_MODEL_STATUSES:
            raise ValueError(f"状态须为：{'、'.join(DEVICE_MODEL_STATUSES)}")
        return s


class DeviceModelOut(BaseModel):
    id: str = Field(alias="_id")
    name: str
    description: str = ""
    status: str
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "DeviceModelOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        if "description" not in d or d["description"] is None:
            d["description"] = ""
        return cls.model_validate(d)
