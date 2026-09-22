/**
 * Turning a seriated ordering into node positions.
 *
 * Phase 1 supports the chain layout only: languages down a single column, in
 * seriated order, which is what K&F's published Figure 5-11 uses and what
 * makes contiguous subgroups drawable as simple capsules. Geographic, MDS and
 * manual layouts come later; the `Layout` shape is deliberately agnostic
 * about how positions were arrived at so the renderer never has to care.
 */

import type { Subgroup } from './types.js';
import { seriate } from './seriation.js';

export interface LayoutNode {
  /** Index into Dataset.languages. */
  language: number;
  label: string;
  x: number;
  y: number;
}

export interface Layout {
  nodes: LayoutNode[];
  /** order[position] = language index. */
  order: number[];
  /** position[language] = position. Inverse of `order`, precomputed. */
  position: number[];
  nodeRadius: number;
  spacing: number;
  width: number;
  height: number;
}

export interface ChainLayoutOptions {
  nodeRadius?: number;
  spacing?: number;
  /** Horizontal room reserved either side for contours. */
  margin?: number;
}

/**
 * Seriate on the FULL subgroup set, not the thresholded subset.
 *
 * This is the layout-stability decision (BUILD_PLAN.md). If the ordering were
 * recomputed from whatever is currently above the display threshold, moving
 * the threshold slider would reshuffle the whole diagram: with few subgroups
 * many orderings tie at zero cost and the search returns an arbitrary one.
 * Measured on the demo data, re-seriating per threshold moved 12-18 of 18
 * nodes per step. Seriating once moves none, costs only two contiguous
 * contours at the default threshold, and is identical at higher ones.
 */
export function orderFor(
  subgroups: Subgroup[],
  nLanguages: number,
  reference?: number[],
): { order: number[]; cost: number } {
  const masks = subgroups.map((s) => {
    const m = new Array<boolean>(nLanguages).fill(false);
    for (const i of s.members) m[i] = true;
    return m;
  });
  const { order, cost } = seriate(masks, subgroups.map((s) => s.sigma), nLanguages, {
    seed: 0,
    restarts: 20,
    reference: reference ?? Array.from({ length: nLanguages }, (_, i) => i),
  });
  return { order, cost };
}

export function chainLayout(
  order: number[],
  labels: string[],
  opts: ChainLayoutOptions = {},
): Layout {
  const { nodeRadius = 13, spacing = 46, margin = 260 } = opts;

  const cx = margin;
  const top = nodeRadius + 20;
  const nodes: LayoutNode[] = order.map((language, pos) => ({
    language,
    label: labels[language] ?? String(language),
    x: cx,
    y: top + pos * spacing,
  }));

  const position = new Array<number>(order.length);
  order.forEach((language, pos) => {
    position[language] = pos;
  });

  return {
    nodes,
    order,
    position,
    nodeRadius,
    spacing,
    width: margin * 2,
    height: top + (order.length - 1) * spacing + nodeRadius + 20,
  };
}

/** Contiguous runs of a subgroup's members, as [startPos, endPos] pairs. */
export function runsOf(members: number[], position: number[]): [number, number][] {
  const positions = members.map((m) => position[m]!).sort((a, b) => a - b);
  const runs: [number, number][] = [];
  let start = positions[0]!;
  let prev = start;
  for (let i = 1; i < positions.length; i++) {
    const p = positions[i]!;
    if (p !== prev + 1) {
      runs.push([start, prev]);
      start = p;
    }
    prev = p;
  }
  runs.push([start, prev]);
  return runs;
}
