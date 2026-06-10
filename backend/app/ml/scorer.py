from functools import lru_cache
from pathlib import Path
import numpy as np
import joblib

from ..models.schemas import TelemetryPayload, ScoreResponse

MODEL_PATH = Path(__file__).parent / "model.pkl"

FEATURES = [
    "keystroke_variance", "avg_keystroke_interval",
    "mouse_movement_count", "mouse_entropy",
    "avg_fill_speed", "instant_fills",
    "time_on_page", "tab_switches",
    "user_agent_consistent", "field_count",
]


@lru_cache(maxsize=1)
def _load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}. "
            "Run: python -m app.ml.train"
        )
    return joblib.load(MODEL_PATH)


def score_session(payload: TelemetryPayload) -> ScoreResponse:
    try:
        bundle = _load_model()
        model = bundle["model"]

        intervals = payload.keystroke_intervals or []
        avg_interval = (
            float(np.mean(intervals)) if intervals
            else (payload.avg_keystroke_interval or 0)
        )

        X = np.array([[
            payload.keystroke_variance or 0,
            avg_interval,
            payload.mouse_movement_count or 0,
            payload.mouse_entropy or 0,
            payload.avg_fill_speed or 0,
            payload.instant_fills or 0,
            payload.time_on_page or 0,
            payload.tab_switches or 0,
            1.0 if payload.user_agent_consistent else 0.0,
            payload.field_count or 0,
        ]])

        prob_human = float(model.predict_proba(X)[0][1])
        human_score = round(prob_human * 100, 1)
        is_bot = prob_human < 0.5

        return ScoreResponse(
            session_id=payload.session_id,
            human_score=human_score,
            is_bot=is_bot,
            label="bot" if is_bot else "human",
            confidence=round(max(prob_human, 1 - prob_human), 3),
        )

    except FileNotFoundError:
        raise

    except Exception:
        # Rule-based fallback if model inference fails
        score = 50.0
        if (payload.avg_fill_speed or 0) < 100:
            score -= 30
        if (payload.mouse_movement_count or 0) < 5:
            score -= 20
        if (payload.time_on_page or 0) < 5:
            score -= 15
        score = max(0.0, min(100.0, score))
        is_bot = score < 50
        return ScoreResponse(
            session_id=payload.session_id,
            human_score=score,
            is_bot=is_bot,
            label="bot" if is_bot else "human",
            confidence=0.6,
        )
