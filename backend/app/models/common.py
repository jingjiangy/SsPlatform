from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union

from bson import ObjectId
from pydantic import BaseModel, Field, field_validator


# 中国标准时间（东八区，无夏令时）
_CN_SHANGHAI = timezone(timedelta(hours=8), name="CST")


def beijing_now() -> datetime:
    """业务当前时间（Asia/Shanghai）。写入 Mongo 时 BSON 仍为同一瞬时的 UTC 毫秒（驱动自动转换）。"""
    return datetime.now(_CN_SHANGHAI)


def utc_now() -> datetime:
    """兼容旧名，等同于 beijing_now()。"""
    return beijing_now()


def datetime_to_beijing_api_str(dt: datetime) -> str:
    """
    API 输出：统一为北京时间字符串 YYYY-MM-DD HH:mm:ss，供前端直接展示，不再做时区换算。
    Mongo 读出的 naive datetime 按 UTC 解释（与 PyMongo/BSON 一致）。
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_CN_SHANGHAI).strftime("%Y-%m-%d %H:%M:%S")


def oid_str(oid: Optional[Union[ObjectId, str]]) -> Optional[str]:
    if oid is None:
        return None
    return str(oid)


VERSION_PATTERN = re.compile(r"^\d+\.\d$")


def validate_version(v: str) -> str:
    if not VERSION_PATTERN.match(v.strip()):
        raise ValueError("版本号格式为一位小数，如 1.1、2.0")
    return v.strip()


class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v: Any) -> str:
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str) and ObjectId.is_valid(v):
            return v
        raise ValueError("Invalid ObjectId")


class MongoModel(BaseModel):
    id: Optional[str] = Field(None, alias="_id")

    class Config:
        populate_by_name = True


def serialize_doc(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    out = dict(doc)
    if "_id" in out:
        out["_id"] = str(out["_id"])
    return out
