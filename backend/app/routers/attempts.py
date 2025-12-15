from fastapi import APIRouter
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime
import json
from typing import Optional

router = APIRouter()

# Store attempts in a JSON file (can be upgraded to database later)
DATA_DIR = Path(__file__).parent.parent.parent / "data"
ATTEMPTS_FILE = DATA_DIR / "attempts.json"


class ToneAttempt(BaseModel):
    """A single tone drill attempt."""
    timestamp: str
    word_id: int
    vietnamese: str
    english: str
    correct_sequence: list[int]  # e.g., [1, 2] for Level → Falling
    selected_sequence: list[int]
    alternatives: list[list[int]]  # The other options shown
    is_correct: bool
    response_time_ms: Optional[int] = None  # Time from audio play to selection


class DrillAttempt(BaseModel):
    """A single image drill attempt."""
    timestamp: str
    word_id: int
    vietnamese: str
    english: str
    correct_image_id: int
    selected_image_id: int
    alternative_word_ids: list[int]  # The other words shown as distractors
    is_correct: bool
    response_time_ms: Optional[int] = None


class AttemptLog(BaseModel):
    """Container for all attempts."""
    tone_attempts: list[ToneAttempt] = []
    drill_attempts: list[DrillAttempt] = []


def load_attempts() -> AttemptLog:
    """Load attempts from JSON file."""
    if not ATTEMPTS_FILE.exists():
        return AttemptLog()
    try:
        with open(ATTEMPTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return AttemptLog(**data)
    except (json.JSONDecodeError, Exception) as e:
        print(f"Error loading attempts: {e}")
        return AttemptLog()


def save_attempts(log: AttemptLog) -> None:
    """Save attempts to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(ATTEMPTS_FILE, "w", encoding="utf-8") as f:
        json.dump(log.model_dump(), f, ensure_ascii=False, indent=2)


@router.post("/attempts/tone")
async def log_tone_attempt(attempt: ToneAttempt):
    """Log a tone drill attempt."""
    log = load_attempts()
    log.tone_attempts.append(attempt)
    save_attempts(log)
    return {"status": "ok", "total_tone_attempts": len(log.tone_attempts)}


@router.post("/attempts/drill")
async def log_drill_attempt(attempt: DrillAttempt):
    """Log an image drill attempt."""
    log = load_attempts()
    log.drill_attempts.append(attempt)
    save_attempts(log)
    return {"status": "ok", "total_drill_attempts": len(log.drill_attempts)}


@router.get("/attempts")
async def get_attempts():
    """Get all logged attempts."""
    log = load_attempts()
    return {
        "tone_attempts": len(log.tone_attempts),
        "drill_attempts": len(log.drill_attempts),
        "data": log.model_dump(),
    }


@router.get("/attempts/stats")
async def get_attempt_stats():
    """Get summary statistics of attempts."""
    log = load_attempts()

    # Tone stats
    tone_correct = sum(1 for a in log.tone_attempts if a.is_correct)
    tone_total = len(log.tone_attempts)

    # Drill stats
    drill_correct = sum(1 for a in log.drill_attempts if a.is_correct)
    drill_total = len(log.drill_attempts)

    # Tone confusion matrix (which sequences are confused with which)
    tone_confusions: dict[str, dict[str, int]] = {}
    for a in log.tone_attempts:
        if not a.is_correct:
            correct_key = "-".join(str(t) for t in a.correct_sequence)
            selected_key = "-".join(str(t) for t in a.selected_sequence)
            if correct_key not in tone_confusions:
                tone_confusions[correct_key] = {}
            tone_confusions[correct_key][selected_key] = (
                tone_confusions[correct_key].get(selected_key, 0) + 1
            )

    return {
        "tone": {
            "total": tone_total,
            "correct": tone_correct,
            "accuracy": tone_correct / tone_total if tone_total > 0 else 0,
            "confusions": tone_confusions,
        },
        "drill": {
            "total": drill_total,
            "correct": drill_correct,
            "accuracy": drill_correct / drill_total if drill_total > 0 else 0,
        },
    }
