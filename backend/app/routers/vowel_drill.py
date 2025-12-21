"""
Vowel drill router - API endpoints for vowel drill sampling and state transitions.
"""
from typing import Annotated, Optional
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.user import User
from app.models.progress import UserProgress, UserVowelCard
from app.auth.dependencies import get_current_active_user
from app.services.vowel_drill import (
    get_vowel_drill_service,
    VowelConfusionState,
    DifficultyLevel,
    NUM_VOWELS,
)

router = APIRouter()


# Request/Response schemas
class VowelPreviousAnswer(BaseModel):
    word_id: int
    correct_sequence: list[int]  # 1-indexed
    selected_sequence: list[int]  # 1-indexed
    alternatives: list[list[int]]  # 1-indexed
    response_time_ms: Optional[int] = None


class VowelNextDrillRequest(BaseModel):
    previous_answer: Optional[VowelPreviousAnswer] = None


class VowelDrill(BaseModel):
    word_id: int
    vietnamese: str
    english: str
    correct_sequence: list[int]  # 1-indexed
    alternatives: list[list[int]]  # 1-indexed


class VowelPairProbability(BaseModel):
    pair: list[int]  # 0-indexed
    probability: float
    correct: int
    total: int


class VowelDrillStats(BaseModel):
    reviews_today: int
    correct_today: int
    total_reviews: int
    total_correct: int
    pair_probabilities: list[VowelPairProbability]


class VowelNextDrillResponse(BaseModel):
    drill: VowelDrill
    difficulty_level: DifficultyLevel
    stats: VowelDrillStats


def get_today_string() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def vowel_confusion_state_from_dict(data: Optional[dict]) -> Optional[VowelConfusionState]:
    """Convert dict to VowelConfusionState."""
    if not data or "counts" not in data:
        return None
    return VowelConfusionState(
        counts=data["counts"],
        counts_by_context=data.get("counts_by_context", {})
    )


def vowel_confusion_state_to_dict(state: VowelConfusionState) -> dict:
    """Convert VowelConfusionState to dict for storage."""
    return {
        "counts": state.counts,
        "counts_by_context": state.counts_by_context
    }


@router.post("/vowel-drill/next", response_model=VowelNextDrillResponse)
async def get_next_vowel_drill(
    request: VowelNextDrillRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Get the next vowel drill. Optionally submit the previous answer.

    If previous_answer is provided:
    - Updates the vowel confusion matrix
    - Records progress stats
    - Updates FSRS card state

    Returns the next drill to present.
    """
    service = get_vowel_drill_service()
    now = datetime.utcnow()
    today = get_today_string()

    # Get or create user progress
    result = await session.execute(
        select(UserProgress).where(UserProgress.user_id == current_user.id)
    )
    progress = result.scalar_one_or_none()

    if not progress:
        progress = UserProgress(
            user_id=current_user.id,
            last_review_date=today,
            confusion_state={"counts": [[0] * 6 for _ in range(6)]},
            vowel_confusion_state={"counts": [[0] * NUM_VOWELS for _ in range(NUM_VOWELS)]},
        )
        session.add(progress)
        await session.commit()
        await session.refresh(progress)

    # Initialize vowel_confusion_state if it doesn't exist
    if not progress.vowel_confusion_state:
        progress.vowel_confusion_state = {"counts": [[0] * NUM_VOWELS for _ in range(NUM_VOWELS)]}
        await session.commit()
        await session.refresh(progress)

    # Reset daily stats if new day (note: this is shared with tone drill)
    if progress.last_review_date != today:
        progress.reviews_today = 0
        progress.correct_today = 0
        progress.last_review_date = today

    # Load vowel confusion state
    confusion_state = vowel_confusion_state_from_dict(progress.vowel_confusion_state)
    if not confusion_state:
        confusion_state = VowelConfusionState(counts=[[0] * NUM_VOWELS for _ in range(NUM_VOWELS)])

    # Process previous answer if provided
    if request.previous_answer:
        answer = request.previous_answer
        is_correct = answer.correct_sequence == answer.selected_sequence

        # Update vowel confusion matrix
        confusion_state = service.update_confusion_matrix(
            confusion_state,
            answer.correct_sequence,
            answer.selected_sequence,
        )
        progress.vowel_confusion_state = vowel_confusion_state_to_dict(confusion_state)

        # Update progress stats (shared with tone drill)
        progress.reviews_today += 1
        progress.total_reviews += 1
        if is_correct:
            progress.correct_today += 1
            progress.total_correct += 1

        # Update vowel card (FSRS state)
        sequence_key = "-".join(str(v) for v in answer.correct_sequence)
        vowel_card_result = await session.execute(
            select(UserVowelCard).where(
                UserVowelCard.user_id == current_user.id,
                UserVowelCard.sequence_key == sequence_key,
            )
        )
        vowel_card = vowel_card_result.scalar_one_or_none()

        if vowel_card:
            vowel_card.total += 1
            if is_correct:
                vowel_card.correct += 1
            vowel_card.updated_at = now
        else:
            vowel_card = UserVowelCard(
                user_id=current_user.id,
                sequence_key=sequence_key,
                card_data={},
                correct=1 if is_correct else 0,
                total=1,
                updated_at=now,
            )
            session.add(vowel_card)

        progress.updated_at = now
        await session.commit()
        await session.refresh(progress)

    # Sample next drill
    drill_data = service.sample_next_drill(confusion_state)

    if not drill_data:
        raise ValueError("No words available for drilling")

    word = drill_data["word"]
    drill = VowelDrill(
        word_id=word.id,
        vietnamese=word.vietnamese,
        english=word.english,
        correct_sequence=drill_data["correct_sequence"],
        alternatives=drill_data["alternatives"],
    )

    # Get difficulty level and stats
    difficulty_level = service.get_difficulty_level(confusion_state)
    pair_probs = service.get_all_pair_probabilities(confusion_state)

    stats = VowelDrillStats(
        reviews_today=progress.reviews_today,
        correct_today=progress.correct_today,
        total_reviews=progress.total_reviews,
        total_correct=progress.total_correct,
        pair_probabilities=[VowelPairProbability(**p) for p in pair_probs],
    )

    return VowelNextDrillResponse(
        drill=drill,
        difficulty_level=difficulty_level,
        stats=stats,
    )
