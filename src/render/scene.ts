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

import type { TreeDrawing } from './treeDrawing.js';
import type { Subgroup } from '../core/types.js';
import { runsOf, type Layout } from '../core/layout.js';
import { assignTracks, assignTracksByOverlap } from '../geometry/tracks.js';
import { capsuleFor, verticalPadding } from '../geometry/capsule.js';
import { blobFor } from '../geometry/blob.js';
import type { Point } from '../geometry/marchingSquares.js';
import { contourStyle, labelHalfWidth, type ContourStyle } from './styles.js';

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
  /**
   * The contour's polygons, for 2-D layouts.
   *
   * Carried so containment can be verified against what was actually drawn.
   * Re-deriving the geometry in a test means the test keeps passing when the
   * renderer's parameters change underneath it — which is exactly how the
   * sparse-layout bug survived a green suite.
   */
  rings?: Point[][];
  /**
   * What the group's exclusive support rests on, and whether it survives on
   * high-quality evidence alone. Set by the quality overlay, not by the
   * geometry; absent when the overlay is off.
   */
  quality?: { support: 'high' | 'low' | 'unassessed'; survives?: boolean };
  /** Set when the contour is a hypothesis group rather than a computed subgroup. */
  hypothesis?: { kind: 'subgroup' | 'linkage' | 'contact'; name: string };
}

export interface Scene {
  /** A hypothesis's tree, drawn beside a chain; see treeDrawing.ts. */
  tree?: TreeDrawing;
  layout: Layout;
  contours: ContourShape[];
  width: number;
  height: number;
  /**
   * The region to actually display.
   *
   * Node positions are laid out first and contours drawn around them, so a
   * contour can reach outside the node canvas — the more so now that its
   * radius grows to bridge sparse layouts. The viewBox is widened to whatever
   * was drawn rather than clipping it, and node coordinates are left alone so
   * saved manual positions keep meaning what they meant.
   */
  viewBox: { x: number; y: number; width: number; height: number };
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
  /**
   * Contour key for the i-th subgroup. Defaults to the member indices, which
   * are unique among computed subgroups but not among a hypothesis's groups:
   * a linkage can have exactly a subgroup's members (Smith 2025, fig. 8).
   */
  keyOf?: (subgroup: Subgroup, index: number) => string;
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
      key: opts.keyOf?.(subgroup, i) ?? subgroup.members.join(','),
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

  // The chain canvas is already sized around its widest contour, and chain
  // contours are emitted as paths rather than rings, so there is nothing to
  // crop to here — the layout bounds are the right view.
  return {
    layout,
    contours,
    width: layout.width,
    height: layout.height,
    viewBox: { x: 0, y: 0, width: layout.width, height: layout.height },
    routedCount: contours.filter((c) => c.routed).length,
  };
}

function planarScene(layout: Layout, subgroups: Subgroup[], opts: SceneOptions): Scene {
  const { trackGap = 7, basePadding = 10, blobResolution = 4 } = opts;
  const { nodeRadius } = layout;

  const floor = nodeRadius * 3.1 + basePadding;

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
    // A backbone sampled along the subgroup's spanning tree carries the field
    // between distant members (see blob.ts), so the radius no longer has to
    // stretch to reach them and the contour stays close to the languages. It
    // only needs to be wide enough to read as a shape.
    const memberRadius = floor + track * trackGap;

    const { paths, rings } = blobFor(members, nonMembers, {
      memberRadius,
      nonMemberRadius: Math.max(nodeRadius * 2.3, memberRadius * 0.45),
      // Tied to the node itself, not the layout: this is what guarantees a
      // non-member's own circle stays outside, whatever the scale.
      exclusionRadius: nodeRadius * 1.45,
      resolution: blobResolution,
    });

    return {
      key: opts.keyOf?.(subgroup, i) ?? subgroup.members.join(','),
      subgroup,
      paths,
      style: contourStyle(subgroup.sigma, subgroup.kappa, { maxSigma }),
      track,
      routed: rings.length > 1,
      rings,
    };
  });

  contours.sort((a, b) => b.track - a.track);

  // Crop to what was actually drawn rather than to the layout canvas. A
  // geographic layout preserves the data's aspect ratio, so a wide, flat
  // family leaves broad empty bands above and below inside a square canvas.
  const pad = 16;
  const nodeExtent = layout.nodes.map((n) => ({
    x: n.x, y: n.y, half: labelHalfWidth(n.label, layout.nodeRadius),
  }));
  if (nodeExtent.length === 0) {
    return {
      layout, contours, width: layout.width, height: layout.height,
      viewBox: { x: 0, y: 0, width: layout.width, height: layout.height },
      routedCount: 0,
    };
  }
  let minX = Math.min(...nodeExtent.map((n) => n.x - n.half));
  let minY = Math.min(...nodeExtent.map((n) => n.y - layout.nodeRadius));
  let maxX = Math.max(...nodeExtent.map((n) => n.x + n.half));
  let maxY = Math.max(...nodeExtent.map((n) => n.y + layout.nodeRadius));
  for (const contour of contours) {
    for (const ring of contour.rings ?? []) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const viewBox = {
    x: minX - pad,
    y: minY - pad,
    width: (maxX - minX) + pad * 2,
    height: (maxY - minY) + pad * 2,
  };

  return {
    layout,
    contours,
    width: viewBox.width,
    height: viewBox.height,
    viewBox,
    routedCount: contours.filter((c) => c.routed).length,
  };
}
