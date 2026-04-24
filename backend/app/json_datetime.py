"""将 FastAPI JSON 响应中的 datetime 序列化为北京时间字符串（见 app.models.common.datetime_to_beijing_api_str）。"""

from __future__ import annotations

import datetime as dt

import fastapi.encoders as fe

from app.models.common import datetime_to_beijing_api_str


def install_beijing_datetime_json_encoder() -> None:
    fe.ENCODERS_BY_TYPE[dt.datetime] = datetime_to_beijing_api_str
    fe.encoders_by_class_tuples = fe.generate_encoders_by_class_tuples(fe.ENCODERS_BY_TYPE)
