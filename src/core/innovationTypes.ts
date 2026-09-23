/**
 * Innovation types, and filtering the dataset by them.
 *
 * Kalyan & François classify their innovations five ways (2018: 77, Table
 * 5-1), and the classification matters: they hold irregular sound change and
 * morphological change to be the most diagnostic of genealogical relatedness
 * (following Greenberg 1957: 51 and Ross 1988: 12), while **half** their
 * dataset is lexical replacement, the category most vulnerable to borrowing.
 * That imbalance is the substance of Jacques & List's (2019) critique, and the
 * cheapest honest answer to it is to let the reader recompute without a
 * category and see what survives.
 *
 * The type is not a field in the interchange format — it lives in the
 * innovation label, as a prefix before the first colon ("ISC: bite: ..."). So
 * it is parsed heuristically and anything unrecognised becomes `untyped`,
 * which is visible in the UI rather than silently lumped in somewhere.
 */

import type { Dataset } from './types.js';

export type InnovationType = 'RSC' | 'ISC' | 'Mrp' | 'Syn' | 'Lex' | 'untyped';

export const INNOVATION_TYPES: InnovationType[] = ['RSC', 'ISC', 'Mrp', 'Syn', 'Lex', 'untyped'];

/** K&F's Table 5-1 categories. */
export const TYPE_LABELS: Record<InnovationType, string> = {
  RSC: 'regular sound change',
  ISC: 'irregular sound change',
  Mrp: 'morphological',
  Syn: 'syntactic',
  Lex: 'lexical replacement',
  untyped: 'untyped',
};

/**
 * Whether the category is usually treated as strong subgrouping evidence.
 *
 * Shown in the UI as a hint, not applied as a weight: the point is to let the
 * user see what a category is worth, not to decide for them.
 */
export const TYPE_DIAGNOSTIC: Record<InnovationType, boolean> = {
  RSC: false, ISC: true, Mrp: true, Syn: false, Lex: false, untyped: false,
};

const ALIASES: Record<string, InnovationType> = {
  rsc: 'RSC', reg: 'RSC', regular: 'RSC',
  isc: 'ISC', irr: 'ISC', irregular: 'ISC',
  mrp: 'Mrp', morph: 'Mrp', morphological: 'Mrp',
  // K&F's "syntactic change" row covers several prefixes in their own data:
  // Sytx, Prg (pragmatic) and Phr (phrasal). Together these are exactly the
  // 10 innovations Table 5-1 counts as syntactic, so they are grouped as it
  // does rather than split into categories the published typology lacks.
  syn: 'Syn', synt: 'Syn', sytx: 'Syn', syntactic: 'Syn',
  prg: 'Syn', phr: 'Syn',
  lex: 'Lex', lexical: 'Lex',
};

/** Read the type from an innovation label's prefix. */
export function typeOf(label: string): InnovationType {
  const colon = label.indexOf(':');
  if (colon <= 0) return 'untyped';
  const prefix = label.slice(0, colon).trim().toLowerCase();
  return ALIASES[prefix] ?? 'untyped';
}

export function typesOf(dataset: Dataset): InnovationType[] {
  return dataset.innovations.map(typeOf);
}

/** How many innovations fall into each type present in the dataset. */
export function typeCounts(dataset: Dataset): Map<InnovationType, number> {
  const counts = new Map<InnovationType, number>();
  for (const type of typesOf(dataset)) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
}

/**
 * A dataset restricted to the enabled types.
 *
 * Note this genuinely changes which subgroups are *attested*, not just their
 * scores: candidates come from distinct innovation patterns, so dropping a
 * category can remove a subgroup entirely. That is the point — "does this
 * grouping survive without the lexical evidence?" is a question about
 * existence, not only strength.
 */
export function filterByType(
  dataset: Dataset,
  enabled: ReadonlySet<InnovationType>,
): Dataset {
  const types = typesOf(dataset);
  const keep: number[] = [];
  for (let i = 0; i < types.length; i++) if (enabled.has(types[i]!)) keep.push(i);

  if (keep.length === dataset.innovations.length) return dataset;
  return {
    languages: dataset.languages,
    innovations: keep.map((i) => dataset.innovations[i]!),
    matrix: keep.map((i) => dataset.matrix[i]!),
  };
}

/**
 * Per-row multipliers from per-type weights.
 *
 * Returns null when every weight is 1, so the scorer can skip the work
 * entirely in the default case.
 */
export function weightsFor(
  dataset: Dataset,
  typeWeights: Partial<Record<InnovationType, number>> | undefined,
): Float64Array | null {
  if (!typeWeights) return null;
  const values = Object.values(typeWeights);
  if (values.length === 0 || values.every((w) => w === 1)) return null;

  const types = typesOf(dataset);
  const weights = new Float64Array(types.length);
  for (let i = 0; i < types.length; i++) weights[i] = typeWeights[types[i]!] ?? 1;
  return weights;
}
