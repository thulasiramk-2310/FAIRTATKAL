from pydantic import BaseModel, Field
from typing import Optional, List


class TelemetryPayload(BaseModel):
    session_id: str = Field(min_length=8, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    keystroke_intervals: Optional[List[float]] = []
    keystroke_variance: Optional[float] = 0
    avg_keystroke_interval: Optional[float] = 0
    mouse_movement_count: Optional[int] = 0
    mouse_entropy: Optional[float] = 0
    field_fill_speeds: Optional[List[float]] = []
    avg_fill_speed: Optional[float] = 0
    instant_fills: Optional[int] = 0
    time_on_page: Optional[float] = 0
    tab_switches: Optional[int] = 0
    user_agent_consistent: Optional[bool] = True
    field_count: Optional[int] = 0


class ScoreResponse(BaseModel):
    session_id: str
    human_score: float
    is_bot: bool
    label: str
    confidence: float


class JoinQueueRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")


class QueueEntry(BaseModel):
    session_id: str
    position: int
    total_in_queue: int
    human_score: float
    label: str
