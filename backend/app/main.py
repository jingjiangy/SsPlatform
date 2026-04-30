from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import close_db, connect_db, get_db
from app.json_datetime import install_beijing_datetime_json_encoder
from app.models.common import beijing_now
from app.permissions import (
    DEFAULT_MODULES_BY_ROLE_CODE,
    MODULE_DEVICE_MODELS,
    MODULE_EVAL_TEMPLATES,
    MODULE_FAULT_RECORDS,
    MODULE_PARTS,
    MODULE_ROBOTS,
    RoleCode,
)
from app.routers import (
    apis,
    auth,
    device_models,
    evaluations,
    fault_records,
    materials,
    parts,
    robots,
    roles,
    users,
)
from app.security import hash_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await seed_if_empty()
    await migrate_role_modules()
    await migrate_robots_module()
    await migrate_device_models_module()
    await migrate_parts_module()
    await migrate_fault_records_module()
    await migrate_eval_templates_module()
    yield
    await close_db()


async def migrate_role_modules() -> None:
    """为已存在的内置角色补齐 modules，与旧版权限对齐。"""
    db = get_db()
    now = beijing_now()
    for code, mods in DEFAULT_MODULES_BY_ROLE_CODE.items():
        await db["roles"].update_many(
            {"code": code, "$or": [{"modules": {"$exists": False}}, {"modules": None}]},
            {"$set": {"modules": mods, "updated_at": now}},
        )


async def migrate_robots_module() -> None:
    """为已落库的内置角色追加「机器人管理」模块（需重新登录后 JWT 含 robot 权限）。"""
    db = get_db()
    for code in DEFAULT_MODULES_BY_ROLE_CODE:
        await db["roles"].update_many(
            {"code": code, "modules": {"$type": "array"}},
            {"$addToSet": {"modules": MODULE_ROBOTS}},
        )


async def migrate_device_models_module() -> None:
    """为已落库的内置角色追加「设备型号」模块。"""
    db = get_db()
    for code in DEFAULT_MODULES_BY_ROLE_CODE:
        await db["roles"].update_many(
            {"code": code, "modules": {"$type": "array"}},
            {"$addToSet": {"modules": MODULE_DEVICE_MODELS}},
        )


async def migrate_parts_data_from_spare_parts() -> None:
    """将旧集合 spare_parts 中的文档迁入 parts（仅当 parts 尚不存在时）。"""
    db = get_db()
    cols = set(await db.list_collection_names())
    if "parts" in cols:
        return
    if "spare_parts" not in cols:
        return
    async for doc in db["spare_parts"].find():
        await db["parts"].insert_one(dict(doc))
    await db["spare_parts"].drop()


async def migrate_role_modules_spare_parts_to_parts() -> None:
    """角色 modules 中的 spare_parts 更名为 parts。"""
    db = get_db()
    now = beijing_now()
    async for role in db["roles"].find({"modules": {"$in": ["spare_parts"]}}):
        mods = list(role.get("modules") or [])
        new_mods = ["parts" if m == "spare_parts" else m for m in mods]
        await db["roles"].update_one(
            {"_id": role["_id"]},
            {"$set": {"modules": new_mods, "updated_at": now}},
        )


async def migrate_fault_records_module() -> None:
    """为已落库的内置角色追加「故障记录」模块。"""
    db = get_db()
    for code in DEFAULT_MODULES_BY_ROLE_CODE:
        await db["roles"].update_many(
            {"code": code, "modules": {"$type": "array"}},
            {"$addToSet": {"modules": MODULE_FAULT_RECORDS}},
        )


async def migrate_parts_module() -> None:
    """配件模块：数据集合迁移 + 角色 modules 对齐 + 内置角色追加 parts。"""
    await migrate_parts_data_from_spare_parts()
    await migrate_role_modules_spare_parts_to_parts()
    db = get_db()
    for code in DEFAULT_MODULES_BY_ROLE_CODE:
        await db["roles"].update_many(
            {"code": code, "modules": {"$type": "array"}},
            {"$addToSet": {"modules": MODULE_PARTS}},
        )


async def migrate_eval_templates_module() -> None:
    """为已落库的内置角色追加「评测模板」模块。"""
    db = get_db()
    for code in (
        RoleCode.ADMIN.value,
        RoleCode.EVALUATOR.value,
        RoleCode.RD.value,
    ):
        await db["roles"].update_many(
            {"code": code, "modules": {"$type": "array"}},
            {"$addToSet": {"modules": MODULE_EVAL_TEMPLATES}},
        )


async def seed_if_empty() -> None:
    db = get_db()
    if await db["roles"].estimated_document_count() == 0:
        now = beijing_now()
        default_roles = [
            {
                "name": "管理员",
                "code": RoleCode.ADMIN.value,
                "description": "全部模块",
                "modules": DEFAULT_MODULES_BY_ROLE_CODE[RoleCode.ADMIN.value],
            },
            {
                "name": "评测员",
                "code": RoleCode.EVALUATOR.value,
                "description": "素材库、评测、账号",
                "modules": DEFAULT_MODULES_BY_ROLE_CODE[RoleCode.EVALUATOR.value],
            },
            {
                "name": "研发",
                "code": RoleCode.RD.value,
                "description": "素材与评测操作",
                "modules": DEFAULT_MODULES_BY_ROLE_CODE[RoleCode.RD.value],
            },
            {
                "name": "采集员",
                "code": RoleCode.COLLECTOR.value,
                "description": "仅查看素材",
                "modules": DEFAULT_MODULES_BY_ROLE_CODE[RoleCode.COLLECTOR.value],
            },
        ]
        for r in default_roles:
            r["created_at"] = now
            r["updated_at"] = now
            await db["roles"].insert_one(r)
    if await db["users"].estimated_document_count() == 0:
        now = beijing_now()
        await db["users"].insert_one(
            {
                "username": "admin",
                "password": hash_password("admin123"),
                "role": RoleCode.ADMIN.value,
                "phone": "",
                "created_at": now,
                "updated_at": now,
            }
        )


app = FastAPI(title="模型评估平台 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_path = Path(settings.upload_dir)
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=str(upload_path)), name="uploads")

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(roles.router, prefix="/api")
app.include_router(apis.router, prefix="/api")
app.include_router(materials.router, prefix="/api")
app.include_router(evaluations.router, prefix="/api")
app.include_router(robots.router, prefix="/api")
app.include_router(device_models.router, prefix="/api")
app.include_router(parts.router, prefix="/api")
app.include_router(fault_records.router, prefix="/api")

install_beijing_datetime_json_encoder()

@app.get("/api/health")
async def health():
    return {"status": "ok"}

# 托管前端 dist/（生产模式下由 start-prod.sh 构建后存在）
_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if _dist.is_dir():
    from fastapi.responses import FileResponse as _FileResponse

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        target = _dist / full_path
        if target.is_file():
            return _FileResponse(str(target))
        return _FileResponse(str(_dist / "index.html"))



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        # reload 模式不支持多进程，生产环境（reload=False）才启用 workers
        workers=None if settings.reload else settings.workers,
    )
