/**
 * A hypothesis drawn with the same contour engine as the computed diagram.
 *
 * Same layout, same routing, so a group sits exactly where the corresponding
 * computed subgroup would and the two views can be flicked between. Only the
 * styling differs (see HYPOTHESIS_STYLE), and each contour carries its group's
 * id as its key: a linkage may share a subgroup's exact membership.
 */

import type { Layout } from '../core/layout.js';
import { maskOf, type Glottometry } from '../core/metrics.js';
import type { GroupSpec } from '../core/hypothesis.js';
import type { Subgroup } from '../core/types.js';
import type { TreeNode } from '../core/tree.js';
import { buildScene, type Scene } from './scene.js';
import { HYPOTHESIS_STYLE, labelHalfWidth } from './styles.js';
import { drawTree, type NodeContent } from './treeDrawing.js';

export function hypothesisScene(
  layout: Layout,
  g: Glottometry,
  groups: GroupSpec[],
  nameOf: (groupId: string) => string,
): Scene {
  // A group with no members left (every one deleted) has nothing to draw.
  const drawable = groups.filter((s) => s.members.length > 0);
  const pseudo: Subgroup[] = drawable.map((s) => ({
    ...g.stats(maskOf(s.members, g.nLanguages)),
    members: s.members,
    memberNames: s.members.map((m) => g.languages[m]!),
  }));
  const byId = new Map(drawable.map((s) => [s.id, s]));
  const scene = buildScene(layout, pseudo, { keyOf: (_, i) => drawable[i]!.id });
  return {
    ...scene,
    contours: scene.contours.map((c) => {
      const spec = byId.get(c.key)!;
      return {
        ...c,
        style: { ...HYPOTHESIS_STYLE[spec.kind] },
        hypothesis: { kind: spec.kind, name: nameOf(spec.id) },
      };
    }),
  };
}

/**
 * The hypothesis as a tree beside the chain: subgroups become the tree, and
 * only linkages and contact zones are drawn as contours — as in Edwards's
 * figure, the tree carries descent and the outlines carry contact.
 *
 * `layout` must be a chain in an order the tree allows (see `treeOrder`), or
 * a subgroup's branches would cross. The view is widened to the left for the
 * tree and cropped on the right to what the contours need.
 */
export function hypothesisTreeScene(
  layout: Layout,
  g: Glottometry,
  groups: GroupSpec[],
  nameOf: (groupId: string) => string,
  tree: TreeNode,
  content: (groupId: string | null) => NodeContent | null,
  opts: { listInnovations?: boolean } = {},
): Scene {
  const zones = groups.filter((s) => s.kind !== 'subgroup');
  const base = hypothesisScene(layout, g, zones, nameOf);

  const cx = layout.nodes[0]?.x ?? layout.width / 2;
  const widestLabel = Math.max(...layout.nodes.map((n) => labelHalfWidth(n.label, layout.nodeRadius)));
  // The chain scene's capsules: nodeRadius + basePadding (8) + track × trackGap (7).
  const widestContour = base.contours.length === 0 ? 0
    : layout.nodeRadius + 8 + Math.max(...base.contours.map((c) => c.track)) * 7 + 2;
  const extent = Math.max(widestLabel, widestContour);

  const drawing = drawTree(tree, layout, content, {
    leafX: cx - extent - 16,
    listInnovations: opts.listInnovations,
  });
  const x0 = Math.floor(drawing.minX - 10);
  const x1 = Math.ceil(cx + extent + 20);
  return {
    ...base,
    tree: drawing,
    width: x1 - x0,
    viewBox: { x: x0, y: base.viewBox.y, width: x1 - x0, height: base.viewBox.height },
  };
}
