"""Bayesian confusion model for tone prediction.

Uses Dirichlet-Categorical conjugate prior for closed-form Bayesian updates.
"""

from typing import Literal, Optional
import numpy as np
from pydantic import BaseModel

# 6 Vietnamese tones
ToneT = Literal["level", "falling", "rising", "dipping", "creaky", "heavy"]
TONES: list[ToneT] = ["level", "falling", "rising", "dipping", "creaky", "heavy"]
TONE_TO_IDX = {tone: i for i, tone in enumerate(TONES)}
NUM_TONES = len(TONES)


class Problem(BaseModel):
    """A tone problem (what was played)."""

    tone: ToneT
    letter: Optional[str] = None
    playback_speed: Optional[float] = None
    voice: Optional[str] = None


class ConfusionState(BaseModel):
    """State for the confusion model.

    Stores pseudo-counts for Dirichlet posterior.
    confusion_counts[i][j] = count of times tone j was selected when tone i was played.
    """

    # 6x6 matrix: prior + observed counts
    # Row i = distribution over selections when tone i was played
    counts: list[list[float]]

    class Config:
        # Allow numpy arrays to be converted
        arbitrary_types_allowed = True


def make_initial_state(prior_strength: float = 1.0) -> ConfusionState:
    """Create initial state with uniform Dirichlet prior.

    Args:
        prior_strength: Strength of prior belief. Higher = more regularization.
            1.0 = uniform prior (each tone equally likely to be confused).
            Setting diagonal higher would encode "correct answer more likely".

    Returns:
        Initial confusion state.
    """
    # Start with slight bias toward correct answer (diagonal)
    # This encodes prior belief that users are slightly better than random
    prior = np.ones((NUM_TONES, NUM_TONES)) * prior_strength
    for i in range(NUM_TONES):
        prior[i, i] += prior_strength * 2  # 3x weight on diagonal

    return ConfusionState(counts=prior.tolist())


def get_confusion_prob(problem: Problem, state: ConfusionState) -> dict[ToneT, float]:
    """Get confusion probabilities for a single problem.

    Args:
        problem: The tone that was played.
        state: Current model state.

    Returns:
        Dictionary mapping each tone to P(guess=tone | played=problem.tone).
        Probabilities sum to 1.0 over all 6 tones.
    """
    counts = np.array(state.counts)
    tone_idx = TONE_TO_IDX[problem.tone]

    # Dirichlet posterior mean: alpha_i / sum(alpha)
    row = counts[tone_idx]
    probs = row / row.sum()

    return {tone: float(probs[i]) for i, tone in enumerate(TONES)}


def get_confusion_prob_batch(
    problems: list[Problem], state: ConfusionState
) -> list[dict[ToneT, float]]:
    """Get confusion probabilities for multiple problems.

    Args:
        problems: List of problems (tones that were played).
        state: Current model state.

    Returns:
        List of dictionaries, one per problem.
    """
    return [get_confusion_prob(p, state) for p in problems]


def update_state(
    state: ConfusionState,
    problem: Problem,
    alternatives: list[ToneT],
    choice: ToneT,
) -> ConfusionState:
    """Update state after observing a user's choice.

    The update is Bayesian: we increment the count for the (played, selected) pair.

    Args:
        state: Current model state.
        problem: The tone that was played.
        alternatives: The choices that were shown (unused in basic model,
                     but could be used for choice-set-aware updates).
        choice: The tone the user selected.

    Returns:
        New state with updated counts.
    """
    counts = np.array(state.counts)
    tone_idx = TONE_TO_IDX[problem.tone]
    choice_idx = TONE_TO_IDX[choice]

    # Increment count for this (played, selected) pair
    counts[tone_idx, choice_idx] += 1.0

    return ConfusionState(counts=counts.tolist())


def get_error_probability(
    problem: Problem, alternatives: list[ToneT], state: ConfusionState
) -> float:
    """Get probability of making an error on this problem.

    Useful for priority scoring: higher error probability = review sooner.

    Args:
        problem: The tone being tested.
        alternatives: The choices that will be shown.
        state: Current model state.

    Returns:
        P(error) = 1 - P(correct | alternatives).
    """
    probs = get_confusion_prob(problem, state)
    correct_tone = problem.tone

    # P(correct | alternatives) = P(correct) / sum(P(alt) for alt in alternatives)
    alt_probs = [probs[alt] for alt in alternatives]
    correct_prob_given_alts = probs[correct_tone] / sum(alt_probs)

    return 1.0 - correct_prob_given_alts
