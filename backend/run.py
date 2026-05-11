from __future__ import annotations

import socket
import subprocess
import uvicorn
from pathlib import Path

from app.config import settings
from app.main import app  # noqa: F401


def _get_certs() -> tuple[str, str]:
    cert_dir = Path(__file__).parent.parent / "certs"
    key = cert_dir / "server-key.pem"
    cert = cert_dir / "server-cert.pem"
    if not (key.exists() and cert.exists()):
        cert_dir.mkdir(exist_ok=True)
        subprocess.run(
            [
                "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                "-keyout", str(key), "-out", str(cert),
                "-days", "3650", "-subj", "/CN=localhost",
                "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
            ],
            check=True, capture_output=True,
        )
    return str(key), str(cert)


def _lan_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return None


if __name__ == "__main__":
    key, cert = _get_certs()
    lan = _lan_ip()

    print(f"\n{'='*54}")
    print(f"  本机     https://127.0.0.1:{settings.port}/login")
    if lan:
        print(f"  局域网   https://{lan}:{settings.port}/login")
    print(f"{'='*54}\n")

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        workers=settings.workers,
        log_config=None,
        access_log=False,
        ssl_keyfile=key,
        ssl_certfile=cert,
    )
