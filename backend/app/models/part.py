"""配件管理（设备管理 → 配件）"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

PART_STATUSES = ("在线", "离线", "故障")


class PartInboundRecord(BaseModel):
    """出入库流水：kind=in 入库，kind=out 出库（数量均为正数）。"""

    model_config = ConfigDict(extra="ignore")
    at: datetime
    by: str = ""
    executor: str = ""
    quantity: int = Field(..., ge=0, description="本次入库或出库数量（正数）")
    note: str = ""
    kind: str = Field(default="in", description="in=入库, out=出库")

    @field_validator("kind", mode="before")
    @classmethod
    def v_kind(cls, v: Any) -> str:
        if isinstance(v, str) and v.strip().lower() == "out":
            return "out"
        return "in"


class PartUpdateRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    at: datetime
    by: str = ""
    executor: str = ""
    quantity: int = Field(..., ge=0)
    status: str = ""
    remark: str = ""


class PartCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    remark: str = Field("", description="配件备注，用于配件历史记录展示与历史同步")
    status: str = Field(..., description="在线 / 离线 / 故障")
    quantity: int = Field(..., ge=0)
    image_url: str = ""
    robot_id: str = Field("", description="可选，关联机器人文档 ID（ObjectId 字符串）")

    @field_validator("status")
    @classmethod
    def v_status(cls, v: str) -> str:
        s = (v or "").strip()
        if s not in PART_STATUSES:
            raise ValueError(f"状态须为：{'、'.join(PART_STATUSES)}")
        return s


class PartUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    remark: Optional[str] = None
    status: Optional[str] = None
    quantity: Optional[int] = None
    image_url: Optional[str] = None
    robot_id: Optional[str] = None
    executor: Optional[str] = None  # 本次保存的执行人，可手填；空则回退为当前登录用户

    @field_validator("status")
    @classmethod
    def v_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in PART_STATUSES:
            raise ValueError(f"状态须为：{'、'.join(PART_STATUSES)}")
        return s

    @field_validator("quantity")
    @classmethod
    def v_qty(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if v < 0:
            raise ValueError("数量不能为负")
        return v


class PartListOut(BaseModel):
    id: str = Field(alias="_id")
    name: str
    description: str = ""
    remark: str = ""
    status: str
    quantity: int
    image_url: str = ""
    robot_id: Optional[str] = None
    robot_name: str = ""
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "PartListOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        if "description" not in d or d["description"] is None:
            d["description"] = ""
        if "remark" not in d or d["remark"] is None:
            d["remark"] = ""
        if "image_url" not in d or d["image_url"] is None:
            d["image_url"] = ""
        d["quantity"] = int(d.get("quantity") or 0)
        rid = d.get("robot_id")
        if rid is not None and not isinstance(rid, str):
            d["robot_id"] = str(rid) if rid else None
        elif isinstance(rid, str) and not rid.strip():
            d["robot_id"] = None
        if "robot_name" not in d or d["robot_name"] is None:
            d["robot_name"] = ""
        return cls.model_validate(d)


class PartDetailOut(PartListOut):
    inbound_history: list[PartInboundRecord] = Field(default_factory=list)
    update_history: list[PartUpdateRecord] = Field(default_factory=list)

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "PartDetailOut":
        base = PartListOut.from_doc(doc).model_dump(by_alias=True)
        base["inbound_history"] = list(doc.get("inbound_history") or [])
        base["update_history"] = list(doc.get("update_history") or [])
        return cls.model_validate(base)
