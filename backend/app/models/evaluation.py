from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.common import validate_version

_EVAL_TEMPLATE_STATUSES = frozenset({"启用", "停用"})


def normalize_eval_step_template_status(st: object) -> str:
    """模板状态仅「启用」「停用」；历史「进行中」等视作启用。"""
    s = str(st or "").strip()
    return "停用" if s == "停用" else "启用"


class EvalStepIncoming(BaseModel):
    """评测任务步骤（创建/修改任务时）；id 可选，不传则自动生成。"""

    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=256)
    max_score: float = Field(gt=0, le=1_000_000)


class EvalStepDef(BaseModel):
    id: str
    name: str
    max_score: float


class EvalStepScoreIn(BaseModel):
    step_id: str
    score: float = Field(ge=0)


class EvalStepTemplateStep(BaseModel):
    step_id: Optional[int] = Field(None, ge=1)
    name: str = Field(..., min_length=1, max_length=256)
    max_score: float = Field(gt=0, le=1_000_000)


class EvalStepTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    status: str = "启用"
    version: str = "1.0"
    steps: list[EvalStepTemplateStep] = Field(default_factory=list)

    @field_validator("status")
    @classmethod
    def v_tpl_status(cls, v: str) -> str:
        s = (v or "").strip()
        if s not in _EVAL_TEMPLATE_STATUSES:
            raise ValueError("模板状态须为「启用」或「停用」")
        return s

    @field_validator("version")
    @classmethod
    def v_version(cls, v: str) -> str:
        return validate_version(v)


class EvalStepTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    steps: Optional[list[EvalStepTemplateStep]] = None

    @field_validator("status")
    @classmethod
    def v_tpl_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if s not in _EVAL_TEMPLATE_STATUSES:
            raise ValueError("模板状态须为「启用」或「停用」")
        return s

    @field_validator("version")
    @classmethod
    def v_version(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return validate_version(v)


class EvalStepTemplateOut(BaseModel):
    id: str = Field(alias="_id")
    name: str
    description: str = ""
    status: str
    version: str
    steps: list[dict[str, Any]]
    updated_at: datetime
    created_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    class Config:
        populate_by_name = True


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
    template_id: Optional[str] = None
    steps: list[EvalStepIncoming] = Field(default_factory=list)


class EvalTaskUpdate(BaseModel):
    description: Optional[str] = None
    task_type: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = Field(
        None, description="未关联素材时可改；已关联素材时 PUT 忽略此字段"
    )
    steps: Optional[list[EvalStepIncoming]] = None

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
    avg_total_score: float = 0.0
    material_id: Optional[str] = None
    material_name: Optional[str] = None
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    template_version: Optional[str] = None
    material_version: Optional[str] = Field(None, description="关联素材 version，列表 $lookup 填充")
    material_parent_id: Optional[str] = Field(
        None, description="关联素材为子版本时的 parent_id，用于前端跳转"
    )
    steps: list[EvalStepDef] = Field(default_factory=list)
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
        if d.get("template_id"):
            d["template_id"] = str(d["template_id"])
        raw_steps = d.get("steps") or []
        out_steps: list[EvalStepDef] = []
        for s in raw_steps:
            try:
                out_steps.append(
                    EvalStepDef(
                        id=str(s.get("id", "")),
                        name=str(s.get("name", "")),
                        max_score=float(s.get("max_score", 0)),
                    )
                )
            except Exception:
                continue
        d["steps"] = out_steps
        return cls.model_validate(d)


class EvalRecordCreate(BaseModel):
    action_description: str = ""
    video_url: Optional[str] = None
    cover_url: Optional[str] = None
    result: str
    duration_seconds: int = 0
    step_scores: Optional[list[EvalStepScoreIn]] = None


class EvalRecordUpdate(BaseModel):
    action_description: Optional[str] = None
    result: Optional[str] = None
    duration_seconds: Optional[int] = None
    video_url: Optional[str] = None
    cover_url: Optional[str] = None
    step_scores: Optional[list[EvalStepScoreIn]] = None


class EvalRecordOut(BaseModel):
    id: str = Field(alias="_id")
    task_id: str
    template_id: Optional[str] = None
    action_description: str
    video_url: Optional[str] = None
    cover_url: Optional[str] = None
    result: str
    duration_seconds: int
    step_scores: list[dict[str, Any]] = Field(default_factory=list)
    total_score: float = 0.0
    created_at: datetime
    created_by: Optional[str] = None

    class Config:
        populate_by_name = True

    @classmethod
    def from_doc(cls, doc: dict[str, Any]) -> "EvalRecordOut":
        d = dict(doc)
        d["_id"] = str(d["_id"])
        d["task_id"] = str(d["task_id"])
        if d.get("template_id"):
            d["template_id"] = str(d["template_id"])
        d.setdefault("step_scores", d.get("step_scores") or [])
        d.setdefault("total_score", float(d.get("total_score") or 0))
        return cls.model_validate(d)
