"""ML service for confusion-based probability estimation.

This service is stateless - it receives state and returns new state.
State persistence is handled by the main logic layer.
"""

import numpy as np
from typing import Optional, Protocol

from .types import Problem, Answer, StateUpdate, ConfusionState, BetaParams
from .registry import get_problem_type, ProblemTypeConfig


class MLServiceProtocol(Protocol):
    """Protocol defining the ML service interface."""

    def get_initial_state(self, problem_type_id: str) -> ConfusionState:
        """Create initial state with priors for this problem type."""
        ...

    def get_success_distribution(
        self,
        problem: Problem,
        state: ConfusionState,
    ) -> BetaParams:
        """Get Beta distribution for P(success | problem, state)."""
        ...

    def batch_success_distribution(
        self,
        problems: list[Problem],
        state: ConfusionState,
    ) -> list[BetaParams]:
        """Get Beta distributions for multiple problems."""
        ...

    def update_state(
        self,
        state: ConfusionState,
        problem: Problem,
        answer: Answer,
    ) -> tuple[ConfusionState, list[StateUpdate]]:
        """Update state after observing user's answer."""
        ...


class ConfusionMLService:
    """ML service using confusion matrix model.

    Uses Dirichlet-Categorical conjugate prior for closed-form Bayesian updates.
    The confusion matrix tracks P(selected | played) for each class pair.
    """

    def get_initial_state(self, problem_type_id: str) -> ConfusionState:
        """Create initial state with priors for this problem type.

        Prior encodes slight bias toward correct answers (3x weight on diagonal).
        """
        config = get_problem_type(problem_type_id)
        n = config.n_classes
        pseudocount = config.pseudocount

        # Start with uniform prior, add extra weight on diagonal
        counts = np.ones((n, n)) * pseudocount
        for i in range(n):
            counts[i, i] += pseudocount * 2  # 3x weight on diagonal

        return ConfusionState(n_classes=n, counts=counts.tolist())

    def get_success_distribution(
        self,
        problem: Problem,
        state: ConfusionState,
    ) -> BetaParams:
        """Get Beta distribution for P(success | problem, state).

        For a problem with multiple alternatives, success probability is:
        P(correct | alternatives) = P(correct) / sum(P(alt) for alt in alternatives)

        We return Beta parameters that approximate this distribution.
        For single-syllable problems, this is exact. For multi-syllable,
        we use the first syllable as primary (can be extended later).
        """
        config = get_problem_type(problem.problem_type_id)
        counts = np.array(state.counts)

        # Get the class being tested (first syllable for now)
        # TODO: Extend to handle multi-syllable properly
        correct_class = problem.correct_sequence[0]
        alt_classes = [alt[0] for alt in problem.alternatives]
        all_classes = [correct_class] + alt_classes

        # Get confusion row for the correct class
        row = counts[correct_class - 1]  # Convert to 0-indexed

        # Calculate probabilities for each alternative
        alt_probs = [row[c - 1] for c in all_classes]  # Convert to 0-indexed
        total_prob = sum(alt_probs)
        correct_prob = row[correct_class - 1] / total_prob

        # Convert to Beta parameters
        # Use effective sample size from the confusion matrix
        effective_n = sum(row) / config.n_classes  # Average observations per class
        alpha = correct_prob * effective_n
        beta = (1 - correct_prob) * effective_n

        # Ensure minimum values for numerical stability
        alpha = max(alpha, 0.1)
        beta = max(beta, 0.1)

        return BetaParams(alpha=alpha, beta=beta)

    def batch_success_distribution(
        self,
        problems: list[Problem],
        state: ConfusionState,
    ) -> list[BetaParams]:
        """Get Beta distributions for multiple problems."""
        return [self.get_success_distribution(p, state) for p in problems]

    def update_state(
        self,
        state: ConfusionState,
        problem: Problem,
        answer: Answer,
    ) -> tuple[ConfusionState, list[StateUpdate]]:
        """Update state after observing user's answer.

        Returns new state and list of changes made for logging.
        """
        updates: list[StateUpdate] = []

        # For now, only update based on first syllable
        # TODO: Extend to handle multi-syllable properly
        correct_class = problem.correct_sequence[0]
        selected_class = answer.selected_sequence[0]

        # Record the update
        old_value = state.get_count(correct_class, selected_class)
        new_value = old_value + 1.0

        updates.append(StateUpdate(
            tracker_id=f"counts[{correct_class}][{selected_class}]",
            old_value=old_value,
            new_value=new_value,
        ))

        # Create new state with updated count
        new_state = state.copy_with_increment(correct_class, selected_class)

        return new_state, updates

    def get_confusion_probability(
        self,
        problem_type_id: str,
        played_class: int,
        state: ConfusionState,
    ) -> dict[int, float]:
        """Get confusion probabilities for a single played class.

        Returns P(selected=j | played=i) for all classes j.
        Classes are 1-indexed.
        """
        counts = np.array(state.counts)
        row = counts[played_class - 1]  # Convert to 0-indexed
        probs = row / row.sum()

        # Return 1-indexed
        return {i + 1: float(probs[i]) for i in range(state.n_classes)}

    def get_all_pair_stats(
        self,
        problem_type_id: str,
        state: ConfusionState,
    ) -> dict[tuple[int, int], BetaParams]:
        """Get Beta parameters for all pairs of classes.

        Useful for determining mastery across all possible confusions.
        Returns dict with (class_a, class_b) keys where a < b.
        """
        config = get_problem_type(problem_type_id)
        n = config.n_classes
        counts = np.array(state.counts)
        result = {}

        for i in range(n):
            for j in range(i + 1, n):
                # For pair (i, j), calculate P(correct) when shown both
                # Get P(i|i) / (P(i|i) + P(j|i)) and P(j|j) / (P(i|j) + P(j|j))
                # Average these for symmetric pair difficulty

                row_i = counts[i]
                row_j = counts[j]

                # When i is played, choosing between i and j
                p_correct_given_i = row_i[i] / (row_i[i] + row_i[j])
                # When j is played, choosing between i and j
                p_correct_given_j = row_j[j] / (row_j[i] + row_j[j])

                # Average success rate for this pair
                avg_success = (p_correct_given_i + p_correct_given_j) / 2

                # Effective observations for this pair
                n_obs = (row_i[i] + row_i[j] + row_j[i] + row_j[j]) / 2

                alpha = avg_success * n_obs
                beta = (1 - avg_success) * n_obs

                # Ensure minimum values
                alpha = max(alpha, 0.1)
                beta = max(beta, 0.1)

                # 1-indexed keys
                result[(i + 1, j + 1)] = BetaParams(alpha=alpha, beta=beta)

        return result


# Module-level singletons for convenience
_confusion_service: Optional[ConfusionMLService] = None


def get_confusion_service() -> ConfusionMLService:
    """Get the Dirichlet-Categorical ML service singleton."""
    global _confusion_service
    if _confusion_service is None:
        _confusion_service = ConfusionMLService()
    return _confusion_service


def get_ml_service() -> MLServiceProtocol:
    """Get the configured ML service based on settings.

    Returns either LuceMLService or ConfusionMLService depending on
    the ML_SERVICE_TYPE setting. Default is "luce".
    """
    from app.config import get_settings

    settings = get_settings()

    if settings.ML_SERVICE_TYPE == "luce":
        from .luce_service import get_luce_service
        return get_luce_service(learning_rate=settings.ML_LEARNING_RATE)
    else:
        return get_confusion_service()
