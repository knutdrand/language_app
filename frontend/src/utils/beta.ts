/**
 * Helper functions for working with Beta distribution parameters.
 */

/**
 * Calculate the mean probability from Beta distribution parameters.
 * @param alpha - Beta distribution alpha (successes + prior)
 * @param beta - Beta distribution beta (errors + prior)
 * @returns Probability between 0 and 1
 */
export function betaMean(alpha: number, beta: number): number {
  return alpha / (alpha + beta);
}

/**
 * Calculate the probability as a percentage.
 * @param alpha - Beta distribution alpha
 * @param beta - Beta distribution beta
 * @returns Percentage (0-100)
 */
export function betaProbabilityPct(alpha: number, beta: number): number {
  return Math.round(betaMean(alpha, beta) * 100);
}

/**
 * Format Beta params as "success/total" string.
 * @param alpha - Beta distribution alpha
 * @param beta - Beta distribution beta
 * @returns Formatted string like "6/8"
 */
export function formatBetaStats(alpha: number, beta: number): string {
  const success = Math.round(alpha);
  const total = Math.round(alpha + beta);
  return `${success}/${total}`;
}

/**
 * Get color class based on probability threshold.
 * @param alpha - Beta distribution alpha
 * @param beta - Beta distribution beta
 * @returns Tailwind color class
 */
export function getBetaColorClass(alpha: number, beta: number): string {
  const pct = betaProbabilityPct(alpha, beta);
  if (pct >= 80) return 'text-green-600';
  if (pct >= 60) return 'text-yellow-600';
  return 'text-red-600';
}
