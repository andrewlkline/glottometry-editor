/**
 * Builds a renderable scene from scored subgroups.
 *
 * Pure and DOM-free: the React component and the standalone SVG exporter both
 * consume this, so what you see on screen and what lands in the .svg cannot
 * drift apart.
 */

import type { Subgroup } from '../core/types.js';
import { chainLayout, runsOf, type Layout } from '../core/layout.js';
import { assignTracks } from '../geometry/tracks.js';
import { capsuleFor, verticalPadding } from '../geometry/capsule.js';
import { contourStyle, type ContourStyle } from './styles.js';

export interface ContourShape {
  key: string;
  subgroup: Subgroup;
  /** One path per contiguous run of members. */
  paths: string[];
  /** Outer-edge connectors, present only when the subgroup is split. */
  connectors: string[];
  style: ContourStyle;
  track: number;
  contiguous: boolean;
}

export interface Scene {
  layout: Layout;
  contours: ContourShape[];
  width: number;
  height: number;
  /** Subgroups that could not be drawn as a single stadium. */
  splitCount: number;
}

export interface SceneOptions {
  nodeRadius?: number;
  spacing?: number;
  trackGap?: number;
  basePadding?: number;
  /** Extra room beyond the widest contour. */
  pagePadding?: number;
}

export function buildScene(
  order: number[],
  labels: string[],
  subgroups: Subgroup[],
  opts: SceneOptions = {},
): Scene {
  const {
    nodeRadius = 13,
    spacing = 46,
    trackGap = 7,
    basePadding = 8,
    pagePadding = 28,
  } = opts;

  const position = new Array<number>(labels.length);
  order.forEach((language, pos) => {
    position[language] = pos;
  });

  const runsPerSubgroup = subgroups.map((s) => runsOf(s.members, position));
  const tracks = assignTracks(runsPerSubgroup.map((runs) => ({ runs })));

  // The widest contour sets the column offset, so nothing is clipped.
  const maxTrack = tracks.length ? Math.max(...tracks) : 0;
  const maxHalfWidth = nodeRadius + basePadding + maxTrack * trackGap;
  const margin = maxHalfWidth + pagePadding;

  const layout = chainLayout(order, labels, { nodeRadius, spacing, margin });
  const maxSigma = subgroups.reduce((m, s) => Math.max(m, s.sigma), 0);

  const contours: ContourShape[] = subgroups.map((subgroup, i) => {
    const runs = runsPerSubgroup[i]!;
    const track = tracks[i]!;
    const { paths, connectors } = capsuleFor(runs, {
      cx: layout.nodes[0]?.x ?? margin,
      top: layout.nodes[0]?.y ?? 0,
      spacing,
      halfWidth: nodeRadius + basePadding + track * trackGap,
      verticalPadding: verticalPadding(track, maxTrack, basePadding, spacing, nodeRadius),
      maxCornerRadius: nodeRadius * 2.4,
    });
    return {
      key: subgroup.members.join(','),
      subgroup,
      paths,
      connectors,
      style: contourStyle(subgroup.sigma, subgroup.kappa, { maxSigma }),
      track,
      contiguous: runs.length === 1,
    };
  });

  // Draw widest first so thin, strong inner contours stay legible on top.
  contours.sort((a, b) => b.track - a.track);

  return {
    layout,
    contours,
    width: margin * 2,
    height: layout.height,
    splitCount: contours.filter((c) => !c.contiguous).length,
  };
}
