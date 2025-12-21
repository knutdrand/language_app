"""Problem type registry.

Each problem type has its own confusion state. Problem types are defined by:
- Drill type (tone vs vowel)
- Number of syllables (1, 2, etc.)

Number of alternatives (2-choice, 4-choice) does NOT create separate states.
"""

from typing import Literal
from pydantic import BaseModel


class ProblemTypeConfig(BaseModel):
    """Configuration for a problem type."""
    problem_type_id: str  # e.g., "tone_1", "tone_2", "vowel_1"
    drill_type: Literal["tone", "vowel"]
    syllable_count: int
    n_classes: int  # 6 for tone, 12 for vowel
    pseudocount: float = 2.0  # Prior strength for Bayesian updates

    @property
    def matrix_size(self) -> int:
        """Size of confusion matrix (n_classes x n_classes)."""
        return self.n_classes


def make_problem_type_id(drill_type: Literal["tone", "vowel"], syllable_count: int) -> str:
    """Generate problem type ID from components."""
    return f"{drill_type}_{syllable_count}"


# Registry of all known problem types
PROBLEM_TYPES: dict[str, ProblemTypeConfig] = {
    # Tone drills - 6 tones
    "tone_1": ProblemTypeConfig(
        problem_type_id="tone_1",
        drill_type="tone",
        syllable_count=1,
        n_classes=6,
        pseudocount=2.0,
    ),
    "tone_2": ProblemTypeConfig(
        problem_type_id="tone_2",
        drill_type="tone",
        syllable_count=2,
        n_classes=6,
        pseudocount=2.0,
    ),
    # Vowel drills - 12 vowels (higher pseudocount due to more confusion)
    "vowel_1": ProblemTypeConfig(
        problem_type_id="vowel_1",
        drill_type="vowel",
        syllable_count=1,
        n_classes=12,
        pseudocount=5.0,
    ),
    "vowel_2": ProblemTypeConfig(
        problem_type_id="vowel_2",
        drill_type="vowel",
        syllable_count=2,
        n_classes=12,
        pseudocount=5.0,
    ),
}


def get_problem_type(problem_type_id: str) -> ProblemTypeConfig:
    """Get problem type config by ID.

    If the problem type doesn't exist but follows the pattern {drill_type}_{syllable_count},
    it will be auto-registered with default settings.
    """
    if problem_type_id not in PROBLEM_TYPES:
        # Try to auto-register based on pattern
        parts = problem_type_id.split("_")
        if len(parts) == 2:
            drill_type, syllable_str = parts
            if drill_type in ("tone", "vowel") and syllable_str.isdigit():
                syllable_count = int(syllable_str)
                n_classes = 6 if drill_type == "tone" else 12
                pseudocount = 2.0 if drill_type == "tone" else 5.0
                config = ProblemTypeConfig(
                    problem_type_id=problem_type_id,
                    drill_type=drill_type,  # type: ignore
                    syllable_count=syllable_count,
                    n_classes=n_classes,
                    pseudocount=pseudocount,
                )
                register_problem_type(config)
                return config

        raise KeyError(f"Unknown problem type: {problem_type_id}. "
                      f"Known types: {list(PROBLEM_TYPES.keys())}")
    return PROBLEM_TYPES[problem_type_id]


def register_problem_type(config: ProblemTypeConfig) -> None:
    """Register a new problem type. Allows dynamic registration for testing."""
    PROBLEM_TYPES[config.problem_type_id] = config


def get_problem_types_for_drill(drill_type: Literal["tone", "vowel"]) -> list[ProblemTypeConfig]:
    """Get all problem types for a drill type, sorted by syllable count."""
    types = [cfg for cfg in PROBLEM_TYPES.values() if cfg.drill_type == drill_type]
    return sorted(types, key=lambda x: x.syllable_count)
