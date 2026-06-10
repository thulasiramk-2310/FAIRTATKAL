from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.security import APIKeyHeader

from ..config import settings

_admin_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=False)


def _require_admin(key: str = Depends(_admin_key_header)):
    if not key or key != settings.admin_key:
        raise HTTPException(status_code=401, detail="Unauthorized")


router = APIRouter(dependencies=[Depends(_require_admin)])


@router.get("/stats")
async def get_stats(request: Request):
    r = request.app.state.redis
    members = await r.zrevrange("queue:sessions", 0, -1, withscores=True)

    sessions = []
    for sid, score in members:
        raw = await r.hgetall(f"session:{sid}")
        if raw:
            sessions.append({
                "session_id": sid,
                "human_score": float(raw.get("human_score", 50)),
                "is_bot": raw.get("is_bot", "0") == "1",
                "label": raw.get("label", "unknown"),
            })

    total = len(sessions)
    humans = sum(1 for s in sessions if s["label"] == "human")
    bots = sum(1 for s in sessions if s["label"] == "bot")
    blocked = int(await r.get("stats:bots_blocked") or 0)

    return {
        "total_sessions": total,
        "human_count": humans,
        "bot_count": bots,
        "bots_blocked_all_time": blocked,
        "detection_rate": round(bots / max(total, 1) * 100, 1),
        "sessions": sessions,
    }


@router.post("/reset")
async def reset_queue(request: Request):
    r = request.app.state.redis
    keys = await r.keys("session:*")
    if keys:
        await r.delete(*keys)
    await r.delete("queue:sessions")
    await r.delete("stats:bots_blocked")
    return {"status": "reset", "message": "Queue cleared successfully"}
