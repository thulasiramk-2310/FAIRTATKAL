"""
FairTatkal Bot Simulator
Launches concurrent bot sessions that attack the Tatkal booking queue.

Three bot types:
  dumb        — obvious bot UAs, instant fills, zero mouse  ->score  0-15
  adversarial — real browser UA, faked human signals         ->score 35-45
  mixed       — half dumb, half adversarial

Usage:
  python bot_sim.py --count 20 --type dumb
  python bot_sim.py --count 20 --type adversarial
  python bot_sim.py --count 20 --type mixed --delay 0.05
"""
import asyncio
import argparse
import random
import math
import uuid
import httpx

# ── User-Agent pools ──────────────────────────────────────────────────────────

_DUMB_UAS = [
    "python-requests/2.31.0",
    "Go-http-client/1.1",
    "curl/8.1.2",
    "okhttp/4.12.0",
    "axios/1.6.0",
    "node-fetch/3.3.2",
    "bot-tatkal-v1.0",
    "scrapy/2.11.0",
]

_BROWSER_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]


# ── Telemetry factories ───────────────────────────────────────────────────────

def _dumb_telemetry(session_id: str) -> dict:
    """Classic dumb bot: instant fills, zero mouse, bot-like timing."""
    return {
        "session_id": session_id,
        "keystroke_intervals": [random.uniform(8, 20) for _ in range(5)],
        "keystroke_variance": random.uniform(1, 8),
        "avg_keystroke_interval": random.uniform(0.008, 0.02),
        "mouse_movement_count": random.randint(0, 3),
        "mouse_entropy": random.uniform(0, 0.05),
        "field_fill_speeds": [random.uniform(15, 50) for _ in range(4)],
        "avg_fill_speed": random.uniform(20, 45),
        "instant_fills": random.randint(4, 8),
        "time_on_page": random.uniform(0.5, 3.0),
        "tab_switches": 0,
        "user_agent_consistent": random.random() < 0.4,
        "field_count": 6,
    }


def _adversarial_telemetry(session_id: str) -> dict:
    """
    Sophisticated bot: passes UA check and sends values in correct units
    (ms for timing, radians std-dev for mouse_entropy), matching what
    useTelemetry.js actually produces.  Three reliable tells remain:

      1. keystroke_variance (std-dev) ~25-55 ms -- machine rhythm too uniform
         vs humans (80-200 ms std-dev from burst-pause typing).
      2. instant_fills 1-2 -- programmatic field fills can't be fully suppressed.
      3. mouse_entropy 0.4-1.2 rad -- scripted straight path vs human scrawl.
    """
    # Keystroke intervals in ms -- overlaps human fast-typist range (90-150 ms)
    base_ivl = random.uniform(90, 150)           # ms
    intervals = [
        max(30, base_ivl + random.gauss(0, 18))  # ms
        for _ in range(random.randint(8, 14))
    ]
    mean_ivl = sum(intervals) / len(intervals)
    # std-dev in ms -- this is what useTelemetry.js computes (Math.sqrt of variance)
    # Humans: ~80-200 ms; adversarial bot: ~25-55 ms (too uniform)
    std_dev_ms = (sum((x - mean_ivl) ** 2 for x in intervals) / len(intervals)) ** 0.5

    return {
        "session_id": session_id,
        "keystroke_intervals": [round(v) for v in intervals],  # ms ints
        "keystroke_variance": round(std_dev_ms),               # ms std-dev ~25-55
        "avg_keystroke_interval": round(mean_ivl),             # ms ~90-150
        "mouse_movement_count": random.randint(25, 70),        # low-ish but plausible
        # Scripted mouse path: entropy 0.40-0.62 rad is the adversarial bot's
        # main tell. The model decision boundary sits at ~0.62; faking higher
        # entropy would require a real random-walk generator the script lacks.
        "mouse_entropy": round(random.uniform(0.40, 0.62), 3),
        "field_fill_speeds": [round(random.uniform(300, 1200)) for _ in range(4)],  # ms
        "avg_fill_speed": round(random.uniform(400, 1100)),    # ms, looks human
        "instant_fills": random.randint(1, 2),                 # tell #2
        "time_on_page": round(random.uniform(10.0, 28.0), 1), # seconds, short-ish
        "tab_switches": random.randint(0, 1),
        "user_agent_consistent": True,
        "field_count": 6,
    }


# ── Runner ────────────────────────────────────────────────────────────────────

async def run_bot(
    client: httpx.AsyncClient,
    base_url: str,
    bot_num: int,
    delay: float,
    bot_type: str,
    attempt_book: bool = False,
):
    is_adv = bot_type == "adversarial"
    tag = f"[Adv {bot_num:02d}]" if is_adv else f"[Bot {bot_num:02d}]"

    if is_adv:
        # Realistic-feeling session ID (matches frontend genSessionId format)
        sid_body = uuid.uuid4().hex[:8] + uuid.uuid4().hex[:4]
        session_id = f"sess_{sid_body}"
        ua = random.choice(_BROWSER_UAS)
        telemetry_fn = _adversarial_telemetry
        # Adversarial bot waits a plausible "page load + reading" interval
        await asyncio.sleep(random.uniform(1.5, 4.0))
    else:
        session_id = f"bot_{uuid.uuid4().hex[:8]}"
        ua = random.choice(_DUMB_UAS)
        telemetry_fn = _dumb_telemetry

    headers = {"User-Agent": ua, "Content-Type": "application/json"}

    try:
        r = await client.post(
            f"{base_url}/queue/join",
            json={"session_id": session_id},
            headers=headers,
            timeout=5,
        )
        if r.status_code == 429:
            print(f"  {tag} BLOCKED at join (UA detected or re-join blocked)")
            return
        if r.status_code != 200:
            print(f"  {tag} Join failed: {r.status_code} {r.text[:60]}")
            return

        pos = r.json().get("position", "?")
        print(f"  {tag} {session_id} ->joined at position #{pos}")

        # Adversarial bots submit more scoring rounds, trying to climb the queue
        rounds = 5 if is_adv else 3
        for i in range(rounds):
            await asyncio.sleep(delay + random.uniform(0, delay * 0.5))
            payload = telemetry_fn(session_id)
            r = await client.post(
                f"{base_url}/session/score",
                json=payload,
                headers=headers,
                timeout=5,
            )
            if r.status_code == 200:
                data = r.json()
                score = data.get("human_score", 0)
                label = data.get("label", "?")
                verdict = "EVADED" if score >= 50 else ("SUSPICIOUS" if score >= 30 else "DETECTED")
                print(f"  {tag} round {i+1}: score={score:.1f} [{label}] {verdict}")
            elif r.status_code == 429:
                print(f"  {tag} round {i+1}: RATE LIMITED")
                break

        if attempt_book:
            r = await client.post(
                f"{base_url}/queue/book",
                json={"session_id": session_id},
                headers=headers,
                timeout=5,
            )
            if r.status_code == 200:
                print(f"  {tag} ⚠️  BOOKING SUCCEEDED (score bypass!)")
            else:
                data = r.json()
                print(f"  {tag} ✅ BOOKING BLOCKED — {data.get('detail', r.status_code)}")

    except httpx.RequestError as e:
        print(f"  {tag} Connection error: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(count: int, delay: float, base_url: str, bot_type: str, attempt_book: bool = False):
    print(f"\n{'='*60}")
    print(f"  FairTatkal Bot Simulator")
    print(f"  {count} bots  |  type={bot_type}  |  target={base_url}")
    print(f"{'='*60}")

    if bot_type == "mixed":
        print(f"  Strategy: {count//2} dumb + {count - count//2} adversarial")
    elif bot_type == "adversarial":
        print(f"  Strategy: human-mimicry - real browser UA, randomised timing,")
        print(f"            faked mouse movement. Expect scores 35-45 (suspicious).")
    else:
        print(f"  Strategy: instant fills, bot UAs. Expect scores 0-15 (detected).")
    print()

    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{base_url}/health", timeout=3)
            print(f"  Server: {r.json()}\n")
    except Exception:
        print(f"  ERROR: Cannot reach server at {base_url}")
        print(f"  Start the backend: uvicorn app.main:app --reload")
        return

    async with httpx.AsyncClient() as client:
        tasks = []
        for i in range(count):
            if bot_type == "mixed":
                t = "dumb" if i < count // 2 else "adversarial"
            else:
                t = bot_type
            tasks.append(
                run_bot(
                    client,
                    base_url,
                    i + 1,
                    delay + random.uniform(0, delay * 0.4),
                    t,
                    attempt_book=attempt_book,
                )
            )
        await asyncio.gather(*tasks)

    print(f"\n{'='*60}")
    print(f"  Simulation complete.")
    print(f"  Booking UI  ->  http://localhost:5173")
    print(f"  Admin dash  ->  http://localhost:5173/admin")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FairTatkal bot simulator")
    parser.add_argument("--count", type=int, default=20, help="Number of bots")
    parser.add_argument("--delay", type=float, default=0.1, help="Delay between scoring rounds (s)")
    parser.add_argument("--url", type=str, default="http://localhost:8000", help="Backend URL")
    parser.add_argument("--book", action="store_true", help="Attempt booking after scoring (tests the /queue/book gate)")
    parser.add_argument(
        "--type",
        choices=["dumb", "adversarial", "mixed"],
        default="dumb",
        help="Bot type: dumb | adversarial | mixed",
    )
    args = parser.parse_args()
    asyncio.run(main(args.count, args.delay, args.url, args.type, args.book))
