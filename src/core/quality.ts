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
 * Nothing here affects scoring. Quality is recorded and shown; how it should
 * enter the diagram is a separate decision.
 */

import { splitPrefix, typeOf, type InnovationType } from './innovationTypes.js';

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
