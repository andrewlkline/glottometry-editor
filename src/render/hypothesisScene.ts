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
import { buildScene, type Scene } from './scene.js';
import { HYPOTHESIS_STYLE } from './styles.js';

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
