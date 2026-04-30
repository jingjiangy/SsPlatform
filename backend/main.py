from app.main import app  # noqa: F401 — re-export for uvicorn
from app.config import settings
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        workers=None if settings.reload else settings.workers,
    )
