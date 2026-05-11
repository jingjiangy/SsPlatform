from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import HTTPException

from app.models.evaluation import (
    _DEFAULT_RETRY_RATIOS,
    EvalStepIncoming,
    EvalStepScoreIn,
)

STEP_TEMPLATES_COLLECTION = "eval_step_templates"


def _parse_retry_ratios(raw: object) -> list[float]:
    if not isinstance(raw, list) or len(raw) != 3:
        return list(_DEFAULT_RETRY_RATIOS)
    try:
        ratios = [float(r) for r in raw]
    except Exception:
        return list(_DEFAULT_RETRY_RATIOS)
    if any(not (0.0 <= r <= 1.0) for r in ratios):
        return list(_DEFAULT_RETRY_RATIOS)
    return [round(r, 4) for r in ratios]


def normalize_task_steps(rows: list[EvalStepIncoming]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        sid = row.id.strip() if row.id else ""
        if not sid:
            sid = uuid.uuid4().hex
        out.append({"id": sid, "name": row.name.strip(), "max_score": float(row.max_score)})
    return out


def normalize_template_steps(rows: list[dict[str, Any]] | list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seq = 1
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name", "")).strip()
        if not name:
            continue
        try:
            score = float(row.get("max_score", 0))
        except Exception:
            continue
        if score <= 0:
            continue
        out.append({
            "step_id": seq,
            "name": name,
            "max_score": score,
            "retry_ratios": _parse_retry_ratios(row.get("retry_ratios")),
        })
        seq += 1
    return out


def validate_step_scores_for_task(
    task_steps: Optional[list[dict[str, Any]]],
    incoming: Optional[list[EvalStepScoreIn]],
) -> tuple[list[dict[str, Any]], float]:
    ordered = [dict(s) for s in (task_steps or []) if s.get("id")]
    sid_order = [str(s["id"]) for s in ordered]
    sid_map = {str(s["id"]): s for s in ordered}
    if not sid_map:
        if incoming:
            raise HTTPException(400, "本评测任务未配置步骤，请勿提交步骤得分")
        return [], 0.0
    incoming = incoming or []
    if len(incoming) != len(sid_map):
        raise HTTPException(400, "请为本任务的每个评测步骤填写得分")
    by_sid: dict[str, float] = {}
    total = 0.0
    for sc in incoming:
        sid = str(sc.step_id)
        if sid not in sid_map:
            raise HTTPException(400, f"无效的步骤 id: {sid}")
        if sid in by_sid:
            raise HTTPException(400, "步骤得分重复")
        mx = float(sid_map[sid]["max_score"])
        sv = float(sc.score)
        if sv > mx + 1e-9:
            label = sid_map[sid].get("name") or sid
            raise HTTPException(400, f"步骤「{label}」得分不能超过满分 {mx}")
        by_sid[sid] = sv
        total += sv
    if set(by_sid.keys()) != set(sid_map.keys()):
        raise HTTPException(400, "请为本任务的每个评测步骤填写得分")
    pairs = [{"step_id": sid, "score": round(by_sid[sid], 4)} for sid in sid_order]
    return pairs, round(total + 1e-11, 4)


async def resolve_task_steps(db: Any, task: dict[str, Any]) -> list[dict[str, Any]]:
    template_id = task.get("template_id")
    if template_id:
        tpl = await db[STEP_TEMPLATES_COLLECTION].find_one({"_id": template_id})
        if tpl:
            return [
                {
                    "id": str(s["step_id"]),
                    "name": s["name"],
                    "max_score": s["max_score"],
                    "retry_ratios": s["retry_ratios"],
                }
                for s in normalize_template_steps(tpl.get("steps") or [])
            ]
    return task.get("steps") or []
