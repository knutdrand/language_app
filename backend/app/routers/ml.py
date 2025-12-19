"""ML API endpoints for confusion probability model."""

from fastapi import APIRouter

from app.ml import (
    get_confusion_prob,
    get_confusion_prob_batch,
    update_state,
    make_initial_state,
    get_error_probability,
    ConfusionState,
    ToneT,
)
from app.models.ml import (
    ConfusionProbRequest,
    ConfusionProbBatchRequest,
    UpdateStateRequest,
    ErrorProbRequest,
    InitialStateResponse,
)

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/initial-state")
def get_initial_state(prior_strength: float = 1.0) -> InitialStateResponse:
    """Get initial confusion model state.

    Args:
        prior_strength: Strength of prior belief (default 1.0).

    Returns:
        Initial state to store client-side.
    """
    state = make_initial_state(prior_strength)
    return InitialStateResponse(state=state)


@router.post("/confusion-prob")
def confusion_prob(request: ConfusionProbRequest) -> dict[ToneT, float]:
    """Get confusion probabilities for a single problem.

    Args:
        request: Problem and current state.

    Returns:
        Dictionary mapping each tone to P(guess=tone | played=problem.tone).
    """
    state = ConfusionState(**request.state) if isinstance(request.state, dict) else request.state
    return get_confusion_prob(request.problem, state)


@router.post("/confusion-prob-batch")
def confusion_prob_batch(
    request: ConfusionProbBatchRequest,
) -> list[dict[ToneT, float]]:
    """Get confusion probabilities for multiple problems.

    Args:
        request: Problems and current state.

    Returns:
        List of probability dictionaries, one per problem.
    """
    state = ConfusionState(**request.state) if isinstance(request.state, dict) else request.state
    return get_confusion_prob_batch(request.problems, state)


@router.post("/update-state")
def update_confusion_state(request: UpdateStateRequest) -> ConfusionState:
    """Update state after observing user's choice.

    Args:
        request: Current state, problem, alternatives shown, and user's choice.

    Returns:
        New state to store client-side.
    """
    state = ConfusionState(**request.state) if isinstance(request.state, dict) else request.state
    return update_state(state, request.problem, request.alternatives, request.choice)


@router.post("/error-prob")
def error_prob(request: ErrorProbRequest) -> float:
    """Get probability of making an error on this problem.

    Useful for priority scoring: higher error probability = review sooner.

    Args:
        request: Problem, alternatives, and current state.

    Returns:
        P(error) = 1 - P(correct | alternatives).
    """
    state = ConfusionState(**request.state) if isinstance(request.state, dict) else request.state
    return get_error_probability(request.problem, request.alternatives, state)
