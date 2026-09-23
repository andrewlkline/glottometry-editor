/**
 * The reasoning behind each innovation.
 *
 * K&F's 474-row matrix was built by hand, and the etymological argument for
 * every row — which proto-form, which reflexes, why this direction of change —
 * lives entirely outside the CSV. Their own worked example (2018: 76) reasons
 * from `hiw mɪjɪt; ltg məlit; lhi mɛlɛt; …` to two competing proto-forms and
 * then to which is innovative. None of that survives export. This is where it
 * goes.
 *
 * ## Deliberately alongside, not inside, `Dataset`
 *
 * `core/` is held at parity with the Python reference implementation and
 * scores a plain innovations × languages matrix. Metadata never reaches it:
 * `Project` carries a parallel `innovationMeta` array that the edit operations
 * keep aligned with `dataset.innovations` by construction. Scoring cannot be
 * affected by a note, and the Marama CSV round-trip is untouched.
 *
 * ## The boundary
 *
 * This edits innovations and their distributions. It is **not** a lexical
 * database or an etymological dictionary: a reflex is one free-text field per
 * language, not a structured lexical entry. Anything richer belongs in CLDF.
 */

import type { InnovationType } from '../core/innovationTypes.js';

export interface InnovationMeta {
  /**
   * Stable identity, independent of the label.
   *
   * Labels get edited and rows get reordered; relative-chronology links have
   * to survive both, so they reference ids rather than labels or positions.
   */
  id: string;
  /**
   * Explicit type, overriding the one parsed from the label prefix.
   *
   * Imported data carries its type in the label ("ISC: bite: …"), which is a
   * convention rather than a field. Once a row is edited here the type becomes
   * explicit, so it no longer depends on the label staying well-formed.
   */
  type?: InnovationType;
  protoForm?: string;
  innovatedForm?: string;
  gloss?: string;
  notes?: string;
  sources?: string[];
  /** Free-text reflex per language, keyed by language label. */
  reflexes?: Record<string, string>;
  /**
   * Innovations this one must have preceded, by id.
   *
   * K&F recorded these orderings and never used them; only 19.4% of their
   * innovations (92 of 474) participate in any. Stored because it is cheap to
   * capture while the evidence is in front of you and impossible to
   * reconstruct later — not because anything consumes it yet.
   */
  precedes?: string[];
}

let counter = 0;

/** Ids need only be unique within a project, and stable across a save. */
export function newInnovationId(): string {
  counter += 1;
  return `i${Date.now().toString(36)}${counter.toString(36)}`;
}

export function emptyMeta(): InnovationMeta {
  return { id: newInnovationId() };
}

/** True when nothing but the id is set, so the row carries no reasoning. */
export function isBlank(meta: InnovationMeta): boolean {
  return !meta.type && !meta.protoForm && !meta.innovatedForm && !meta.gloss
    && !meta.notes
    && !meta.sources?.length
    && !meta.precedes?.length
    && Object.values(meta.reflexes ?? {}).every((r) => !r);
}

/**
 * Bring a metadata array into line with a row count.
 *
 * Only used when loading a file whose arrays disagree — the edit operations
 * keep them aligned, so a mismatch means the file was written by another tool
 * or edited by hand. Padding beats refusing to open it.
 */
export function reconcile(
  meta: InnovationMeta[] | undefined,
  rowCount: number,
): InnovationMeta[] {
  const out = (meta ?? []).slice(0, rowCount);
  while (out.length < rowCount) out.push(emptyMeta());
  return out;
}
