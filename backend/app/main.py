from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.database import close_db, connect_db
from app.json_datetime import install_beijing_datetime_json_encoder
from app.logger import setup_logging
from app.routers import register_routers
from app.startup import run_all_migrations


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await connect_db()
    await run_all_migrations()
    yield
    await close_db()


app = FastAPI(title="模型评估平台 API", lifespan=lifespan)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    logger.info("{} {} {} {:.0f}ms", request.method, request.url.path, response.status_code, ms)
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_routers(app)
install_beijing_datetime_json_encoder()
