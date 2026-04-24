from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ApiConfigCreate(BaseModel):
    name: str
    base_url: str
    method: str = "GET"
    description: str = ""
    headers_json: str = "{}"


class ApiConfigUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    method: Optional[str] = None
    description: Optional[str] = None
    headers_json: Optional[str] = None


class ApiConfigOut(BaseModel):
    id: str = Field(alias="_id")
    name: str
    base_url: str
    method: str
    description: str
    headers_json: str
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "ApiConfigOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        return cls.model_validate(d)
