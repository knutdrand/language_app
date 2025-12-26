"""
Lesson router - API layer for lesson-based drills.
"""

from __future__ import annotations

from typing import Annotated, Optional, List
import uuid

from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.user import User
from app.auth.dependencies import get_current_active_user
from app.ml import (
    Problem,
    ConfusionState,
    make_problem_type_id,
    get_problem_types_for_drill,
)
from app.services.lesson import (
    get_lesson_service,
    LessonPhase,
    DrillMode,
    LESSON_THEMES,
)
from app.services.state_persistence import load_state, save_state
from app.routers.drill import random_voice_speed, log_attempt

router = APIRouter()


# Request/Response schemas
class StartLessonRequest(BaseModel):
    theme_id: Optional[int] = None  # None for adaptive


class StartLessonResponse(BaseModel):
    session_id: str
    lesson_id: int
    theme_id: int
    theme_pairs: List[List[int]]  # List of [a, b] pairs
    total_drills: int


class LessonProgress(BaseModel):
    phase: str  # "learning", "review", "complete"
    current: int
    total: int


class LessonDrillResponse(BaseModel):
    problem_type_id: str
    word_id: int
    vietnamese: str
    english: str
    correct_sequence: List[int]
    alternatives: List[List[int]]
    voice: str
    speed: int
    mode: str  # "2-choice-1syl", "4-choice-1syl", "2-choice-2syl"
    progress: LessonProgress


class SubmitLessonAnswerRequest(BaseModel):
    session_id: str
    word_id: int
    vietnamese: str
    correct_sequence: List[int]
    selected_sequence: List[int]
    alternatives: List[List[int]]
    response_time_ms: Optional[int] = None
    voice: str = "banmai"
    speed: int = 0
    mode: str


class LessonSummary(BaseModel):
    lesson_id: int
    theme_id: int
    theme_pairs: List[List[int]]
    total_drills: int
    mistakes_count: int
    accuracy: float


class LessonNextResponse(BaseModel):
    drill: Optional[LessonDrillResponse] = None
    is_complete: bool
    summary: Optional[LessonSummary] = None


class ThemeInfo(BaseModel):
    id: int
    pairs: List[List[int]]


class ThemesResponse(BaseModel):
    themes: List[ThemeInfo]


@router.post("/lesson/start", response_model=StartLessonResponse)
async def start_lesson(
    request: StartLessonRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Start a new lesson session."""
    service = get_lesson_service()

    # Load ML states for adaptive selection
    problem_types = get_problem_types_for_drill("tone")
    states: dict[str, ConfusionState] = {}
    for pt in problem_types:
        states[pt.problem_type_id] = await load_state(
            session, current_user.id, pt.problem_type_id
        )

    # Generate unique session ID
    session_id = f"{current_user.id}_{uuid.uuid4().hex[:8]}"

    lesson_state = await service.start_lesson(
        session_id=session_id,
        user_id=current_user.id,
        db_session=session,
        theme_id=request.theme_id,
        states=states,
    )

    return StartLessonResponse(
        session_id=session_id,
        lesson_id=lesson_state.lesson_id,
        theme_id=lesson_state.theme_id,
        theme_pairs=[[p[0], p[1]] for p in lesson_state.theme_pairs],
        total_drills=len(lesson_state.drill_sequence),
    )


@router.get("/lesson/first/{session_id}", response_model=LessonNextResponse)
async def get_first_drill(
    session_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get the first drill for a lesson (no previous answer)."""
    service = get_lesson_service()

    # Load ML states
    problem_types = get_problem_types_for_drill("tone")
    states: dict[str, ConfusionState] = {}
    for pt in problem_types:
        states[pt.problem_type_id] = await load_state(
            session, current_user.id, pt.problem_type_id
        )

    result = service.get_next_drill(session_id, states)

    if result is None:
        return LessonNextResponse(is_complete=True)

    problem, drill_mode, progress = result
    voice, speed = random_voice_speed()

    return LessonNextResponse(
        drill=LessonDrillResponse(
            problem_type_id=problem.problem_type_id,
            word_id=problem.word_id,
            vietnamese=problem.vietnamese,
            english=problem.english,
            correct_sequence=problem.correct_sequence,
            alternatives=problem.alternatives,
            voice=voice,
            speed=speed,
            mode=drill_mode.value,
            progress=LessonProgress(**progress),
        ),
        is_complete=False,
    )


@router.post("/lesson/next", response_model=LessonNextResponse)
async def get_lesson_next(
    request: SubmitLessonAnswerRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Submit answer and get next lesson drill."""
    service = get_lesson_service()

    # Get lesson state for lesson_id
    lesson_state = service.get_lesson_state(request.session_id)
    lesson_id = lesson_state.lesson_id if lesson_state else None

    # Load ML states
    problem_types = get_problem_types_for_drill("tone")
    states: dict[str, ConfusionState] = {}
    for pt in problem_types:
        states[pt.problem_type_id] = await load_state(
            session, current_user.id, pt.problem_type_id
        )

    # Determine problem_type_id from correct_sequence length
    syllable_count = len(request.correct_sequence)
    problem_type_id = make_problem_type_id("tone", syllable_count)

    # Log the attempt with lesson_id
    is_correct = request.selected_sequence == request.correct_sequence
    await log_attempt(
        session=session,
        user_id=current_user.id,
        problem_type_id=problem_type_id,
        word_id=request.word_id,
        vietnamese=request.vietnamese,
        correct_sequence=request.correct_sequence,
        alternatives=request.alternatives,
        selected_sequence=request.selected_sequence,
        is_correct=is_correct,
        response_time_ms=request.response_time_ms,
        voice=request.voice,
        speed=request.speed,
        lesson_id=lesson_id,
    )

    # Update ML state
    state = states.get(problem_type_id)
    if state is not None:
        from app.ml import get_ml_service, Answer
        ml = get_ml_service()

        # Construct Problem for state update
        problem = Problem(
            problem_type_id=problem_type_id,
            word_id=request.word_id,
            vietnamese=request.vietnamese,
            english="",
            correct_index=0,
            correct_sequence=request.correct_sequence,
            alternatives=request.alternatives,
        )
        answer = Answer(
            selected_sequence=request.selected_sequence,
            elapsed_ms=request.response_time_ms or 0,
        )
        new_state, _ = ml.update_state(state, problem, answer)
        states[problem_type_id] = new_state
        await save_state(session, current_user.id, problem_type_id, new_state)

    # Record answer in lesson state
    problem = Problem(
        problem_type_id=problem_type_id,
        word_id=request.word_id,
        vietnamese=request.vietnamese,
        english="",
        correct_index=0,
        correct_sequence=request.correct_sequence,
        alternatives=request.alternatives,
    )

    mode = DrillMode(request.mode)
    service.record_answer(
        session_id=request.session_id,
        problem=problem,
        mode=mode,
        selected_sequence=request.selected_sequence,
        is_correct=is_correct,
    )

    # Get next drill
    result = service.get_next_drill(request.session_id, states)

    if result is None:
        # Lesson complete
        summary_data = service.get_lesson_summary(request.session_id)
        service.cleanup_session(request.session_id)

        summary = None
        if summary_data:
            summary = LessonSummary(
                lesson_id=summary_data["lesson_id"],
                theme_id=summary_data["theme_id"],
                theme_pairs=summary_data["theme_pairs"],
                total_drills=summary_data["total_drills"],
                mistakes_count=summary_data["mistakes_count"],
                accuracy=summary_data["accuracy"],
            )

        return LessonNextResponse(
            is_complete=True,
            summary=summary,
        )

    problem, drill_mode, progress = result
    voice, speed = random_voice_speed()

    return LessonNextResponse(
        drill=LessonDrillResponse(
            problem_type_id=problem.problem_type_id,
            word_id=problem.word_id,
            vietnamese=problem.vietnamese,
            english=problem.english,
            correct_sequence=problem.correct_sequence,
            alternatives=problem.alternatives,
            voice=voice,
            speed=speed,
            mode=drill_mode.value,
            progress=LessonProgress(**progress),
        ),
        is_complete=False,
    )


@router.get("/lesson/themes", response_model=ThemesResponse)
async def get_lesson_themes():
    """Get available lesson themes."""
    return ThemesResponse(
        themes=[
            ThemeInfo(
                id=i,
                pairs=[[p[0], p[1]] for p in pairs],
            )
            for i, pairs in enumerate(LESSON_THEMES)
        ]
    )
