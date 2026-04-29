from __future__ import annotations

import asyncio
import json
import re
import uuid
from typing import Annotated, Any, Optional
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.deps import DbDep, require_permission
from app.models.common import beijing_now
from app.models.evaluation import (
    EvalRecordCreate,
    EvalRecordOut,
    EvalRecordUpdate,
    EvalStepIncoming,
    EvalStepScoreIn,
    EvalStepTemplateCreate,
    EvalStepTemplateOut,
    EvalStepTemplateUpdate,
    EvalTaskCreate,
    EvalTaskOut,
    EvalTaskUpdate,
    normalize_eval_step_template_status,
)
from app.permissions import (
    P_EVAL_READ,
    P_EVAL_TEMPLATE_READ,
    P_EVAL_TEMPLATE_WRITE,
    P_EVAL_WRITE,
)
from app.services.eval_task_version import compute_next_eval_task_version_for_material
from app.services.upload import (
    delete_local_upload_file,
    delete_local_upload_media_fields,
    save_video_file,
)
from app.services.eval_stats import eval_record_included_in_task_stats, recalc_task_stats
from app.services.user_display import actor_label_from_payload, enrich_actor_fields, enrich_one

router = APIRouter(prefix="/evaluations", tags=["evaluations"])

STEP_TEMPLATES_COLLECTION = "eval_step_templates"

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def normalize_task_steps(rows: list[EvalStepIncoming]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        sid = row.id.strip() if row.id else ""
        if not sid:
            sid = uuid.uuid4().hex
        out.append({"id": sid, "name": row.name.strip(), "max_score": float(row.max_score)})
    return out


def validate_step_scores_for_task(
    task_steps: Optional[list[dict[str, Any]]],
    incoming: Optional[list[EvalStepScoreIn]],
) -> tuple[list[dict[str, Any]], float]:
    ordered: list[dict[str, Any]] = [dict(s) for s in (task_steps or []) if s.get("id")]
    sid_order = [str(s["id"]) for s in ordered]
    sid_map = {str(s["id"]): s for s in ordered}
    if not sid_map:
        if incoming:
            raise HTTPException(status_code=400, detail="本评测任务未配置步骤，请勿提交步骤得分")
        return [], 0.0
    incoming = incoming or []
    if len(incoming) != len(sid_map):
        raise HTTPException(status_code=400, detail="请为本任务的每个评测步骤填写得分")
    by_sid: dict[str, float] = {}
    total = 0.0
    for sc in incoming:
        sid = str(sc.step_id)
        if sid not in sid_map:
            raise HTTPException(status_code=400, detail=f"无效的步骤 id: {sid}")
        if sid in by_sid:
            raise HTTPException(status_code=400, detail="步骤得分重复")
        mx = float(sid_map[sid]["max_score"])
        sv = float(sc.score)
        if sv > mx + 1e-9:
            label = sid_map[sid].get("name") or sid
            raise HTTPException(status_code=400, detail=f"步骤「{label}」得分不能超过满分 {mx}")
        by_sid[sid] = sv
        total += sv
    if set(by_sid.keys()) != set(sid_map.keys()):
        raise HTTPException(status_code=400, detail="请为本任务的每个评测步骤填写得分")
    pairs = [{"step_id": sid, "score": round(by_sid[sid], 4)} for sid in sid_order]
    return pairs, round(total + 1e-11, 4)


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
        out.append({"step_id": seq, "name": name, "max_score": score})
        seq += 1
    return out


@router.get("/tasks")
async def list_tasks(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_READ))],
    material_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
):
    if limit < 1:
        limit = 20
    if limit > 200:
        limit = 200
    q: dict = {}
    if material_id:
        try:
            q["material_id"] = ObjectId(material_id)
        except InvalidId:
            raise HTTPException(400, "无效素材ID")
    total = await db["eval_tasks"].count_documents(q)
    # $lookup 用 localField/foreignField 时类型须一致；material_id 若存成字符串则关联不上。
    # 用 let + $convert 同时兼容 ObjectId / 合法 24 位 hex 字符串。
    pipeline = [
        {"$match": q},
        {"$sort": {"_id": -1}},
        {"$skip": skip},
        {"$limit": limit},
        {
            "$lookup": {
                "from": "materials",
                "let": {"mid": "$material_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$ne": ["$$mid", None]},
                                    {
                                        "$eq": [
                                            "$_id",
                                            {
                                                "$convert": {
                                                    "input": "$$mid",
                                                    "to": "objectId",
                                                    "onError": None,
                                                    "onNull": None,
                                                }
                                            },
                                        ]
                                    },
                                ]
                            }
                        }
                    }
                ],
                "as": "_mat",
            }
        },
    ]
    items_raw: list[dict] = []
    async for doc in db["eval_tasks"].aggregate(pipeline):
        d = dict(doc)
        mats = d.pop("_mat", [])
        mid_raw = d.get("material_id")
        if not mats and mid_raw is not None:
            try:
                oid = mid_raw if isinstance(mid_raw, ObjectId) else ObjectId(str(mid_raw))
                m0 = await db["materials"].find_one({"_id": oid})
                if m0:
                    mats = [m0]
            except (InvalidId, TypeError, ValueError):
                pass
        if mats:
            m0 = mats[0]
            mv = m0.get("version")
            d["material_version"] = str(mv) if mv is not None else None
            pid = m0.get("parent_id")
            d["material_parent_id"] = str(pid) if pid else None
        else:
            d["material_version"] = None
            d["material_parent_id"] = None
        items_raw.append(d)
    await enrich_actor_fields(db, items_raw)
    items = [EvalTaskOut.from_doc(d).model_dump(by_alias=True) for d in items_raw]
    return {"items": items, "total": total}


@router.post("/tasks")
async def create_task(
    body: EvalTaskCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    now = beijing_now()
    mid = None
    template_oid = None
    template_doc: Optional[dict[str, Any]] = None
    if body.material_id:
        try:
            mid = ObjectId(body.material_id)
        except InvalidId:
            raise HTTPException(400, "无效素材ID")
    if body.template_id:
        try:
            template_oid = ObjectId(body.template_id)
        except InvalidId:
            raise HTTPException(400, "无效模板ID")
        template_doc = await db[STEP_TEMPLATES_COLLECTION].find_one({"_id": template_oid})
        if not template_doc:
            raise HTTPException(404, "评测模板不存在")
    if mid:
        version_str = await compute_next_eval_task_version_for_material(db, mid)
    else:
        version_str = body.version
    task_steps = normalize_task_steps(body.steps) if body.steps else []
    if not task_steps and template_doc:
        template_steps = normalize_template_steps(template_doc.get("steps") or [])
        task_steps = [
            {
                # 任务步骤 id 仍采用字符串，与录入打分逻辑保持一致
                "id": str(s.get("step_id")),
                "name": str(s.get("name", "")),
                "max_score": float(s.get("max_score", 0)),
            }
            for s in template_steps
            if s.get("name")
        ]

    doc = {
        "description": body.description,
        "task_type": body.task_type,
        "status": body.status,
        "version": version_str,
        "success_count": 0,
        "total_count": 0,
        "success_rate": 0.0,
        "avg_video_seconds": 0.0,
        "avg_total_score": 0.0,
        "material_id": mid,
        "material_name": body.material_name,
        "template_id": template_oid,
        "template_name": str(template_doc.get("name")) if template_doc else None,
        "template_version": str(template_doc.get("version")) if template_doc else None,
        "steps": task_steps,
        "created_at": now,
        "updated_at": now,
        "created_by": actor_label_from_payload(user),
        "updated_by": actor_label_from_payload(user),
    }
    r = await db["eval_tasks"].insert_one(doc)
    doc["_id"] = r.inserted_id
    await enrich_actor_fields(db, [doc])
    return EvalTaskOut.from_doc(doc).model_dump(by_alias=True)


@router.get("/tasks/{tid}")
async def get_task(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_READ))],
):
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    doc = await db["eval_tasks"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "评测任务不存在")
    d = await enrich_one(db, doc)
    return EvalTaskOut.from_doc(d).model_dump(by_alias=True)


@router.put("/tasks/{tid}")
async def update_task(
    tid: str,
    body: EvalTaskUpdate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    existing = await db["eval_tasks"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "评测任务不存在")
    patch: dict = {"updated_at": beijing_now(), "updated_by": actor_label_from_payload(user)}
    raw = body.model_dump(exclude_unset=True)
    if "steps" in raw:
        incoming = raw.pop("steps")
        if incoming is not None:
            patch["steps"] = normalize_task_steps(incoming)
    for k, v in raw.items():
        if v is not None:
            if k == "version" and existing.get("material_id"):
                continue
            patch[k] = v
    r = await db["eval_tasks"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "评测任务不存在")
    doc = await db["eval_tasks"].find_one({"_id": oid})
    d = await enrich_one(db, doc)
    return EvalTaskOut.from_doc(d).model_dump(by_alias=True)


@router.delete("/tasks/{tid}")
async def delete_task(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    async for rec in db["eval_records"].find({"task_id": oid}):
        delete_local_upload_media_fields(rec)
    await db["eval_records"].delete_many({"task_id": oid})
    r = await db["eval_tasks"].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "评测任务不存在")
    return {"ok": True}


@router.get("/tasks/{tid}/records")
async def list_records(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_READ))],
    skip: int = 0,
    limit: int = 20,
):
    if limit < 1:
        limit = 20
    if limit > 200:
        limit = 200
    try:
        oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    _q = {"task_id": oid}
    total = await db["eval_records"].count_documents(_q)
    cur = db["eval_records"].find(_q).sort("_id", -1).skip(skip).limit(limit)
    items = []
    async for doc in cur:
        items.append(dict(doc))
    await enrich_actor_fields(db, items, fields=("created_by",))
    return {
        "items": [EvalRecordOut.from_doc(d).model_dump(by_alias=True) for d in items],
        "total": total,
    }


@router.get("/tasks/{tid}/step-avg")
async def get_task_step_avg(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_READ))],
):
    """各步骤 avg_score、sample_count 仅统计非「剔除」的评测记录（与 recalc_task_stats 一致）。"""
    try:
        task_oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    task = await db["eval_tasks"].find_one({"_id": task_oid})
    if not task:
        raise HTTPException(404, "评测任务不存在")

    task_steps = task.get("steps") or []
    meta_by_id: dict[str, dict[str, Any]] = {}
    for s in task_steps:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("id") or "")
        if not sid:
            continue
        meta_by_id[sid] = {
            "step_id": sid,
            "step_name": str(s.get("name") or ""),
            "max_score": float(s.get("max_score") or 0),
        }

    sum_by_id: dict[str, float] = {sid: 0.0 for sid in meta_by_id}
    cnt_by_id: dict[str, int] = {sid: 0 for sid in meta_by_id}

    async for rec in db["eval_records"].find({"task_id": task_oid}):
        if not eval_record_included_in_task_stats(rec):
            continue
        scores = rec.get("step_scores") or []
        if not isinstance(scores, list):
            continue
        for ss in scores:
            if not isinstance(ss, dict):
                continue
            sid = str(ss.get("step_id") or "")
            if sid not in sum_by_id:
                continue
            try:
                sc = float(ss.get("score") or 0)
            except Exception:
                sc = 0.0
            sum_by_id[sid] += sc
            cnt_by_id[sid] += 1

    items: list[dict[str, Any]] = []
    for sid, meta in meta_by_id.items():
        c = cnt_by_id.get(sid, 0)
        avg = (sum_by_id.get(sid, 0.0) / c) if c > 0 else 0.0
        items.append(
            {
                **meta,
                "avg_score": round(avg + 1e-11, 4),
                "sample_count": c,
            }
        )

    return {
        "task_id": str(task_oid),
        "template_id": str(task.get("template_id")) if task.get("template_id") else None,
        "items": items,
    }


@router.get("/translate/zh-to-en")
async def translate_zh_to_en(
    q: str,
    _: Annotated[dict, Depends(require_permission(P_EVAL_READ))],
):
    """将短文本中译英（MyMemory 免费接口，仅供步骤名展示）。失败时退回原文。"""
    text = (q or "").strip()
    if not text:
        return {"text": ""}
    if _CJK_RE.search(text) is None:
        return {"text": text}
    if len(text) > 800:
        text = text[:800]

    def _fetch() -> dict[str, Any]:
        enc = quote_plus(text)
        url = f"https://api.mymemory.translated.net/get?q={enc}&langpair=zh-CN|en"
        req = Request(url, headers={"User-Agent": "SsPlatform-eval/1"})
        with urlopen(req, timeout=25) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)

    try:
        payload = await asyncio.to_thread(_fetch)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="翻译服务暂不可用") from exc

    out = ""
    if isinstance(payload, dict):
        rd = payload.get("responseData")
        if isinstance(rd, dict):
            t = rd.get("translatedText")
            out = str(t).strip() if isinstance(t, str) else ""
        elif isinstance(rd, str):
            out = rd.strip()
    if out:
        return {"text": out}
    return {"text": text}


@router.post("/tasks/{tid}/records")
async def create_record(
    tid: str,
    body: EvalRecordCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        task_oid = ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    task = await db["eval_tasks"].find_one({"_id": task_oid})
    if not task:
        raise HTTPException(404, "评测任务不存在")
    task_steps_any = task.get("steps") or []
    pairs, total_scr = validate_step_scores_for_task(
        task_steps_any if isinstance(task_steps_any, list) else [],
        body.step_scores,
    )
    now = beijing_now()
    doc = {
        "task_id": task_oid,
        "template_id": task.get("template_id"),
        "action_description": body.action_description,
        "video_url": body.video_url,
        "cover_url": body.cover_url,
        "result": body.result,
        "duration_seconds": body.duration_seconds,
        "status": "有效",
        "step_scores": pairs,
        "total_score": total_scr,
        "created_at": now,
        "created_by": actor_label_from_payload(user),
    }
    r = await db["eval_records"].insert_one(doc)
    doc["_id"] = r.inserted_id
    await recalc_task_stats(db, task_oid)
    await enrich_actor_fields(db, [doc], fields=("created_by",))
    return EvalRecordOut.from_doc(doc).model_dump(by_alias=True)


@router.post("/tasks/{tid}/records/upload-video")
async def upload_record_video(
    tid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
    file: UploadFile = File(...),
):
    try:
        ObjectId(tid)
    except InvalidId:
        raise HTTPException(400, "无效任务ID")
    return await save_video_file(file)


@router.put("/records/{rid}")
async def update_record(
    rid: str,
    body: EvalRecordUpdate,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        oid = ObjectId(rid)
    except InvalidId:
        raise HTTPException(400, "无效评测记录ID")
    doc = await db["eval_records"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "评测记录不存在")
    patch = body.model_dump(exclude_unset=True, exclude_none=True)
    if patch.get("step_scores") is not None:
        task_id = doc["task_id"]
        task = await db["eval_tasks"].find_one({"_id": task_id})
        if not task:
            raise HTTPException(404, "评测任务不存在")
        raw_ss = patch["step_scores"]
        parsed_scores = (
            [EvalStepScoreIn(**cast) for cast in raw_ss]
            if isinstance(raw_ss, list) and raw_ss is not None
            else []
        )
        pairs, total_scr = validate_step_scores_for_task(task.get("steps") or [], parsed_scores)
        patch["step_scores"] = pairs
        patch["total_score"] = total_scr
    if not patch:
        raise HTTPException(400, "无更新内容")
    if "video_url" in patch and patch["video_url"] != doc.get("video_url"):
        if doc.get("video_url"):
            delete_local_upload_file(doc.get("video_url"))
    if "cover_url" in patch and patch.get("cover_url") != doc.get("cover_url"):
        if doc.get("cover_url"):
            delete_local_upload_file(doc.get("cover_url"))
    r = await db["eval_records"].update_one({"_id": oid}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "评测记录不存在")
    task_id = doc["task_id"]
    await recalc_task_stats(db, task_id)
    updated = await db["eval_records"].find_one({"_id": oid})
    if not updated:
        raise HTTPException(404, "评测记录不存在")
    await enrich_actor_fields(db, [updated], fields=("created_by",))
    return EvalRecordOut.from_doc(updated).model_dump(by_alias=True)


@router.delete("/records/{rid}")
async def delete_record(
    rid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_WRITE))],
):
    try:
        oid = ObjectId(rid)
    except InvalidId:
        raise HTTPException(400, "无效评测记录ID")
    doc = await db["eval_records"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "评测记录不存在")
    task_id = doc["task_id"]
    delete_local_upload_media_fields(doc)
    await db["eval_records"].delete_one({"_id": oid})
    await recalc_task_stats(db, task_id)
    return {"ok": True}


@router.get("/step-templates")
async def list_step_templates(
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_TEMPLATE_READ))],
    skip: int = 0,
    limit: int = 100,
):
    if limit < 1:
        limit = 100
    if limit > 200:
        limit = 200
    q: dict[str, Any] = {}
    total = await db[STEP_TEMPLATES_COLLECTION].count_documents(q)
    cur = (
        db[STEP_TEMPLATES_COLLECTION].find(q).sort("_id", -1).skip(skip).limit(limit)
    )
    items_raw: list[dict[str, Any]] = []
    async for doc in cur:
        items_raw.append(dict(doc))
    await enrich_actor_fields(db, items_raw, fields=("created_by", "updated_by"))
    items = []
    for doc in items_raw:
        d = dict(doc)
        d.setdefault("description", "")
        d.setdefault("version", "1.0")
        d.setdefault("updated_at", d.get("created_at"))
        d.setdefault("updated_by", d.get("created_by"))
        d["steps"] = normalize_template_steps(d.get("steps") or [])
        d["_id"] = str(d["_id"])
        d["status"] = normalize_eval_step_template_status(d.get("status"))
        items.append(EvalStepTemplateOut.model_validate(d).model_dump(by_alias=True))
    return {"items": items, "total": total}


@router.post("/step-templates")
async def create_step_template(
    body: EvalStepTemplateCreate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_EVAL_TEMPLATE_WRITE))],
):
    now = beijing_now()
    normalized_steps = normalize_template_steps(
        [{"step_id": x.step_id, "name": x.name, "max_score": x.max_score} for x in body.steps]
    )
    actor = actor_label_from_payload(user)
    doc = {
        "name": body.name.strip(),
        "description": body.description,
        "status": body.status,
        "version": body.version,
        "steps": normalized_steps,
        "updated_at": now,
        "created_at": now,
        "created_by": actor,
        "updated_by": actor,
    }
    r = await db[STEP_TEMPLATES_COLLECTION].insert_one(doc)
    doc["_id"] = r.inserted_id
    await enrich_actor_fields(db, [doc], fields=("created_by", "updated_by"))
    dd = dict(doc)
    dd["_id"] = str(dd["_id"])
    return EvalStepTemplateOut.model_validate(dd).model_dump(by_alias=True)


@router.put("/step-templates/{tpid}")
async def update_step_template(
    tpid: str,
    body: EvalStepTemplateUpdate,
    db: DbDep,
    user: Annotated[dict, Depends(require_permission(P_EVAL_TEMPLATE_WRITE))],
):
    try:
        oid = ObjectId(tpid)
    except InvalidId:
        raise HTTPException(400, "无效模板 ID")
    existing = await db[STEP_TEMPLATES_COLLECTION].find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "模板不存在")
    raw = body.model_dump(exclude_unset=True)
    patch: dict[str, Any] = {
        "updated_at": beijing_now(),
        "updated_by": actor_label_from_payload(user),
    }
    if "steps" in raw and raw["steps"] is not None:
        patch["steps"] = normalize_template_steps(
            [
                {
                    "step_id": x.get("step_id"),
                    "name": x["name"],
                    "max_score": x["max_score"],
                }
                for x in raw["steps"]
            ]
        )
        raw.pop("steps", None)
    for k, v in raw.items():
        if v is not None:
            patch[k] = v
    await db[STEP_TEMPLATES_COLLECTION].update_one({"_id": oid}, {"$set": patch})
    updated = await db[STEP_TEMPLATES_COLLECTION].find_one({"_id": oid})
    if not updated:
        raise HTTPException(404, "模板不存在")
    await enrich_actor_fields(db, [updated], fields=("created_by", "updated_by"))
    d = dict(updated)
    d.setdefault("description", "")
    d.setdefault("version", "1.0")
    d.setdefault("updated_at", d.get("created_at"))
    d.setdefault("updated_by", d.get("created_by"))
    d["steps"] = normalize_template_steps(d.get("steps") or [])
    d["_id"] = str(d["_id"])
    d["status"] = normalize_eval_step_template_status(d.get("status"))
    return EvalStepTemplateOut.model_validate(d).model_dump(by_alias=True)


@router.delete("/step-templates/{tpid}")
async def delete_step_template(
    tpid: str,
    db: DbDep,
    _: Annotated[dict, Depends(require_permission(P_EVAL_TEMPLATE_WRITE))],
):
    try:
        oid = ObjectId(tpid)
    except InvalidId:
        raise HTTPException(400, "无效模板 ID")
    r = await db[STEP_TEMPLATES_COLLECTION].delete_one({"_id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "模板不存在")
    return {"ok": True}
