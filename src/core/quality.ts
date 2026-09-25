/**
 * Innovation quality: how safely an innovation can be read as inherited
 * rather than borrowed or independently repeated.
 *
 * This is a different axis from type. K&F's types say *what* changed; quality
 * says how probative the change is, and the literature locates the decisive
 * distinction *inside* a type. Smith (2025: 659–662) splits lexical innovations
 * into replacements — a well-supported older word is gone without trace, as
 * with Proto-Kayanic *ŋad 'gills' displacing PMP *hasaŋ — and non-replacements,
 * where the older word survives alongside (synonymic) or there was none to
 * replace (novel concept). Only replacements count as subgrouping evidence for
 * him. A weight on the whole Lex type cannot express that: it discounts *ŋad
 * and *tikus alike.
 *
 * ## What is and is not recorded here
 *
 * Smith's criteria also ask whether an innovation is universal within, and
 * exclusive to, the group it defines. Those are relations between an
 * innovation and a candidate subgroup, and the metrics already compute them
 * (ε, p, q). Recording them per row would count them twice. What the matrix
 * cannot see is intrinsic to the innovation: whether it replaced something,
 * and whether its correspondences are regular. Those are the fields.
 *
 * ## Deliberately not defaulted by type
 *
 * Smith treats phonological innovations as the best evidence; Kaufman (2026:
 * 3) points out that natural sound changes recur independently and only
 * idiosyncratic ones are strong; K&F rank irregular sound change above regular.
 * There is no quality a type implies that all three would accept, so outside
 * the lexical statuses — which carry Smith's own definitions — nothing is
 * inferred. An unassessed row says so.
 *
 * Nothing here changes a score. Quality enters the diagram only as
 * decoration (see `supportClass` and `highQualitySubset`): K&F's numbers stay
 * exactly as they define them, and the reader sees what they rest on.
 */

import { splitPrefix, typeOf, type InnovationType } from './innovationTypes.js';
import type { Glottometry } from './metrics.js';
import type { Dataset } from './types.js';

/** Smith (2025: 659, ex. 5; 662 fn. 4). */
export type LexicalStatus = 'replacement' | 'synonymic' | 'novel' | 'indeterminate';

export const LEXICAL_STATUSES: LexicalStatus[] = [
  'replacement', 'synonymic', 'novel', 'indeterminate',
];

export const LEXICAL_STATUS_LABELS: Record<LexicalStatus, string> = {
  replacement: 'replacement',
  synonymic: 'synonymic',
  novel: 'novel concept',
  indeterminate: 'indeterminate',
};

export const LEXICAL_STATUS_HELP: Record<LexicalStatus, string> = {
  replacement: 'Replaces a well-supported older word, which leaves no trace in the group.',
  synonymic: 'The older word survives alongside the innovation.',
  novel: 'Fills a slot with no older reconstruction — new technology, new flora or fauna.',
  indeterminate: 'No older reconstruction exists to tell replacement from non-replacement.',
};

/** Prefix letters: `Lex-R:`, `Lex-S:`, `Lex-N:`, `Lex-I:`. */
export const STATUS_LETTERS: Record<string, LexicalStatus> = {
  R: 'replacement', S: 'synonymic', N: 'novel', I: 'indeterminate',
};

/**
 * Whether the reflexes show regular sound correspondences. Irregular ones mark
 * a loan from a related language (Smith 2025: 662; Kaufman 2026: 19–20).
 */
export type Correspondences = 'regular' | 'irregular';

/** An explicit judgement, overriding anything derived. */
export type Quality = 'high' | 'low';

export type QualityClass = 'high' | 'low' | 'undetermined';

export const QUALITY_CLASSES: QualityClass[] = ['high', 'low', 'undetermined'];

/** The quality-bearing fields; `InnovationMeta` carries these. */
export interface QualityFields {
  type?: InnovationType;
  lexicalStatus?: LexicalStatus;
  correspondences?: Correspondences;
  quality?: Quality;
}

export interface QualityJudgement {
  quality: QualityClass;
  /** Why, in a phrase the UI can show as is. */
  reason: string;
  /** Where the deciding value came from. */
  source: 'explicit' | 'label' | 'derived' | 'none';
}

/** What a label prefix says about quality, if anything. */
export function labelQuality(label: string): { lexicalStatus?: LexicalStatus; quality?: Quality } {
  const prefix = splitPrefix(label);
  if (!prefix) return {};
  const out: { lexicalStatus?: LexicalStatus; quality?: Quality } = {};
  // A status letter only means something on a lexical innovation.
  if (prefix.status && typeOf(label) === 'Lex') {
    const status = STATUS_LETTERS[prefix.status];
    if (status) out.lexicalStatus = status;
  }
  if (prefix.mark) out.quality = prefix.mark === '+' ? 'high' : 'low';
  return out;
}

/**
 * The quality a row is treated as.
 *
 * Precedence: an explicit judgement; then irregular correspondences, which
 * override a lexical status because a regular-looking replacement that was
 * borrowed is still a loan; then the lexical status. Explicit fields in the
 * metadata override what the label prefix says.
 */
export function assessQuality(label: string, fields: QualityFields = {}): QualityJudgement {
  const fromLabel = labelQuality(label);
  const type = fields.type ?? typeOf(label);
  const quality = fields.quality ?? fromLabel.quality;
  const qualitySource = fields.quality ? 'explicit' : 'label';

  if (quality) {
    return {
      quality,
      reason: qualitySource === 'explicit' ? 'set explicitly' : 'marked in the label prefix',
      source: qualitySource,
    };
  }

  if (fields.correspondences === 'irregular') {
    return {
      quality: 'low',
      reason: 'irregular correspondences suggest a loan',
      source: 'derived',
    };
  }

  if (type === 'Lex') {
    const status = fields.lexicalStatus ?? fromLabel.lexicalStatus;
    const source = fields.lexicalStatus ? 'derived' : 'label';
    switch (status) {
      case 'replacement':
        return { quality: 'high', reason: 'lexical replacement', source };
      case 'synonymic':
        return { quality: 'low', reason: 'synonymic: the older word survives', source };
      case 'novel':
        return { quality: 'low', reason: 'novel concept: nothing was replaced', source };
      case 'indeterminate':
        return {
          quality: 'undetermined',
          reason: 'indeterminate: no older word to compare',
          source,
        };
      default:
        return { quality: 'undetermined', reason: 'lexical status not recorded', source: 'none' };
    }
  }

  return { quality: 'undetermined', reason: 'not assessed', source: 'none' };
}

/** How many rows fall in each class. */
export function qualityCounts(judgements: QualityJudgement[]): Record<QualityClass, number> {
  const counts: Record<QualityClass, number> = { high: 0, low: 0, undetermined: 0 };
  for (const j of judgements) counts[j.quality]++;
  return counts;
}

// ---------------------------------------------------------------------------
// Quality in the diagram

/**
 * A group's exclusively shared innovations, counted by quality class.
 *
 * Expected counts, not weighted totals: a type weight says how much an
 * innovation should count, not whether it exists, and "is there a
 * high-quality innovation behind this group?" is a question about existence.
 * Down-weighting Lex to 0.25 must not make a replacement stop counting as one.
 * (The evidence panel's split is weighted instead, because it decomposes ε.)
 */
export function exclusiveByQuality(
  g: Glottometry,
  mask: boolean[],
  classOf: (row: number) => QualityClass,
): Record<QualityClass, number> {
  const out: Record<QualityClass, number> = { high: 0, low: 0, undetermined: 0 };
  for (let r = 0; r < g.nInnovations; r++) {
    const { allIn, noneOut } = g.rowProbabilities(r, mask);
    out[classOf(r)] += allIn * noneOut;
  }
  return out;
}

/**
 * The expected count at which a class is taken to be present: even odds that
 * at least one such innovation is exclusive to the group. Below it, a lone
 * high-quality innovation with an unknown cell in a member (0.5 under the
 * default NA policy) still counts; one that is probably shared by an outsider
 * does not.
 */
export const SUPPORT_THRESHOLD = 0.5;

/**
 * What a group's exclusive support rests on.
 *
 * - `high`: at least one high-quality exclusively shared innovation.
 * - `low`: none, and the support is assessed — it rests on low-quality
 *   evidence, Smith's (2025: 658–659) contact-zone profile.
 * - `unassessed`: none yet, but unassessed innovations could still supply one.
 *
 * The third class keeps the second honest: until the evidence is assessed, "no
 * high-quality support" is not a finding.
 */
export type SupportClass = 'high' | 'low' | 'unassessed';

export function supportClass(byQuality: Record<QualityClass, number>): SupportClass {
  if (byQuality.high >= SUPPORT_THRESHOLD) return 'high';
  if (byQuality.undetermined >= SUPPORT_THRESHOLD) return 'unassessed';
  return 'low';
}

/**
 * The rows judged high quality, with their weights kept aligned.
 *
 * Scoring this subset asks Smith's question of every group at once: does it
 * survive when only the evidence that can bear the weight is kept? Note it can
 * raise a group's κ as well as lower its ε, since low-quality conflicting
 * innovations go too.
 */
export function highQualitySubset(
  dataset: Dataset,
  weights: Float64Array | null,
  isHigh: (row: number) => boolean,
): { dataset: Dataset; weights: Float64Array | null } {
  const keep: number[] = [];
  for (let r = 0; r < dataset.innovations.length; r++) if (isHigh(r)) keep.push(r);
  return {
    dataset: {
      languages: dataset.languages,
      innovations: keep.map((r) => dataset.innovations[r]!),
      matrix: keep.map((r) => dataset.matrix[r]!),
    },
    weights: weights ? Float64Array.from(keep, (r) => weights[r]!) : null,
  };
}
