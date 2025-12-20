"""
Tone drill router - API endpoints for tone drill sampling and state transitions.
"""
from typing import Annotated, Optional
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.user import User
from app.models.progress import UserProgress, UserToneCard
from app.auth.dependencies import get_current_active_user
from app.services.tone_drill import (
    get_tone_drill_service,
    ConfusionState,
    DifficultyLevel,
)

router = APIRouter()


# Request/Response schemas
class PreviousAnswer(BaseModel):
    word_id: int
    correct_sequence: list[int]  # 1-indexed
    selected_sequence: list[int]  # 1-indexed
    alternatives: list[list[int]]  # 1-indexed
    response_time_ms: Optional[int] = None


class NextDrillRequest(BaseModel):
    previous_answer: Optional[PreviousAnswer] = None


class ToneDrill(BaseModel):
    word_id: int
    vietnamese: str
    english: str
    correct_sequence: list[int]  # 1-indexed
    alternatives: list[list[int]]  # 1-indexed


class PairProbability(BaseModel):
    pair: list[int]  # 0-indexed
    probability: float
    correct: int
    total: int


class FourChoiceProbability(BaseModel):
    set: list[int]  # 0-indexed
    probability: float


class DrillStats(BaseModel):
    reviews_today: int
    correct_today: int
    total_reviews: int
    total_correct: int
    pair_probabilities: list[PairProbability]
    four_choice_probabilities: list[FourChoiceProbability]


class NextDrillResponse(BaseModel):
    drill: ToneDrill
    difficulty_level: DifficultyLevel
    stats: DrillStats


def get_today_string() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def confusion_state_from_dict(data: Optional[dict]) -> Optional[ConfusionState]:
    """Convert dict to ConfusionState."""
    if not data or "counts" not in data:
        return None
    return ConfusionState(counts=data["counts"])


def confusion_state_to_dict(state: ConfusionState) -> dict:
    """Convert ConfusionState to dict for storage."""
    return {"counts": state.counts}


@router.post("/tone-drill/next", response_model=NextDrillResponse)
async def get_next_drill(
    request: NextDrillRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Get the next tone drill. Optionally submit the previous answer.

    If previous_answer is provided:
    - Updates the confusion matrix
    - Records progress stats
    - Updates FSRS card state

    Returns the next drill to present.
    """
    service = get_tone_drill_service()
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
        )
        session.add(progress)
        await session.commit()
        await session.refresh(progress)

    # Reset daily stats if new day
    if progress.last_review_date != today:
        progress.reviews_today = 0
        progress.correct_today = 0
        progress.last_review_date = today

    # Load confusion state
    confusion_state = confusion_state_from_dict(progress.confusion_state)
    if not confusion_state:
        confusion_state = ConfusionState(counts=[[0] * 6 for _ in range(6)])

    # Process previous answer if provided
    if request.previous_answer:
        answer = request.previous_answer
        is_correct = answer.correct_sequence == answer.selected_sequence

        # Update confusion matrix
        confusion_state = service.update_confusion_matrix(
            confusion_state,
            answer.correct_sequence,
            answer.selected_sequence,
        )
        progress.confusion_state = confusion_state_to_dict(confusion_state)

        # Update progress stats
        progress.reviews_today += 1
        progress.total_reviews += 1
        if is_correct:
            progress.correct_today += 1
            progress.total_correct += 1

        # Update tone card (FSRS state)
        sequence_key = "-".join(str(t) for t in answer.correct_sequence)
        tone_card_result = await session.execute(
            select(UserToneCard).where(
                UserToneCard.user_id == current_user.id,
                UserToneCard.sequence_key == sequence_key,
            )
        )
        tone_card = tone_card_result.scalar_one_or_none()

        if tone_card:
            tone_card.total += 1
            if is_correct:
                tone_card.correct += 1
            tone_card.updated_at = now
        else:
            tone_card = UserToneCard(
                user_id=current_user.id,
                sequence_key=sequence_key,
                card_data={},
                correct=1 if is_correct else 0,
                total=1,
                updated_at=now,
            )
            session.add(tone_card)

        progress.updated_at = now
        await session.commit()
        await session.refresh(progress)

    # Sample next drill
    drill_data = service.sample_next_drill(confusion_state)

    if not drill_data:
        # This shouldn't happen if we have words, but just in case
        raise ValueError("No words available for drilling")

    word = drill_data["word"]
    drill = ToneDrill(
        word_id=word.id,
        vietnamese=word.vietnamese,
        english=word.english,
        correct_sequence=drill_data["correct_sequence"],
        alternatives=drill_data["alternatives"],
    )

    # Get difficulty level and stats
    difficulty_level = service.get_difficulty_level(confusion_state)
    pair_probs = service.get_all_pair_probabilities(confusion_state)
    four_choice_probs = service.get_all_four_choice_probabilities(confusion_state)

    stats = DrillStats(
        reviews_today=progress.reviews_today,
        correct_today=progress.correct_today,
        total_reviews=progress.total_reviews,
        total_correct=progress.total_correct,
        pair_probabilities=[PairProbability(**p) for p in pair_probs],
        four_choice_probabilities=[FourChoiceProbability(**p) for p in four_choice_probs],
    )

    return NextDrillResponse(
        drill=drill,
        difficulty_level=difficulty_level,
        stats=stats,
    )
