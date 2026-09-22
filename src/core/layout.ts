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

export type LayoutKind = 'chain' | 'mds' | 'geographic';

export interface Layout {
  /**
   * How positions were derived. The renderer uses this to pick contour
   * geometry: a chain gets rounded rectangles, anything 2-D gets routed
   * blobs.
   */
  kind: LayoutKind;
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
    kind: 'chain',
    nodes,
    order,
    position,
    nodeRadius,
    spacing,
    width: margin * 2,
    height: top + (order.length - 1) * spacing + nodeRadius + 20,
  };
}

export interface PlanarLayoutOptions {
  width?: number;
  height?: number;
  nodeRadius?: number;
  padding?: number;
}

/**
 * Scale arbitrary 2-D coordinates into the canvas, preserving aspect ratio.
 *
 * Aspect ratio matters: MDS distances and geographic distances both mean
 * something, and stretching one axis to fill the box would misrepresent them.
 */
export function fitToCanvas(
  points: [number, number][],
  width: number,
  height: number,
  padding: number,
): [number, number][] {
  if (points.length === 0) return [];

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);

  // Centre whichever axis the uniform scale leaves slack in.
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return points.map(([x, y]) => [
    offsetX + (x - minX) * scale,
    offsetY + (y - minY) * scale,
  ]);
}

/**
 * Push apart nodes that overlap, without losing the structure underneath.
 *
 * MDS places languages by how much history they share, so a tightly-knit
 * cluster — exactly the interesting case in a linkage — comes back as points
 * nearly on top of each other. Geographic coordinates do the same for villages
 * a few kilometres apart. Either way the labels become unreadable and the
 * contours meaningless.
 *
 * So: repeatedly separate pairs closer than `minDistance`, while a weak spring
 * pulls every node back toward where the data actually put it. The result
 * keeps the large-scale arrangement and only spreads what would collide.
 */
export function relaxOverlaps(
  points: [number, number][],
  minDistance: number,
  iterations = 220,
  anchorPull = 0.015,
): [number, number][] {
  const anchors = points.map(([x, y]) => [x, y] as [number, number]);
  const current = points.map(([x, y]) => [x, y] as [number, number]);
  const n = current.length;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = current[i]!;
        const b = current[j]!;
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        let d = Math.hypot(dx, dy);

        if (d < 1e-9) {
          // Exactly coincident: nudge along a deterministic direction so the
          // pair has something to separate along.
          const angle = (i * 2.399963) + j;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1e-9;
        }
        if (d >= minDistance) continue;

        const push = (minDistance - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a[0] -= ux * push;
        a[1] -= uy * push;
        b[0] += ux * push;
        b[1] += uy * push;
      }
    }

    for (let i = 0; i < n; i++) {
      current[i]![0] += (anchors[i]![0] - current[i]![0]) * anchorPull;
      current[i]![1] += (anchors[i]![1] - current[i]![1]) * anchorPull;
    }
  }

  return current;
}

/** A 2-D layout from arbitrary coordinates. */
export function planarLayout(
  coords: [number, number][],
  labels: string[],
  kind: LayoutKind,
  opts: PlanarLayoutOptions = {},
): Layout {
  const { width = 620, height = 620, nodeRadius = 13, padding = 70 } = opts;

  // Fit, separate anything that would collide, then fit again — relaxation can
  // push nodes past the original bounds.
  const spread = relaxOverlaps(
    fitToCanvas(coords, width, height, padding),
    nodeRadius * 3.4,
  );
  const fitted = fitToCanvas(spread, width, height, padding);
  const nodes: LayoutNode[] = fitted.map(([x, y], language) => ({
    language,
    label: labels[language] ?? String(language),
    x,
    y,
  }));

  // Reading order along the dominant axis, so anything that still wants a
  // sequence (the subgroup list, exports) has a sensible one.
  const order = [...nodes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((n) => n.language);
  const position = new Array<number>(nodes.length);
  order.forEach((language, pos) => {
    position[language] = pos;
  });

  return {
    kind,
    nodes,
    order,
    position,
    nodeRadius,
    spacing: 0,
    width,
    height,
  };
}

/**
 * Equirectangular projection of lat/long.
 *
 * Longitude is scaled by cos(mean latitude) so east-west distance is not
 * exaggerated, and latitude is negated because SVG y grows downward while
 * north is up. Good enough for a single language family, which never spans
 * enough of the globe for projection choice to matter.
 */
export function projectGeographic(
  coordinates: { lat: number; lon: number }[],
): [number, number][] {
  if (coordinates.length === 0) return [];
  const meanLat = coordinates.reduce((a, c) => a + c.lat, 0) / coordinates.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  return coordinates.map((c) => [c.lon * k, -c.lat]);
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
