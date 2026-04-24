from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.common import validate_version

ROBOT_STATUSES = ("在线", "离线", "故障")


class RobotCreate(BaseModel):
    name: str = Field(..., min_length=1)
    device_model_id: str = Field(..., min_length=1, description="设备型号文档 ID（ObjectId 字符串）")
    status: str = Field(..., description="在线 / 离线 / 故障")
    version: str = Field("1.0", description="版本号，一位小数")
    details: str = ""

    @field_validator("status")
    @classmethod
    def v_status(cls, v: str) -> str:
        s = (v or "").strip()
        if s not in ROBOT_STATUSES:
            raise ValueError(f"状态须为：{'、'.join(ROBOT_STATUSES)}")
        return s

    @field_validator("version")
    @classmethod
    def v_version(cls, v: str) -> str:
        return validate_version(v)


class RobotUpdate(BaseModel):
    name: Optional[str] = None
    device_model_id: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    details: Optional[str] = None

    @field_validator("status")
    @classmethod
    def v_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in ROBOT_STATUSES:
            raise ValueError(f"状态须为：{'、'.join(ROBOT_STATUSES)}")
        return s

    @field_validator("version")
    @classmethod
    def v_version(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return validate_version(v)


class RobotOut(BaseModel):
    id: str = Field(alias="_id")
    name: str
    device_model_id: Optional[str] = None
    device_model: str
    status: str
    version: str
    details: str = ""
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "RobotOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        dmid = d.get("device_model_id")
        if dmid is not None:
            d["device_model_id"] = str(dmid) if not isinstance(dmid, str) else dmid
        else:
            d["device_model_id"] = None
        if not d.get("device_model"):
            d["device_model"] = ""
        if "details" not in d or d["details"] is None:
            d["details"] = ""
        return cls.model_validate(d)
