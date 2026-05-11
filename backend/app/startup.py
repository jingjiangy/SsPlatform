"""应用启动时执行的初始化与数据迁移逻辑。"""

from __future__ import annotations

from app.database import get_db
from app.models.common import beijing_now
from app.permissions import (
    DEFAULT_MODULES_BY_ROLE_CODE,
    MODULE_DEVICE_MODELS,
    MODULE_EVAL_TEMPLATES,
    MODULE_ROBOTS,
    RoleCode,
)
from app.security import hash_password


async def seed_if_empty() -> None:
    """数据库为空时写入默认角色和管理员账号。"""
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


async def migrate_role_modules() -> None:
    """为已存在的内置角色补齐 modules 字段，与旧版权限对齐。"""
    db = get_db()
    now = beijing_now()
    for code, mods in DEFAULT_MODULES_BY_ROLE_CODE.items():
        await db["roles"].update_many(
            {"code": code, "$or": [{"modules": {"$exists": False}}, {"modules": None}]},
            {"$set": {"modules": mods, "updated_at": now}},
        )


async def migrate_robots_module() -> None:
    """为已落库的内置角色追加「机器人管理」模块。"""
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


async def migrate_eval_templates_module() -> None:
    """为已落库的内置角色追加「评测模板」模块。"""
    db = get_db()
    for code in (RoleCode.ADMIN.value, RoleCode.EVALUATOR.value, RoleCode.RD.value):
        await db["roles"].update_many(
            {"code": code, "modules": {"$type": "array"}},
            {"$addToSet": {"modules": MODULE_EVAL_TEMPLATES}},
        )


async def run_all_migrations() -> None:
    """按顺序执行所有迁移，供 lifespan 调用。"""
    await seed_if_empty()
    await migrate_role_modules()
    await migrate_robots_module()
    await migrate_device_models_module()
    await migrate_eval_templates_module()
