/**
 * Classical multidimensional scaling, and the cohesiveness distances it runs on.
 *
 * K&F use MDS on pairwise cohesiveness themselves — to colour the nodes of
 * Figure 5-11, by running it in three dimensions and mapping the axes to RGB
 * (2018: 84 fn. 13). The same distances in two dimensions give node positions,
 * which is what a layout that is not a chain needs.
 *
 * Small enough (n rarely above ~50) that power iteration on the doubly-centred
 * matrix is the right tool; no linear algebra dependency needed.
 */

import { Glottometry } from './metrics.js';

/**
 * Pairwise cohesiveness. `k[i][j]` is how often languages i and j innovated
 * together, out of the innovations relevant to the pair.
 *
 * This is K&F's Table 5-2. Note it is defined for *every* pair, whether or not
 * the pair is an attested subgroup: cohesiveness measures shared history, and
 * does not require an exclusively shared innovation.
 */
export function cohesivenessMatrix(g: Glottometry): number[][] {
  const n = g.nLanguages;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(1));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mask = new Array<boolean>(n).fill(false);
      mask[i] = true;
      mask[j] = true;
      const { kappa } = g.stats(mask);
      matrix[i]![j] = kappa;
      matrix[j]![i] = kappa;
    }
  }
  return matrix;
}

/** Cohesiveness to distance: languages that innovate together sit together. */
export function distanceMatrix(cohesiveness: number[][]): number[][] {
  return cohesiveness.map((row) => row.map((k) => 1 - k));
}

/**
 * Classical MDS. Returns `n` points in `dimensions` dimensions.
 *
 * Doubly-centres the squared distances, then extracts the leading eigenvectors
 * by power iteration with deflation.
 */
export function classicalMds(
  distances: number[][],
  dimensions = 2,
  iterations = 256,
): number[][] {
  const n = distances.length;
  if (n === 0) return [];
  if (n <= dimensions) {
    // Not enough points to be worth decomposing; spread them out.
    return Array.from({ length: n }, (_, i) =>
      Array.from({ length: dimensions }, (_, d) => (d === 0 ? i : 0)),
    );
  }

  // B = -0.5 * J D^2 J, computed via row/column/grand means.
  const squared = distances.map((row) => row.map((d) => d * d));
  const rowMeans = squared.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const grandMean = rowMeans.reduce((a, b) => a + b, 0) / n;

  const b: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      -0.5 * (squared[i]![j]! - rowMeans[i]! - rowMeans[j]! + grandMean),
    ),
  );

  const coords: number[][] = Array.from({ length: n }, () =>
    new Array<number>(dimensions).fill(0),
  );

  // Deterministic start vector; a constant one would be orthogonal to the
  // leading eigenvector of a centred matrix, so vary it.
  for (let dim = 0; dim < dimensions; dim++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin((i + 1) * (dim + 1) * 1.7) + 0.1);
    let eigenvalue = 0;

    for (let iter = 0; iter < iterations; iter++) {
      const next = new Array<number>(n).fill(0);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) sum += b[i]![j]! * v[j]!;
        next[i] = sum;
      }
      const norm = Math.hypot(...next);
      if (norm < 1e-12) break;
      for (let i = 0; i < n; i++) next[i] = next[i]! / norm;
      eigenvalue = norm;
      v = next;
    }

    // Rayleigh quotient gives the signed eigenvalue; a negative one means this
    // dimension carries no real structure.
    let rayleigh = 0;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += b[i]![j]! * v[j]!;
      rayleigh += v[i]! * sum;
    }
    eigenvalue = rayleigh;

    const scale = eigenvalue > 0 ? Math.sqrt(eigenvalue) : 0;
    for (let i = 0; i < n; i++) coords[i]![dim] = v[i]! * scale;

    // Deflate so the next pass finds the following eigenvector.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        b[i]![j] = b[i]![j]! - eigenvalue * v[i]! * v[j]!;
      }
    }
  }

  return coords;
}
