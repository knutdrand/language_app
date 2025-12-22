"""Bradley-Terry model for pairwise comparison data.

The Bradley-Terry model estimates latent "strength" parameters for each
item based on pairwise comparison outcomes. Given wins[i][j] = number of
times item i beat item j, the model estimates theta[i] such that:

    P(i beats j) = theta[i] / (theta[i] + theta[j])

This module provides the MM algorithm (Hunter 2004) for computing the MLE
of the strength parameters, which is guaranteed to converge when the
comparison graph is connected.

Reference:
    Hunter, D. R. (2004). MM algorithms for generalized Bradley-Terry models.
    The Annals of Statistics, 32(1), 384-406.
"""

import math
from typing import Optional


def compute_bt_strengths(
    wins: list[list[float]],
    prior: float = 1.0,
    max_iter: int = 100,
    tol: float = 1e-6,
) -> list[float]:
    """Compute Bradley-Terry MLE strengths from wins matrix.

    Uses the MM (Minorization-Maximization) algorithm which is guaranteed
    to converge to the unique MLE when the comparison graph is connected.

    Args:
        wins: n x n matrix where wins[i][j] = times i beat j
        prior: Pseudo-wins added to regularize. Each pair (i,j) gets
               'prior' pseudo-wins in both directions, ensuring MLE
               is well-defined even with sparse data.
        max_iter: Maximum number of iterations
        tol: Convergence tolerance (max change in theta)

    Returns:
        List of n strengths, normalized to sum to n.
    """
    n = len(wins)
    if n == 0:
        return []

    # Add prior pseudo-observations (Laplace smoothing equivalent)
    regularized = [[wins[i][j] + prior for j in range(n)] for i in range(n)]

    # Total games between i and j (symmetric)
    n_games = [
        [regularized[i][j] + regularized[j][i] for j in range(n)] for i in range(n)
    ]

    # Initialize strengths uniformly
    theta = [1.0] * n

    for _ in range(max_iter):
        theta_old = theta.copy()

        # MM update: theta[i] = W[i] / sum_j(n[i,j] / (theta[i] + theta[j]))
        for i in range(n):
            # Total wins for i
            w_i = sum(regularized[i])

            # Denominator sum
            denom = 0.0
            for j in range(n):
                if i != j and n_games[i][j] > 0:
                    denom += n_games[i][j] / (theta_old[i] + theta_old[j])

            if denom > 0:
                theta[i] = w_i / denom
            else:
                theta[i] = 1.0  # No comparisons involving i

        # Normalize (strengths are only identified up to scale)
        total = sum(theta)
        if total > 0:
            theta = [t * n / total for t in theta]

        # Check convergence
        max_change = max(abs(theta[i] - theta_old[i]) for i in range(n))
        if max_change < tol:
            break

    return theta


def compute_bt_strengths_logspace(
    wins: list[list[float]],
    prior: float = 1.0,
    max_iter: int = 100,
    tol: float = 1e-8,
) -> list[float]:
    """Bradley-Terry MLE in log-space for numerical stability.

    Same as compute_bt_strengths but works in log-space to handle
    cases with very large strength differences. Useful when some
    items dominate others strongly.

    Args:
        wins: n x n matrix where wins[i][j] = times i beat j
        prior: Pseudo-wins added to regularize
        max_iter: Maximum iterations
        tol: Convergence tolerance (max change in log_theta)

    Returns:
        List of n strengths (in original scale, not log).
    """
    n = len(wins)
    if n == 0:
        return []

    regularized = [[wins[i][j] + prior for j in range(n)] for i in range(n)]
    n_games = [
        [regularized[i][j] + regularized[j][i] for j in range(n)] for i in range(n)
    ]

    # Initialize log-strengths to 0 (theta = 1)
    log_theta = [0.0] * n

    def log_sum_exp_pair(a: float, b: float) -> float:
        """Compute log(exp(a) + exp(b)) stably."""
        if a > b:
            return a + math.log1p(math.exp(b - a))
        else:
            return b + math.log1p(math.exp(a - b))

    for _ in range(max_iter):
        log_theta_old = log_theta.copy()

        for i in range(n):
            w_i = sum(regularized[i])
            if w_i == 0:
                continue

            # Compute sum_j(n[i,j] / (theta[i] + theta[j])) in log space
            log_denom_terms: list[float] = []
            for j in range(n):
                if i != j and n_games[i][j] > 0:
                    log_sum_ij = log_sum_exp_pair(log_theta_old[i], log_theta_old[j])
                    log_denom_terms.append(math.log(n_games[i][j]) - log_sum_ij)

            if log_denom_terms:
                # log-sum-exp of all terms
                log_denom = log_denom_terms[0]
                for t in log_denom_terms[1:]:
                    log_denom = log_sum_exp_pair(log_denom, t)

                log_theta[i] = math.log(w_i) - log_denom

        # Normalize: subtract mean so geometric mean of theta = 1
        mean_log = sum(log_theta) / n
        log_theta = [lt - mean_log for lt in log_theta]

        # Convergence check
        max_change = max(abs(log_theta[i] - log_theta_old[i]) for i in range(n))
        if max_change < tol:
            break

    # Convert back to original scale and normalize to sum = n
    theta = [math.exp(lt) for lt in log_theta]
    total = sum(theta)
    if total > 0:
        theta = [t * n / total for t in theta]

    return theta


def pairwise_probability(theta: list[float], i: int, j: int) -> float:
    """Compute P(i beats j) under Bradley-Terry model.

    Args:
        theta: Strength parameters
        i: Index of first item (0-based)
        j: Index of second item (0-based)

    Returns:
        Probability that item i beats item j.
    """
    if theta[i] + theta[j] == 0:
        return 0.5  # Undefined, return uniform
    return theta[i] / (theta[i] + theta[j])


def choice_probability(theta: list[float], target: int, alternatives: list[int]) -> float:
    """Compute P(choose target | alternatives) under Luce choice rule.

    The Luce choice rule (which Bradley-Terry is a special case of) gives:
        P(choose i | set A) = theta[i] / sum_{k in A} theta[k]

    Args:
        theta: Strength parameters
        target: Index of target item (0-based)
        alternatives: List of indices of all alternatives (must include target)

    Returns:
        Probability of choosing target from alternatives.
    """
    if target not in alternatives:
        return 0.0

    target_strength = theta[target]
    total_strength = sum(theta[k] for k in alternatives)

    if total_strength == 0:
        return 1.0 / len(alternatives)  # Uniform if all strengths are 0

    return target_strength / total_strength
