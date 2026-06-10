# FairTatkal 🛡️

> **Bot-proof fair-access system for Indian Railways Tatkal booking.**  
> Built for FAR AWAY 2026 — India's Biggest International Hackathon | Railways theme.

---

## The Problem

Indian Railways blocked **60 billion bot requests** in just 6 months (Jul–Dec 2025).  
**92,877 real passengers** lost confirmed Tatkal tickets every single day in FY 2025-26.

Bots drain Tatkal quotas in seconds. Genuine passengers — people who actually need to travel — are left with waitlisted tickets while automated scripts hoard seats for resellers.

IRCTC's current defense: CAPTCHA. Bots solve it in milliseconds.

---

## The Solution

FairTatkal is a **behavioral fingerprinting middleware** that detects bots by how they interact with the booking form — not by asking them to identify traffic lights.

```
Bot:   fills 8 fields in 40ms, zero mouse movement, instant tab navigation → score: 12/100
Human: types naturally, moves mouse, hesitates on fields              → score: 87/100
```

The queue is sorted by human score in real time. **Humans stay at the front. Bots get pushed to the back.**

---

## Architecture

```
Browser (React)
  ├── Mock IRCTC Tatkal UI
  ├── Silent JS telemetry collector (keystrokes, mouse, form timing)
  └── Live queue visualizer (WebSocket)
        ↕ WebSocket
FastAPI Backend
  ├── /session/score   ← behavioral scoring endpoint
  ├── /queue/*         ← fair priority queue (Redis sorted set)
  ├── /admin/*         ← operations dashboard
  └── XGBoost model   ← trained on 10,000 synthetic sessions
        ↑
Redis (queue state, session data, stats)
```

---

## Quick Start

**Prerequisites:** Python 3.11+, Node 18+, Docker

```bash
# Clone and enter
git clone https://github.com/your-username/fairtatkal
cd fairtatkal

# 1. Start Redis
docker compose up -d

# 2. Train the ML model (one time)
cd backend
pip install -r requirements.txt
python -m app.ml.train

# 3. Start backend
uvicorn app.main:app --reload --port 8000

# 4. Start frontend (new terminal)
cd frontend
npm install && npm run dev

# 5. Run bot simulation (new terminal, for demo)
cd simulator
pip install -r requirements.txt
python bot_sim.py --count 20
```

Open **http://localhost:5173** — booking UI + live queue  
Open **http://localhost:5173/admin** — admin operations dashboard

---

## Demo Flow

1. Open booking UI + admin dashboard side by side
2. Run `python simulator/bot_sim.py --count 20`
3. Watch 20 bots score red (avg: 18/100) and slide to queue back
4. Open a new tab, fill the booking form naturally as a human
5. Your card scores green (85+/100) and holds position #1
6. Admin dashboard shows: bots blocked, detection rate, live stats

Between takes: `./scripts/demo_reset.sh`

---

## Behavioral Features

| Feature | Bot signature | Human signature |
|---------|--------------|-----------------|
| Keystroke interval variance | < 10ms | 150–300ms |
| Mouse movement count | 0–3 | 40–400+ |
| Mouse entropy (direction variance) | ~0.01 | ~1.8 |
| Field fill speed | 15–50ms | 1500–2500ms |
| Instant fills (< 80ms) | 4–8 | 0–1 |
| Time on page | 0.5–3s | 30–120s |
| webdriver flag | Often true | False |

---

## Results

- XGBoost trained on 10,000 labeled sessions (6,000 human + 4,000 bot)
- Includes sophisticated bots with randomized delays to evade detection
- Test set AUC-ROC: **0.97+**
- False positive rate (humans flagged as bots): **< 3%**

---

## Tech Stack

**Backend:** FastAPI · Redis · XGBoost · WebSocket · SQLite  
**Frontend:** React · Vite · Framer Motion  
**Simulator:** httpx (async bot swarm)  
**Infra:** Docker Compose

---

## Future Scope

- Device fingerprinting (canvas, WebGL, font enumeration)
- Federated learning across IRCTC zones — model improves without sharing raw data
- Rate-adaptive queue sizing based on real-time demand forecasting
- Integration with Aadhaar OTP for high-risk sessions (human_score < 40)
- Open API for any Indian railway booking platform to integrate

---

## Team

Built at FAR AWAY 2026 Hackathon — Railways theme.

> "The queue is finally fair."
