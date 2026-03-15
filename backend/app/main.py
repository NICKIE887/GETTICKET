import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import Base, engine
from .routers import attendance, auth, events, payments, tickets

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Event Ticketing API")

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

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(tickets.router)
app.include_router(payments.router)
app.include_router(attendance.router)


@app.get("/")
def root():
    return {"status": "ok"}