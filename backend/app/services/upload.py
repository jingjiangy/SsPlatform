from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Optional, Set
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile

from app.config import settings

# 素材库仅 mp4；评测录入可 mp4/webm
ALLOWED_MATERIAL_VIDEO_EXT = {".mp4"}
ALLOWED_EVAL_VIDEO_EXT = {".mp4", ".webm"}
# 配件图片 jpg / png / jpeg（model_ss）
ALLOWED_PART_IMAGE_EXT = {".jpg", ".jpeg", ".png"}


def _build_upload_url(filename: str) -> str:
    relative = f"/static/uploads/{filename}"
    base = settings.upload_base_url.strip().rstrip("/")
    if not base:
        return relative
    return f"{base}{relative}"


def ensure_upload_dir() -> Path:
    p = Path(settings.upload_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def save_video_file(file: UploadFile, allowed_ext: Optional[Set[str]] = None) -> dict:
    allowed = allowed_ext or ALLOWED_EVAL_VIDEO_EXT
    if not file.filename:
        raise HTTPException(400, "未选择文件")
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"仅支持 {', '.join(sorted(allowed))}")
    ensure_upload_dir()
    name = f"{uuid.uuid4().hex}{ext}"
    dest = ensure_upload_dir() / name
    size = 0
    max_bytes = settings.max_video_mb * 1024 * 1024
    chunk = 1024 * 1024
    with dest.open("wb") as f:
        while True:
            data = await file.read(chunk)
            if not data:
                break
            size += len(data)
            if size > max_bytes:
                dest.unlink(missing_ok=True)
                raise HTTPException(400, f"文件超过 {settings.max_video_mb}MB")
            f.write(data)
    return {"video_url": _build_upload_url(name), "filename": name}


async def save_image_file(file: UploadFile, allowed_ext: Optional[Set[str]] = None) -> dict:
    allowed = allowed_ext or ALLOWED_PART_IMAGE_EXT
    if not file.filename:
        raise HTTPException(400, "未选择文件")
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"仅支持 {', '.join(sorted(allowed))}")
    ensure_upload_dir()
    name = f"{uuid.uuid4().hex}{ext}"
    dest = ensure_upload_dir() / name
    size = 0
    max_bytes = settings.max_image_mb * 1024 * 1024
    chunk = 1024 * 1024
    with dest.open("wb") as f:
        while True:
            data = await file.read(chunk)
            if not data:
                break
            size += len(data)
            if size > max_bytes:
                dest.unlink(missing_ok=True)
                raise HTTPException(400, f"图片超过 {settings.max_image_mb}MB")
            f.write(data)
    return {"image_url": _build_upload_url(name), "filename": name}


_STATIC_UPLOAD_PREFIX = "/static/uploads/"


def _upload_basename_from_url(url: str) -> Optional[str]:
    """从站内或绝对 URL 中解析出 uploads 目录下的文件名；无法识别则返回 None。"""
    s = url.strip()
    if not s or s.lower().startswith("blob:"):
        return None
    path = s
    if s.startswith(("http://", "https://")):
        path = urlparse(s).path or ""
    path = path.split("?", 1)[0].split("#", 1)[0]
    name: Optional[str] = None
    if _STATIC_UPLOAD_PREFIX in path:
        idx = path.index(_STATIC_UPLOAD_PREFIX) + len(_STATIC_UPLOAD_PREFIX)
        name = path[idx:].lstrip("/").split("/")[0] or None
    elif path.startswith("static/uploads/"):
        name = path[len("static/uploads/"):].split("/")[0] or None
    if not name or name in (".", ".."):
        return None
    if "/" in name or "\\" in name or ".." in name:
        return None
    return name


def delete_local_upload_file(url: Optional[str]) -> None:
    """删除本服务 `save_video_file` 写入的上传文件；外链或非 /static/uploads/ 路径则忽略。"""
    if not isinstance(url, str):
        return
    name = _upload_basename_from_url(url)
    if not name:
        return
    base = ensure_upload_dir().resolve()
    target = (base / name).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return
    if target.is_file():
        try:
            target.unlink()
        except OSError:
            pass


def delete_local_upload_media_fields(doc: dict[str, Any]) -> None:
    """删除文档中与本地存储相关的 video_url / cover_url / image_url 文件。"""
    delete_local_upload_file(doc.get("video_url"))
    delete_local_upload_file(doc.get("cover_url"))
    delete_local_upload_file(doc.get("image_url"))
