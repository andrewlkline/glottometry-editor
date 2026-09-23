/**
 * Shared geometric predicates for tests.
 *
 * Containment alone does not pin down a correct contour. Under the even-odd
 * rule a self-intersecting outline can trace a region twice and cancel it, so
 * a shape that renders visibly wrong — a corridor tucked on the wrong side, or
 * collapsed to zero width — still reports every member inside and every
 * non-member outside. Simplicity is the missing property: a contour has to be
 * a polygon you could actually cut out.
 */

import type { Point } from '../src/geometry/marchingSquares.js';

const EPS = 1e-9;

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function onSegment(p: Point, a: Point, b: Point): boolean {
  if (Math.abs(cross(a, b, p)) > EPS) return false;
  return (
    p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

/** True when segments a1-a2 and b1-b2 cross, or overlap while collinear. */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);

  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
      ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }
  // Collinear overlap, which is how a zero-width corridor shows up.
  return (
    onSegment(b1, a1, a2) || onSegment(b2, a1, a2) ||
    onSegment(a1, b1, b2) || onSegment(a2, b1, b2)
  );
}

/**
 * True when no two non-adjacent edges of the closed polygon touch.
 *
 * Adjacent edges share an endpoint by construction and are skipped; so is the
 * first/last pair, which closes the ring.
 */
export function isSimplePolygon(points: Point[]): boolean {
  const n = points.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    const a1 = points[i]!;
    const a2 = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsIntersect(a1, a2, points[j]!, points[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

/** Signed area; positive means counter-clockwise in a y-up frame. */
export function signedArea(points: Point[]): number {
  let total = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    total += (points[j]![0] - points[i]![0]) * (points[j]![1] + points[i]![1]);
  }
  return total / 2;
}
