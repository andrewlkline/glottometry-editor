/**
 * 2-D layouts and routed contours.
 *
 * The property that matters is the same one the chain renderer has to satisfy
 * and the Marama engine's convex hulls violate: every member inside the
 * contour, every non-member outside. In 2-D it is genuinely non-trivial —
 * non-members sit *among* members — so it is checked exhaustively on the real
 * dataset in both 2-D layouts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Glottometry } from '../src/core/metrics.js';
import { classicalMds, cohesivenessMatrix, distanceMatrix } from '../src/core/mds.js';
import {
  fitToCanvas, planarLayout, projectGeographic, relaxOverlaps,
} from '../src/core/layout.js';
import {
  blobFor, pointInBlob, pointInRing, simplifyRing, smoothRing,
} from '../src/geometry/blob.js';
import { isoContours, type Point } from '../src/geometry/marchingSquares.js';
import { assignTracksByOverlap } from '../src/geometry/tracks.js';
import { parseCoordinatesCsv, parseMaramaCsv } from '../src/data/maramaCsv.js';
import { buildScene } from '../src/render/scene.js';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf-8');

const dataset = parseMaramaCsv(read('../prototype/data/innov.csv'));
const coords = parseCoordinatesCsv(read('../prototype/data/coords.csv'));
const g = new Glottometry(dataset, 'half');
const subgroups = g.subgroups();
const shown = subgroups.filter((s) => s.sigma >= 1);

describe('classical MDS', () => {
  it('recovers a known configuration up to rotation', () => {
    const truth: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];
    const d = truth.map((a) => truth.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
    const rec = classicalMds(d, 2);
    for (let i = 0; i < truth.length; i++) {
      for (let j = i + 1; j < truth.length; j++) {
        const expected = Math.hypot(truth[i]![0] - truth[j]![0], truth[i]![1] - truth[j]![1]);
        const got = Math.hypot(rec[i]![0]! - rec[j]![0]!, rec[i]![1]! - rec[j]![1]!);
        expect(got).toBeCloseTo(expected, 6);
      }
    }
  });

  it('is deterministic', () => {
    const d = distanceMatrix(cohesivenessMatrix(g));
    expect(classicalMds(d, 2)).toEqual(classicalMds(d, 2));
  });

  it('handles degenerate inputs', () => {
    expect(classicalMds([], 2)).toEqual([]);
    expect(classicalMds([[0]], 2)).toHaveLength(1);
  });
});

describe('cohesiveness matrix', () => {
  const matrix = cohesivenessMatrix(g);

  it('is symmetric with a unit diagonal', () => {
    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i]![i]).toBe(1);
      for (let j = 0; j < matrix.length; j++) {
        expect(matrix[i]![j]).toBeCloseTo(matrix[j]![i]!, 12);
      }
    }
  });

  it('stays within [0, 1]', () => {
    for (const row of matrix) {
      for (const k of row) {
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is defined for pairs that are not attested subgroups', () => {
    // Cohesiveness measures shared history and does not require an
    // exclusively shared innovation, unlike subgroupiness.
    const attested = new Set(shown.map((s) => s.members.join(',')));
    const pairs = [];
    for (let i = 0; i < matrix.length; i++) {
      for (let j = i + 1; j < matrix.length; j++) {
        if (!attested.has(`${i},${j}`)) pairs.push(matrix[i]![j]!);
      }
    }
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((k) => k > 0)).toBe(true);
  });
});

describe('relaxOverlaps', () => {
  it('separates coincident points', () => {
    const out = relaxOverlaps([[0, 0], [0, 0], [0, 0]], 10);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const d = Math.hypot(out[i]![0] - out[j]![0], out[i]![1] - out[j]![1]);
        expect(d).toBeGreaterThan(1);
      }
    }
  });

  it('leaves well-separated points essentially alone', () => {
    const input: [number, number][] = [[0, 0], [100, 0], [0, 100]];
    const out = relaxOverlaps(input, 10);
    out.forEach((p, i) => {
      expect(Math.hypot(p[0] - input[i]![0], p[1] - input[i]![1])).toBeLessThan(1);
    });
  });

  it('preserves the broad arrangement', () => {
    // A relaxation that scrambled the structure would defeat the point.
    const input: [number, number][] = [[0, 0], [5, 0], [200, 0], [205, 0]];
    const out = relaxOverlaps(input, 30);
    expect(out[0]![0]).toBeLessThan(out[2]![0]);
    expect(out[1]![0]).toBeLessThan(out[2]![0]);
  });
});

describe('fitToCanvas', () => {
  it('preserves aspect ratio', () => {
    // A wide, flat configuration must not be stretched vertically to fill.
    const out = fitToCanvas([[0, 0], [100, 0], [0, 10]], 400, 400, 20);
    const width = Math.abs(out[1]![0] - out[0]![0]);
    const height = Math.abs(out[2]![1] - out[0]![1]);
    expect(width / height).toBeCloseTo(10, 1);
  });

  it('stays within bounds', () => {
    const out = fitToCanvas([[0, 0], [1, 5], [3, 2]], 300, 200, 25);
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(300);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200);
    }
  });

  it('survives a single point', () => {
    expect(fitToCanvas([[5, 5]], 100, 100, 10)).toHaveLength(1);
  });
});

describe('projectGeographic', () => {
  it('puts north at the top', () => {
    const out = projectGeographic([{ lat: 10, lon: 0 }, { lat: -10, lon: 0 }]);
    expect(out[0]![1]).toBeLessThan(out[1]![1]); // SVG y grows downward
  });

  it('compresses longitude away from the equator', () => {
    const equator = projectGeographic([{ lat: 0, lon: 0 }, { lat: 0, lon: 10 }]);
    const high = projectGeographic([{ lat: 60, lon: 0 }, { lat: 60, lon: 10 }]);
    expect(Math.abs(high[1]![0] - high[0]![0]))
      .toBeLessThan(Math.abs(equator[1]![0] - equator[0]![0]));
  });
});

describe('marching squares', () => {
  it('finds a ring around a single positive blob', () => {
    const cols = 21;
    const rows = 21;
    const values = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        values[r * cols + c] = 1 - Math.hypot(r - 10, c - 10) / 6;
      }
    }
    const rings = isoContours({ values, rows, cols, originX: 0, originY: 0, step: 1 }, 0.5);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.length).toBeGreaterThan(8);
    expect(pointInRing([10, 10], rings[0]!)).toBe(true);
    expect(pointInRing([0, 0], rings[0]!)).toBe(false);
  });

  it('finds nothing when the field is everywhere below threshold', () => {
    const values = new Float64Array(9);
    expect(isoContours({ values, rows: 3, cols: 3, originX: 0, originY: 0, step: 1 }, 0.5))
      .toEqual([]);
  });
});

describe('smoothRing', () => {
  it('keeps the ring closed and roughly in place', () => {
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const out = smoothRing(square, 2);
    expect(out.length).toBeGreaterThan(square.length);
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(11);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(11);
    }
  });
});

describe('simplifyRing', () => {
  it('drops near-collinear points', () => {
    const line: Point[] = Array.from({ length: 40 }, (_, i) => [i, i * 0.001]);
    const out = simplifyRing([...line, [39, 10], [0, 10]], 0.5);
    expect(out.length).toBeLessThan(10);
  });

  it('keeps real corners', () => {
    const square: Point[] = [];
    for (let i = 0; i < 10; i++) square.push([i * 10, 0]);
    for (let i = 0; i < 10; i++) square.push([90, i * 10]);
    for (let i = 0; i < 10; i++) square.push([90 - i * 10, 90]);
    for (let i = 0; i < 10; i++) square.push([0, 90 - i * 10]);
    const out = simplifyRing(square, 0.5);
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out.length).toBeLessThan(square.length);
  });

  it('leaves short rings alone', () => {
    const tri: Point[] = [[0, 0], [10, 0], [5, 9]];
    expect(simplifyRing(tri, 0.5)).toEqual(tri);
  });

  it('is a no-op at zero tolerance', () => {
    const ring: Point[] = Array.from({ length: 20 }, (_, i) => [
      Math.cos((i / 20) * Math.PI * 2) * 10,
      Math.sin((i / 20) * Math.PI * 2) * 10,
    ]);
    expect(simplifyRing(ring, 0)).toEqual(ring);
  });

  it('preserves enclosed area to within the tolerance', () => {
    // Simplification must not shrink a contour enough to drop a member.
    const circle: Point[] = Array.from({ length: 200 }, (_, i) => [
      Math.cos((i / 200) * Math.PI * 2) * 50,
      Math.sin((i / 200) * Math.PI * 2) * 50,
    ]);
    const out = simplifyRing(circle, 0.6);
    expect(out.length).toBeLessThan(circle.length / 2);
    for (const p of [[0, 0], [30, 0], [0, -30]] as Point[]) {
      expect(pointInRing(p, out)).toBe(true);
    }
  });
});

describe('blobFor', () => {
  const opts = { memberRadius: 52, nonMemberRadius: 38 };

  const cases: { name: string; members: Point[]; nonMembers: Point[] }[] = [
    { name: 'adjacent pair', members: [[100, 100], [100, 160]], nonMembers: [[100, 240]] },
    { name: 'L-shaped triple', members: [[100, 100], [100, 160], [160, 160]], nonMembers: [[160, 100]] },
    { name: 'non-member between members', members: [[60, 100], [220, 100]], nonMembers: [[140, 100]] },
    { name: 'members encircling a non-member', members: [[100, 60], [160, 100], [100, 140], [60, 100]], nonMembers: [[100, 100]] },
    { name: 'interleaved diagonals', members: [[80, 80], [160, 160]], nonMembers: [[160, 80], [80, 160]] },
    { name: 'single member', members: [[100, 100]], nonMembers: [[100, 150]] },
  ];

  for (const { name, members, nonMembers } of cases) {
    it(`contains members and excludes non-members: ${name}`, () => {
      const { rings } = blobFor(members, nonMembers, opts);
      for (const m of members) expect(pointInBlob(m, rings), `member ${m}`).toBe(true);
      for (const n of nonMembers) expect(pointInBlob(n, rings), `non-member ${n}`).toBe(false);
    });
  }

  it('splits into separate regions when a non-member divides the members', () => {
    const { rings } = blobFor([[60, 100], [220, 100]], [[140, 100]], opts);
    expect(rings.length).toBeGreaterThan(1);
  });

  it('produces a hole rather than swallowing an encircled non-member', () => {
    const { rings } = blobFor(
      [[100, 60], [160, 100], [100, 140], [60, 100]], [[100, 100]], opts,
    );
    // Inside two rings — outer boundary and the hole — hence outside the shape.
    expect(rings.filter((r) => pointInRing([100, 100], r))).toHaveLength(2);
  });

  it('returns nothing for no members', () => {
    expect(blobFor([], [[0, 0]], opts).paths).toEqual([]);
  });
});

describe('assignTracksByOverlap', () => {
  it('shares a track between disjoint sets', () => {
    expect(assignTracksByOverlap([[0, 1], [2, 3]])).toEqual([0, 0]);
  });

  it('separates intersecting sets', () => {
    const t = assignTracksByOverlap([[0, 1, 2], [1, 5]]);
    expect(t[0]).not.toBe(t[1]);
  });

  it('puts smaller sets on inner tracks', () => {
    const t = assignTracksByOverlap([[0, 1, 2, 3], [0, 1]]);
    expect(t[1]).toBeLessThan(t[0]!);
  });
});

describe.each([
  ['mds', () => classicalMds(distanceMatrix(cohesivenessMatrix(g)), 2)
    .map((c) => [c[0]!, c[1]!] as [number, number])],
  ['geographic', () => projectGeographic(dataset.languages.map((l) => coords[l]!))],
] as const)('%s scene on the demo dataset', (kind, makeCoords) => {
  const layout = planarLayout(makeCoords(), dataset.languages, kind);
  const scene = buildScene(layout, shown);

  it('builds a contour per displayed subgroup', () => {
    expect(scene.contours).toHaveLength(shown.length);
  });

  it('places every node inside the canvas', () => {
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(layout.width);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(layout.height);
    }
  });

  it('leaves no two nodes overlapping', () => {
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i]!;
        const b = layout.nodes[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(layout.nodeRadius * 2);
      }
    }
  });

  it('contains every member and excludes every non-member', () => {
    // Checked against the rings the scene actually produced, not a
    // reconstruction: re-deriving the geometry here would let the test go on
    // passing after the renderer's parameters change, which is how the
    // sparse-layout bug survived a green suite.
    for (const contour of scene.contours) {
      const rings = contour.rings!;
      expect(rings, `${contour.key} has no rings`).toBeDefined();
      const memberSet = new Set(contour.subgroup.members);

      for (const node of layout.nodes) {
        const inside = pointInBlob([node.x, node.y], rings);
        expect(
          inside,
          `${node.label} in ${contour.subgroup.memberNames.join('+')}`,
        ).toBe(memberSet.has(node.language));
      }
    }
  });
});

describe('a sparse layout', () => {
  /**
   * Five languages spread over the same canvas eighteen would occupy sit
   * three to four times further apart, and a contour radius tuned for the
   * dense case cannot bridge the gap: every subgroup came apart into one blob
   * per member. Coordinates here are the eastern Timor set that surfaced it.
   */
  const languages = ['Kairui-Midiki', 'Waima’a', 'Naueti', 'Habun', 'Tetun'];
  const coordinates = [
    { lat: -8.683515, lon: 126.332798 },
    { lat: -8.500603, lon: 126.36677 },
    { lat: -8.750454, lon: 126.695896 },
    { lat: -8.67963, lon: 125.990486 },
    { lat: -8.922276, lon: 126.275939 },
  ];
  const layout = planarLayout(projectGeographic(coordinates), languages, 'geographic');

  const subgroup = (members: number[], sigma: number) => ({
    members,
    memberNames: members.map((m) => languages[m]!),
    epsilon: sigma, kappa: 1, sigma, p: sigma, q: 0,
    fisher: { a: 0, b: 0, c: 0, d: 0, pValue: 1, strength: 0 },
    significance: 0,
  });

  // The three subgroups that dataset actually yields above the default cutoff.
  const scene = buildScene(layout, [
    subgroup([0, 1, 2], 8),
    subgroup([3, 4], 2.86),
    subgroup([0, 1, 2, 3], 2.15),
  ]);

  it('spreads the nodes much further apart than a dense layout', () => {
    // If this stops holding the test no longer exercises the sparse case.
    const gaps = layout.nodes.map((a) => Math.min(
      ...layout.nodes.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
    ));
    expect(Math.min(...gaps)).toBeGreaterThan(100);
  });

  it('draws each subgroup as one connected shape', () => {
    for (const contour of scene.contours) {
      expect(
        contour.rings!.length,
        `${contour.subgroup.memberNames.join('+')} came apart`,
      ).toBe(1);
    }
    expect(scene.routedCount).toBe(0);
  });

  it('still contains members and excludes non-members', () => {
    // The radius grew to bridge the gap; containment must not have been the
    // price of that.
    for (const contour of scene.contours) {
      const memberSet = new Set(contour.subgroup.members);
      for (const node of layout.nodes) {
        expect(
          pointInBlob([node.x, node.y], contour.rings!),
          `${node.label} in ${contour.subgroup.memberNames.join('+')}`,
        ).toBe(memberSet.has(node.language));
      }
    }
  });
});
