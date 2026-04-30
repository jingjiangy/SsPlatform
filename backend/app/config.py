from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 数据库
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "model_eval"

    # 认证
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # 文件上传
    upload_dir: str = "uploads"
    upload_base_url: str = ""
    max_video_mb: int = 1000
    max_image_mb: int = 100

    # 服务器
    host: str = "0.0.0.0"
    port: int = 8077
    reload: bool = False
    workers: int = 4


settings = Settings()
