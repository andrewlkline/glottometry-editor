/**
 * Historical Glottometry metrics — Kalyan & François (2018: §3.2–3.3).
 *
 * For a candidate subgroup G:
 *   p   innovations shared by ALL members of G (outsiders may share too)
 *   q   innovations that CONFLICT with G: they affect some-but-not-all of G
 *       *and* at least one language outside G
 *   eps innovations shared by exactly G and nobody else
 *
 *   kappa (cohesiveness)  = p / (p + q)
 *   sigma (subgroupiness) = eps * kappa
 *
 * Innovations nested strictly inside G — affecting a proper subset of G and no
 * outsider — are irrelevant to cohesiveness and excluded from both p and q
 * (K&F 2018: 70 fn. 9). That falls out of the formulation below: such a row has
 * `noneOutside = 1`, so it contributes 0 to q, and `allIn = 0`, so 0 to p.
 *
 * This file is the TypeScript half of a two-implementation pair; it must agree
 * with prototype/glottometry.py to 1e-9. See tests/parity.test.ts.
 */

import type {
  Cell, Dataset, EvidenceItem, NaPolicy, Subgroup, SubgroupEvidence,
} from './types.js';

/** Resolve the matrix to participation probabilities under the given policy. */
export function resolveProbabilities(
  matrix: Cell[][],
  nLanguages: number,
  policy: NaPolicy,
): Float64Array {
  const nRows = matrix.length;
  const p1 = new Float64Array(nRows * nLanguages);

  // Means are over *known* cells only, and are needed before filling.
  let rowMeans: Float64Array | null = null;
  let colMeans: Float64Array | null = null;

  if (policy === 'rowMean') {
    rowMeans = new Float64Array(nRows);
    for (let r = 0; r < nRows; r++) {
      const row = matrix[r]!;
      let sum = 0;
      let seen = 0;
      for (let c = 0; c < nLanguages; c++) {
        const v = row[c];
        if (v !== null && v !== undefined) {
          sum += v;
          seen++;
        }
      }
      rowMeans[r] = seen > 0 ? sum / seen : 0.5;
    }
  } else if (policy === 'colMean') {
    colMeans = new Float64Array(nLanguages);
    for (let c = 0; c < nLanguages; c++) {
      let sum = 0;
      let seen = 0;
      for (let r = 0; r < nRows; r++) {
        const v = matrix[r]![c];
        if (v !== null && v !== undefined) {
          sum += v;
          seen++;
        }
      }
      colMeans[c] = seen > 0 ? sum / seen : 0.5;
    }
  }

  for (let r = 0; r < nRows; r++) {
    const row = matrix[r]!;
    for (let c = 0; c < nLanguages; c++) {
      const v = row[c];
      let resolved: number;
      if (v === null || v === undefined) {
        switch (policy) {
          case 'half': resolved = 0.5; break;
          case 'zero': resolved = 0; break;
          case 'one': resolved = 1; break;
          case 'rowMean': resolved = rowMeans![r]!; break;
          case 'colMean': resolved = colMeans![c]!; break;
        }
      } else {
        resolved = v;
      }
      p1[r * nLanguages + c] = resolved;
    }
  }
  return p1;
}

export class Glottometry {
  readonly languages: string[];
  readonly innovations: string[];
  readonly nLanguages: number;
  readonly nInnovations: number;
  /** Flattened [row * nLanguages + col] probability that the language participated. */
  private readonly p1: Float64Array;
  /** Raw cells, kept so candidate patterns stay independent of the NA policy. */
  private readonly raw: Cell[][];

  constructor(dataset: Dataset, policy: NaPolicy = 'half') {
    this.languages = dataset.languages;
    this.innovations = dataset.innovations;
    this.nLanguages = dataset.languages.length;
    this.nInnovations = dataset.matrix.length;
    this.raw = dataset.matrix;
    this.p1 = resolveProbabilities(dataset.matrix, this.nLanguages, policy);
  }

  /** Score one subgroup, given as a boolean mask over language indices. */
  stats(mask: boolean[]): Pick<Subgroup, 'epsilon' | 'kappa' | 'sigma' | 'p' | 'q'> {
    const { p1, nLanguages, nInnovations } = this;
    let eps = 0;
    let p = 0;
    let q = 0;

    for (let r = 0; r < nInnovations; r++) {
      const base = r * nLanguages;
      let allIn = 1;      // P(every member participated)
      let noneIn = 1;     // P(no member participated)
      let noneOut = 1;    // P(no outsider participated)

      for (let c = 0; c < nLanguages; c++) {
        const prob = p1[base + c]!;
        if (mask[c]) {
          allIn *= prob;
          noneIn *= 1 - prob;
        } else {
          noneOut *= 1 - prob;
        }
      }

      eps += allIn * noneOut;
      p += allIn;
      // some-but-not-all members, together with at least one outsider
      q += (1 - allIn - noneIn) * (1 - noneOut);
    }

    const kappa = p + q > 0 ? p / (p + q) : 0;
    return { epsilon: eps, kappa, sigma: eps * kappa, p, q };
  }

  /**
   * The three probabilities the metrics are built from, for one innovation.
   *
   * Shared with `evidenceFor` so the inspector cannot drift from the scores:
   * both read the same arithmetic.
   */
  rowProbabilities(row: number, mask: boolean[]): {
    allIn: number; noneIn: number; noneOut: number;
  } {
    const { p1, nLanguages } = this;
    const base = row * nLanguages;
    let allIn = 1;
    let noneIn = 1;
    let noneOut = 1;
    for (let c = 0; c < nLanguages; c++) {
      const prob = p1[base + c]!;
      if (mask[c]) {
        allIn *= prob;
        noneIn *= 1 - prob;
      } else {
        noneOut *= 1 - prob;
      }
    }
    return { allIn, noneIn, noneOut };
  }

  /**
   * Distinct attested innovation patterns, as boolean masks.
   *
   * This is what keeps the method tractable. A subgroup needs at least one
   * exclusively shared innovation to count as attested (K&F 2018: 80), so
   * candidates are bounded by the number of *distinct rows*, never by 2**n.
   * Unknown cells are read as 0 for pattern identity.
   *
   * Deliberately reads `raw`, not the resolved probabilities: which subgroups
   * are *attested* is a fact about the data, and must not shift when the user
   * changes NA policy (under 'one', every unknown would otherwise join the
   * pattern). Only the scores depend on the policy.
   *
   * The set of ALL languages is excluded. The family as a whole is not a
   * subgroup of itself; nothing can conflict with it, so its kappa is a
   * trivial 1 and it would otherwise head the ranking. The Marama engine
   * omits it too.
   */
  candidates(minSize = 2): boolean[][] {
    const { raw, nLanguages, nInnovations } = this;
    const seen = new Set<string>();
    const out: boolean[][] = [];

    for (let r = 0; r < nInnovations; r++) {
      const row = raw[r]!;
      const mask: boolean[] = new Array(nLanguages);
      let size = 0;
      let key = '';
      for (let c = 0; c < nLanguages; c++) {
        // Only a definite 1 puts a language in the pattern.
        const bit = row[c] === 1;
        mask[c] = bit;
        if (bit) size++;
        key += bit ? '1' : '0';
      }
      if (size < minSize || size >= nLanguages || seen.has(key)) continue;
      seen.add(key);
      out.push(mask);
    }
    return out;
  }

  /**
   * Score every attested subgroup, sorted by descending sigma.
   *
   * `minEpsilon` defaults to 1 because K&F (2018: 80) require a subgroup to
   * "have at least one exclusively shared innovation". With integer data that
   * is the same as epsilon > 0, but once NA weighting makes epsilon fractional
   * the two diverge, and epsilon > 0 admits groups supported only by partial
   * evidence from unknown cells.
   */
  subgroups(
    opts: { minSize?: number; minSigma?: number; minEpsilon?: number } = {},
  ): Subgroup[] {
    const { minSize = 2, minSigma = 0, minEpsilon = 1 } = opts;
    const result: Subgroup[] = [];

    for (const mask of this.candidates(minSize)) {
      const s = this.stats(mask);
      if (s.epsilon < minEpsilon || s.sigma < minSigma) continue;
      const members: number[] = [];
      for (let c = 0; c < this.nLanguages; c++) if (mask[c]) members.push(c);
      result.push({
        members,
        memberNames: members.map((i) => this.languages[i]!),
        ...s,
      });
    }

    result.sort((a, b) => b.sigma - a.sigma);
    return result;
  }
}

/** Convenience: boolean mask from language indices. */
export function maskOf(members: number[], nLanguages: number): boolean[] {
  const mask = new Array<boolean>(nLanguages).fill(false);
  for (const m of members) mask[m] = true;
  return mask;
}

/**
 * Which innovations actually produced a subgroup's score.
 *
 * The diagram says a subgroup is strong; this says why. No existing tool
 * exposes it — the Marama engine returns totals and the published tables
 * report epsilon, kappa and sigma, leaving the reader to go back to the
 * spreadsheet to find out which sound change or lexical replacement is doing
 * the work.
 *
 * Weights mirror the metric definitions exactly, so `sum(exclusive.weight)`
 * is epsilon, `sum(supporting.weight)` is p, and `sum(conflicting.weight)` is
 * q. An innovation nested strictly inside the subgroup is irrelevant to
 * cohesiveness (K&F 2018: 70 fn. 9) and appears in none of the three lists.
 */
export function evidenceFor(
  g: Glottometry,
  dataset: Dataset,
  mask: boolean[],
  minWeight = 0.005,
): SubgroupEvidence {
  const evidence: SubgroupEvidence = { exclusive: [], supporting: [], conflicting: [] };

  for (let r = 0; r < g.nInnovations; r++) {
    const { allIn, noneIn, noneOut } = g.rowProbabilities(r, mask);

    const exclusive = allIn * noneOut;
    const conflicting = (1 - allIn - noneIn) * (1 - noneOut);
    const supporting = allIn;

    const participants: number[] = [];
    const unknown: number[] = [];
    const row = dataset.matrix[r]!;
    for (let c = 0; c < g.nLanguages; c++) {
      if (row[c] === 1) participants.push(c);
      else if (row[c] === null || row[c] === undefined) unknown.push(c);
    }

    const base = { index: r, label: dataset.innovations[r] ?? `row ${r}`, participants, unknown };

    if (exclusive > minWeight) {
      evidence.exclusive.push({ ...base, role: 'exclusive', weight: exclusive });
    }
    // Exclusive innovations are a subset of supporting ones; list them under
    // both, since "all members share this" is true of them too.
    if (supporting > minWeight) {
      evidence.supporting.push({ ...base, role: 'supporting', weight: supporting });
    }
    if (conflicting > minWeight) {
      evidence.conflicting.push({ ...base, role: 'conflicting', weight: conflicting });
    }
  }

  const byWeight = (a: EvidenceItem, b: EvidenceItem) =>
    b.weight - a.weight || a.label.localeCompare(b.label);
  evidence.exclusive.sort(byWeight);
  evidence.supporting.sort(byWeight);
  evidence.conflicting.sort(byWeight);
  return evidence;
}
