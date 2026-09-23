/**
 * Linkage breaking: reading a diagram as a sequence of splits.
 *
 * Kalyan & François (2019: 171) define the machinery precisely:
 *
 *   i.   A glottometric diagram is a weighted hypergraph whose nodes are
 *        dialects, whose edges are isoglosses, and whose edge weights are the
 *        subgroupiness values of those isoglosses.
 *   ii.  A **language** is a connected component of that hypergraph — a set of
 *        dialects chained together by isoglosses and disconnected from the rest.
 *   iii. The **chronology** is found by successively removing the weakest
 *        edges and noting at each stage how the dialects are partitioned.
 *
 * The threshold control already removes the weakest isoglosses; all that was
 * missing is reporting the partition. So the slider doubles as a position in
 * the sequence: at threshold t the diagram shows the stage after every
 * isogloss weaker than t has been lost, and the components are the languages
 * that existed then.
 *
 * ## The objection, which travels with the feature
 *
 * Elgh & Hammarström (2024: 312) argue the inference does not hold. The
 * weakness formula "offers no guarantee that the weakest isogloss lines are
 * the earliest links to be broken. Rather, weaker lines may be indicative of
 * shorter time spans, not of when those time spans occurred." They hold more
 * broadly that Historical Glottometry is "simply a data display system, with
 * no explicit time dimension".
 *
 * That is why nothing here is named `date` or `age`, why the UI calls the
 * result a *fragmentation sequence* rather than a chronology, and why the
 * panel carries the quotation. The sequence is a fact about the evidence; that
 * it is a history is a claim the evidence does not settle.
 */

import type { Subgroup } from './types.js';

export interface LinkageStage {
  /**
   * The highest threshold at which this partition still holds.
   *
   * A partition is constant over a half-open interval: raising the threshold
   * past an isogloss's weight is what drops it, so the partition for
   * `(previous.threshold, threshold]` is this one. Keying a stage by the top
   * of its interval is what makes "set the slider here" land on this stage
   * rather than the one before it.
   */
  threshold: number;
  /**
   * The isogloss whose loss ended the previous stage, or null for the first.
   *
   * Several isoglosses can share a weight, so this is the strongest of those
   * removed at this step — the one it is fair to say the break waited on.
   */
  brokenBy: Subgroup | null;
  /** Languages at this stage: connected components, each sorted. */
  components: number[][];
  /** componentOf[language] = index into `components`. */
  componentOf: number[];
}

/** Connected components of the hypergraph formed by `edges` over n languages. */
export function componentsOf(edges: Subgroup[], nLanguages: number): number[][] {
  const parent = Array.from({ length: nLanguages }, (_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[x] !== root) {
      const next = parent[x]!;
      parent[x] = root;
      x = next;
    }
    return root;
  };

  for (const edge of edges) {
    const first = edge.members[0];
    if (first === undefined) continue;
    for (let i = 1; i < edge.members.length; i++) {
      const a = find(first);
      const b = find(edge.members[i]!);
      if (a !== b) parent[a] = b;
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < nLanguages; i++) {
    const root = find(i);
    const group = byRoot.get(root);
    if (group) group.push(i);
    else byRoot.set(root, [i]);
  }

  return [...byRoot.values()].sort((a, b) => a[0]! - b[0]!);
}

const signature = (components: number[][]) =>
  components.map((c) => c.join(',')).join('|');

/**
 * Every stage of fragmentation, from the whole family to its final pieces.
 *
 * Only thresholds at which the partition actually changes become stages, so
 * the result is the sequence of *events* rather than one entry per isogloss.
 */
export function linkageStages(
  subgroups: Subgroup[],
  nLanguages: number,
  weightOf: (s: Subgroup) => number,
): LinkageStage[] {
  if (nLanguages === 0) return [];

  const sorted = [...subgroups].sort((a, b) => weightOf(a) - weightOf(b));
  const weights = [...new Set(sorted.map(weightOf))].sort((a, b) => a - b);
  const max = weights.length ? weights[weights.length - 1]! : 0;

  // Candidates: 0 (nothing removed), each distinct weight, and one step past
  // the strongest. Without that last one the strongest isogloss survives every
  // threshold and the family never finishes coming apart.
  const beyond = max + Math.max(0.01, Math.abs(max) * 1e-6);
  const thresholds = [0, ...weights, beyond];

  // Collect the partition at each candidate, then keep the LAST threshold of
  // each run of identical partitions — the top of the interval it holds on.
  const collected: { threshold: number; components: number[][]; key: string }[] = [];
  for (const threshold of thresholds) {
    const active = sorted.filter((s) => weightOf(s) >= threshold);
    const components = componentsOf(active, nLanguages);
    const key = signature(components);
    const last = collected[collected.length - 1];
    if (last && last.key === key) last.threshold = threshold;
    else collected.push({ threshold, components, key });
  }

  return collected.map((entry, index) => {
    // The isogloss whose loss ended the previous stage: the strongest of those
    // that dropped out as the threshold rose past its interval.
    let brokenBy: Subgroup | null = null;
    if (index > 0) {
      const previousThreshold = collected[index - 1]!.threshold;
      const dropped = sorted.filter((s) => weightOf(s) <= previousThreshold);
      brokenBy = dropped.length ? dropped[dropped.length - 1]! : null;
    }

    const componentOf = new Array<number>(nLanguages).fill(0);
    entry.components.forEach((component, componentIndex) => {
      for (const language of component) componentOf[language] = componentIndex;
    });

    return { threshold: entry.threshold, brokenBy, components: entry.components, componentOf };
  });
}

/**
 * The stage in force at a given threshold.
 *
 * Each stage holds on `(previous.threshold, threshold]`, so the right one is
 * the first whose threshold reaches the value asked for — not the last one
 * below it, which would return the partition from the interval before.
 */
export function stageAt(stages: LinkageStage[], threshold: number): LinkageStage | null {
  for (const stage of stages) {
    if (stage.threshold >= threshold - 1e-9) return stage;
  }
  return stages[stages.length - 1] ?? null;
}
