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

/**
 * A label prefix, split into its parts: `Lex-R+:` is type `Lex`, lexical
 * status `R`, quality mark `+`.
 *
 * The modifiers carry innovation quality (see `quality.ts`) through the CSV,
 * which has no other channel for it: an extra column would be read as a
 * language. K&F's analyzer treats the label as opaque text, so files using
 * them still load there.
 */
const PREFIX = /^([A-Za-z]+)(?:-([A-Za-z]))?([+-])?$/;

export interface LabelPrefix {
  /** The type part as written, e.g. `Lex`, `Sytx`. */
  base: string;
  /** A single status letter after a hyphen, uppercased. */
  status?: string;
  mark?: '+' | '-';
}

export function splitPrefix(label: string): LabelPrefix | null {
  const colon = label.indexOf(':');
  if (colon <= 0) return null;
  const m = PREFIX.exec(label.slice(0, colon).trim());
  if (!m) return null;
  return {
    base: m[1]!,
    status: m[2]?.toUpperCase(),
    mark: m[3] as '+' | '-' | undefined,
  };
}

/** Read the type from an innovation label's prefix. */
export function typeOf(label: string): InnovationType {
  const prefix = splitPrefix(label);
  if (!prefix) return 'untyped';
  return ALIASES[prefix.base.toLowerCase()] ?? 'untyped';
}

/**
 * Per-row explicit types, aligned with the dataset's rows.
 *
 * The editor lets a row's type be set outright, stored in its metadata, so the
 * label prefix is only a fallback. Everything that scores or counts by type has
 * to take these into account: a row shown as ISC in the grid but filtered and
 * weighted as `untyped` would make the type controls quietly wrong.
 */
export type TypeOverrides = ReadonlyArray<InnovationType | undefined>;

/** The type a row is treated as: explicit if set, else from its label. */
export function resolveType(label: string, override?: InnovationType): InnovationType {
  return override ?? typeOf(label);
}

export function typesOf(dataset: Dataset, overrides?: TypeOverrides): InnovationType[] {
  return dataset.innovations.map((label, i) => resolveType(label, overrides?.[i]));
}

/** How many innovations fall into each type present in the dataset. */
export function typeCounts(dataset: Dataset, overrides?: TypeOverrides): Map<InnovationType, number> {
  const counts = new Map<InnovationType, number>();
  for (const type of typesOf(dataset, overrides)) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
}

function keptRows(types: InnovationType[], enabled: ReadonlySet<InnovationType>): number[] {
  const keep: number[] = [];
  for (let i = 0; i < types.length; i++) if (enabled.has(types[i]!)) keep.push(i);
  return keep;
}

function selectRows(dataset: Dataset, keep: number[]): Dataset {
  if (keep.length === dataset.innovations.length) return dataset;
  return {
    languages: dataset.languages,
    innovations: keep.map((i) => dataset.innovations[i]!),
    matrix: keep.map((i) => dataset.matrix[i]!),
  };
}

function weightsFromTypes(
  types: InnovationType[],
  typeWeights: Partial<Record<InnovationType, number>> | undefined,
): Float64Array | null {
  if (!typeWeights) return null;
  const values = Object.values(typeWeights);
  if (values.length === 0 || values.every((w) => w === 1)) return null;

  const weights = new Float64Array(types.length);
  for (let i = 0; i < types.length; i++) weights[i] = typeWeights[types[i]!] ?? 1;
  return weights;
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
  overrides?: TypeOverrides,
): Dataset {
  return selectRows(dataset, keptRows(typesOf(dataset, overrides), enabled));
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
  overrides?: TypeOverrides,
): Float64Array | null {
  return weightsFromTypes(typesOf(dataset, overrides), typeWeights);
}

/**
 * Filter and weight in one step, which is what the scorer needs.
 *
 * `rows[i]` is the full dataset's index for filtered row i: anything keyed by
 * the original rows, such as innovation metadata, is looked up through it.
 *
 * Doing them separately would mean re-aligning the overrides with the
 * filtered rows, and a misalignment there would weight the wrong innovations
 * without any visible symptom.
 */
export function applyTypeSettings(
  dataset: Dataset,
  enabled: ReadonlySet<InnovationType>,
  typeWeights: Partial<Record<InnovationType, number>> | undefined,
  overrides?: TypeOverrides,
): { dataset: Dataset; weights: Float64Array | null; rows: number[] } {
  const types = typesOf(dataset, overrides);
  const keep = keptRows(types, enabled);
  return {
    dataset: selectRows(dataset, keep),
    weights: weightsFromTypes(keep.map((i) => types[i]!), typeWeights),
    rows: keep,
  };
}

/**
 * The type settings in words, for the exported figure's caption.
 *
 * Spelled out rather than flagged: a figure has to be reproducible from its
 * own caption, and "type-weighted" does not say how. Only types present in the
 * data are mentioned, and a weight on an excluded type is moot, so omitted.
 */
export function describeTypeSettings(
  present: ReadonlyMap<InnovationType, number>,
  enabledTypes: readonly InnovationType[] | undefined,
  typeWeights: Partial<Record<InnovationType, number>> | undefined,
): string[] {
  const name = (t: InnovationType) => (t === 'untyped' ? TYPE_LABELS[t] : t);
  const enabled = enabledTypes ?? INNOVATION_TYPES;
  const excluded = INNOVATION_TYPES.filter((t) => present.has(t) && !enabled.includes(t));
  const weighted = INNOVATION_TYPES.filter((t) => {
    const w = typeWeights?.[t];
    return w !== undefined && w !== 1 && present.has(t) && !excluded.includes(t);
  });

  const parts: string[] = [];
  if (excluded.length > 0) parts.push(`excluding ${excluded.map(name).join(', ')}`);
  if (weighted.length > 0) {
    parts.push(`weights ${weighted.map((t) => `${name(t)} ×${typeWeights![t]}`).join(', ')}`);
  }
  return parts;
}
