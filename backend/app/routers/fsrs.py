from fastapi import APIRouter
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime
import json
from typing import Optional

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent.parent / "data"
TONE_CARDS_FILE = DATA_DIR / "tone_cards.json"
WORD_CARDS_FILE = DATA_DIR / "word_cards.json"
PROGRESS_FILE = DATA_DIR / "progress.json"


# ============ Tone Sequence Cards ============

class ToneCardState(BaseModel):
    """FSRS card state for a tone sequence."""
    sequence_key: str
    card: dict  # FSRS card object
    correct: int = 0
    total: int = 0


class ToneCardsData(BaseModel):
    """All tone card states."""
    cards: list[ToneCardState] = []


def load_tone_cards() -> ToneCardsData:
    if not TONE_CARDS_FILE.exists():
        return ToneCardsData()
    try:
        with open(TONE_CARDS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return ToneCardsData(**data)
    except Exception as e:
        print(f"Error loading tone cards: {e}")
        return ToneCardsData()


def save_tone_cards(data: ToneCardsData) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(TONE_CARDS_FILE, "w", encoding="utf-8") as f:
        json.dump(data.model_dump(), f, ensure_ascii=False, indent=2)


@router.get("/fsrs/tone-cards")
async def get_tone_cards():
    """Get all tone card states."""
    data = load_tone_cards()
    return {"cards": [c.model_dump() for c in data.cards]}


@router.post("/fsrs/tone-cards")
async def save_all_tone_cards(cards: list[ToneCardState]):
    """Save all tone card states (full replace)."""
    data = ToneCardsData(cards=cards)
    save_tone_cards(data)
    return {"status": "ok", "count": len(cards)}


@router.put("/fsrs/tone-cards/{sequence_key}")
async def update_tone_card(sequence_key: str, card: ToneCardState):
    """Update a single tone card state."""
    data = load_tone_cards()

    # Find and update or append
    found = False
    for i, c in enumerate(data.cards):
        if c.sequence_key == sequence_key:
            data.cards[i] = card
            found = True
            break

    if not found:
        data.cards.append(card)

    save_tone_cards(data)
    return {"status": "ok", "sequence_key": sequence_key}


# ============ Word Cards (Image Drill) ============

class WordCardState(BaseModel):
    """FSRS card state for a word."""
    word_id: int
    card: dict  # FSRS card object


class WordCardsData(BaseModel):
    """All word card states."""
    cards: list[WordCardState] = []


def load_word_cards() -> WordCardsData:
    if not WORD_CARDS_FILE.exists():
        return WordCardsData()
    try:
        with open(WORD_CARDS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return WordCardsData(**data)
    except Exception as e:
        print(f"Error loading word cards: {e}")
        return WordCardsData()


def save_word_cards(data: WordCardsData) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(WORD_CARDS_FILE, "w", encoding="utf-8") as f:
        json.dump(data.model_dump(), f, ensure_ascii=False, indent=2)


@router.get("/fsrs/word-cards")
async def get_word_cards():
    """Get all word card states."""
    data = load_word_cards()
    return {"cards": [c.model_dump() for c in data.cards]}


@router.post("/fsrs/word-cards")
async def save_all_word_cards(cards: list[WordCardState]):
    """Save all word card states (full replace)."""
    data = WordCardsData(cards=cards)
    save_word_cards(data)
    return {"status": "ok", "count": len(cards)}


@router.put("/fsrs/word-cards/{word_id}")
async def update_word_card(word_id: int, card: WordCardState):
    """Update a single word card state."""
    data = load_word_cards()

    found = False
    for i, c in enumerate(data.cards):
        if c.word_id == word_id:
            data.cards[i] = card
            found = True
            break

    if not found:
        data.cards.append(card)

    save_word_cards(data)
    return {"status": "ok", "word_id": word_id}


# ============ Progress Stats ============

class ProgressData(BaseModel):
    """Daily and total progress stats."""
    reviews_today: int = 0
    correct_today: int = 0
    last_review_date: str = ""
    total_reviews: int = 0
    total_correct: int = 0


def load_progress() -> ProgressData:
    if not PROGRESS_FILE.exists():
        return ProgressData()
    try:
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return ProgressData(**data)
    except Exception as e:
        print(f"Error loading progress: {e}")
        return ProgressData()


def save_progress(data: ProgressData) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(data.model_dump(), f, ensure_ascii=False, indent=2)


def get_today_string() -> str:
    return datetime.now().strftime("%Y-%m-%d")


@router.get("/fsrs/progress")
async def get_progress():
    """Get progress stats."""
    data = load_progress()
    today = get_today_string()

    # Reset daily stats if new day
    if data.last_review_date != today:
        data.reviews_today = 0
        data.correct_today = 0
        data.last_review_date = today
        save_progress(data)

    return data.model_dump()


class RecordReviewRequest(BaseModel):
    correct: bool


@router.post("/fsrs/progress/record")
async def record_progress(request: RecordReviewRequest):
    """Record a review in progress stats."""
    data = load_progress()
    today = get_today_string()

    # Reset if new day
    if data.last_review_date != today:
        data.reviews_today = 0
        data.correct_today = 0
        data.last_review_date = today

    # Update counts
    data.reviews_today += 1
    data.total_reviews += 1
    if request.correct:
        data.correct_today += 1
        data.total_correct += 1

    save_progress(data)
    return data.model_dump()
