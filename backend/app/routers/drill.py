"""
Tone drill router - API layer for tone drills.

Delegates all logic to services and ML layer.
"""

from __future__ import annotations

from typing import Annotated, Optional
from datetime import datetime
from pydantic import BaseModel, computed_field
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.user import User
from app.auth.dependencies import get_current_active_user
from app.ml import (
    Problem,
    Answer,
    StateUpdate,
    ConfusionState,
    BetaParams,
    make_problem_type_id,
    get_problem_types_for_drill,
)
from app.services.drill import get_drill_service, DifficultyLevel
from app.services.state_persistence import load_state, save_state, load_all_states

router = APIRouter()


# Request/Response schemas
class PreviousAnswer(BaseModel):
    """Answer to the previous drill."""
    problem_type_id: str
    word_id: int
    correct_sequence: list[int]  # 1-indexed
    selected_sequence: list[int]  # 1-indexed
    alternatives: list[list[int]]  # 1-indexed
    response_time_ms: Optional[int] = None


class NextDrillRequest(BaseModel):
    """Request for next drill."""
    previous_answer: Optional[PreviousAnswer] = None


class DrillResponse(BaseModel):
    """A drill to present to the user."""
    problem_type_id: str
    word_id: int
    vietnamese: str
    english: str = ""  # English translation
    correct_sequence: list[int]  # 1-indexed
    alternatives: list[list[int]]  # 1-indexed


class PairStats(BaseModel):
    """Statistics for a pair of classes."""
    pair: tuple[int, int]  # 1-indexed
    alpha: float
    beta: float

    @computed_field
    @property
    def mean(self) -> float:
        """Mean of Beta distribution, computed from alpha and beta."""
        return self.alpha / (self.alpha + self.beta)


class FourChoiceStats(BaseModel):
    """Statistics for a 4-choice set."""
    set: list[int]  # 4 class IDs (1-indexed)
    alpha: float
    beta: float
    mean: float


class StateUpdateResponse(BaseModel):
    """A state update that was made."""
    tracker_id: str
    old_value: float
    new_value: float


class NextDrillResponse(BaseModel):
    """Response containing next drill and stats."""
    drill: DrillResponse
    difficulty_level: DifficultyLevel
    state_updates: list[StateUpdateResponse]
    pair_stats: list[PairStats]
    four_choice_stats: list[FourChoiceStats] = []


@router.post("/drill/next", response_model=NextDrillResponse)
async def get_next_drill(
    request: NextDrillRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Get the next drill. Optionally submit the previous answer.

    If previous_answer is provided:
    - Updates the ML confusion state
    - Logs the event for replay capability

    Returns the next drill to present.
    """
    service = get_drill_service("tone")

    # Load all states for this drill type
    problem_types = get_problem_types_for_drill("tone")
    states: dict[str, ConfusionState] = {}

    for pt in problem_types:
        states[pt.problem_type_id] = await load_state(
            session, current_user.id, pt.problem_type_id
        )

    # Convert request to Problem/Answer if previous answer provided
    previous_problem: Optional[Problem] = None
    previous_answer: Optional[Answer] = None

    if request.previous_answer:
        pa = request.previous_answer
        previous_problem = Problem(
            problem_type_id=pa.problem_type_id,
            word_id=pa.word_id,
            vietnamese="",  # Not needed for update
            correct_index=0,
            correct_sequence=pa.correct_sequence,
            alternatives=pa.alternatives,
        )
        previous_answer = Answer(
            selected_sequence=pa.selected_sequence,
            elapsed_ms=pa.response_time_ms or 0,
        )

    # Process answer and get next problem
    next_problem, updated_states, state_updates = service.process_answer_and_get_next(
        previous_problem,
        previous_answer,
        states,
    )

    # Save updated states
    for problem_type_id, state in updated_states.items():
        if problem_type_id in [pt.problem_type_id for pt in problem_types]:
            await save_state(session, current_user.id, problem_type_id, state)

    # Get pair stats for the primary problem type (single syllable)
    primary_type_id = make_problem_type_id("tone", 1)
    primary_state = updated_states.get(primary_type_id)
    if primary_state is None:
        primary_state = await load_state(session, current_user.id, primary_type_id)

    from app.ml import get_ml_service
    ml = get_ml_service()
    all_pair_stats = ml.get_all_pair_stats(primary_type_id, primary_state)

    pair_stats = [
        PairStats(pair=pair, alpha=beta.alpha, beta=beta.beta)
        for pair, beta in all_pair_stats.items()
    ]

    # Get 4-choice stats
    four_choice_stats_raw = service.get_four_choice_stats(primary_state)
    four_choice_stats = [
        FourChoiceStats(
            set=s["set"],
            alpha=s["alpha"],
            beta=s["beta"],
            mean=s["mean"],
        )
        for s in four_choice_stats_raw
    ]

    # Determine difficulty level
    difficulty = service._get_difficulty_level(primary_state)

    # Build response
    drill = DrillResponse(
        problem_type_id=next_problem.problem_type_id,
        word_id=next_problem.word_id,
        vietnamese=next_problem.vietnamese,
        english=next_problem.english,
        correct_sequence=next_problem.correct_sequence,
        alternatives=next_problem.alternatives,
    )

    return NextDrillResponse(
        drill=drill,
        difficulty_level=difficulty,
        state_updates=[
            StateUpdateResponse(
                tracker_id=u.tracker_id,
                old_value=u.old_value,
                new_value=u.new_value,
            )
            for u in state_updates
        ],
        pair_stats=pair_stats,
        four_choice_stats=four_choice_stats,
    )


@router.get("/drill/stats")
async def get_drill_stats(
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get current stats for tone drill."""
    primary_type_id = make_problem_type_id("tone", 1)
    state = await load_state(session, current_user.id, primary_type_id)

    from app.ml import get_ml_service
    ml = get_ml_service()
    all_pair_stats = ml.get_all_pair_stats(primary_type_id, state)

    service = get_drill_service("tone")
    difficulty = service._get_difficulty_level(state)

    # Get 4-choice stats
    four_choice_stats_raw = service.get_four_choice_stats(state)

    return {
        "difficulty_level": difficulty,
        "pair_stats": [
            PairStats(pair=pair, alpha=beta.alpha, beta=beta.beta).model_dump()
            for pair, beta in all_pair_stats.items()
        ],
        "four_choice_stats": [
            FourChoiceStats(
                set=s["set"],
                alpha=s["alpha"],
                beta=s["beta"],
                mean=s["mean"],
            ).model_dump()
            for s in four_choice_stats_raw
        ],
    }
