import time
from fastapi import APIRouter, Request, HTTPException

from ..models.schemas import JoinQueueRequest
from ..limiter import limiter

router = APIRouter()

_BOT_UA_PATTERNS = [
    "python-requests", "python-httpx", "go-http-client", "curl/",
    "okhttp", "axios/", "node-fetch", "scrapy", "bot-tatkal", "httpx/",
    "java/", "apache-httpclient", "wget/", "libwww-perl",
]


def _is_bot_ua(ua: str) -> bool:
    ua_lower = ua.lower()
    return any(p in ua_lower for p in _BOT_UA_PATTERNS)


@router.post("/join")
@limiter.limit("60/minute")
async def join_queue(body: JoinQueueRequest, request: Request):
    r = request.app.state.redis
    sid = body.session_id

    # Block sessions already scored as strong bots (re-join after low ML score)
    existing = await r.hgetall(f"session:{sid}")
    if existing:
        stored_score = float(existing.get("human_score", 50))
        if stored_score < 30:
            raise HTTPException(
                status_code=429,
                detail="Access denied — automated request detected",
            )

    ua = request.headers.get("user-agent", "")
    initial_score = 0.0 if _is_bot_ua(ua) else 50.0
    is_bot = initial_score < 30

    await r.hset(f"session:{sid}", mapping={
        "human_score": initial_score,
        "is_bot": "1" if is_bot else "0",
        "label": "bot" if is_bot else "unknown",
        "joined_at": time.time(),
        "last_scored_at": time.time(),
    })
    await r.expire(f"session:{sid}", 300)
    await r.zadd("queue:sessions", {sid: initial_score})

    if is_bot:
        await r.incr("stats:bots_blocked")
        raise HTTPException(
            status_code=429,
            detail="Access denied — automated request detected",
        )

    rank = await r.zrevrank("queue:sessions", sid)
    position = (rank or 0) + 1
    total = await r.zcard("queue:sessions")

    return {"session_id": sid, "position": position, "total_in_queue": total}


@router.get("/status/{session_id}")
async def queue_status(session_id: str, request: Request):
    r = request.app.state.redis
    raw = await r.hgetall(f"session:{session_id}")
    if not raw:
        return {"error": "Session not found", "human_score": 50, "label": "unknown"}

    rank = await r.zrevrank("queue:sessions", session_id)
    position = (rank or 0) + 1
    total = await r.zcard("queue:sessions")

    return {
        "session_id": session_id,
        "position": position,
        "total_in_queue": total,
        "human_score": float(raw.get("human_score", 50)),
        "label": raw.get("label", "unknown"),
        "is_bot": raw.get("is_bot", "0") == "1",
    }
