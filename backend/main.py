from app.main import app  # noqa: F401 — re-export for uvicorn
from app.config import settings
import uvicorn

if __name__ == "__main__":
    ssl_kwargs = {}
    if settings.ssl_keyfile and settings.ssl_certfile:
        ssl_kwargs = {
            "ssl_keyfile": settings.ssl_keyfile,
            "ssl_certfile": settings.ssl_certfile,
        }
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        workers=None if settings.reload else settings.workers,
        **ssl_kwargs,
    )
