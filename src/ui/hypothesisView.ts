/**
 * Everything the app derives from one hypothesis: its resolved groups and
 * assignments, the analysis against the matrix, its tree, and the scene that
 * draws it.
 *
 * One function rather than a chain of hooks so the comparison view can build
 * two of these side by side from exactly the same code as the single view —
 * a comparison computed differently from what each view shows would be worse
 * than none.
 */

import type { Glottometry } from '../core/metrics.js';
import { chainLayout, type Layout, type LayoutKind } from '../core/layout.js';
import { analyseHypothesis, type HypothesisAnalysis } from '../core/hypothesis.js';
import type { QualityClass } from '../core/quality.js';
import { buildTree, treeOrder, type TreeNode } from '../core/tree.js';
import type { Dataset } from '../core/types.js';
import {
  resolveAssignments, resolveGroups, type Hypothesis,
} from '../data/hypothesis.js';
import type { InnovationMeta } from '../data/innovationMeta.js';
import { hypothesisScene, hypothesisTreeScene } from '../render/hypothesisScene.js';
import type { Scene } from '../render/scene.js';

export interface HypothesisViewInput {
  hypothesis: Hypothesis;
  /** The full dataset (languages) and the scored, type-filtered one. */
  dataset: Dataset;
  scored: { g: Glottometry; dataset: Dataset; rows: number[] };
  meta: InnovationMeta[];
  layout: Layout | null;
  layoutKind: LayoutKind;
  /** Quality class of a scored row. */
  classOf: (row: number) => QualityClass;
  showTree: boolean;
  listAtNodes: boolean;
}

export interface HypothesisView {
  resolved: ReturnType<typeof resolveGroups>;
  assignments: ReturnType<typeof resolveAssignments>;
  analysis: HypothesisAnalysis;
  tree: TreeNode | null;
  /** Why no tree could be drawn, if none could. */
  treeUnavailable: string | null;
  scene: Scene | null;
  /** Whether `scene` is the tree drawing rather than nested contours. */
  isTree: boolean;
}

export function buildHypothesisView(input: HypothesisViewInput): HypothesisView {
  const { hypothesis, dataset, scored, meta, layout, layoutKind, classOf } = input;

  const resolved = resolveGroups(hypothesis, dataset.languages);
  const assignments = resolveAssignments(
    hypothesis, scored.rows.map((r) => meta[r]?.id), dataset.languages,
  );
  // Checked against the scored dataset, so the type filter decides what
  // evidence counts here exactly as it does for the computed diagram.
  const analysis = analyseHypothesis(
    scored.dataset, resolved.specs, classOf, layout?.order, assignments.assignmentOf,
  );

  const hasSubgroup = resolved.specs.some((s) => s.kind === 'subgroup' && s.members.length > 0);
  const tree = analysis.conflicts.length === 0 && hasSubgroup
    ? buildTree(resolved.specs, dataset.languages.length) : null;
  const treeUnavailable = analysis.conflicts.length > 0 ? 'subgroups overlap without nesting'
    : !tree ? 'no subgroups yet' : null;

  const names = new Map(hypothesis.groups.map((g) => [g.id, g.name || g.members.join(' + ')]));
  const nameOf = (id: string) => names.get(id) ?? id;

  if (!layout) {
    return { resolved, assignments, analysis, tree, treeUnavailable, scene: null, isTree: false };
  }

  if (input.showTree && layoutKind === 'chain' && tree) {
    const specs = resolved.specs;
    const order = treeOrder(
      tree, layout.order, specs.filter((s) => s.kind !== 'subgroup').map((s) => s.members),
    );
    const treeLayout = chainLayout(order, dataset.languages);
    const reports = new Map(analysis.groups.map((r) => [r.id, r]));
    const lostSuffix = (lost: number[]) =>
      (lost.length ? ` (lost in ${lost.map((l) => dataset.languages[l]).join(', ')})` : '');
    const innovationsOf = (rows: { row: number; lost?: number[] }[]) =>
      rows.map(({ row, lost }) => ({
        label: scored.dataset.innovations[row]! + lostSuffix(lost ?? []),
        quality: classOf(row),
      }));
    const familyRows = analysis.explanations.flatMap((e, r) => (e.kind === 'family' ? [r] : []));
    const scene = hypothesisTreeScene(
      treeLayout, scored.g, specs, nameOf, tree,
      (groupId) => {
        if (groupId === null) {
          return familyRows.length
            ? { name: '', innovations: innovationsOf(familyRows.map((row) => ({ row }))) } : null;
        }
        return {
          name: nameOf(groupId),
          innovations: innovationsOf(reports.get(groupId)?.credited ?? []),
        };
      },
      { listInnovations: input.listAtNodes },
    );
    return { resolved, assignments, analysis, tree, treeUnavailable, scene, isTree: true };
  }

  return {
    resolved, assignments, analysis, tree, treeUnavailable,
    scene: hypothesisScene(layout, scored.g, resolved.specs, nameOf),
    isTree: false,
  };
}
