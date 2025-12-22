"""ML service using Luce Choice Model with MM-style updates.

The Luce Choice Model (Bradley-Terry-Luce) models choice probability as
the ratio of "strengths" for each option:

    P(choose j | played i, alternatives A) = θ[i,j] / Σ_{k∈A} θ[i,k]

This implementation uses count-based strength estimation inspired by
Hunter's MM algorithm for Plackett-Luce models. Instead of gradient
descent, we directly track observation counts and use them as strengths
with Laplace smoothing.

Key properties:
- Strengths are counts + prior (interpretable)
- effective_n grows with observations (proper uncertainty)
- Handles varying alternative set sizes correctly (Luce property)
"""

import math
import numpy as np
from typing import Optional

from .types import Problem, Answer, StateUpdate, ConfusionState, BetaParams
from .registry import get_problem_type


class LuceState(ConfusionState):
    """State for Luce model using count-based strengths.

    The 'counts' field stores observation counts: counts[i][j] = number of
    times class j was selected when class i was played.

    Strengths are computed as counts + prior for Laplace smoothing.
    """

    prior: float = 1.0  # Laplace smoothing prior per cell

    @classmethod
    def from_counts(
        cls, n_classes: int, counts: list[list[float]], prior: float = 1.0
    ) -> "LuceState":
        """Create LuceState from count matrix."""
        return cls(n_classes=n_classes, counts=counts, prior=prior)

    def get_strength(self, played: int, selected: int) -> float:
        """Get strength θ[i,j] = counts[i,j] + prior. 1-indexed inputs."""
        return self.counts[played - 1][selected - 1] + self.prior

    def get_total_observations(self, played: int) -> float:
        """Get total observations for a played class. 1-indexed input."""
        return sum(self.counts[played - 1])

    def copy_with_increment(self, played: int, selected: int) -> "LuceState":
        """Return new state with incremented count. 1-indexed inputs."""
        new_counts = [row.copy() for row in self.counts]
        new_counts[played - 1][selected - 1] += 1.0
        return LuceState(n_classes=self.n_classes, counts=new_counts, prior=self.prior)


class LuceMLService:
    """ML service using Luce Choice Model with count-based strengths.

    Uses the Luce/Plackett-Luce formula for probabilities but with
    count-based strength estimation (equivalent to MM algorithm fixed point).
    """

    def __init__(self, prior: float = 1.0):
        """Initialize with prior for Laplace smoothing.

        Args:
            prior: Pseudocount added to each cell (default 1.0)
        """
        self.prior = prior

    def get_initial_state(self, problem_type_id: str) -> LuceState:
        """Create initial state with zero counts.

        All cells start at 0, with prior applied during strength calculation.
        This gives P(correct | 2 choices) = 50% initially.
        """
        config = get_problem_type(problem_type_id)
        n = config.n_classes

        # Initialize all counts to 0
        counts = np.zeros((n, n))

        return LuceState(n_classes=n, counts=counts.tolist(), prior=self.prior)

    def get_success_distribution(
        self,
        problem: Problem,
        state: ConfusionState,
    ) -> BetaParams:
        """Get Beta distribution for P(success | problem, state).

        Uses Luce formula for probability, with effective_n based on
        actual observation counts.
        """
        # Handle both LuceState and ConfusionState
        prior = getattr(state, "prior", self.prior)

        # Get the class being tested (first syllable)
        correct_class = problem.correct_sequence[0]
        alt_classes = [alt[0] for alt in problem.alternatives]
        all_classes = [correct_class] + alt_classes

        # Compute strengths (counts + prior)
        strengths = []
        for c in all_classes:
            count = state.counts[correct_class - 1][c - 1]
            strengths.append(count + prior)

        # Luce choice probability
        total_strength = sum(strengths)
        p_correct = strengths[0] / total_strength

        # Effective N based on observations for this played class
        # prior_n = number of alternatives * prior (initial pseudocounts)
        n_obs = sum(state.counts[correct_class - 1])
        prior_n = len(all_classes) * prior
        effective_n = prior_n + n_obs

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

        Simply increments the count for (played, selected).
        """
        updates: list[StateUpdate] = []

        # Convert to LuceState if needed
        if isinstance(state, LuceState):
            luce_state = state
        else:
            luce_state = LuceState(
                n_classes=state.n_classes, counts=state.counts, prior=self.prior
            )

        # Get classes involved
        correct_class = problem.correct_sequence[0]
        selected_class = answer.selected_sequence[0]

        # Record the update
        old_value = luce_state.counts[correct_class - 1][selected_class - 1]
        new_value = old_value + 1.0

        updates.append(
            StateUpdate(
                tracker_id=f"counts[{correct_class}][{selected_class}]",
                old_value=old_value,
                new_value=new_value,
            )
        )

        # Create new state with incremented count
        new_state = luce_state.copy_with_increment(correct_class, selected_class)

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
        prior = getattr(state, "prior", self.prior)
        n = state.n_classes

        # Compute strengths
        strengths = [state.counts[played_class - 1][j] + prior for j in range(n)]
        total = sum(strengths)
        probs = [s / total for s in strengths]

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
        pair_indices: list[tuple[int, int, str]] = []

        for i in range(n):
            for j in range(i + 1, n):
                # Problem where class i+1 is correct, j+1 is alternative
                problems.append(
                    Problem(
                        problem_type_id=problem_type_id,
                        word_id=0,  # Synthetic
                        vietnamese="",
                        correct_index=0,
                        correct_sequence=[i + 1],  # 1-indexed
                        alternatives=[[j + 1]],  # 1-indexed
                    )
                )
                pair_indices.append((i + 1, j + 1, "i"))

                # Problem where class j+1 is correct, i+1 is alternative
                problems.append(
                    Problem(
                        problem_type_id=problem_type_id,
                        word_id=0,
                        vietnamese="",
                        correct_index=0,
                        correct_sequence=[j + 1],
                        alternatives=[[i + 1]],
                    )
                )
                pair_indices.append((i + 1, j + 1, "j"))

        # Get all success distributions in one batch
        betas = self.batch_success_distribution(problems, state)

        # Use moment-matched Beta mixture for each pair
        from .beta_utils import beta_mixture_approx

        result = {}
        for idx in range(0, len(betas), 2):
            beta_i = betas[idx]  # i is correct
            beta_j = betas[idx + 1]  # j is correct
            i, j, _ = pair_indices[idx]

            # Compute moment-matched mixture of the two directions
            mix_alpha, mix_beta = beta_mixture_approx(
                beta_i.alpha,
                beta_i.beta,
                beta_j.alpha,
                beta_j.beta,
                w1=0.5,  # Equal weight for both directions
            )

            result[(i, j)] = BetaParams(alpha=mix_alpha, beta=mix_beta)

        return result


# Module-level singleton
_luce_service: Optional[LuceMLService] = None


def get_luce_service(prior: float = 1.0) -> LuceMLService:
    """Get the Luce ML service singleton."""
    global _luce_service
    if _luce_service is None:
        _luce_service = LuceMLService(prior=prior)
    return _luce_service


# ============================================================================
# Bradley-Terry Pairwise Comparison Model
# ============================================================================


class BradleyTerryState(ConfusionState):
    """State for Bradley-Terry model using pairwise wins.

    Unlike LuceState which tracks counts[played][selected], this state
    tracks pairwise comparison outcomes:

        counts[i][j] = number of times class i beat class j

    This captures head-to-head dominance relationships from user choices.
    When user selects class 'a' from alternatives {a, b, c, d}:
        - a beat b: counts[a-1][b-1] += 1
        - a beat c: counts[a-1][c-1] += 1
        - a beat d: counts[a-1][d-1] += 1
    """

    prior: float = 1.0  # Pseudo-wins added for regularization
    model_version: int = 2  # 1=old confusion matrix, 2=pairwise wins

    # Cached strengths (transient, not serialized)
    # Note: Excluded from serialization via Field(exclude=True)
    _cached_strengths: Optional[list[float]] = None

    model_config = {
        "arbitrary_types_allowed": True,
        # Exclude private fields from serialization
    }

    @classmethod
    def initial(cls, n_classes: int, prior: float = 1.0) -> "BradleyTerryState":
        """Create initial state with zero wins."""
        counts = [[0.0] * n_classes for _ in range(n_classes)]
        return cls(n_classes=n_classes, counts=counts, prior=prior, model_version=2)

    def copy_with_pairwise_wins(
        self, winner: int, losers: list[int]
    ) -> "BradleyTerryState":
        """Return new state with recorded pairwise wins. 1-indexed inputs.

        Args:
            winner: The class that won (1-indexed)
            losers: List of classes that lost to winner (1-indexed)
        """
        new_counts = [row.copy() for row in self.counts]
        for loser in losers:
            new_counts[winner - 1][loser - 1] += 1.0
        return BradleyTerryState(
            n_classes=self.n_classes,
            counts=new_counts,
            prior=self.prior,
            model_version=2,
            _cached_strengths=None,  # Invalidate cache
        )


class BradleyTerryMLService:
    """ML service using Bradley-Terry model with pairwise comparisons.

    Uses the MM algorithm (Hunter 2004) to estimate latent strengths from
    pairwise win data, then applies the Luce choice rule for probabilities.
    """

    def __init__(self, prior: float = 1.0):
        """Initialize with prior for regularization.

        Args:
            prior: Pseudo-wins added to each pair (default 1.0)
        """
        self.prior = prior

    def get_initial_state(self, problem_type_id: str) -> BradleyTerryState:
        """Create initial state with zero wins."""
        config = get_problem_type(problem_type_id)
        return BradleyTerryState.initial(config.n_classes, self.prior)

    def _compute_strengths(self, state: ConfusionState) -> list[float]:
        """Compute Bradley-Terry strengths from wins matrix.

        Uses lazy caching - only recomputes if cache is invalid.
        """
        # Check cache if available
        if isinstance(state, BradleyTerryState) and state._cached_strengths is not None:
            return state._cached_strengths

        from .bradley_terry import compute_bt_strengths

        prior = getattr(state, "prior", self.prior)
        strengths = compute_bt_strengths(state.counts, prior=prior)

        # Cache if possible (mutates state, but that's fine for cache)
        if isinstance(state, BradleyTerryState):
            object.__setattr__(state, "_cached_strengths", strengths)

        return strengths

    def get_success_distribution(
        self,
        problem: Problem,
        state: ConfusionState,
    ) -> BetaParams:
        """Get Beta distribution for P(success | problem, state).

        Uses Bradley-Terry strengths with Luce choice rule:
            P(correct | alternatives) = θ_correct / Σ_k θ_k
        """
        theta = self._compute_strengths(state)

        # Get classes involved (0-indexed for theta)
        correct_class = problem.correct_sequence[0]
        alt_classes = [alt[0] for alt in problem.alternatives]
        all_classes = [correct_class] + alt_classes

        # Luce choice probability using BT strengths
        strengths = [theta[c - 1] for c in all_classes]
        total_strength = sum(strengths)
        p_correct = strengths[0] / total_strength if total_strength > 0 else 0.5

        # Effective N: total pairwise comparisons involving correct class
        n = state.n_classes
        prior = getattr(state, "prior", self.prior)
        total_comparisons = sum(
            state.counts[correct_class - 1][j] + state.counts[j][correct_class - 1]
            for j in range(n)
            if j != correct_class - 1
        )
        prior_n = (n - 1) * 2 * prior  # Prior comparisons in both directions
        effective_n = prior_n + total_comparisons

        alpha = p_correct * effective_n
        beta = (1 - p_correct) * effective_n

        return BetaParams(alpha=max(alpha, 0.1), beta=max(beta, 0.1))

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
    ) -> tuple[BradleyTerryState, list[StateUpdate]]:
        """Update state after observing user's answer.

        Records pairwise wins: the selected class beats all other alternatives.

        Example: correct=1, alternatives=[2,3,4], user selects 1
            -> wins[1][2] += 1, wins[1][3] += 1, wins[1][4] += 1

        Example: correct=1, alternatives=[2,3,4], user selects 2 (wrong)
            -> wins[2][1] += 1, wins[2][3] += 1, wins[2][4] += 1
        """
        updates: list[StateUpdate] = []

        # Convert to BradleyTerryState if needed
        if isinstance(state, BradleyTerryState):
            bt_state = state
        else:
            bt_state = BradleyTerryState(
                n_classes=state.n_classes,
                counts=state.counts,
                prior=self.prior,
                model_version=2,
            )

        # Get classes involved
        correct_class = problem.correct_sequence[0]
        selected_class = answer.selected_sequence[0]
        alt_classes = [alt[0] for alt in problem.alternatives]
        all_classes = [correct_class] + alt_classes

        # The selected class beats all other alternatives
        losers = [c for c in all_classes if c != selected_class]

        for loser in losers:
            old_value = bt_state.counts[selected_class - 1][loser - 1]
            new_value = old_value + 1.0

            updates.append(
                StateUpdate(
                    tracker_id=f"wins[{selected_class}][{loser}]",
                    old_value=old_value,
                    new_value=new_value,
                )
            )

        # Create new state with pairwise wins
        new_state = bt_state.copy_with_pairwise_wins(selected_class, losers)

        return new_state, updates

    def get_confusion_probability(
        self,
        problem_type_id: str,
        played_class: int,
        state: ConfusionState,
    ) -> dict[int, float]:
        """Get confusion probabilities for a single played class.

        Returns P(selected=j | played=i) for all classes j using BT strengths.
        """
        theta = self._compute_strengths(state)
        n = state.n_classes

        # Compute Luce choice probabilities
        total = sum(theta)
        probs = [t / total for t in theta] if total > 0 else [1.0 / n] * n

        # Return 1-indexed
        return {i + 1: probs[i] for i in range(n)}

    def get_all_pair_stats(
        self,
        problem_type_id: str,
        state: ConfusionState,
    ) -> dict[tuple[int, int], BetaParams]:
        """Get Beta parameters for all pairs using Bradley-Terry strengths.

        Uses pairwise probability from BT model with uncertainty based on
        the number of comparisons for that pair.
        """
        theta = self._compute_strengths(state)
        n = state.n_classes
        prior = getattr(state, "prior", self.prior)

        result = {}
        for i in range(n):
            for j in range(i + 1, n):
                # Pairwise probability from BT
                theta_sum = theta[i] + theta[j]
                p_ij = theta[i] / theta_sum if theta_sum > 0 else 0.5

                # Effective observations for this pair
                n_ij = (
                    state.counts[i][j] + state.counts[j][i] + 2 * prior
                )

                # Convert to Beta params
                # p_ij = P(i beats j), so discrimination = |p_ij - 0.5| * 2
                discrimination = abs(p_ij - 0.5) * 2
                effective_correct = 0.5 + discrimination * 0.5

                alpha = effective_correct * n_ij
                beta = (1 - effective_correct) * n_ij

                result[(i + 1, j + 1)] = BetaParams(
                    alpha=max(alpha, 0.1), beta=max(beta, 0.1)
                )

        return result


# Module-level singleton for Bradley-Terry
_bt_service: Optional[BradleyTerryMLService] = None


def get_bradley_terry_service(prior: float = 1.0) -> BradleyTerryMLService:
    """Get the Bradley-Terry ML service singleton."""
    global _bt_service
    if _bt_service is None:
        _bt_service = BradleyTerryMLService(prior=prior)
    return _bt_service
