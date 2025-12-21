"""ML layer for confusion-based probability estimation.

This module provides:
- Problem, Answer, StateUpdate, ConfusionState: Data models
- ProblemTypeConfig, PROBLEM_TYPES: Problem type registry
- ConfusionMLService: ML service implementation
"""

from .types import (
    Problem,
    Answer,
    StateUpdate,
    ConfusionState,
    BetaParams,
)
from .registry import (
    ProblemTypeConfig,
    PROBLEM_TYPES,
    get_problem_type,
    register_problem_type,
    make_problem_type_id,
    get_problem_types_for_drill,
)
from .service import (
    ConfusionMLService,
    get_ml_service,
)

__all__ = [
    # Types
    "Problem",
    "Answer",
    "StateUpdate",
    "ConfusionState",
    "BetaParams",
    # Registry
    "ProblemTypeConfig",
    "PROBLEM_TYPES",
    "get_problem_type",
    "register_problem_type",
    "make_problem_type_id",
    "get_problem_types_for_drill",
    # Service
    "ConfusionMLService",
    "get_ml_service",
]
