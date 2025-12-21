"""ML service using Luce Choice Model.

The Luce Choice Model (Bradley-Terry-Luce) models choice probability as
the ratio of "strengths" for each option:

    P(choose j | played i, alternatives A) = v[i,j] / Σ_{k∈A} v[i,k]

This implementation uses log-strengths for numerical stability and
Bayesian updates via gradient descent on the posterior.

Key differences from Dirichlet-Categorical (ConfusionMLService):
- Models underlying "strengths" rather than category probabilities directly
- Uses multiplicative/gradient-based updates rather than count increments
- Better handles varying alternative sets (the model is consistent under
  subset selection - IIA property)
"""

import math
import numpy as np
from typing import Optional

from .types import Problem, Answer, StateUpdate, ConfusionState, BetaParams
from .registry import get_problem_type


class LuceState(ConfusionState):
    """State for Luce model.

    Inherits from ConfusionState for compatibility.
    The 'counts' field stores log-strengths: log(v[i,j]).
    Higher values = higher probability of selecting j when i is played.
    """

    # Learning rate for Bayesian updates
    learning_rate: float = 0.1

    @classmethod
    def from_counts(cls, n_classes: int, counts: list[list[float]],
                    learning_rate: float = 0.1) -> "LuceState":
        """Create LuceState from log-strength matrix."""
        return cls(n_classes=n_classes, counts=counts, learning_rate=learning_rate)

    def get_strength(self, played: int, selected: int) -> float:
        """Get strength v[i,j] = exp(log_strength[i,j]). 1-indexed inputs."""
        log_strength = self.counts[played - 1][selected - 1]
        return math.exp(log_strength)

    def get_log_strength(self, played: int, selected: int) -> float:
        """Get log-strength. 1-indexed inputs."""
        return self.counts[played - 1][selected - 1]

    def copy_with_update(self, played: int, selected: int,
                         alternatives: list[int],
                         learning_rate: Optional[float] = None) -> "LuceState":
        """Return new state with Bayesian update after observation.

        Uses stochastic gradient descent on the log-posterior.
        Updates log-strengths based on:
        - Increase log_v[played, selected] (chosen option)
        - Decrease log_v[played, alt] for alternatives (not chosen)

        1-indexed inputs.
        """
        lr = learning_rate if learning_rate is not None else self.learning_rate
        new_counts = [row.copy() for row in self.counts]

        # Get current probabilities under Luce model
        played_idx = played - 1
        all_options = alternatives  # includes selected

        # Compute choice probabilities
        log_strengths = [new_counts[played_idx][opt - 1] for opt in all_options]
        max_log = max(log_strengths)
        exp_strengths = [math.exp(ls - max_log) for ls in log_strengths]
        total = sum(exp_strengths)
        probs = [e / total for e in exp_strengths]

        # Gradient update: ∂log P(selected) / ∂log v[played, k]
        # = 1{k=selected} - P(k | played, alternatives)
        for opt, prob in zip(all_options, probs):
            opt_idx = opt - 1
            if opt == selected:
                # Gradient is (1 - prob), increase strength
                new_counts[played_idx][opt_idx] += lr * (1.0 - prob)
            else:
                # Gradient is -prob, decrease strength
                new_counts[played_idx][opt_idx] -= lr * prob

        return LuceState(n_classes=self.n_classes, counts=new_counts,
                         learning_rate=self.learning_rate)


class LuceMLService:
    """ML service using Luce Choice Model.

    Implements the same interface as ConfusionMLService but uses
    the Luce (ratio-of-strengths) model instead of Dirichlet-Categorical.
    """

    def __init__(self, learning_rate: float = 0.1):
        """Initialize with learning rate for updates.

        Args:
            learning_rate: Step size for gradient updates (default 0.1)
        """
        self.learning_rate = learning_rate

    def get_initial_state(self, problem_type_id: str) -> LuceState:
        """Create initial state with uniform priors for this problem type.

        All log-strengths start at 0, giving P(correct | 2 choices) = 50%.
        Learning happens purely from observations.
        """
        config = get_problem_type(problem_type_id)
        n = config.n_classes

        # Initialize all log-strengths to 0 (uniform)
        # This gives P(correct | k choices) = 1/k initially
        log_strengths = np.zeros((n, n))

        return LuceState(
            n_classes=n,
            counts=log_strengths.tolist(),
            learning_rate=self.learning_rate
        )

    def get_success_distribution(
        self,
        problem: Problem,
        state: ConfusionState,
    ) -> BetaParams:
        """Get Beta distribution for P(success | problem, state).

        Computes the Luce choice probability for the correct answer
        and returns Beta params where alpha/beta directly represent
        the success probability (alpha = p_correct, beta = 1 - p_correct,
        scaled by a fixed factor for numerical stability).
        """
        # Get the class being tested (first syllable)
        correct_class = problem.correct_sequence[0]
        alt_classes = [alt[0] for alt in problem.alternatives]
        all_classes = [correct_class] + alt_classes

        # Compute Luce choice probabilities
        log_strengths = []
        for c in all_classes:
            log_strengths.append(state.counts[correct_class - 1][c - 1])

        # Softmax for numerical stability
        max_log = max(log_strengths)
        exp_strengths = [math.exp(ls - max_log) for ls in log_strengths]
        total = sum(exp_strengths)

        # P(correct) is the first option
        p_correct = exp_strengths[0] / total

        # Use fixed effective_n so alpha/(alpha+beta) = p_correct exactly
        effective_n = 2.0
        alpha = p_correct * effective_n
        beta = (1 - p_correct) * effective_n

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
    ) -> tuple[LuceState, list[StateUpdate]]:
        """Update state after observing user's answer.

        Uses gradient descent on log-likelihood.
        Returns new state and list of changes made for logging.
        """
        updates: list[StateUpdate] = []

        # Convert to LuceState if needed
        if isinstance(state, LuceState):
            luce_state = state
        else:
            luce_state = LuceState(
                n_classes=state.n_classes,
                counts=state.counts,
                learning_rate=self.learning_rate
            )

        # Get classes involved
        correct_class = problem.correct_sequence[0]
        selected_class = answer.selected_sequence[0]
        alt_classes = [alt[0] for alt in problem.alternatives]
        all_classes = [correct_class] + alt_classes

        # Record old values for logging
        for c in all_classes:
            old_value = luce_state.get_log_strength(correct_class, c)
            updates.append(StateUpdate(
                tracker_id=f"log_strength[{correct_class}][{c}]",
                old_value=old_value,
                new_value=0.0,  # Will be filled after update
            ))

        # Perform update
        new_state = luce_state.copy_with_update(
            played=correct_class,
            selected=selected_class,
            alternatives=all_classes,
        )

        # Update the logged new values
        for i, c in enumerate(all_classes):
            updates[i] = StateUpdate(
                tracker_id=updates[i].tracker_id,
                old_value=updates[i].old_value,
                new_value=new_state.get_log_strength(correct_class, c),
            )

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
        n = state.n_classes
        log_strengths = state.counts[played_class - 1]

        # Softmax
        max_log = max(log_strengths)
        exp_strengths = [math.exp(ls - max_log) for ls in log_strengths]
        total = sum(exp_strengths)
        probs = [e / total for e in exp_strengths]

        # Return 1-indexed
        return {i + 1: probs[i] for i in range(n)}

    def get_all_pair_stats(
        self,
        problem_type_id: str,
        state: ConfusionState,
    ) -> dict[tuple[int, int], BetaParams]:
        """Get Beta parameters for all pairs of classes.

        Creates synthetic 2-choice problems for each pair and uses
        batch_success_distribution to compute stats consistently.
        """
        config = get_problem_type(problem_type_id)
        n = config.n_classes

        # Create synthetic problems for each pair (both directions)
        problems: list[Problem] = []
        pair_indices: list[tuple[int, int]] = []

        for i in range(n):
            for j in range(i + 1, n):
                # Problem where class i+1 is correct, j+1 is alternative
                problems.append(Problem(
                    problem_type_id=problem_type_id,
                    word_id=0,  # Synthetic
                    vietnamese="",
                    correct_index=0,
                    correct_sequence=[i + 1],  # 1-indexed
                    alternatives=[[j + 1]],  # 1-indexed
                ))
                pair_indices.append((i + 1, j + 1, "i"))

                # Problem where class j+1 is correct, i+1 is alternative
                problems.append(Problem(
                    problem_type_id=problem_type_id,
                    word_id=0,
                    vietnamese="",
                    correct_index=0,
                    correct_sequence=[j + 1],
                    alternatives=[[i + 1]],
                ))
                pair_indices.append((i + 1, j + 1, "j"))

        # Get all success distributions in one batch
        betas = self.batch_success_distribution(problems, state)

        # Use moment-matched Beta mixture for each pair
        from .beta_utils import beta_mixture_approx

        result = {}
        for idx in range(0, len(betas), 2):
            beta_i = betas[idx]      # i is correct
            beta_j = betas[idx + 1]  # j is correct
            i, j, _ = pair_indices[idx]

            # Compute moment-matched mixture of the two directions
            mix_alpha, mix_beta = beta_mixture_approx(
                beta_i.alpha, beta_i.beta,
                beta_j.alpha, beta_j.beta,
                w1=0.5,  # Equal weight for both directions
            )

            result[(i, j)] = BetaParams(alpha=mix_alpha, beta=mix_beta)

        return result


# Module-level singleton
_luce_service: Optional[LuceMLService] = None


def get_luce_service(learning_rate: float = 0.1) -> LuceMLService:
    """Get the Luce ML service singleton."""
    global _luce_service
    if _luce_service is None:
        _luce_service = LuceMLService(learning_rate=learning_rate)
    return _luce_service
