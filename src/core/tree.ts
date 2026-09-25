/**
 * The subgroups of a hypothesis as a tree, and a chain order that respects it.
 *
 * A tree drawn over the chain needs every subgroup to be an unbroken run of
 * languages; the glottometric seriation owes no such thing. So the order is
 * derived from the tree: each node's children are arranged by where their
 * languages sat in the current chain order (so the view changes as little as
 * possible), then, where a node has few enough children to try every
 * arrangement, by what keeps the linkages and contact zones in one piece.
 */

import type { GroupSpec } from './hypothesis.js';

export type TreeNode =
  | { kind: 'leaf'; language: number }
  | {
    kind: 'clade';
    /** Null for the root, which is implicit: the whole family. */
    groupId: string | null;
    members: number[];
    children: TreeNode[];
  };

/**
 * Nest the subgroups into a tree under an implicit root. Null if they do not
 * nest (see `treeConflicts`). Two subgroups with identical members nest in the
 * order given, one directly inside the other.
 */
export function buildTree(groups: GroupSpec[], nLanguages: number): TreeNode | null {
  const subs = groups
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => g.kind === 'subgroup' && g.members.length > 0)
    .sort((a, b) => b.g.members.length - a.g.members.length || a.i - b.i)
    .map(({ g }) => g);

  const root: TreeNode = {
    kind: 'clade', groupId: null,
    members: Array.from({ length: nLanguages }, (_, i) => i),
    children: [],
  };
  // Clades placed so far, most recent first, so an identical later subgroup
  // lands inside the earlier one rather than beside it.
  const placed: Extract<TreeNode, { kind: 'clade' }>[] = [root];

  for (const g of subs) {
    const set = new Set(g.members);
    // The smallest placed clade containing it.
    let parent: Extract<TreeNode, { kind: 'clade' }> | null = null;
    for (const c of placed) {
      if (g.members.every((m) => c.members.includes(m))
        && (!parent || c.members.length <= parent.members.length)) {
        parent = c;
      }
    }
    // Anything already under the parent that overlaps without nesting means
    // the subgroups do not form a tree.
    for (const child of parent!.children) {
      if (child.kind !== 'clade') continue;
      const shared = child.members.filter((m) => set.has(m)).length;
      if (shared > 0 && shared < child.members.length && shared < set.size) return null;
    }
    const node: TreeNode = { kind: 'clade', groupId: g.id, members: g.members.slice(), children: [] };
    parent!.children.push(node);
    placed.unshift(node);
  }

  // Leaves go under the smallest clade containing them.
  const attach = (node: Extract<TreeNode, { kind: 'clade' }>) => {
    const covered = new Set<number>();
    for (const c of node.children) {
      if (c.kind === 'clade') {
        attach(c);
        c.members.forEach((m) => covered.add(m));
      }
    }
    for (const m of node.members) {
      if (!covered.has(m)) node.children.push({ kind: 'leaf', language: m });
    }
  };
  attach(root);
  return root;
}

export function leavesOf(node: TreeNode): number[] {
  return node.kind === 'leaf' ? [node.language] : node.children.flatMap(leavesOf);
}

/** Levels above the leaves: a leaf is 0, a clade one more than its tallest child. */
export function heightOf(node: TreeNode): number {
  return node.kind === 'leaf' ? 0 : 1 + Math.max(...node.children.map(heightOf));
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items.slice();
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i]!, ...p];
  }
}

/** Try every arrangement of up to this many children (5! = 120). */
export const EXHAUSTIVE_CHILDREN = 5;

/**
 * A leaf order in which every subgroup is contiguous, as close as it can
 * reasonably be to `base` (e.g. the seriated chain order), with linkages and
 * contact zones kept in as few pieces as the tree allows.
 */
export function treeOrder(tree: TreeNode, base: number[], zones: number[][]): number[] {
  const basePos = new Map(base.map((l, i) => [l, i]));
  const pos = (l: number) => basePos.get(l) ?? l;
  const barycentre = (leaves: number[]) =>
    leaves.reduce((a, l) => a + pos(l), 0) / leaves.length;

  /** Pieces each zone is broken into within this stretch of leaves. */
  const pieces = (leaves: number[]) => {
    let total = 0;
    for (const zone of zones) {
      const inZone = new Set(zone);
      let inside = false;
      for (const l of leaves) {
        const now = inZone.has(l);
        if (now && !inside) total++;
        inside = now;
      }
    }
    return total;
  };
  /** How far the stretch has drifted from the base order. */
  const drift = (leaves: number[], offset: number) =>
    leaves.reduce((a, l, i) => a + Math.abs(offset + i - pos(l)), 0);

  const order = (node: TreeNode): number[] => {
    if (node.kind === 'leaf') return [node.language];
    const blocks = node.children.map(order);
    blocks.sort((a, b) => barycentre(a) - barycentre(b));
    if (blocks.length <= 1 || blocks.length > EXHAUSTIVE_CHILDREN || zones.length === 0) {
      return blocks.flat();
    }
    const offset = Math.min(...blocks.flat().map(pos));
    let best = blocks.flat();
    let bestCost = [pieces(best), drift(best, offset)];
    for (const arrangement of permutations(blocks)) {
      const leaves = arrangement.flat();
      const cost = [pieces(leaves), drift(leaves, offset)];
      if (cost[0]! < bestCost[0]! || (cost[0] === bestCost[0] && cost[1]! < bestCost[1]!)) {
        best = leaves;
        bestCost = cost;
      }
    }
    return best;
  };

  return order(tree);
}
