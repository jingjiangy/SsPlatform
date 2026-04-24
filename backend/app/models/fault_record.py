"""故障记录（model_ss：设备管理 → 故障记录表）"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

# model_ss 未枚举状态，与常见工单一致
FAULT_STATUSES = ("待处理", "处理中", "已关闭")


class FaultRecordCreate(BaseModel):
    name: str = Field(..., min_length=1, description="故障名称")
    description: str = ""
    status: str = Field(..., description="故障状态")
    robot_id: str = Field("", description="可选，关联机器人 ObjectId 字符串")
    image_url: str = ""
    maintainer: str = Field("", description="维修人")

    @field_validator("status")
    @classmethod
    def v_status(cls, v: str) -> str:
        s = (v or "").strip()
        if s not in FAULT_STATUSES:
            raise ValueError(f"状态须为：{'、'.join(FAULT_STATUSES)}")
        return s


class FaultRecordUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    robot_id: Optional[str] = None
    image_url: Optional[str] = None
    maintainer: Optional[str] = None

    @field_validator("status")
    @classmethod
    def v_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in FAULT_STATUSES:
            raise ValueError(f"状态须为：{'、'.join(FAULT_STATUSES)}")
        return s


class FaultRecordOut(BaseModel):
    id: str = Field(alias="_id")
    name: str
    description: str = ""
    status: str
    robot_id: Optional[str] = None
    robot_name: str = ""
    image_url: str = ""
    maintainer: str = ""
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "FaultRecordOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        if "description" not in d or d["description"] is None:
            d["description"] = ""
        if "image_url" not in d or d["image_url"] is None:
            d["image_url"] = ""
        if "maintainer" not in d or d["maintainer"] is None:
            d["maintainer"] = ""
        rid = d.get("robot_id")
        if rid is not None and not isinstance(rid, str):
            d["robot_id"] = str(rid) if rid else None
        elif isinstance(rid, str) and not rid.strip():
            d["robot_id"] = None
        if "robot_name" not in d or d["robot_name"] is None:
            d["robot_name"] = ""
        return cls.model_validate(d)
