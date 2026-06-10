import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


def make_mock_redis():
    r = AsyncMock()
    r.zrevrange.return_value = []
    r.hgetall.return_value = {}
    r.zrevrank.return_value = 0
    r.zcard.return_value = 1
    r.get.return_value = "0"
    r.hset.return_value = True
    r.expire.return_value = True
    r.zadd.return_value = True
    r.incr.return_value = 1
    r.keys.return_value = []
    r.delete.return_value = 1
    return r


@pytest.fixture
def mock_redis():
    return make_mock_redis()


@pytest.mark.asyncio
async def test_health():
    from app.main import app
    app.state.redis = make_mock_redis()
    app.state.manager = MagicMock()
    app.state.manager.broadcast = AsyncMock()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_join_queue():
    from app.main import app
    r = make_mock_redis()
    app.state.redis = r
    app.state.manager = MagicMock()
    app.state.manager.broadcast = AsyncMock()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # httpx's default UA is "python-httpx/..." which the join endpoint
        # correctly blocks as a bot — send a browser UA to test the happy path.
        resp = await client.post(
            "/queue/join",
            json={"session_id": "test_session_1"},
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == "test_session_1"
    assert "position" in data


@pytest.mark.asyncio
async def test_admin_reset():
    from app.main import app
    app.state.redis = make_mock_redis()
    app.state.manager = MagicMock()
    app.state.manager.broadcast = AsyncMock()

    from app.config import settings

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/admin/reset", headers={"X-Admin-Key": settings.admin_key})
    assert resp.status_code == 200
    assert resp.json()["status"] == "reset"
