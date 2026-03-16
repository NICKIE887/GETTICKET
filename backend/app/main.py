import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .db import Base, engine
from .migrations import ensure_schema
from .routers import attendance, auth, events, payments, tickets, uploads
from .storage import get_upload_dir

Base.metadata.create_all(bind=engine)
ensure_schema(engine)

app = FastAPI(title="GETTICKET API")

origins = ["*"]
raw_origins = os.getenv("CORS_ORIGINS")
if raw_origins:
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_dir = get_upload_dir()
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(tickets.router)
app.include_router(payments.router)
app.include_router(attendance.router)
app.include_router(uploads.router)


@app.get("/")
def root():
    return {"status": "ok"}