from sqlalchemy import text
from .storage import get_upload_dir


def ensure_schema(engine):
    if engine.url.get_backend_name() != "sqlite":
        return

    with engine.connect() as conn:
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table';")).fetchall()}

        if "events" in tables:
            columns = {row[1] for row in conn.execute(text("PRAGMA table_info('events')")).fetchall()}
            if "image_url" not in columns:
                conn.execute(text("ALTER TABLE events ADD COLUMN image_url VARCHAR(500)"))

        if "tickets" in tables:
            columns = {row[1] for row in conn.execute(text("PRAGMA table_info('tickets')")).fetchall()}
            if "contact_phone" not in columns:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN contact_phone VARCHAR(20)"))
            if "contact_email" not in columns:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN contact_email VARCHAR(255)"))

    get_upload_dir()