# FairTatkal

**Behavioral bot detection and fair-access queue for Indian Railways Tatkal booking.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![XGBoost](https://img.shields.io/badge/XGBoost-AUC_0.961-F7931E?style=flat-square)](https://xgboost.readthedocs.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## The Problem

Indian Railways blocked **60 billion bot requests** in six months (Jul–Dec 2025).  
**92,877 genuine passengers** lost confirmed Tatkal tickets every single day in FY 2025–26.

Automated scripts drain Tatkal quotas in seconds. Real passengers are left with waitlisted tickets while bots hoard seats for resellers. IRCTC's primary defense is CAPTCHA — which modern bots solve in under 200ms.

---

## How FairTatkal Works

FairTatkal runs a **behavioral fingerprinting layer** that analyzes *how* a user interacts with the booking form — keystroke cadence, mouse trajectory, field timing, and more — rather than asking them to solve a puzzle.

```
Bot:   8 fields filled in 40ms · zero mouse movement · instant tab jumps → score  12/100
Human: natural typing · organic mouse path · hesitation on unfamiliar fields → score  87/100
```

Every session gets a continuous human-likelihood score. The booking queue is a Redis sorted set keyed on that score — **humans hold the front, bots are pushed to the back in real time.**

---

## Architecture

```
Browser (React)
  ├── Tatkal booking UI  (mock IRCTC form)
  ├── Silent telemetry hook  (keystroke intervals, mouse entropy, form timing)
  └── Live queue panel  (WebSocket — score + position update every 3 s)
         ↕  WebSocket  /ws
FastAPI Backend
  ├── POST /session/score    behavioral scoring (XGBoost inference, ~0.003 ms)
  ├── POST /queue/join       session registration + UA pre-filter
  ├── GET  /queue/status     position lookup
  ├── WS   /ws               real-time queue broadcast
  └── POST /admin/reset      operations endpoint
         ↕  async Redis calls
Redis  (sorted set for queue · session hashes · counters)
XGBoost model  (10 features · trained on 10,000 synthetic sessions)
```

---

## Behavioral Features

| Feature | Bot signature | Human signature |
|---|---|---|
| Keystroke interval variance | < 10 ms | 150–300 ms |
| Mouse movement count | 0–3 | 40–400+ |
| Mouse entropy (direction spread) | ~0.01 | ~1.8 |
| Field fill duration | 15–50 ms | 1,500–2,500 ms |
| Instant fills (< 80 ms) | 4–8 | 0–1 |
| Time on page | 0.5–3 s | 30–120 s |
| WebDriver flag | Often `true` | `false` |

The model includes an **adversarial bot class** — bots with randomized delays and simulated mouse jitter — to prevent simple evasion. AUC-ROC on the hold-out test set: **0.961**. False positive rate (humans flagged): **< 3%**.

Scoring is gated: the system waits for `≥ 3 keystroke intervals` or `≥ 15 mouse events + 15 s on page` before emitting a score, so a fresh page load never penalizes a real user.

---

## Quick Start

**Prerequisites:** Python 3.11+, Node 18+, Docker

```bash
git clone https://github.com/thulasiramk-2310/FAIRTATKAL.git
cd FAIRTATKAL

# 1. Start Redis
docker compose up -d

# 2. Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env — generate SECRET_KEY and ADMIN_KEY per the comments inside

# 3. Train the ML model (one time)
cd backend
pip install -r requirements.txt
python -m app.ml.train

# 4. Start backend
uvicorn app.main:app --reload --port 8000

# 5. Start frontend
cd ../frontend
npm install && npm run dev
```

| URL | Purpose |
|---|---|
| http://localhost:5173 | Booking UI + live queue |
| http://localhost:5173/admin | Admin dashboard |
| http://localhost:8000/docs | Interactive API docs |

---

## Bot Simulator

A Playwright-based bot swarm ships with the project for load testing and demo use.

```bash
cd simulator
pip install -r requirements.txt

# Launch 20 concurrent bots
python bot_sim.py --count 20

# Tune aggression (seconds between requests)
python bot_sim.py --count 50 --delay 0.02
```

Bots fill all form fields programmatically in under 50 ms, producing feature vectors far outside human distributions. Watch them score red and sink to queue bottom in real time on the admin dashboard.

Reset between runs:

```bash
./scripts/demo_reset.sh   # flushes Redis, clears session state
```

---

## Running Tests

```bash
cd backend
pytest tests/ -v
```

All tests use mocked Redis (no live infrastructure required). The test suite covers health check, queue join (with browser UA validation), and admin reset authentication.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI, Uvicorn, Pydantic v2 |
| Queue store | Redis (sorted sets + hashes) |
| ML model | XGBoost, scikit-learn, NumPy |
| Real-time | WebSocket (Starlette) |
| Frontend | React 18, Vite, Tailwind CSS |
| Bot simulator | Playwright (Python) |
| Infrastructure | Docker Compose (Redis) |

---

## Security Notes

- `.env` is gitignored. Never commit real secrets.
- The `/admin/reset` endpoint requires an `X-Admin-Key` header.
- User-Agent pre-filtering blocks headless-browser and scripted HTTP clients at the join endpoint before ML scoring runs.
- All environment variables are validated at startup with warnings for insecure defaults.

---

## Roadmap

- [ ] Device fingerprinting (canvas hash, WebGL renderer, font enumeration)
- [ ] Federated model updates across zones — improves detection without centralising raw behavioral data
- [ ] Aadhaar OTP escalation for sessions with human score < 40
- [ ] Real-time demand forecasting to resize queue slots dynamically
- [ ] Public SDK for third-party Indian railway booking platforms

---

## License

MIT — see [LICENSE](LICENSE).

---

> "The queue is finally fair."
