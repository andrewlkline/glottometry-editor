/**
 * Routed contours for 2-D layouts.
 *
 * The chain layout lets a subgroup be a rounded rectangle, because seriation
 * makes its members a contiguous run. In a 2-D layout that no longer holds, so
 * the contour has to wrap the members and route *around* the non-members that
 * happen to sit among them. This is the BubbleSets idea (Collins et al. 2009):
 * build a scalar field where members attract and non-members repel, then trace
 * an iso-contour through it.
 *
 * The correctness property is the same one the chain renderer has to satisfy,
 * and the same one the Marama engine's convex hulls violate: every member
 * inside, every non-member outside.
 */

import { isoContours, type Grid, type Point } from './marchingSquares.js';

export interface BlobOptions {
  /** Radius of a member's influence. Larger = fatter, smoother blobs. */
  memberRadius: number;
  /** Radius of a non-member's repulsion. */
  nonMemberRadius: number;
  /** How hard non-members push the contour away. */
  repulsion?: number;
  /**
   * Radius of a hard exclusion disk around each non-member.
   *
   * The soft repulsion shapes the contour nicely but cannot *guarantee*
   * anything: the member term is a sum, so enough nearby members outvote any
   * fixed repulsion, and a fatter blob (higher track) makes that worse. Inside
   * this radius the field is forced below the threshold, which turns
   * containment from a tuning question into a structural property.
   */
  exclusionRadius?: number;
  /** Iso-level to trace. */
  threshold?: number;
  /** World size of a grid cell. Smaller = finer contour, more work. */
  resolution?: number;
  /** Chaikin smoothing passes applied to each ring. */
  smoothing?: number;
  /**
   * Douglas-Peucker tolerance, in world units, applied after smoothing.
   *
   * Marching squares emits a vertex per grid crossing and each Chaikin pass
   * doubles that, so an unsimplified ring runs to a thousand-odd points and a
   * whole diagram to hundreds of kilobytes of near-collinear noise. That is
   * bad for file size and worse for anyone opening the result in a vector
   * editor. Set to 0 to keep every point.
   */
  simplifyTolerance?: number;
}

export const DEFAULT_BLOB: Required<
  Omit<BlobOptions, 'memberRadius' | 'nonMemberRadius' | 'exclusionRadius'>
> = {
  repulsion: 1.0,
  threshold: 0.32,
  resolution: 4,
  smoothing: 2,
  simplifyTolerance: 0.6,
};

/**
 * Compact-support falloff. Zero beyond `radius`, so the field can be evaluated
 * against nearby points only, and blobs never reach across the whole canvas.
 */
function falloff(distanceSquared: number, radius: number): number {
  const r2 = radius * radius;
  if (distanceSquared >= r2) return 0;
  const t = 1 - distanceSquared / r2;
  return t * t;
}

/**
 * Build the scalar field over a grid covering the members plus a margin.
 *
 * Only non-members within reach of the padded bounding box matter; the rest
 * cannot influence any grid point because the falloff has compact support.
 */
export function blobField(
  members: Point[],
  nonMembers: Point[],
  opts: BlobOptions,
): Grid {
  const {
    memberRadius,
    nonMemberRadius,
    repulsion = DEFAULT_BLOB.repulsion,
    resolution = DEFAULT_BLOB.resolution,
    exclusionRadius = nonMemberRadius * 0.6,
  } = opts;
  const threshold = opts.threshold ?? DEFAULT_BLOB.threshold;
  const exclusionSquared = exclusionRadius * exclusionRadius;
  // Comfortably below any threshold a caller might trace at.
  const excludedValue = Math.min(-1, threshold - 1);

  const xs = members.map((p) => p[0]);
  const ys = members.map((p) => p[1]);
  const margin = memberRadius + resolution * 2;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;

  const cols = Math.max(2, Math.ceil((maxX - minX) / resolution) + 1);
  const rows = Math.max(2, Math.ceil((maxY - minY) / resolution) + 1);
  const values = new Float64Array(rows * cols);

  const relevant = nonMembers.filter(
    (p) =>
      p[0] >= minX - nonMemberRadius && p[0] <= maxX + nonMemberRadius &&
      p[1] >= minY - nonMemberRadius && p[1] <= maxY + nonMemberRadius,
  );

  for (let r = 0; r < rows; r++) {
    const y = minY + r * resolution;
    for (let c = 0; c < cols; c++) {
      const x = minX + c * resolution;
      let v = 0;
      for (const [mx, my] of members) {
        const dx = x - mx;
        const dy = y - my;
        v += falloff(dx * dx + dy * dy, memberRadius);
      }
      let excluded = false;
      for (const [nx, ny] of relevant) {
        const dx = x - nx;
        const dy = y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 <= exclusionSquared) {
          excluded = true;
          break;
        }
        v -= repulsion * falloff(d2, nonMemberRadius);
      }
      values[r * cols + c] = excluded ? excludedValue : v;
    }
  }

  return { values, rows, cols, originX: minX, originY: minY, step: resolution };
}

/** Chaikin corner cutting on a closed ring. */
export function smoothRing(ring: Point[], passes: number): Point[] {
  let current = ring;
  for (let pass = 0; pass < passes; pass++) {
    if (current.length < 3) break;
    const next: Point[] = [];
    for (let i = 0; i < current.length; i++) {
      const a = current[i]!;
      const b = current[(i + 1) % current.length]!;
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    current = next;
  }
  return current;
}

/** Perpendicular distance from `p` to the segment `a`-`b`. */
function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-18) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker simplification of an open polyline. */
function simplifyOpen(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;

  let worst = 0;
  let worstIndex = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToSegment(points[i]!, first, last);
    if (d > worst) {
      worst = d;
      worstIndex = i;
    }
  }

  if (worst <= tolerance) return [first, last];
  const left = simplifyOpen(points.slice(0, worstIndex + 1), tolerance);
  const right = simplifyOpen(points.slice(worstIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

/**
 * Simplify a closed ring.
 *
 * Split at the two extreme points before simplifying, so the ring is treated
 * as two open polylines. Running Douglas-Peucker straight round a loop would
 * take the first and last point as its baseline, and those are adjacent.
 */
export function simplifyRing(ring: Point[], tolerance: number): Point[] {
  if (tolerance <= 0 || ring.length < 8) return ring;

  let farthest = 0;
  let maxDistance = -1;
  const start = ring[0]!;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i]![0] - start[0], ring[i]![1] - start[1]);
    if (d > maxDistance) {
      maxDistance = d;
      farthest = i;
    }
  }

  const front = simplifyOpen(ring.slice(0, farthest + 1), tolerance);
  const back = simplifyOpen([...ring.slice(farthest), start], tolerance);
  const combined = [...front.slice(0, -1), ...back.slice(0, -1)];
  return combined.length >= 3 ? combined : ring;
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

/** Closed SVG path through a ring, as a Catmull-Rom-ish smooth polyline. */
export function ringToPath(ring: Point[]): string {
  if (ring.length === 0) return '';
  const parts = [`M ${fmt(ring[0]![0])} ${fmt(ring[0]![1])}`];
  for (let i = 1; i < ring.length; i++) {
    parts.push(`L ${fmt(ring[i]![0])} ${fmt(ring[i]![1])}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

export interface BlobResult {
  /** One path per connected region of the contour. */
  paths: string[];
  rings: Point[][];
}

/** Contour enclosing `members` while excluding `nonMembers`. */
export function blobFor(
  members: Point[],
  nonMembers: Point[],
  opts: BlobOptions,
): BlobResult {
  if (members.length === 0) return { paths: [], rings: [] };

  const threshold = opts.threshold ?? DEFAULT_BLOB.threshold;
  const smoothing = opts.smoothing ?? DEFAULT_BLOB.smoothing;
  const tolerance = opts.simplifyTolerance ?? DEFAULT_BLOB.simplifyTolerance;

  const grid = blobField(members, nonMembers, opts);
  const rings = isoContours(grid, threshold)
    .map((r) => simplifyRing(smoothRing(r, smoothing), tolerance));

  return { paths: rings.map(ringToPath), rings };
}

/** Even-odd point-in-polygon, for verifying containment. */
export function pointInRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const straddles = yi > point[1] !== yj > point[1];
    if (straddles && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * True when `point` falls inside the blob.
 *
 * Even-odd across *all* rings, not "inside any ring". Members arranged around
 * a non-member produce a genuine hole: an outer ring and an inner one. A point
 * in that hole is inside two rings and therefore outside the region — which is
 * exactly the containment the contour is supposed to express. This matches
 * SVG's `fill-rule: evenodd`.
 */
export function pointInBlob(point: Point, rings: Point[][]): boolean {
  let crossings = 0;
  for (const ring of rings) if (pointInRing(point, ring)) crossings++;
  return crossings % 2 === 1;
}
