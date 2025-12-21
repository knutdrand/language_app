"""Pydantic models for the ML layer.

These models define the interface between the main logic layer and ML layer.
"""

from typing import Any, Literal
from pydantic import BaseModel, Field


class Problem(BaseModel):
    """A drill problem presented to the user.

    This represents a single question: given audio of a word, identify
    the correct tone/vowel sequence from alternatives.
    """
    problem_type_id: str  # e.g., "tone_1", "tone_2", "vowel_1"
    word_id: int
    vietnamese: str
    correct_index: int  # 0-indexed position in correct_sequence
    correct_sequence: list[int]  # 1-indexed tones/vowels for each syllable
    alternatives: list[list[int]]  # Other options shown (excludes correct)

    @property
    def syllable_count(self) -> int:
        return len(self.correct_sequence)

    @property
    def n_choices(self) -> int:
        return len(self.alternatives) + 1

    @property
    def all_choices(self) -> list[list[int]]:
        """All choices including correct, with correct first."""
        return [self.correct_sequence] + self.alternatives


class Answer(BaseModel):
    """User's answer to a problem."""
    selected_sequence: list[int]  # What the user chose
    elapsed_ms: int  # Response time

    def is_correct(self, problem: Problem) -> bool:
        return self.selected_sequence == problem.correct_sequence


class StateUpdate(BaseModel):
    """A single change made to the ML state.

    Used for logging/debugging state transitions.
    """
    tracker_id: str  # e.g., "counts[2][3]" or "counts_by_context.1-0[2][3]"
    old_value: float
    new_value: float


class ConfusionState(BaseModel):
    """State for the confusion model.

    Stores pseudo-counts for Dirichlet posterior.
    counts[i][j] = count of times class j was selected when class i was played.

    For multi-syllable problems, we track confusion per position.
    """
    n_classes: int  # 6 for tones, 12 for vowels
    counts: list[list[float]]  # n_classes x n_classes global matrix

    model_config = {"arbitrary_types_allowed": True}

    def get_count(self, played: int, selected: int) -> float:
        """Get count for (played, selected) pair. 1-indexed inputs."""
        return self.counts[played - 1][selected - 1]

    def copy_with_increment(self, played: int, selected: int) -> "ConfusionState":
        """Return new state with incremented count. 1-indexed inputs."""
        new_counts = [row.copy() for row in self.counts]
        new_counts[played - 1][selected - 1] += 1.0
        return ConfusionState(n_classes=self.n_classes, counts=new_counts)


class BetaParams(BaseModel):
    """Parameters of a Beta distribution."""
    alpha: float
    beta: float

    @property
    def mean(self) -> float:
        """Expected value of the Beta distribution."""
        return self.alpha / (self.alpha + self.beta)

    @property
    def total_observations(self) -> float:
        """Effective number of observations (alpha + beta - prior)."""
        return self.alpha + self.beta
