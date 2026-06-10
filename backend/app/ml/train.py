"""
Generate synthetic behavioral data and train XGBoost bot detector.
Run: python -m app.ml.train
Outputs: app/ml/model.pkl

Score design:
  simple bots    : 0-15   -- obvious signals, clear bot
  adversarial    : 35-48  -- human-mimicking, caught as suspicious
  humans         : 70-98  -- genuine human behavior

Key insight for the 35-48 adversarial band:
  Rush users (15% of humans) and adversarial bots are drawn from the SAME
  distribution. XGBoost cannot do better than the Bayes prior for these:
    P(human | rush profile) = N_rush / (N_rush + N_adv)
                             = 1080 / (1080 + 1600) = 40.3%
  So adversarial bots reliably score ~40 regardless of hyperparameters.

  Typical humans (85%) are clearly separable from bots, scoring 85-99.
  Simple bots are clearly separable, scoring 0-10.

All units match useTelemetry.js:
  keystroke_variance   = std-dev of inter-key intervals in ms
  avg_keystroke_interval = mean interval in ms
  mouse_entropy          = std-dev of movement angles in radians
  avg_fill_speed         = mean field-dwell time in ms
  time_on_page           = seconds
"""
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score

SEED     = 42
N_HUMANS = 6000
N_SIMPLE = 2400   # 60% of bot traffic
N_ADV    = 1600   # 40% of bot traffic

# Must satisfy: N_RUSH / (N_RUSH + N_ADV) ≈ 0.48  →  N_RUSH ≈ 1477
# Using 25% of N_HUMANS = 1500 gives 48.4%
RUSH_FRAC = 0.25

OUT_PATH = Path(__file__).parent / "model.pkl"


# ── Shared profile: rush users AND adversarial bots ─────────────────────────
# This distribution is IDENTICAL for both classes. The model's Bayes-optimal
# output for sessions matching this profile is:
#   P(human) = 1080 / (1080 + 1600) ≈ 0.40  →  score 40
# Distributions are calibrated to match bot_sim.py _adversarial_telemetry().

def _rush_adv_sessions(n: int, rng, label: int) -> pd.DataFrame:
    """
    Shared fast-typing profile. One feature intentionally differs by class:
    rush humans have higher mouse_entropy (they still wander while clicking
    form fields) vs adversarial bots (scripted straight-line paths).
    """
    if label == 1:  # rush human
        # One real distinguishing signal: even rushed humans wander the mouse
        # more than a scripted bot (they click form fields, scroll, scroll back).
        # All other features identical to adversarial bots.
        mouse_entropy = rng.normal(0.90, 0.24, n).clip(0.35, 1.65)
        user_agent_consistent = rng.choice([1.0, 0.0], n, p=[0.97, 0.03])
    else:           # adversarial bot
        # Scripted straight-line mouse path; matches bot_sim 0.4-1.2 range
        mouse_entropy = rng.normal(0.78, 0.22, n).clip(0.35, 1.22)
        user_agent_consistent = np.ones(n)

    return pd.DataFrame({
        # Fast typist: narrow std-dev, matches bot_sim computed ~17-19ms
        "keystroke_variance":     rng.normal(20, 7, n).clip(7, 46),
        # Quick intervals, matches bot_sim mean 90-150ms
        "avg_keystroke_interval": rng.normal(118, 26, n).clip(58, 188),
        # Some mouse movement but sparse
        "mouse_movement_count":   rng.integers(20, 76, n).astype(float),
        "mouse_entropy":          mouse_entropy,
        # Faster fills, matches bot_sim 400-1100ms
        "avg_fill_speed":         rng.normal(728, 192, n).clip(378, 1108),
        # 1-2 instant fills (autofill / programmatic), matches bot_sim randint(1,2)
        "instant_fills":          rng.choice([1, 2], n).astype(float),
        # Identical for both classes — matches bot_sim 10-28s and 0-1
        "time_on_page":           rng.normal(19, 5, n).clip(8, 30),
        "tab_switches":           rng.integers(0, 2, n).astype(float),
        "user_agent_consistent":  user_agent_consistent,
        "field_count":            rng.integers(4, 8, n).astype(float),
        "label": label,
    })


# ── Typical human sessions ───────────────────────────────────────────────────

def _typical_human_sessions(n: int, rng) -> pd.DataFrame:
    """Deliberate human users — clearly separable from all bot types."""
    return pd.DataFrame({
        "keystroke_variance":     rng.normal(195, 60, n).clip(60, 650),
        "avg_keystroke_interval": rng.normal(250, 80, n).clip(80, 900),
        "mouse_movement_count":   rng.integers(80, 500, n).astype(float),
        "mouse_entropy":          rng.normal(2.1, 0.45, n).clip(0.8, 3.5),
        "avg_fill_speed":         rng.normal(2200, 700, n).clip(500, 9000),
        "instant_fills":          rng.choice([0, 1], n, p=[0.72, 0.28]).astype(float),
        "time_on_page":           rng.normal(58, 22, n).clip(18, 250),
        "tab_switches":           rng.integers(1, 7, n).astype(float),
        "user_agent_consistent":  rng.choice([1.0, 0.0], n, p=[0.97, 0.03]),
        "field_count":            rng.integers(4, 8, n).astype(float),
        "label": 1,
    })


# ── Simple bot sessions ──────────────────────────────────────────────────────

def _simple_bot_sessions(n: int, rng) -> pd.DataFrame:
    """Classic bots: instant fills, near-zero mouse, robotic timing."""
    return pd.DataFrame({
        "keystroke_variance":     rng.normal(5, 3, n).clip(0, 20),
        "avg_keystroke_interval": rng.normal(15, 8, n).clip(1, 50),
        "mouse_movement_count":   rng.integers(0, 5, n).astype(float),
        "mouse_entropy":          rng.normal(0.05, 0.03, n).clip(0, 0.2),
        "avg_fill_speed":         rng.normal(25, 12, n).clip(1, 80),
        "instant_fills":          rng.integers(4, 9, n).astype(float),
        "time_on_page":           rng.normal(1.5, 0.8, n).clip(0.3, 6),
        "tab_switches":           np.zeros(n),
        "user_agent_consistent":  rng.choice([1.0, 0.0], n, p=[0.55, 0.45]),
        "field_count":            rng.integers(4, 8, n).astype(float),
        "label": 0,
    })


FEATURES = [
    "keystroke_variance", "avg_keystroke_interval",
    "mouse_movement_count", "mouse_entropy",
    "avg_fill_speed", "instant_fills",
    "time_on_page", "tab_switches",
    "user_agent_consistent", "field_count",
]


def train():
    rng_h = np.random.default_rng(SEED)
    rng_r = np.random.default_rng(SEED + 1)
    rng_b = np.random.default_rng(SEED + 2)
    rng_a = np.random.default_rng(SEED + 3)

    n_rush    = int(N_HUMANS * RUSH_FRAC)          # 1080
    n_typical = N_HUMANS - n_rush                  # 4920
    target_p  = n_rush / (n_rush + N_ADV)          # 0.403

    print("Generating synthetic session data...")
    print(f"  typical humans : {n_typical:,}")
    print(f"  rush humans    : {n_rush:,}  (same profile as adversarial bots)")
    print(f"  simple bots    : {N_SIMPLE:,}")
    print(f"  adversarial    : {N_ADV:,}")
    print(f"  Bayes target P(human|adversarial) = {target_p:.3f}  -> score ~{target_p*100:.0f}")

    typical = _typical_human_sessions(n_typical, rng_h)
    rush    = _rush_adv_sessions(n_rush, rng_r, label=1)
    simple  = _simple_bot_sessions(N_SIMPLE, rng_b)
    adv     = _rush_adv_sessions(N_ADV, rng_a, label=0)

    df = pd.concat([typical, rush, simple, adv], ignore_index=True).sample(
        frac=1, random_state=SEED
    )
    X = df[FEATURES]
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y
    )

    print("\nTraining XGBoost...")
    model = XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=8,
        gamma=0.15,
        reg_lambda=2.0,
        eval_metric="logloss",
        random_state=SEED,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    print("\n=== Model Performance ===")
    print(classification_report(y_test, y_pred, target_names=["bot", "human"]))
    print(f"AUC-ROC: {roc_auc_score(y_test, y_prob):.4f}")

    test_df = X_test.copy()
    test_df["true_label"] = y_test.values
    test_df["score"] = (y_prob * 100).round(1)

    for lbl, name in [(0, "all bots"), (1, "all humans")]:
        s = test_df.loc[test_df["true_label"] == lbl, "score"]
        print(f"  {name:12s}: mean={s.mean():.1f}  "
              f"p25={s.quantile(0.25):.1f}  median={s.median():.1f}  "
              f"p75={s.quantile(0.75):.1f}")

    # Adversarial-specific scores (full set, not just test split)
    y_adv  = model.predict_proba(adv[FEATURES])[:, 1] * 100
    y_rush = model.predict_proba(rush[FEATURES])[:, 1] * 100

    print(f"\n  adversarial ({N_ADV}): "
          f"mean={y_adv.mean():.1f}  "
          f"p10={np.percentile(y_adv, 10):.1f}  "
          f"p50={np.percentile(y_adv, 50):.1f}  "
          f"p90={np.percentile(y_adv, 90):.1f}  "
          f"caught(< 50)={100*(y_adv < 50).mean():.0f}%")

    print(f"  rush humans ({n_rush}): "
          f"mean={y_rush.mean():.1f}  "
          f"p10={np.percentile(y_rush, 10):.1f}  "
          f"p50={np.percentile(y_rush, 50):.1f}  "
          f"false-pos(< 50)={100*(y_rush < 50).mean():.0f}%")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES}, OUT_PATH)
    print(f"\nModel saved to {OUT_PATH}")


if __name__ == "__main__":
    train()
