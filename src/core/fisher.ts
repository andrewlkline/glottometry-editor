/**
 * Fisher's exact test as an alternative measure of subgroup strength.
 *
 * ## Attribution, and what this is not
 *
 * Hammarström (2017) is reported to use Fisher's exact test for exactly this
 * purpose — Pelkey & Kalyan describe it as "a statistically rigorous measure
 * of the 'strength' of an isogloss, thereby improving upon Kalyan and
 * François's (2018) measures". **This is not a reimplementation of that.** The
 * construction of his contingency table could not be verified from the sources
 * to hand, and putting his name on a guess would be worse than useless in a
 * tool linguists might cite. The table below is ours, stated explicitly so it
 * can be checked or replaced once the original is available. See BUILD_PLAN.md.
 *
 * ## The table
 *
 * Every innovation is classified on two independent binary questions:
 *
 *              | no outsider participated | some outsider did
 *   all of G   |            a (= ε)       |        b
 *   not all    |            c             |        d
 *
 * A genuine subgroup should show an association between the two: innovations
 * that reach every member should also tend to stop at its boundary. Fisher's
 * exact test asks how unlikely `a` is, given the row and column totals, if the
 * two questions were independent.
 *
 * ## It is not a significance test on κ
 *
 * Tempting to assume, and false — the two can rank subgroups in opposite
 * directions, which is worth understanding before choosing between them.
 *
 * The difference is cell `b`: innovations reaching every member that *also*
 * spread outside. Cohesiveness counts those as supporting (they are part of
 * `p`), because all members did innovate together. This table counts them
 * against, because reaching everyone while continuing past the boundary is
 * evidence that reaching-everyone says nothing about where the group ends.
 *
 * On a constructed pair with identical ε = 10, one with a=10 b=1 c=1 d=10 and
 * the other a=10 b=20 c=20 d=10, κ prefers the second (0.75 against 0.52)
 * while this test prefers the first (p < 0.001 against p > 0.5). Neither is
 * wrong; they are answering different questions. `tests/settings.test.ts`
 * pins the disagreement down so it cannot drift silently.
 *
 * ## What it buys over ε
 *
 * ε alone cannot separate those two cases at all. Ten exclusively shared
 * innovations with little leakage is a real signal; the same ten buried among
 * innovations that reach all members and keep going is none.
 *
 * It is **not** a correction for dataset size. Innovations irrelevant to the
 * subgroup land in `d` and enlarge the table, which makes the observed overlap
 * rarer and the p-value smaller. Arguable either way — those rows are evidence
 * the pattern is not a generic one — but worth knowing before reading a
 * significance score as "corrected for how much data there is". It is not.
 *
 * ## Fractional counts
 *
 * Unknown cells make the counts expectations rather than integers (see the NA
 * policy discussion in metrics.ts), and Fisher's exact needs integers. They are
 * rounded. This is a real approximation and is flagged as such rather than
 * hidden: with the default `half` policy on K&F's demo data the rounding moves
 * counts by under one innovation in a table of 473.
 */

/** Cached log-factorials, grown on demand. */
let logFactorials: Float64Array = new Float64Array([0, 0]);

function logFactorial(n: number): number {
  if (n < 0) return NaN;
  if (n >= logFactorials.length) {
    const grown = new Float64Array(Math.max(n + 1, logFactorials.length * 2));
    grown.set(logFactorials);
    for (let i = logFactorials.length; i < grown.length; i++) {
      grown[i] = grown[i - 1]! + Math.log(i);
    }
    logFactorials = grown;
  }
  return logFactorials[n]!;
}

/** log P(X = a) for the hypergeometric distribution behind a 2x2 table. */
function logHypergeometric(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  return (
    logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d)
    - logFactorial(n) - logFactorial(a) - logFactorial(b) - logFactorial(c) - logFactorial(d)
  );
}

/**
 * One-tailed Fisher's exact test for positive association: the probability of
 * seeing `a` or more in the top-left cell, with the margins held fixed.
 */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  if (a < 0 || b < 0 || c < 0 || d < 0) return 1;
  const rowTotal = a + b;
  const colTotal = a + c;
  const n = a + b + c + d;
  if (n === 0) return 1;

  // `a` cannot exceed either margin, nor fall below what the margins force.
  const max = Math.min(rowTotal, colTotal);
  const min = Math.max(0, rowTotal + colTotal - n);

  let total = 0;
  for (let k = a; k <= max; k++) {
    const kb = rowTotal - k;
    const kc = colTotal - k;
    const kd = n - k - kb - kc;
    if (kb < 0 || kc < 0 || kd < 0) continue;
    total += Math.exp(logHypergeometric(k, kb, kc, kd));
  }
  // Guard against floating-point drift past 1 when `a` is at its minimum.
  return a <= min ? 1 : Math.min(1, total);
}

export interface FisherTable {
  /** All of G, no outsiders — the exclusively shared innovations. */
  a: number;
  /** All of G, but outsiders too. */
  b: number;
  /** Not all of G, no outsiders. */
  c: number;
  /** Not all of G, and outsiders. */
  d: number;
}

export interface FisherResult extends FisherTable {
  pValue: number;
  /**
   * `-log10(p)`, so bigger means stronger and it can drive a threshold slider
   * the way ς does. 2 is p = 0.01, 3 is p = 0.001.
   */
  strength: number;
}

export function fisherStrength(table: FisherTable): FisherResult {
  const a = Math.round(table.a);
  const b = Math.round(table.b);
  const c = Math.round(table.c);
  const d = Math.round(table.d);
  const pValue = fisherExact(a, b, c, d);
  return {
    a, b, c, d,
    pValue,
    strength: pValue > 0 ? -Math.log10(pValue) : Infinity,
  };
}
