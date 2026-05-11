"""统一注册所有路由，供 main.py 一次性挂载。"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import (
    apis,
    auth,
    device_models,
    evaluations,
    health,
    materials,
    robots,
    roles,
    users,
)

_API_PREFIX = "/api"
_dist = Path(__file__).parent.parent.parent.parent / "frontend" / "dist"


def register_routers(app: FastAPI) -> None:
    """将所有路由和静态文件挂载到 app 实例。"""
    # 上传文件静态目录
    upload_path = Path(settings.upload_dir)
    upload_path.mkdir(parents=True, exist_ok=True)
    app.mount("/static/uploads", StaticFiles(directory=str(upload_path)), name="uploads")

    # API 路由
    app.include_router(auth.router, prefix=_API_PREFIX)
    app.include_router(users.router, prefix=_API_PREFIX)
    app.include_router(roles.router, prefix=_API_PREFIX)
    app.include_router(apis.router, prefix=_API_PREFIX)
    app.include_router(materials.router, prefix=_API_PREFIX)
    app.include_router(evaluations.router, prefix=_API_PREFIX)
    app.include_router(robots.router, prefix=_API_PREFIX)
    app.include_router(device_models.router, prefix=_API_PREFIX)
    app.include_router(health.router, prefix=_API_PREFIX)

    # SPA 静态资源 + fallback（仅生产构建存在时注册）
    if _dist.is_dir():
        assets_path = _dist / "assets"
        if assets_path.is_dir():
            app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")
        from app.routers.spa import router as spa_router
        app.include_router(spa_router)
