/**
 * Two hypotheses over the same matrix, compared.
 *
 * Kaufman (2026: 6–7) insists such diagrams are "hypotheses in competition",
 * and his (4) and (5) differ in one thing: whether *a > ə is inherited or
 * areal. So the comparison is built around the innovations whose explanation
 * changes between the two readings, alongside the totals — extra origins,
 * losses, what is left unexplained — and how the high-quality innovations
 * fare, since Smith (2025: 659) would have a subgroup rest on those.
 *
 * Nothing here says which hypothesis is right. Fewer extra origins is more
 * parsimonious, not more true; the table reports the counts and the list
 * shows what they are made of.
 */

import type { Explanation, GroupSpec, HypothesisAnalysis } from './hypothesis.js';
import type { QualityClass } from './quality.js';

/** What an explanation amounts to, whichever group supplies it. */
export type ExplanationClass = 'inherited' | 'areal' | 'unexplained' | 'uninformative';

export function explanationClass(e: Explanation): ExplanationClass {
  switch (e.kind) {
    case 'tree': return 'inherited';
    case 'linkage':
    case 'contact': return 'areal';
    case 'residue': return 'unexplained';
    default: return 'uninformative';
  }
}

export interface HypothesisSummary {
  groups: { subgroup: number; linkage: number; contact: number };
  treeValid: boolean;
  extraGains: number | null;
  extraGainsFlat: number;
  losses: { recorded: number; unrecorded: number };
  informative: number;
  explained: Record<Exclude<ExplanationClass, 'uninformative'>, number>;
  /** How the informative innovations of each quality class are explained. */
  byQuality: Record<QualityClass, Record<Exclude<ExplanationClass, 'uninformative'>, number>>;
}

export function summarise(
  analysis: HypothesisAnalysis,
  groups: GroupSpec[],
  classOf: (row: number) => QualityClass,
): HypothesisSummary {
  const blank = () => ({ inherited: 0, areal: 0, unexplained: 0 });
  const explained = blank();
  const byQuality = { high: blank(), low: blank(), undetermined: blank() };
  analysis.explanations.forEach((e, row) => {
    const c = explanationClass(e);
    if (c === 'uninformative') return;
    explained[c]++;
    byQuality[classOf(row)][c]++;
  });
  const count = (k: GroupSpec['kind']) => groups.filter((g) => g.kind === k).length;
  return {
    groups: { subgroup: count('subgroup'), linkage: count('linkage'), contact: count('contact') },
    treeValid: analysis.conflicts.length === 0,
    extraGains: analysis.extraGains,
    extraGainsFlat: analysis.extraGainsFlat,
    losses: analysis.losses,
    informative: analysis.informative,
    explained,
    byQuality,
  };
}

/** How the explanation of one innovation changes from A to B. */
export type ChangeKind =
  /** Inherited in one, areal in the other: the (4)-versus-(5) question. */
  | 'inherited-areal'
  /** Explained in one, left unexplained in the other. */
  | 'explained-unexplained'
  /** Same kind of explanation, by a different group or with different losses. */
  | 'regrouped';

export interface Difference {
  row: number;
  a: Explanation;
  b: Explanation;
  kind: ChangeKind;
}

/**
 * The innovations explained differently.
 *
 * Groups are compared by their members, not their ids: a hypothesis copied
 * and then edited shares nothing by id with its original, but a subgroup it
 * left alone is the same claim and should not show as a change.
 */
export function differences(
  a: HypothesisAnalysis,
  b: HypothesisAnalysis,
  groupsA: GroupSpec[],
  groupsB: GroupSpec[],
): Difference[] {
  const membersA = new Map(groupsA.map((g) => [g.id, g.members.join(',')]));
  const membersB = new Map(groupsB.map((g) => [g.id, g.members.join(',')]));
  const key = (e: Explanation, members: Map<string, string>) => {
    const c = explanationClass(e);
    if (e.kind === 'tree') {
      return `${c}:${members.get(e.groupId)}:lost ${(e.assigned?.lost ?? []).join(',')}`;
    }
    if (e.kind === 'linkage' || e.kind === 'contact') return `${c}:${e.kind}:${members.get(e.groupId)}`;
    return c;
  };

  const out: Difference[] = [];
  const n = Math.min(a.explanations.length, b.explanations.length);
  for (let row = 0; row < n; row++) {
    const ea = a.explanations[row]!;
    const eb = b.explanations[row]!;
    if (key(ea, membersA) === key(eb, membersB)) continue;
    const ca = explanationClass(ea);
    const cb = explanationClass(eb);
    const pair = new Set([ca, cb]);
    const kind: ChangeKind = pair.has('inherited') && pair.has('areal') ? 'inherited-areal'
      : pair.has('unexplained') ? 'explained-unexplained'
      : 'regrouped';
    out.push({ row, a: ea, b: eb, kind });
  }
  return out;
}
