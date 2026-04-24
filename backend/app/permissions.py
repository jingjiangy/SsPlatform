"""Role-based permissions aligned with model_ss."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional


class RoleCode(str, Enum):
    ADMIN = "admin"
    EVALUATOR = "evaluator"
    RD = "rd"
    COLLECTOR = "collector"


# Permission keys
P_USER_READ = "user:read"
P_USER_WRITE = "user:write"
P_ROLE_READ = "role:read"
P_ROLE_WRITE = "role:write"
P_API_READ = "api:read"
P_API_WRITE = "api:write"
P_MATERIAL_READ = "material:read"
P_MATERIAL_WRITE = "material:write"
P_EVAL_READ = "eval:read"
P_EVAL_WRITE = "eval:write"
P_ROBOT_READ = "robot:read"
P_ROBOT_WRITE = "robot:write"
P_DEVICE_MODEL_READ = "device_model:read"
P_DEVICE_MODEL_WRITE = "device_model:write"
P_PART_READ = "part:read"
P_PART_WRITE = "part:write"
P_FAULT_RECORD_READ = "fault_record:read"
P_FAULT_RECORD_WRITE = "fault_record:write"

# 与前端菜单一致的模块 id（接口文档仅前端入口，不映射 API 权限）
MODULE_ROLES = "roles"
MODULE_USERS = "users"
MODULE_MATERIALS = "materials"
MODULE_EVAL = "eval"
MODULE_API_DOCS = "api_docs"
MODULE_ROBOTS = "robots"
MODULE_DEVICE_MODELS = "device_models"
MODULE_PARTS = "parts"
MODULE_FAULT_RECORDS = "fault_records"

VALID_MODULES: tuple[str, ...] = (
    MODULE_ROLES,
    MODULE_USERS,
    MODULE_MATERIALS,
    MODULE_EVAL,
    MODULE_API_DOCS,
    MODULE_ROBOTS,
    MODULE_DEVICE_MODELS,
    MODULE_PARTS,
    MODULE_FAULT_RECORDS,
)

ROLE_PERMISSIONS: dict[str, set[str]] = {
    RoleCode.ADMIN.value: {
        P_USER_READ,
        P_USER_WRITE,
        P_ROLE_READ,
        P_ROLE_WRITE,
        P_API_READ,
        P_API_WRITE,
        P_MATERIAL_READ,
        P_MATERIAL_WRITE,
        P_EVAL_READ,
        P_EVAL_WRITE,
        P_ROBOT_READ,
        P_ROBOT_WRITE,
        P_DEVICE_MODEL_READ,
        P_DEVICE_MODEL_WRITE,
        P_PART_READ,
        P_PART_WRITE,
        P_FAULT_RECORD_READ,
        P_FAULT_RECORD_WRITE,
    },
    # 评测员：素材库、评测记录、账号管理（读写账号按需求给读写）
    RoleCode.EVALUATOR.value: {
        P_USER_READ,
        P_USER_WRITE,
        P_MATERIAL_READ,
        P_EVAL_READ,
        P_EVAL_WRITE,
        P_ROBOT_READ,
        P_DEVICE_MODEL_READ,
        P_PART_READ,
        P_FAULT_RECORD_READ,
    },
    # 研发：素材库、评测记录、可操作
    RoleCode.RD.value: {
        P_MATERIAL_READ,
        P_MATERIAL_WRITE,
        P_EVAL_READ,
        P_EVAL_WRITE,
        P_ROBOT_READ,
        P_ROBOT_WRITE,
        P_DEVICE_MODEL_READ,
        P_DEVICE_MODEL_WRITE,
        P_PART_READ,
        P_PART_WRITE,
        P_FAULT_RECORD_READ,
        P_FAULT_RECORD_WRITE,
    },
    # 采集员：仅查看素材库表单
    RoleCode.COLLECTOR.value: {
        P_MATERIAL_READ,
        P_ROBOT_READ,
        P_DEVICE_MODEL_READ,
        P_PART_READ,
        P_FAULT_RECORD_READ,
    },
}

# 内置角色在库中尚无 modules 字段时的默认勾选（与旧前端可见范围一致）
DEFAULT_MODULES_BY_ROLE_CODE: dict[str, list[str]] = {
    RoleCode.ADMIN.value: [
        MODULE_ROLES,
        MODULE_USERS,
        MODULE_MATERIALS,
        MODULE_EVAL,
        MODULE_ROBOTS,
        MODULE_DEVICE_MODELS,
        MODULE_PARTS,
        MODULE_FAULT_RECORDS,
        MODULE_API_DOCS,
    ],
    RoleCode.EVALUATOR.value: [
        MODULE_USERS,
        MODULE_MATERIALS,
        MODULE_EVAL,
        MODULE_ROBOTS,
        MODULE_DEVICE_MODELS,
        MODULE_PARTS,
        MODULE_FAULT_RECORDS,
        MODULE_API_DOCS,
    ],
    RoleCode.RD.value: [
        MODULE_MATERIALS,
        MODULE_EVAL,
        MODULE_ROBOTS,
        MODULE_DEVICE_MODELS,
        MODULE_PARTS,
        MODULE_FAULT_RECORDS,
        MODULE_API_DOCS,
    ],
    RoleCode.COLLECTOR.value: [
        MODULE_MATERIALS,
        MODULE_ROBOTS,
        MODULE_DEVICE_MODELS,
        MODULE_PARTS,
        MODULE_FAULT_RECORDS,
    ],
}


def expand_modules_to_api_permissions(modules: list[str], role_code: Optional[str] = None) -> set[str]:
    """将勾选的系统模块展开为接口鉴权用的 permission 集合。"""
    out: set[str] = set()
    for raw in modules:
        m = str(raw).strip()
        if m not in VALID_MODULES:
            continue
        if m == MODULE_ROLES:
            out.update({P_ROLE_READ, P_ROLE_WRITE})
        elif m == MODULE_USERS:
            out.update({P_USER_READ, P_USER_WRITE})
        elif m == MODULE_MATERIALS:
            out.add(P_MATERIAL_READ)
            # 与旧 ROLE_PERMISSIONS 一致：采集员、评测员仅素材只读
            if role_code not in (RoleCode.COLLECTOR.value, RoleCode.EVALUATOR.value):
                out.add(P_MATERIAL_WRITE)
        elif m == MODULE_EVAL:
            out.update({P_EVAL_READ, P_EVAL_WRITE})
        elif m == MODULE_ROBOTS:
            out.add(P_ROBOT_READ)
            if role_code not in (RoleCode.COLLECTOR.value, RoleCode.EVALUATOR.value):
                out.add(P_ROBOT_WRITE)
        elif m == MODULE_DEVICE_MODELS:
            out.add(P_DEVICE_MODEL_READ)
            if role_code not in (RoleCode.COLLECTOR.value, RoleCode.EVALUATOR.value):
                out.add(P_DEVICE_MODEL_WRITE)
        elif m == MODULE_PARTS:
            out.add(P_PART_READ)
            if role_code not in (RoleCode.COLLECTOR.value, RoleCode.EVALUATOR.value):
                out.add(P_PART_WRITE)
        elif m == MODULE_FAULT_RECORDS:
            out.add(P_FAULT_RECORD_READ)
            if role_code not in (RoleCode.COLLECTOR.value, RoleCode.EVALUATOR.value):
                out.add(P_FAULT_RECORD_WRITE)
        # api_docs：无后端 API 权限位
    return out


def normalize_modules(modules: Any) -> list[str]:
    if not isinstance(modules, list):
        return []
    return [str(x).strip() for x in modules if str(x).strip() in VALID_MODULES]


def resolve_role_modules_and_permissions(
    role_doc: Optional[dict[str, Any]],
    role_code: str,
) -> tuple[list[str], list[str]]:
    """
    返回 (modules UI 列表, 排序后的 perms 列表供写入 JWT)。
    若库中角色文档含 modules 列表（含空列表），则严格按模块展开，不再合并内置 ROLE_PERMISSIONS。
    若缺少 modules 字段，则退回内置 ROLE_PERMISSIONS，并用 DEFAULT_MODULES_BY_ROLE_CODE 填充 UI 模块。
    """
    code = role_code or ""
    if role_doc is not None and "modules" in role_doc:
        mods = normalize_modules(role_doc.get("modules"))
        perms = expand_modules_to_api_permissions(mods, role_code=code)
    else:
        perms = set(ROLE_PERMISSIONS.get(code, set()))
        mods = list(DEFAULT_MODULES_BY_ROLE_CODE.get(code, []))
    if code == RoleCode.ADMIN.value:
        perms.update({P_API_READ, P_API_WRITE})
    return mods, sorted(perms)


def role_has(role_code: Optional[str], permission: str) -> bool:
    """兼容旧 JWT（无 perms 字段）时按角色编码查内置表。"""
    if not role_code:
        return False
    perms = ROLE_PERMISSIONS.get(role_code, set())
    return permission in perms
