import { describe, it, expect } from 'vitest';
import { assignTracks } from '../src/geometry/tracks.js';
import { capsuleFor, maxVerticalPadding, verticalPadding } from '../src/geometry/capsule.js';
import { runsOf, chainLayout } from '../src/core/layout.js';
import { cohesivenessColour, contourStyle } from '../src/render/styles.js';

describe('runsOf', () => {
  const position = [0, 1, 2, 3, 4, 5];

  it('returns one run for contiguous members', () => {
    expect(runsOf([1, 2, 3], position)).toEqual([[1, 3]]);
  });

  it('splits on a gap', () => {
    expect(runsOf([0, 1, 4, 5], position)).toEqual([[0, 1], [4, 5]]);
  });

  it('handles a single member', () => {
    expect(runsOf([3], position)).toEqual([[3, 3]]);
  });

  it('is insensitive to input order', () => {
    expect(runsOf([3, 1, 2], position)).toEqual([[1, 3]]);
  });

  it('respects a permuted layout', () => {
    // position[language] = position; languages 0 and 2 are adjacent here.
    const permuted = [0, 5, 1, 2, 3, 4];
    expect(runsOf([0, 2], permuted)).toEqual([[0, 1]]);
  });
});

describe('assignTracks', () => {
  it('puts disjoint subgroups on the same track', () => {
    const t = assignTracks([{ runs: [[0, 1]] }, { runs: [[3, 4]] }]);
    expect(t).toEqual([0, 0]);
  });

  it('separates nested subgroups', () => {
    const t = assignTracks([{ runs: [[0, 5]] }, { runs: [[1, 2]] }]);
    expect(t[1]).toBeLessThan(t[0]!); // smaller span goes inside
  });

  it('separates crossing subgroups', () => {
    // Partial overlap — the defining case of a linkage, and they must stay
    // visually distinguishable.
    const t = assignTracks([{ runs: [[0, 3]] }, { runs: [[2, 5]] }]);
    expect(t[0]).not.toBe(t[1]);
  });

  it('never gives overlapping intervals the same track', () => {
    const items = [
      { runs: [[0, 9]] as [number, number][] },
      { runs: [[0, 4]] as [number, number][] },
      { runs: [[3, 7]] as [number, number][] },
      { runs: [[5, 9]] as [number, number][] },
      { runs: [[1, 2]] as [number, number][] },
      { runs: [[8, 9]] as [number, number][] },
    ];
    const tracks = assignTracks(items);
    const span = (r: [number, number][]) => [
      Math.min(...r.map((x) => x[0])),
      Math.max(...r.map((x) => x[1])),
    ];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const [aLo, aHi] = span(items[i]!.runs);
        const [bLo, bHi] = span(items[j]!.runs);
        if (aLo! <= bHi! && bLo! <= aHi!) {
          expect(tracks[i], `items ${i},${j} overlap`).not.toBe(tracks[j]);
        }
      }
    }
  });

  it('treats a split subgroup as spanning the whole gap', () => {
    // The drawn contour reaches across, so it must clear what sits between.
    const t = assignTracks([{ runs: [[0, 0], [4, 4]] }, { runs: [[2, 2]] }]);
    expect(t[0]).not.toBe(t[1]);
  });

  it('is deterministic', () => {
    const items = [{ runs: [[0, 3]] as [number, number][] }, { runs: [[1, 5]] as [number, number][] }];
    expect(assignTracks(items)).toEqual(assignTracks(items));
  });

  it('handles an empty input', () => {
    expect(assignTracks([])).toEqual([]);
  });
});

/** y coordinates named by a path's M/L/A commands. */
function pathYs(d: string): number[] {
  const ys = [...d.matchAll(/[ML] -?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const arcs = [...d.matchAll(/A [\d.]+ [\d.]+ 0 0 1 -?[\d.]+ (-?[\d.]+)/g)]
    .map((m) => Number(m[1]));
  return [...ys, ...arcs];
}

describe('capsuleFor', () => {
  const base = {
    cx: 100, top: 20, spacing: 40, halfWidth: 18, verticalPadding: 18,
  };

  it('emits one path for a contiguous run', () => {
    const g = capsuleFor([[0, 2]], base);
    expect(g.paths).toHaveLength(1);
    expect(g.connectors).toHaveLength(0);
  });

  it('emits a path per run plus connectors when split', () => {
    const g = capsuleFor([[0, 1], [4, 5]], base);
    expect(g.paths).toHaveLength(2);
    expect(g.connectors).toHaveLength(1);
  });

  it('encloses its end nodes vertically', () => {
    const g = capsuleFor([[1, 2]], base);
    const ys = pathYs(g.paths[0]!);
    expect(Math.min(...ys)).toBeLessThan(base.top + 1 * base.spacing);
    expect(Math.max(...ys)).toBeGreaterThan(base.top + 2 * base.spacing);
  });

  it('keeps adjacent non-members outside', () => {
    // The containment property. Vertical padding is capped for exactly this
    // reason: the next node up the chain is only `spacing` away.
    const vPad = maxVerticalPadding(base.spacing, 10);
    const g = capsuleFor([[1, 2]], { ...base, halfWidth: 90, verticalPadding: vPad });
    const ys = pathYs(g.paths[0]!);
    expect(Math.min(...ys)).toBeGreaterThan(base.top + 0 * base.spacing);
    expect(Math.max(...ys)).toBeLessThan(base.top + 3 * base.spacing);
  });

  it('caps the corner radius independently of width', () => {
    // A wide contour must not become a stadium ballooning past its end nodes.
    const wide = capsuleFor([[0, 1]], { ...base, halfWidth: 90, maxCornerRadius: 20 });
    const radii = [...wide.paths[0]!.matchAll(/A ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...radii)).toBeLessThanOrEqual(20);
  });

  it('produces a closed path', () => {
    const g = capsuleFor([[0, 2]], base);
    expect(g.paths[0]).toMatch(/^M /);
    expect(g.paths[0]).toMatch(/Z$/);
  });
});

describe('verticalPadding', () => {
  const spacing = 46;
  const nodeRadius = 13;

  it('never exceeds what keeps a neighbour outside', () => {
    const limit = maxVerticalPadding(spacing, nodeRadius);
    for (let track = 0; track <= 12; track++) {
      expect(verticalPadding(track, 12, 8, spacing, nodeRadius)).toBeLessThanOrEqual(limit);
    }
  });

  it('still grows with the track, so nested contours separate', () => {
    const inner = verticalPadding(0, 10, 8, spacing, nodeRadius);
    const outer = verticalPadding(10, 10, 8, spacing, nodeRadius);
    expect(outer).toBeGreaterThan(inner);
  });

  it('degrades gracefully when there is no room', () => {
    const tight = verticalPadding(5, 5, 40, 20, 8);
    expect(tight).toBeGreaterThan(0);
    expect(tight).toBeLessThanOrEqual(maxVerticalPadding(20, 8));
  });
});

describe('chainLayout', () => {
  it('places nodes in seriated order down a column', () => {
    const layout = chainLayout([2, 0, 1], ['a', 'b', 'c']);
    expect(layout.nodes.map((n) => n.label)).toEqual(['c', 'a', 'b']);
    expect(new Set(layout.nodes.map((n) => n.x)).size).toBe(1);
    expect(layout.nodes[0]!.y).toBeLessThan(layout.nodes[1]!.y);
  });

  it('exposes position as the inverse of order', () => {
    const layout = chainLayout([2, 0, 1], ['a', 'b', 'c']);
    layout.order.forEach((lang, pos) => {
      expect(layout.position[lang]).toBe(pos);
    });
  });
});

describe('styles', () => {
  it('maps sigma to stroke width monotonically', () => {
    const scale = { maxSigma: 12 };
    const weak = contourStyle(1, 0.5, scale).strokeWidth;
    const strong = contourStyle(12, 0.5, scale).strokeWidth;
    expect(strong).toBeGreaterThan(weak);
  });

  it('never exceeds the configured width bounds', () => {
    const scale = { maxSigma: 10, minStrokeWidth: 1, maxStrokeWidth: 8 };
    for (const sigma of [0, 0.01, 5, 10, 999]) {
      const w = contourStyle(sigma, 0.5, scale).strokeWidth;
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(8);
    }
  });

  it('darkens with cohesiveness', () => {
    const lightnessOf = (k: number) => Number(/(\d+)%\)$/.exec(cohesivenessColour(k))![1]);
    expect(lightnessOf(0.9)).toBeLessThan(lightnessOf(0.1));
  });

  it('clamps kappa outside [0, 1]', () => {
    expect(cohesivenessColour(-5)).toBe(cohesivenessColour(0));
    expect(cohesivenessColour(5)).toBe(cohesivenessColour(1));
  });

  it('survives a degenerate scale', () => {
    expect(contourStyle(0, 0, { maxSigma: 0 }).strokeWidth).toBe(1);
  });
});
