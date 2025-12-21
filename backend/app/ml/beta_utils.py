"""Utilities for working with Beta distributions."""


def beta_mixture_approx(
    alpha1: float,
    beta1: float,
    alpha2: float,
    beta2: float,
    w1: float = 0.5,
) -> tuple[float, float]:
    """
    Approximate a mixture of two Beta distributions with a single Beta.

    Uses moment matching to find Beta parameters that match the mean
    and variance of the mixture distribution.

    Args:
        alpha1, beta1: Parameters of first Beta distribution
        alpha2, beta2: Parameters of second Beta distribution
        w1: Weight of first distribution (default 0.5 for uniform selection)

    Returns:
        (alpha_approx, beta_approx): Moment-matched Beta parameters
    """
    w2 = 1 - w1

    # Means
    mu1 = alpha1 / (alpha1 + beta1)
    mu2 = alpha2 / (alpha2 + beta2)

    # Variances
    n1 = alpha1 + beta1
    n2 = alpha2 + beta2
    var1 = (alpha1 * beta1) / (n1**2 * (n1 + 1))
    var2 = (alpha2 * beta2) / (n2**2 * (n2 + 1))

    # Mixture moments
    mu_mix = w1 * mu1 + w2 * mu2
    var_mix = w1 * var1 + w2 * var2 + w1 * w2 * (mu1 - mu2) ** 2

    # Fit Beta parameters
    nu = mu_mix * (1 - mu_mix) / var_mix - 1

    # Handle edge case where variance is too high
    if nu <= 0:
        return (1.0, 1.0)  # Uniform prior as fallback

    alpha_approx = mu_mix * nu
    beta_approx = (1 - mu_mix) * nu

    return (alpha_approx, beta_approx)
