import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { countBreaks, seriate } from '../src/core/seriation.js';

interface SeriationFixture {
  masks: boolean[][];
  weights: number[];
  nLanguages: number;
  cases: { order: number[]; breaks: number[]; cost: number }[];
  referenceBestCost: number;
  referenceBestOrder: number[];
}

const fixturePath = fileURLToPath(new URL('./fixtures/seriation.json', import.meta.url));
const fx: SeriationFixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

describe('countBreaks', () => {
  it('matches the Python reference on fixed orderings', () => {
    for (const c of fx.cases) {
      const got = fx.masks.map((m) => countBreaks(c.order, m));
      expect(got).toEqual(c.breaks);
    }
  });

  it('reports 0 for a contiguous run and 1 for a single gap', () => {
    const order = [0, 1, 2, 3, 4];
    const contiguous = [false, true, true, true, false];
    const split = [true, false, true, false, false];
    expect(countBreaks(order, contiguous)).toBe(0);
    expect(countBreaks(order, split)).toBe(1);
  });

  it('ignores gaps outside the member span', () => {
    // Leading and trailing non-members are not breaks.
    expect(countBreaks([0, 1, 2, 3], [false, true, true, false])).toBe(0);
  });

  it('counts multiple gaps', () => {
    expect(countBreaks([0, 1, 2, 3, 4], [true, false, true, false, true])).toBe(2);
  });
});

describe('seriate', () => {
  it('is deterministic for a given seed', () => {
    const a = seriate(fx.masks, fx.weights, fx.nLanguages, { seed: 7, restarts: 4 });
    const b = seriate(fx.masks, fx.weights, fx.nLanguages, { seed: 7, restarts: 4 });
    expect(a.order).toEqual(b.order);
    expect(a.cost).toBeCloseTo(b.cost, 12);
  });

  it('returns a valid permutation', () => {
    const { order } = seriate(fx.masks, fx.weights, fx.nLanguages, { seed: 1, restarts: 4 });
    expect([...order].sort((x, y) => x - y)).toEqual(
      Array.from({ length: fx.nLanguages }, (_, i) => i),
    );
  });

  it('reports a cost consistent with its own order', () => {
    const { order, cost, breaks } = seriate(fx.masks, fx.weights, fx.nLanguages, {
      seed: 3,
      restarts: 4,
    });
    const recomputed = fx.masks.reduce(
      (acc, m, i) => acc + fx.weights[i]! * countBreaks(order, m),
      0,
    );
    expect(cost).toBeCloseTo(recomputed, 9);
    expect(breaks).toEqual(fx.masks.map((m) => countBreaks(order, m)));
  });

  it('reaches at least the quality of the Python search', () => {
    // A floor, not an equality: both searches are stochastic, so asserting
    // identical output across two languages would be brittle.
    const { cost } = seriate(fx.masks, fx.weights, fx.nLanguages, {
      seed: 0,
      restarts: 20,
    });
    expect(cost).toBeLessThanOrEqual(fx.referenceBestCost + 1e-9);
  });

  it('makes almost every displayed subgroup contiguous on the demo data', () => {
    // The claim the whole rendering strategy rests on: if this regresses, the
    // capsule renderer stops covering the common case.
    const { order } = seriate(fx.masks, fx.weights, fx.nLanguages, {
      seed: 0,
      restarts: 20,
    });
    const contiguous = fx.masks.filter((m) => countBreaks(order, m) === 0).length;
    expect(contiguous / fx.masks.length).toBeGreaterThanOrEqual(0.9);
  });

  it('handles the empty case', () => {
    const r = seriate([], [], 5);
    expect(r.order).toEqual([0, 1, 2, 3, 4]);
    expect(r.cost).toBe(0);
  });
});
