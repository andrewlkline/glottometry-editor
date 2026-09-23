/**
 * Builds a renderable scene from scored subgroups and a layout.
 *
 * Pure and DOM-free: the React component and the standalone SVG exporter both
 * consume this, so what you see on screen and what lands in the .svg cannot
 * drift apart.
 *
 * Contour geometry is chosen by layout kind. A chain layout gets rounded
 * rectangles, because seriation makes each subgroup a contiguous run. A 2-D
 * layout gets routed blobs, which cost more but can wrap any arrangement of
 * members while excluding whatever sits among them.
 */

import type { Subgroup } from '../core/types.js';
import { runsOf, type Layout } from '../core/layout.js';
import { assignTracks, assignTracksByOverlap } from '../geometry/tracks.js';
import { capsuleFor, verticalPadding } from '../geometry/capsule.js';
import { blobFor } from '../geometry/blob.js';
import type { Point } from '../geometry/marchingSquares.js';
import { contourStyle, type ContourStyle } from './styles.js';

export interface ContourShape {
  key: string;
  subgroup: Subgroup;
  /** One path per connected region of the contour. */
  paths: string[];
  style: ContourStyle;
  track: number;
  /**
   * True when the subgroup's members are not contiguous in the layout, so the
   * contour had to route around non-members. Not a defect — it is what the
   * renderer exists to handle — but worth surfacing.
   */
  routed: boolean;
}

export interface Scene {
  layout: Layout;
  contours: ContourShape[];
  width: number;
  height: number;
  /** Subgroups whose contour had to route around non-members. */
  routedCount: number;
}

export interface SceneOptions {
  trackGap?: number;
  basePadding?: number;
  /** Extra room beyond the widest contour, chain layout only. */
  pagePadding?: number;
  /** Grid resolution for blob contours. Smaller is finer and slower. */
  blobResolution?: number;
}

export function buildScene(
  layout: Layout,
  subgroups: Subgroup[],
  opts: SceneOptions = {},
): Scene {
  return layout.kind === 'chain'
    ? chainScene(layout, subgroups, opts)
    : planarScene(layout, subgroups, opts);
}

function chainScene(layout: Layout, subgroups: Subgroup[], opts: SceneOptions): Scene {
  const { trackGap = 7, basePadding = 8 } = opts;
  const { nodeRadius, spacing, position } = layout;

  const runsPerSubgroup = subgroups.map((s) => runsOf(s.members, position));
  const tracks = assignTracks(runsPerSubgroup.map((runs) => ({ runs })));
  const maxTrack = tracks.length ? Math.max(...tracks) : 0;
  const maxSigma = subgroups.reduce((m, s) => Math.max(m, s.sigma), 0);

  const cx = layout.nodes[0]?.x ?? layout.width / 2;
  const top = layout.nodes[0]?.y ?? 0;

  const contours: ContourShape[] = subgroups.map((subgroup, i) => {
    const runs = runsPerSubgroup[i]!;
    const track = tracks[i]!;
    const { paths } = capsuleFor(runs, {
      cx,
      top,
      spacing,
      halfWidth: nodeRadius + basePadding + track * trackGap,
      verticalPadding: verticalPadding(track, maxTrack, basePadding, spacing, nodeRadius),
      maxCornerRadius: nodeRadius * 2.4,
    });
    return {
      key: subgroup.members.join(','),
      subgroup,
      paths,
      style: contourStyle(subgroup.sigma, subgroup.kappa, { maxSigma }),
      track,
      // A routed outline is one connected shape even when the members are
      // split, so this now records whether routing was needed, not whether
      // the drawing is fragmented.
      routed: runs.length > 1,
    };
  });

  contours.sort((a, b) => b.track - a.track);

  return {
    layout,
    contours,
    width: layout.width,
    height: layout.height,
    routedCount: contours.filter((c) => c.routed).length,
  };
}

function planarScene(layout: Layout, subgroups: Subgroup[], opts: SceneOptions): Scene {
  const { trackGap = 7, basePadding = 10, blobResolution = 4 } = opts;
  const { nodeRadius } = layout;

  const tracks = assignTracksByOverlap(subgroups.map((s) => s.members));
  const maxSigma = subgroups.reduce((m, s) => Math.max(m, s.sigma), 0);

  const pointOf = (language: number): Point => {
    const node = layout.nodes.find((n) => n.language === language)!;
    return [node.x, node.y];
  };
  const allPoints = new Map<number, Point>(
    layout.nodes.map((n) => [n.language, [n.x, n.y] as Point]),
  );

  const contours: ContourShape[] = subgroups.map((subgroup, i) => {
    const track = tracks[i]!;
    const memberSet = new Set(subgroup.members);
    const members = subgroup.members.map(pointOf);
    const nonMembers = [...allPoints.entries()]
      .filter(([language]) => !memberSet.has(language))
      .map(([, point]) => point);

    // Each track sits a little further out, which is what keeps overlapping
    // contours distinguishable — the 2-D equivalent of the chain's nesting.
    const { paths, rings } = blobFor(members, nonMembers, {
      memberRadius: nodeRadius * 3.1 + basePadding + track * trackGap,
      nonMemberRadius: nodeRadius * 2.3,
      exclusionRadius: nodeRadius * 1.45,
      resolution: blobResolution,
    });

    return {
      key: subgroup.members.join(','),
      subgroup,
      paths,
      style: contourStyle(subgroup.sigma, subgroup.kappa, { maxSigma }),
      track,
      routed: rings.length > 1,
    };
  });

  contours.sort((a, b) => b.track - a.track);

  return {
    layout,
    contours,
    width: layout.width,
    height: layout.height,
    routedCount: contours.filter((c) => c.routed).length,
  };
}
