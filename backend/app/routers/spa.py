"""SPA fallback 路由：生产模式下托管前端 dist/。"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

_dist = Path(__file__).parent.parent.parent.parent / "frontend" / "dist"

# assets/ 下的文件名含 hash，内容不变则文件名不变，可长期缓存
_IMMUTABLE = "public, max-age=31536000, immutable"
# index.html 不含 hash，每次都需要重新验证
_NO_CACHE = "no-cache"

router = APIRouter(include_in_schema=False)


@router.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    target = _dist / full_path
    if target.is_file():
        cache = _IMMUTABLE if full_path.startswith("assets/") else _NO_CACHE
        return FileResponse(str(target), headers={"Cache-Control": cache})
    return FileResponse(str(_dist / "index.html"), headers={"Cache-Control": _NO_CACHE})
