/** A single cell of the innovations matrix: participated, did not, or unknown. */
export type Cell = 1 | 0 | null;

/**
 * How unknown ('-' / 'NA') cells are treated.
 *
 * Kalyan & François leave this undefined, and the official Marama engine's
 * scheme is undocumented and could not be reproduced (see README, "Known
 * discrepancy in NA handling"). So it is an explicit, user-visible choice.
 *
 * Every policy resolves an unknown to a *probability* of participation; counts
 * are then expectations, which is why epsilon can come out fractional.
 */
export type NaPolicy =
  | 'half'      // P = 0.5. Agnostic; the default.
  | 'zero'      // P = 0. Unknown means "no evidence it participated".
  | 'one'       // P = 1. Unknown means "assume it patterned with the group".
  | 'rowMean'   // P = participation rate of that innovation across known cells.
  | 'colMean';  // P = participation rate of that language across known cells.

export interface Dataset {
  languages: string[];
  innovations: string[];
  /** matrix[innovation][language] */
  matrix: Cell[][];
}

export interface Subgroup {
  /** Indices into `Dataset.languages`. */
  members: number[];
  memberNames: string[];
  /** Exclusively shared innovations. */
  epsilon: number;
  /** Cohesiveness, p / (p + q). Always in [0, 1]. */
  kappa: number;
  /** Subgroupiness, epsilon * kappa. */
  sigma: number;
  /** Supporting innovations: shared by every member, outsiders permitted. */
  p: number;
  /** Conflicting innovations: some-but-not-all members, plus >= 1 outsider. */
  q: number;
  /** Contingency table and p-value; see core/fisher.ts. */
  fisher: FisherResult;
  /** `-log10(p)` from that test, so bigger is stronger. */
  significance: number;
}

/** Which measure a display threshold is applied to. */
export type StrengthMeasure = 'sigma' | 'epsilon' | 'significance';

import type { FisherResult } from './fisher.js';

/** How one innovation bears on one subgroup. */
export type EvidenceRole =
  | 'exclusive'     // affects exactly these languages and no others
  | 'supporting'    // affects all of them, possibly others too
  | 'conflicting';  // affects some but not all, plus at least one outsider

export interface EvidenceItem {
  /** Row index into Dataset.innovations. */
  index: number;
  label: string;
  role: EvidenceRole;
  /**
   * How strongly this innovation plays the role: in [0, 1] times `multiplier`.
   *
   * 1 when every relevant cell is known and the row is unweighted. Unknown
   * cells make it fractional, for the same reason they make epsilon
   * fractional: the counts are expectations under the NA policy, not
   * certainties.
   */
  weight: number;
  /**
   * The type weight included in `weight`; 1 when unweighted. Kept separately
   * so the inspector can tell "fractional because of unknown cells" apart from
   * "scaled by a type weight".
   */
  multiplier: number;
  /** Language indices with a definite 1. */
  participants: number[];
  /** Language indices whose cell is unknown. */
  unknown: number[];
}

export interface SubgroupEvidence {
  exclusive: EvidenceItem[];
  supporting: EvidenceItem[];
  conflicting: EvidenceItem[];
}
