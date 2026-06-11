"""
FairTatkal — FastAPI entry point.
Manages WebSocket connections and broadcasts queue updates.
"""
import asyncio
import json
import time
import sqlite3
from contextlib import asynccontextmanager
from typing import Any
import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import settings
from .limiter import limiter
from .routers import queue, session, admin


# ── WebSocket connection manager ─────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active = [c for c in self.active if c is not ws]

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    conn = sqlite3.connect(settings.db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            human_score REAL,
            is_bot INTEGER,
            label TEXT,
            joined_at REAL,
            last_scored_at REAL
        )
    """)
    conn.commit()
    conn.close()
    app.state.manager = manager
    task = asyncio.create_task(broadcast_loop(app))
    yield
    task.cancel()
    await app.state.redis.aclose()


async def broadcast_loop(app: FastAPI):
    """Push queue state to all WS clients every second."""
    while True:
        try:
            r = app.state.redis
            mgr = app.state.manager
            members = await r.zrevrange("queue:sessions", 0, -1, withscores=True)
            queue_data = []
            stale = []
            for sid, score in members:
                raw = await r.hgetall(f"session:{sid}")
                if not raw:
                    stale.append(sid)
                    continue
                queue_data.append({
                    "session_id": sid,
                    "human_score": float(raw.get("human_score", 50)),
                    "is_bot": raw.get("is_bot", "0") == "1",
                    "label": raw.get("label", "unknown"),
                    "position": len(queue_data) + 1,
                    "joined_at": float(raw.get("joined_at", 0)),
                })
            if stale:
                await r.zrem("queue:sessions", *stale)
            total = len(queue_data)
            humans = sum(1 for q in queue_data if q["label"] == "human")
            bots = sum(1 for q in queue_data if q["label"] == "bot")
            blocked = int(await r.get("stats:bots_blocked") or 0)
            human_scores = [q["human_score"] for q in queue_data if not q["is_bot"]]
            bot_scores = [q["human_score"] for q in queue_data if q["is_bot"]]
            stats = {
                "total_sessions": total,
                "human_count": humans,
                "bot_count": bots,
                "unknown_count": total - humans - bots,
                "detection_rate": round(bots / max(total, 1) * 100, 1),
                "bots_blocked_this_session": blocked,
                "avg_human_score": round(sum(human_scores) / max(len(human_scores), 1), 1),
                "avg_bot_score": round(sum(bot_scores) / max(len(bot_scores), 1), 1),
            }
            await mgr.broadcast({
                "type": "queue_update",
                "queue": queue_data,
                "stats": stats,
                "ts": time.time(),
            })
        except Exception:
            pass
        await asyncio.sleep(1)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="FairTatkal API",
    description="Bot-proof Tatkal booking queue system",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response


app.include_router(session.router, prefix="/session", tags=["session"])
app.include_router(queue.router,   prefix="/queue",   tags=["queue"])
app.include_router(admin.router,   prefix="/admin",   tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "FairTatkal"}


@app.websocket("/ws/queue")
async def ws_queue(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
