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
        # alternatives already includes the correct answer
        alt_classes = [alt[0] for alt in problem.alternatives]

        # Compute strengths (counts + prior)
        strengths = []
        correct_strength = None
        for c in alt_classes:
            count = state.counts[correct_class - 1][c - 1]
            strength = count + prior
            strengths.append(strength)
            if c == correct_class:
                correct_strength = strength

        # Luce choice probability
        total_strength = sum(strengths)
        p_correct = correct_strength / total_strength if correct_strength else 0.25

        # Effective N based on observations for this played class
        # prior_n = number of alternatives * prior (initial pseudocounts)
        n_obs = sum(state.counts[correct_class - 1])
        prior_n = len(alt_classes) * prior
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
                # Problem where class i+1 is correct, choosing between i+1 and j+1
                problems.append(
                    Problem(
                        problem_type_id=problem_type_id,
                        word_id=0,  # Synthetic
                        vietnamese="",
                        correct_index=0,
                        correct_sequence=[i + 1],  # 1-indexed
                        alternatives=[[i + 1], [j + 1]],  # Both options
                    )
                )
                pair_indices.append((i + 1, j + 1, "i"))

                # Problem where class j+1 is correct, choosing between i+1 and j+1
                problems.append(
                    Problem(
                        problem_type_id=problem_type_id,
                        word_id=0,
                        vietnamese="",
                        correct_index=0,
                        correct_sequence=[j + 1],
                        alternatives=[[i + 1], [j + 1]],  # Both options
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
    """State for Bradley-Terry model using confusion matrix.

    Tracks counts[correct][selected] - how often each class was selected
    when each class was the correct answer:

        counts[i][j] = number of times class j was selected when class i was correct

    This allows computing asymmetric success probabilities:
    - P(a | correct=a) may differ from P(b | correct=b)
    - Pair success = mean(P(a|correct=a), P(b|correct=b))
    """

    prior: float = 1.0  # Pseudo-counts for regularization
    model_version: int = 3  # 1=old, 2=pairwise wins, 3=confusion matrix

    model_config = {
        "arbitrary_types_allowed": True,
    }

    @classmethod
    def initial(cls, n_classes: int, prior: float = 1.0) -> "BradleyTerryState":
        """Create initial state with zero counts."""
        counts = [[0.0] * n_classes for _ in range(n_classes)]
        return cls(n_classes=n_classes, counts=counts, prior=prior, model_version=3)

    def copy_with_increment(self, played: int, selected: int) -> "BradleyTerryState":
        """Return new state with incremented count. 1-indexed inputs.

        Args:
            played: The correct/played class (1-indexed)
            selected: The class user selected (1-indexed)
        """
        new_counts = [row.copy() for row in self.counts]
        new_counts[played - 1][selected - 1] += 1.0
        return BradleyTerryState(
            n_classes=self.n_classes,
            counts=new_counts,
            prior=self.prior,
            model_version=3,
        )


class BradleyTerryMLService:
    """ML service using confusion matrix for success probability.

    Tracks counts[correct][selected] and computes:
    - P(a | correct=a, choices={a,b}) from counts[a][a] / (counts[a][a] + counts[a][b])
    - Pair success = mean(P(a|correct=a), P(b|correct=b))
    """

    def __init__(self, prior: float = 1.0):
        """Initialize with prior for regularization.

        Args:
            prior: Pseudo-count added to each cell (default 1.0)
        """
        self.prior = prior

    def get_initial_state(self, problem_type_id: str) -> BradleyTerryState:
        """Create initial state with zero counts."""
        config = get_problem_type(problem_type_id)
        return BradleyTerryState.initial(config.n_classes, self.prior)

    def get_success_distribution(
        self,
        problem: Problem,
        state: ConfusionState,
    ) -> BetaParams:
        """Get Beta distribution for P(success | problem, state).

        Uses confusion matrix: P(correct) based on counts[correct][selected]
        for all alternatives in the problem.
        """
        prior = getattr(state, "prior", self.prior)

        # Get classes involved (0-indexed)
        correct_idx = problem.correct_sequence[0] - 1
        alt_indices = [alt[0] - 1 for alt in problem.alternatives]
        all_indices = [correct_idx] + alt_indices

        # Compute strengths from confusion matrix row for correct class
        strengths = []
        for idx in all_indices:
            count = state.counts[correct_idx][idx]
            strengths.append(count + prior)

        # Luce choice probability
        total_strength = sum(strengths)
        p_correct = strengths[0] / total_strength

        # Effective N based on observations for this correct class
        n_obs = sum(state.counts[correct_idx])
        prior_n = len(all_indices) * prior
        effective_n = prior_n + n_obs

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

        Records in confusion matrix: counts[correct][selected] += 1

        Example: correct=1, alternatives=[2,3,4], user selects 1
            -> counts[1][1] += 1

        Example: correct=1, alternatives=[2,3,4], user selects 2 (wrong)
            -> counts[1][2] += 1
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
                model_version=3,
            )

        # Get classes involved
        correct_class = problem.correct_sequence[0]
        selected_class = answer.selected_sequence[0]

        # Record the update in confusion matrix
        old_value = bt_state.counts[correct_class - 1][selected_class - 1]
        new_value = old_value + 1.0

        updates.append(
            StateUpdate(
                tracker_id=f"counts[{correct_class}][{selected_class}]",
                old_value=old_value,
                new_value=new_value,
            )
        )

        # Create new state with incremented count
        new_state = bt_state.copy_with_increment(correct_class, selected_class)

        return new_state, updates

    def get_confusion_probability(
        self,
        problem_type_id: str,
        played_class: int,
        state: ConfusionState,
    ) -> dict[int, float]:
        """Get confusion probabilities for a single played/correct class.

        Returns P(selected=j | correct=i) for all classes j.
        Classes are 1-indexed.
        """
        prior = getattr(state, "prior", self.prior)
        n = state.n_classes

        # Compute strengths from confusion matrix row
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
        """Get Beta parameters for all pairs.

        For pair (a, b), computes:
        - P(a | correct=a, choices={a,b}) = (counts[a][a] + prior) / (counts[a][a] + counts[a][b] + 2*prior)
        - P(b | correct=b, choices={b,a}) = (counts[b][b] + prior) / (counts[b][b] + counts[b][a] + 2*prior)
        - Pair success = mean of these two probabilities
        """
        from .beta_utils import beta_mixture_approx

        n = state.n_classes
        prior = getattr(state, "prior", self.prior)

        result = {}
        for i in range(n):
            for j in range(i + 1, n):
                # P(i | correct=i, choices={i,j})
                strength_ii = state.counts[i][i] + prior
                strength_ij = state.counts[i][j] + prior
                p_i_given_i = strength_ii / (strength_ii + strength_ij)
                n_i = state.counts[i][i] + state.counts[i][j] + 2 * prior

                # P(j | correct=j, choices={j,i})
                strength_jj = state.counts[j][j] + prior
                strength_ji = state.counts[j][i] + prior
                p_j_given_j = strength_jj / (strength_jj + strength_ji)
                n_j = state.counts[j][j] + state.counts[j][i] + 2 * prior

                # Beta params for each direction
                alpha_i = p_i_given_i * n_i
                beta_i = (1 - p_i_given_i) * n_i
                alpha_j = p_j_given_j * n_j
                beta_j = (1 - p_j_given_j) * n_j

                # Moment-matched mixture (equal weight for both directions)
                mix_alpha, mix_beta = beta_mixture_approx(
                    alpha_i, beta_i, alpha_j, beta_j, w1=0.5
                )

                result[(i + 1, j + 1)] = BetaParams(
                    alpha=max(mix_alpha, 0.1), beta=max(mix_beta, 0.1)
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
