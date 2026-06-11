import time
from fastapi import APIRouter, Request, HTTPException

from ..models.schemas import TelemetryPayload, ScoreResponse
from ..ml.scorer import score_session as _score
from ..limiter import limiter

router = APIRouter()


@router.post("/score", response_model=ScoreResponse)
@limiter.limit("120/minute")
async def score_session_endpoint(payload: TelemetryPayload, request: Request):
    r = request.app.state.redis
    sid = payload.session_id

    # Reject score updates for sessions that never joined the queue — prevents
    # a bot submitting human telemetry under an arbitrary victim session ID.
    existing = await r.hgetall(f"session:{sid}")
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found — join the queue first")

    result = _score(payload)

    await r.hset(f"session:{sid}", mapping={
        "human_score": result.human_score,
        "is_bot": "1" if result.is_bot else "0",
        "label": result.label,
        "last_scored_at": time.time(),
        "ml_scored": "1",
    })
    await r.expire(f"session:{sid}", 300)

    # Higher human_score = higher rank (humans first)
    await r.zadd("queue:sessions", {sid: result.human_score})

    if result.is_bot:
        await r.incr("stats:bots_blocked")

    return result
