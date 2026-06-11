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

    # If already in queue, return current position without resetting
    existing = await r.hgetall(f"session:{sid}")
    if existing:
        rank = await r.zrevrank("queue:sessions", sid)
        position = (rank or 0) + 1
        total = await r.zcard("queue:sessions")
        return {"session_id": sid, "position": position, "total_in_queue": total}

    ua = request.headers.get("user-agent", "")
    is_bot_agent = _is_bot_ua(ua)
    # Bot UAs go to back (score 0); unscored browsers start at 50 (pending ML)
    initial_score = 0.0 if is_bot_agent else 50.0

    await r.hset(f"session:{sid}", mapping={
        "human_score": initial_score,
        "is_bot": "1" if is_bot_agent else "0",
        "label": "bot" if is_bot_agent else "unknown",
        "joined_at": time.time(),
        "last_scored_at": time.time(),
    })
    await r.expire(f"session:{sid}", 300)
    await r.zadd("queue:sessions", {sid: initial_score})

    if is_bot_agent:
        await r.incr("stats:bots_detected")

    rank = await r.zrevrank("queue:sessions", sid)
    position = (rank or 0) + 1
    total = await r.zcard("queue:sessions")

    return {"session_id": sid, "position": position, "total_in_queue": total}


@router.post("/book")
@limiter.limit("10/minute")
async def book_ticket(body: JoinQueueRequest, request: Request):
    """Humans book freely. Bots wait until no humans (score >= 50) remain."""
    r = request.app.state.redis
    sid = body.session_id
    raw = await r.hgetall(f"session:{sid}")
    if not raw:
        raise HTTPException(status_code=404, detail="Session not found")

    score = float(raw.get("human_score", 0))
    label = raw.get("label", "unknown")

    if score < 50:
        # Bot session — only allowed once all humans have booked
        human_count = int(await r.zcount("queue:sessions", 50, "+inf"))
        if human_count > 0:
            await r.incr("stats:bots_blocked")
            raise HTTPException(
                status_code=403,
                detail=f"Bots go to the back — {human_count} human(s) still in queue.",
            )

    # Booking approved — remove from queue so human_count drops for waiting bots
    await r.zrem("queue:sessions", sid)

    return {
        "session_id": sid,
        "approved": True,
        "human_score": score,
        "label": label,
        "position": 0,
    }


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
