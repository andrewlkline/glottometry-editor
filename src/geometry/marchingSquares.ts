/**
 * Marching squares: extract iso-contours from a scalar field.
 *
 * Used to draw a contour around an arbitrary set of nodes in a 2-D layout,
 * where the chain layout's rounded rectangles no longer apply. The field is
 * built in `blob.ts`; this module only turns a grid of values into rings.
 *
 * Rings come back as closed polylines in world coordinates. A subgroup whose
 * members fall into spatially separate clusters yields several rings, which is
 * correct — one shape spanning the gap would enclose non-members.
 */

export interface Grid {
  /** values[row * cols + col] */
  values: Float64Array;
  rows: number;
  cols: number;
  /** World position of grid cell (0, 0). */
  originX: number;
  originY: number;
  /** World distance between adjacent grid points. */
  step: number;
}

export type Point = [number, number];

/**
 * Case table: for each of the 16 corner configurations, which edge pairs to
 * connect. Edges are indexed 0=top, 1=right, 2=bottom, 3=left.
 *
 * Corner bits, high to low: top-left(8), top-right(4), bottom-right(2),
 * bottom-left(1). A bit is set when that corner is inside (value >= threshold).
 */
const CASES: number[][][] = [
  [],                       // 0000
  [[2, 3]],                 // 0001
  [[1, 2]],                 // 0010
  [[1, 3]],                 // 0011
  [[0, 1]],                 // 0100
  [[0, 3], [1, 2]],         // 0101 — ambiguous, resolved below
  [[0, 2]],                 // 0110
  [[0, 3]],                 // 0111
  [[0, 3]],                 // 1000
  [[0, 2]],                 // 1001
  [[0, 1], [2, 3]],         // 1010 — ambiguous, resolved below
  [[0, 1]],                 // 1011
  [[1, 3]],                 // 1100
  [[1, 2]],                 // 1101
  [[2, 3]],                 // 1110
  [],                       // 1111
];

/** Linear interpolation of the crossing point along an edge. */
function lerp(a: number, b: number, t: number): number {
  const d = b - a;
  return Math.abs(d) < 1e-12 ? 0.5 : (t - a) / d;
}

export function isoContours(grid: Grid, threshold: number): Point[][] {
  const { values, rows, cols, originX, originY, step } = grid;
  const at = (r: number, c: number) => values[r * cols + c]!;

  const segments: [Point, Point][] = [];

  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const tl = at(r, c);
      const tr = at(r, c + 1);
      const br = at(r + 1, c + 1);
      const bl = at(r + 1, c);

      let code = 0;
      if (tl >= threshold) code |= 8;
      if (tr >= threshold) code |= 4;
      if (br >= threshold) code |= 2;
      if (bl >= threshold) code |= 1;

      let pairs = CASES[code]!;
      if (pairs.length === 0) continue;

      // Saddle cases: the two diagonal corners may be joined or separated.
      // Decide with the cell centre, which is what avoids contours crossing.
      if (code === 5 || code === 10) {
        const centre = (tl + tr + br + bl) / 4;
        const centreInside = centre >= threshold;
        if (code === 5) pairs = centreInside ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
        else pairs = centreInside ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]];
      }

      const x0 = originX + c * step;
      const y0 = originY + r * step;

      const edgePoint = (edge: number): Point => {
        switch (edge) {
          case 0: return [x0 + step * lerp(tl, tr, threshold), y0];
          case 1: return [x0 + step, y0 + step * lerp(tr, br, threshold)];
          case 2: return [x0 + step * lerp(bl, br, threshold), y0 + step];
          default: return [x0, y0 + step * lerp(tl, bl, threshold)];
        }
      };

      for (const [a, b] of pairs) {
        segments.push([edgePoint(a!), edgePoint(b!)]);
      }
    }
  }

  return stitch(segments, grid.step);
}

/**
 * Join loose segments into closed rings by matching endpoints.
 *
 * Marching squares emits each segment independently, so coordinates that
 * should be identical are only equal up to floating point. Points are snapped
 * onto a grid far finer than a cell before matching.
 */
function stitch(segments: [Point, Point][], step: number): Point[][] {
  const quantum = step * 1e-6;
  const key = (p: Point) =>
    `${Math.round(p[0] / quantum)},${Math.round(p[1] / quantum)}`;

  const adjacency = new Map<string, { point: Point; links: string[] }>();
  const add = (p: Point, q: Point) => {
    const kp = key(p);
    const entry = adjacency.get(kp) ?? { point: p, links: [] };
    entry.links.push(key(q));
    adjacency.set(kp, entry);
  };
  for (const [a, b] of segments) {
    add(a, b);
    add(b, a);
  }

  const visited = new Set<string>();
  const rings: Point[][] = [];

  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;

    const ring: Point[] = [];
    let current = start;
    let previous: string | null = null;

    while (true) {
      const node = adjacency.get(current);
      if (!node || visited.has(current)) break;
      visited.add(current);
      ring.push(node.point);

      const next = node.links.find((l) => l !== previous && !visited.has(l));
      if (next === undefined) break;
      previous = current;
      current = next;
    }

    // Two points cannot bound a region.
    if (ring.length >= 3) rings.push(ring);
  }

  return rings;
}
