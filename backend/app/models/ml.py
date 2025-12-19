"""Pydantic schemas for ML API endpoints."""

from typing import Any
from pydantic import BaseModel

from app.ml.model import ToneT, Problem, ConfusionState

# Re-export for convenience
__all__ = ["ToneT", "Problem", "ConfusionState"]

# StateT is opaque to API callers - they just pass it through
StateT = Any


class ConfusionProbRequest(BaseModel):
    """Request for single problem confusion probability."""

    problem: Problem
    state: StateT


class ConfusionProbBatchRequest(BaseModel):
    """Request for batch confusion probabilities."""

    problems: list[Problem]
    state: StateT


class UpdateStateRequest(BaseModel):
    """Request to update state after user answers."""

    state: StateT
    problem: Problem
    alternatives: list[ToneT]
    choice: ToneT


class ErrorProbRequest(BaseModel):
    """Request for error probability on a problem."""

    problem: Problem
    alternatives: list[ToneT]
    state: StateT


class InitialStateResponse(BaseModel):
    """Response containing initial state."""

    state: ConfusionState
