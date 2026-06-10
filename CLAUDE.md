# FairTatkal — Claude Code Project Brain

## What this is
Bot-proof Tatkal ticket booking queue system for Indian Railways.
Detects bots via behavioral fingerprinting (XGBoost), shows a live visual queue
where humans win and bots get pushed to the back.

Built for FAR AWAY 2026 hackathon — Railways theme.

## Stack
- Backend: FastAPI + Redis + SQLite + WebSocket
- ML: XGBoost (behavioral scoring)
- Frontend: React + Vite + Tailwind
- Bot simulator: Playwright (Python)
- Infra: Docker Compose (Redis only)

## Project structure
```
fairtatkal/
├── CLAUDE.md              ← you are here
├── docker-compose.yml     ← Redis only
├── backend/
│   ├── app/
│   │   ├── main.py        ← FastAPI app entry
│   │   ├── config.py      ← env config
│   │   ├── routers/
│   │   │   ├── queue.py   ← /queue/* routes
│   │   │   ├── session.py ← /session/score
│   │   │   └── admin.py   ← /admin/* routes
│   │   ├── models/
│   │   │   └── schemas.py ← Pydantic models
│   │   └── ml/
│   │       ├── train.py   ← generate data + train XGBoost
│   │       └── scorer.py  ← load model, score sessions
│   ├── tests/
│   │   └── test_api.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── MockIRCTC.jsx     ← fake booking UI
│   │   │   ├── LiveQueue.jsx     ← WebSocket queue visualizer
│   │   │   └── AdminDashboard.jsx
│   │   ├── hooks/
│   │   │   ├── useTelemetry.js   ← keystroke/mouse collector
│   │   │   └── useQueue.js       ← WebSocket hook
│   │   └── lib/
│   │       └── api.js
│   ├── package.json
│   └── vite.config.js
├── simulator/
│   ├── bot_sim.py         ← Playwright bot swarm
│   └── requirements.txt
└── scripts/
    └── demo_reset.sh      ← wipe Redis, reset for demo recording
```

## Running locally

```bash
# 1. Start Redis
docker compose up -d

# 2. Train ML model (first time only)
cd backend && pip install -r requirements.txt
python -m app.ml.train

# 3. Start backend
uvicorn app.main:app --reload --port 8000

# 4. Start frontend (new terminal)
cd frontend && npm install && npm run dev

# 5. Run bot simulator (new terminal, for demo)
cd simulator && pip install -r requirements.txt
python bot_sim.py --count 20 --delay 0.05
```

## Key URLs
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Admin dashboard: http://localhost:5173/admin

## Demo flow (for video recording)
1. Open http://localhost:5173 (booking UI) + /admin side by side
2. Run: python simulator/bot_sim.py --count 20
3. Show bots flooding queue, getting red scores, sliding to bottom
4. Open new tab → fill form slowly as human → green score, position #1
5. Switch to admin — show detection stats

## Claude Code rules
- Never break the WebSocket connection logic in main.py
- XGBoost model lives at backend/app/ml/model.pkl — never delete
- All env vars in backend/.env (copy from .env.example)
- Frontend proxies /api/* to :8000 via vite.config.js
