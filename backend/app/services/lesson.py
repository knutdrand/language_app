"""
Lesson service - manages lesson-based drill sessions.

Creates themed lessons around specific tone pairs with mixed modes.
Tracks mistakes for single review pass at lesson end.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml import (
    Problem,
    ConfusionState,
    make_problem_type_id,
    get_ml_service,
)
from app.models.progress import DrillAttempt
from app.services.drill import DrillService, get_drill_service, N_TONES


# Lesson constants
DRILLS_PER_LESSON = 10


class LessonPhase(str, Enum):
    LEARNING = "learning"
    REVIEW = "review"
    COMPLETE = "complete"


class DrillMode(str, Enum):
    TWO_CHOICE_1SYL = "2-choice-1syl"
    FOUR_CHOICE_1SYL = "4-choice-1syl"
    TWO_CHOICE_2SYL = "2-choice-2syl"


@dataclass
class MistakeRecord:
    """Record of a mistake for review."""
    problem: Problem
    mode: DrillMode
    user_selected: list[int]


@dataclass
class LessonState:
    """In-memory state for a lesson session."""
    lesson_id: int                       # Auto-increment per user (for logging)
    theme_id: int                        # Which theme (0-7)
    theme_pairs: list[tuple[int, int]]   # 1-indexed tone pairs
    drill_sequence: list[DrillMode]      # Pre-planned mode sequence
    current_index: int = 0
    phase: LessonPhase = LessonPhase.LEARNING
    mistakes: list[MistakeRecord] = field(default_factory=list)
    review_index: int = 0

    @property
    def is_complete(self) -> bool:
        return self.phase == LessonPhase.COMPLETE

    @property
    def progress(self) -> dict:
        if self.phase == LessonPhase.LEARNING:
            return {
                "phase": "learning",
                "current": self.current_index,
                "total": len(self.drill_sequence),
            }
        elif self.phase == LessonPhase.REVIEW:
            return {
                "phase": "review",
                "current": self.review_index,
                "total": len(self.mistakes),
            }
        else:
            return {
                "phase": "complete",
                "total_drills": len(self.drill_sequence),
                "mistakes_reviewed": len(self.mistakes),
            }


# Lesson themes: each defines 2 focus pairs (1-indexed)
LESSON_THEMES: list[list[tuple[int, int]]] = [
    [(1, 2), (1, 3)],  # Level vs Falling/Rising
    [(2, 3), (2, 4)],  # Falling vs Rising/Dipping
    [(3, 4), (4, 5)],  # Rising/Dipping/Creaky
    [(5, 6), (3, 6)],  # Creaky/Heavy
    [(1, 4), (1, 5)],  # Level vs Dipping/Creaky
    [(2, 5), (2, 6)],  # Falling vs Creaky/Heavy
    [(3, 5), (4, 6)],  # Mixed pairs
    [(1, 6), (2, 3)],  # Mixed advanced
]


class LessonService:
    """Service for lesson-based drill sessions."""

    def __init__(self):
        self.drill_service: DrillService = get_drill_service()
        self.ml = get_ml_service()
        self._sessions: dict[str, LessonState] = {}

    async def get_next_lesson_id(
        self,
        session: AsyncSession,
        user_id: str,
    ) -> int:
        """Get next lesson ID for a user (max + 1)."""
        result = await session.execute(
            select(func.coalesce(func.max(DrillAttempt.lesson_id), 0))
            .where(DrillAttempt.user_id == user_id)
        )
        max_lesson_id = result.scalar_one()
        return max_lesson_id + 1

    async def start_lesson(
        self,
        session_id: str,
        user_id: str,
        db_session: AsyncSession,
        theme_id: Optional[int] = None,
        states: Optional[dict[str, ConfusionState]] = None,
    ) -> LessonState:
        """Start a new lesson.

        Args:
            session_id: Unique session identifier (e.g., user_id + timestamp)
            user_id: User ID for lesson_id tracking
            db_session: Database session for querying lesson_id
            theme_id: Which lesson theme (0-7), or None for adaptive
            states: ML confusion states for adaptive selection
        """
        # Get next lesson ID
        lesson_id = await self.get_next_lesson_id(db_session, user_id)

        # Select theme pairs
        if theme_id is not None:
            actual_theme_id = theme_id % len(LESSON_THEMES)
            theme_pairs = LESSON_THEMES[actual_theme_id]
        else:
            actual_theme_id = -1  # Adaptive
            theme_pairs = self._select_adaptive_theme(states)

        # Generate drill mode sequence
        drill_sequence = self._generate_drill_sequence()

        state = LessonState(
            lesson_id=lesson_id,
            theme_id=actual_theme_id,
            theme_pairs=theme_pairs,
            drill_sequence=drill_sequence,
        )
        self._sessions[session_id] = state
        return state

    def _select_adaptive_theme(
        self,
        states: Optional[dict[str, ConfusionState]],
    ) -> list[tuple[int, int]]:
        """Select theme based on weakest pairs from ML state."""
        if states is None:
            return LESSON_THEMES[0]

        problem_type_id = make_problem_type_id("tone", 1)
        state = states.get(problem_type_id)
        if state is None:
            return LESSON_THEMES[0]

        pair_stats = self.ml.get_all_pair_stats(problem_type_id, state)

        # Sort by error probability (1 - mean), take 2 weakest
        sorted_pairs = sorted(
            pair_stats.items(),
            key=lambda x: x[1].mean,  # Lower mean = more errors
        )

        if len(sorted_pairs) >= 2:
            return [sorted_pairs[0][0], sorted_pairs[1][0]]
        return LESSON_THEMES[0]

    def _generate_drill_sequence(self) -> list[DrillMode]:
        """Generate the mode sequence for a lesson.

        Distribution: 6x 2-choice-1syl, 2x 4-choice-1syl, 2x 2-choice-2syl
        Shuffled randomly.
        """
        sequence = (
            [DrillMode.TWO_CHOICE_1SYL] * 6 +
            [DrillMode.FOUR_CHOICE_1SYL] * 2 +
            [DrillMode.TWO_CHOICE_2SYL] * 2
        )
        random.shuffle(sequence)
        return sequence

    def get_next_drill(
        self,
        session_id: str,
        states: dict[str, ConfusionState],
    ) -> Optional[tuple[Problem, DrillMode, dict]]:
        """Get the next drill for the lesson.

        Returns:
            (problem, mode, progress) or None if lesson complete
        """
        state = self._sessions.get(session_id)
        if state is None:
            return None

        if state.phase == LessonPhase.LEARNING:
            return self._get_learning_drill(state, states)
        elif state.phase == LessonPhase.REVIEW:
            return self._get_review_drill(state)
        else:
            return None

    def _get_learning_drill(
        self,
        state: LessonState,
        states: dict[str, ConfusionState],
    ) -> Optional[tuple[Problem, DrillMode, dict]]:
        """Get next drill in learning phase."""
        if state.current_index >= len(state.drill_sequence):
            # Learning phase complete, transition to review if mistakes
            if state.mistakes:
                state.phase = LessonPhase.REVIEW
                return self._get_review_drill(state)
            else:
                state.phase = LessonPhase.COMPLETE
                return None

        mode = state.drill_sequence[state.current_index]
        problem = self._sample_drill_for_mode(mode, state.theme_pairs, states)

        return (problem, mode, state.progress)

    def _get_review_drill(
        self,
        state: LessonState,
    ) -> Optional[tuple[Problem, DrillMode, dict]]:
        """Get next drill in review phase."""
        if state.review_index >= len(state.mistakes):
            state.phase = LessonPhase.COMPLETE
            return None

        mistake = state.mistakes[state.review_index]
        return (mistake.problem, mistake.mode, state.progress)

    def _sample_drill_for_mode(
        self,
        mode: DrillMode,
        theme_pairs: list[tuple[int, int]],
        states: dict[str, ConfusionState],
    ) -> Problem:
        """Sample a drill constrained to mode and theme pairs."""
        if mode == DrillMode.TWO_CHOICE_1SYL:
            return self._sample_2_choice_themed(theme_pairs, states)
        elif mode == DrillMode.FOUR_CHOICE_1SYL:
            return self._sample_4_choice_themed(theme_pairs, states)
        else:  # TWO_CHOICE_2SYL
            return self._sample_2_choice_2syl_themed(theme_pairs, states)

    def _sample_2_choice_themed(
        self,
        theme_pairs: list[tuple[int, int]],
        states: dict[str, ConfusionState],
    ) -> Problem:
        """Sample 2-choice drill from theme pairs."""
        # Pick one of the theme pairs
        pair = random.choice(theme_pairs)

        # Sample class from pair
        selected_class = pair[0] if random.random() < 0.5 else pair[1]
        words = self.drill_service._words_by_sequence.get(str(selected_class), [])

        if not words:
            # Fallback to other class
            selected_class = pair[1] if selected_class == pair[0] else pair[0]
            words = self.drill_service._words_by_sequence.get(str(selected_class), [])

        if not words:
            return self.drill_service._sample_fallback()

        word = random.choice(words)

        return Problem(
            problem_type_id=make_problem_type_id("tone", 1),
            word_id=word.id,
            vietnamese=word.vietnamese,
            english=word.english,
            correct_index=0,
            correct_sequence=[selected_class],
            alternatives=[[pair[0]], [pair[1]]],
        )

    def _sample_4_choice_themed(
        self,
        theme_pairs: list[tuple[int, int]],
        states: dict[str, ConfusionState],
    ) -> Problem:
        """Sample 4-choice drill including at least one theme pair."""
        # Build a 4-choice set that includes both classes from a theme pair
        pair = random.choice(theme_pairs)

        # Add 2 more tones to make 4
        all_tones = set(range(1, N_TONES + 1))
        remaining = list(all_tones - set(pair))
        random.shuffle(remaining)
        four_set = list(pair) + remaining[:2]
        random.shuffle(four_set)

        # Pick correct class from the four
        selected_class = random.choice(four_set)
        words = self.drill_service._words_by_sequence.get(str(selected_class), [])

        if not words:
            # Try other classes in set
            for cls in four_set:
                words = self.drill_service._words_by_sequence.get(str(cls), [])
                if words:
                    selected_class = cls
                    break

        if not words:
            return self.drill_service._sample_fallback()

        word = random.choice(words)

        return Problem(
            problem_type_id=make_problem_type_id("tone", 1),
            word_id=word.id,
            vietnamese=word.vietnamese,
            english=word.english,
            correct_index=0,
            correct_sequence=[selected_class],
            alternatives=[[c] for c in four_set],
        )

    def _sample_2_choice_2syl_themed(
        self,
        theme_pairs: list[tuple[int, int]],
        states: dict[str, ConfusionState],
    ) -> Problem:
        """Sample 2-syllable drill where one syllable uses theme tone."""
        # Find 2-syllable words where at least one syllable has a theme tone
        theme_tones = set()
        for p in theme_pairs:
            theme_tones.add(p[0])
            theme_tones.add(p[1])

        candidates = []
        candidate_keys = []
        for key, words in self.drill_service._words_by_sequence.items():
            parts = key.split('-')
            if len(parts) == 2:
                t1, t2 = int(parts[0]), int(parts[1])
                if t1 in theme_tones or t2 in theme_tones:
                    for word in words:
                        candidates.append(word)
                        candidate_keys.append(key)

        if not candidates:
            # Fallback to any 2-syllable
            problem = self.drill_service._sample_2_choice_multi_syllable(states)
            if problem:
                return problem
            return self.drill_service._sample_fallback()

        idx = random.randrange(len(candidates))
        word = candidates[idx]
        key = candidate_keys[idx]
        correct_sequence = [int(t) for t in key.split('-')]

        distractor = self.drill_service._generate_single_distractor(correct_sequence)
        alternatives = [correct_sequence, distractor]
        random.shuffle(alternatives)

        return Problem(
            problem_type_id=make_problem_type_id("tone", 2),
            word_id=word.id,
            vietnamese=word.vietnamese,
            english=word.english,
            correct_index=0,
            correct_sequence=correct_sequence,
            alternatives=alternatives,
        )

    def record_answer(
        self,
        session_id: str,
        problem: Problem,
        mode: DrillMode,
        selected_sequence: list[int],
        is_correct: bool,
    ) -> None:
        """Record an answer, tracking mistakes for review."""
        state = self._sessions.get(session_id)
        if state is None:
            return

        if state.phase == LessonPhase.LEARNING:
            if not is_correct:
                state.mistakes.append(MistakeRecord(
                    problem=problem,
                    mode=mode,
                    user_selected=selected_sequence,
                ))
            state.current_index += 1
        elif state.phase == LessonPhase.REVIEW:
            # Single pass review - no recursion
            state.review_index += 1

    def get_lesson_summary(self, session_id: str) -> Optional[dict]:
        """Get summary for completed lesson."""
        state = self._sessions.get(session_id)
        if state is None or state.phase != LessonPhase.COMPLETE:
            return None

        return {
            "lesson_id": state.lesson_id,
            "theme_id": state.theme_id,
            "theme_pairs": [[p[0], p[1]] for p in state.theme_pairs],
            "total_drills": len(state.drill_sequence),
            "mistakes_count": len(state.mistakes),
            "accuracy": (len(state.drill_sequence) - len(state.mistakes))
                       / len(state.drill_sequence) * 100,
        }

    def get_lesson_state(self, session_id: str) -> Optional[LessonState]:
        """Get the current lesson state."""
        return self._sessions.get(session_id)

    def cleanup_session(self, session_id: str) -> None:
        """Remove session state."""
        self._sessions.pop(session_id, None)


# Singleton
_lesson_service: Optional[LessonService] = None


def get_lesson_service() -> LessonService:
    """Get singleton LessonService."""
    global _lesson_service
    if _lesson_service is None:
        _lesson_service = LessonService()
    return _lesson_service
