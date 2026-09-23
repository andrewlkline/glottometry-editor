/**
 * Contour geometry for the chain layout.
 *
 * A subgroup occupying a contiguous run of positions becomes a rounded
 * rectangle enclosing exactly its members. Seriation makes that the common
 * case — 28 of 31 displayed subgroups on the demo data — and it is what K&F
 * drew by hand.
 *
 * A subgroup split across the ordering gets a single *routed* outline. The
 * members sit on one vertical line, so a corridor that connects two runs has
 * to pass to one side of the non-members in between, leaving them outside.
 * The result is one non-convex shape saying "this is one isogloss", rather
 * than two shapes and a dashed line hinting at it.
 *
 * Horizontal and vertical padding are deliberately independent. Horizontal
 * offset is where nesting room comes from and can grow freely. Vertical
 * padding cannot: the next node up the chain is only `spacing` away, so a
 * contour that padded vertically as much as it does horizontally would
 * enclose languages that are not its members. See `verticalPadding`.
 */

import type { Point } from './marchingSquares.js';

export interface CapsuleGeometry {
  /** SVG path data. One entry; split subgroups are a single routed outline. */
  paths: string[];
  /**
   * The un-rounded outline polygon behind each path.
   *
   * Exposed so containment can be verified by point-in-polygon rather than by
   * bounding boxes, which cannot see the gap in a routed shape.
   */
  outlines: Point[][];
  /** Half the width of the shape, i.e. how far it sits from the node column. */
  halfWidth: number;
}

export interface CapsuleOptions {
  /** Column x of the node centres. */
  cx: number;
  /** y of position 0. */
  top: number;
  /** Vertical distance between adjacent positions. */
  spacing: number;
  /** Distance from the node column to this contour's edge. */
  halfWidth: number;
  /** Distance above the first member and below the last. */
  verticalPadding: number;
  /**
   * Ceiling on the corner radius. Without it a wide contour becomes a stadium
   * whose caps balloon far past the end nodes; K&F's figure uses a consistent,
   * modest radius.
   */
  maxCornerRadius?: number;
  /**
   * Width of the corridor that carries a split contour past the non-members
   * between its runs. Straddles the contour's own edge, so it reaches only
   * half this far beyond the nominal width and barely disturbs outer tracks.
   */
  corridorWidth?: number;
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

/**
 * The largest vertical padding that still keeps non-member nodes outside.
 *
 * The nearest non-member sits `spacing` below the last member (or above the
 * first). Its circle must stay clear of the contour edge, so the padding has
 * to stop short of `spacing - nodeRadius`.
 */
export function maxVerticalPadding(spacing: number, nodeRadius: number, gap = 3): number {
  return Math.max(1, spacing - nodeRadius - gap);
}

/**
 * Vertical padding for a track, compressed to fit the room available.
 *
 * Contours still nest vertically — otherwise two shapes over the same span
 * would have collinear top edges — but the growth per track is scaled so the
 * outermost track lands exactly on the limit rather than sailing past it.
 */
export function verticalPadding(
  track: number,
  maxTrack: number,
  basePadding: number,
  spacing: number,
  nodeRadius: number,
): number {
  const base = nodeRadius + basePadding;
  const limit = maxVerticalPadding(spacing, nodeRadius);
  if (maxTrack <= 0 || limit <= base) return Math.min(base, limit);
  const perTrack = (limit - base) / maxTrack;
  return base + track * perTrack;
}

/**
 * SVG path through a polygon with rounded corners.
 *
 * Each corner's radius is clamped to half the shorter adjacent edge, so a
 * short edge — the step in and out of a corridor — degrades to a sharp corner
 * instead of producing a self-intersecting arc.
 */
export function roundedPolygon(points: Point[], radius: number): string {
  const n = points.length;
  if (n < 3) return '';

  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;

    const toPrev = [prev[0] - curr[0], prev[1] - curr[1]];
    const toNext = [next[0] - curr[0], next[1] - curr[1]];
    const lenPrev = Math.hypot(toPrev[0]!, toPrev[1]!);
    const lenNext = Math.hypot(toNext[0]!, toNext[1]!);
    if (lenPrev < 1e-9 || lenNext < 1e-9) continue;

    const r = Math.min(radius, lenPrev / 2, lenNext / 2);
    const start: Point = [
      curr[0] + (toPrev[0]! / lenPrev) * r,
      curr[1] + (toPrev[1]! / lenPrev) * r,
    ];
    const end: Point = [
      curr[0] + (toNext[0]! / lenNext) * r,
      curr[1] + (toNext[1]! / lenNext) * r,
    ];

    parts.push(
      i === 0 ? `M ${fmt(start[0])} ${fmt(start[1])}` : `L ${fmt(start[0])} ${fmt(start[1])}`,
    );
    if (r > 1e-9) {
      // Sweep direction follows the polygon's winding; these outlines are
      // built clockwise in SVG's y-down space.
      const cross = toPrev[0]! * toNext[1]! - toPrev[1]! * toNext[0]!;
      const sweep = cross > 0 ? 0 : 1;
      parts.push(`A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(end[0])} ${fmt(end[1])}`);
    }
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Outline for one or more runs along the column.
 *
 * Single run: a plain rectangle. Several: down the right-hand side through
 * corridors, then back up the left, tucking inside each corridor on the way so
 * the non-members between runs finish outside the shape.
 */
export function chainOutline(
  runs: [number, number][],
  yOf: (position: number) => number,
  cx: number,
  halfWidth: number,
  vPad: number,
  corridorWidth: number,
): Point[] {
  const sorted = [...runs].sort((a, b) => a[0] - b[0]);
  const bounds = sorted.map(([a, b]) => ({ top: yOf(a) - vPad, bottom: yOf(b) + vPad }));

  const left = cx - halfWidth;
  const right = cx + halfWidth;

  if (bounds.length === 1) {
    const { top, bottom } = bounds[0]!;
    return [[left, top], [right, top], [right, bottom], [left, bottom]];
  }

  const half = corridorWidth / 2;
  const outer = right + half;
  const inner = right - half;

  const points: Point[] = [];

  // Down the right-hand side, detouring outward between runs.
  points.push([left, bounds[0]!.top]);
  points.push([right, bounds[0]!.top]);
  for (let i = 0; i < bounds.length; i++) {
    points.push([right, bounds[i]!.bottom]);
    if (i + 1 < bounds.length) {
      points.push([outer, bounds[i]!.bottom]);
      points.push([outer, bounds[i + 1]!.top]);
      points.push([right, bounds[i + 1]!.top]);
    }
  }

  // Back up the left-hand side, tucking into each corridor's inner edge so the
  // column between runs is not enclosed.
  const last = bounds.length - 1;
  points.push([left, bounds[last]!.bottom]);
  for (let i = last; i > 0; i--) {
    points.push([left, bounds[i]!.top]);
    points.push([inner, bounds[i]!.top]);
    points.push([inner, bounds[i - 1]!.bottom]);
    points.push([left, bounds[i - 1]!.bottom]);
  }

  return points;
}

export function capsuleFor(
  runs: [number, number][],
  opts: CapsuleOptions,
): CapsuleGeometry {
  const {
    cx, top, spacing, halfWidth, verticalPadding: vPad,
    maxCornerRadius = halfWidth,
    corridorWidth = 8,
  } = opts;

  const yOf = (pos: number) => top + pos * spacing;
  const outline = chainOutline(runs, yOf, cx, halfWidth, vPad, corridorWidth);
  const radius = Math.min(halfWidth, maxCornerRadius);

  return {
    paths: [roundedPolygon(outline, radius)],
    outlines: [outline],
    halfWidth,
  };
}
