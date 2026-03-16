import os
from pathlib import Path


def get_upload_dir() -> Path:
    env = os.getenv("UPLOAD_DIR")
    base = Path(env) if env else (Path(__file__).resolve().parent.parent / "uploads")
    base.mkdir(parents=True, exist_ok=True)
    return base