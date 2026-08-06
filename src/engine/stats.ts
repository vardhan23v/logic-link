// Small statistics helpers for the Monte Carlo gates. Pure, unit-testable.

/** Wilson score interval for a proportion with k successes out of n trials
 *  at confidence z (1.96 ≈ 95%). Returns { lower, upper } in [0, 1]. */
export function wilsonInterval(n: number, k: number, z = 1.96): { lower: number; upper: number } {
  if (n <= 0) return { lower: 0, upper: 1 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lower: Math.max(0, (centre - margin) / denom),
    upper: Math.min(1, (centre + margin) / denom),
  };
}

/** Normal-approximation CI half-width for a sample mean at confidence z. */
export function meanHalfWidth(values: number[], z = 1.96): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, values.length - 1);
  return z * Math.sqrt(variance / values.length);
}
