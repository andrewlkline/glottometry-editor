/**
 * Invariants that follow from the method itself rather than from either
 * implementation, so they catch errors both could share.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Glottometry, maskOf } from '../src/core/metrics.js';
import type { Cell, Dataset, NaPolicy } from '../src/core/types.js';

const fixturePath = fileURLToPath(new URL('./fixtures/metrics.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const dataset: Dataset = {
  languages: fixture.languages,
  innovations: fixture.innovations,
  matrix: fixture.matrix as Cell[][],
};

const policies: NaPolicy[] = ['half', 'zero', 'one', 'rowMean', 'colMean'];

describe('invariants on real data', () => {
  for (const policy of policies) {
    it(`kappa stays in [0, 1] and sigma <= epsilon (${policy})`, () => {
      for (const s of new Glottometry(dataset, policy).subgroups()) {
        expect(s.kappa).toBeGreaterThanOrEqual(0);
        expect(s.kappa).toBeLessThanOrEqual(1 + 1e-12);
        expect(s.sigma).toBeLessThanOrEqual(s.epsilon + 1e-12);
        expect(s.epsilon).toBeGreaterThan(0);
      }
    });
  }

  it('is sorted by descending sigma', () => {
    const subs = new Glottometry(dataset, 'half').subgroups();
    for (let i = 0; i + 1 < subs.length; i++) {
      expect(subs[i]!.sigma).toBeGreaterThanOrEqual(subs[i + 1]!.sigma);
    }
  });

  it('honours minSigma', () => {
    const subs = new Glottometry(dataset, 'half').subgroups({ minSigma: 1 });
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) expect(s.sigma).toBeGreaterThanOrEqual(1);
  });
});

/**
 * A perfectly tree-like dataset: nested clades, nothing cross-cutting.
 *
 * K&F (2018: 69) define the ideal tree as the case where every subgroup has
 * cohesiveness 100%. If this fails, the conflict rule `q` is wrong.
 */
function perfectTree(): { dataset: Dataset; clades: number[][] } {
  const clades = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 1, 2, 3], [4, 5, 6, 7],
    [0, 1, 2, 3, 4, 5, 6, 7],
  ];
  const languages = Array.from({ length: 8 }, (_, i) => `L${i}`);
  const innovations: string[] = [];
  const matrix: Cell[][] = [];

  clades.forEach((clade, ci) => {
    for (let k = 0; k < 3; k++) {
      innovations.push(`clade${ci}-innovation${k}`);
      matrix.push(languages.map((_, i) => (clade.includes(i) ? 1 : 0)) as Cell[]);
    }
  });

  return { dataset: { languages, innovations, matrix }, clades };
}

describe('a perfectly tree-like dataset', () => {
  const { dataset: tree, clades } = perfectTree();

  it('gives every clade cohesiveness 1', () => {
    const g = new Glottometry(tree, 'half');
    for (const clade of clades) {
      const s = g.stats(maskOf(clade, tree.languages.length));
      expect(s.q).toBeCloseTo(0, 12);
      expect(s.kappa).toBeCloseTo(1, 12);
    }
  });

  it('recovers exactly the clades, minus the root', () => {
    // The tree's root clade is the whole family, which is deliberately not
    // reported as a subgroup of itself.
    const properClades = clades.filter((c) => c.length < tree.languages.length);
    expect(properClades.length).toBe(clades.length - 1);

    const found = new Glottometry(tree, 'half')
      .subgroups()
      .map((s) => s.members.join(','))
      .sort();
    expect(found).toEqual(properClades.map((c) => c.join(',')).sort());
  });

  it('never reports the whole family as a subgroup', () => {
    const g = new Glottometry(tree, 'half');
    expect(g.subgroups().some((s) => s.members.length === tree.languages.length))
      .toBe(false);
    expect(g.candidates().some((m) => m.every(Boolean))).toBe(false);
  });

  it('gives each clade epsilon equal to its own innovation count', () => {
    const g = new Glottometry(tree, 'half');
    for (const clade of clades) {
      expect(g.stats(maskOf(clade, tree.languages.length)).epsilon).toBeCloseTo(3, 12);
    }
  });
});

describe('a cross-cutting dataset', () => {
  // K&F's Figure 5-7: 12 innovations for AB, 4 for AC, 2 for BC.
  const languages = ['A', 'B', 'C'];
  const innovations: string[] = [];
  const matrix: Cell[][] = [];
  const add = (n: number, row: Cell[], tag: string) => {
    for (let i = 0; i < n; i++) {
      innovations.push(`${tag}${i}`);
      matrix.push([...row]);
    }
  };
  add(12, [1, 1, 0], 'AB');
  add(4, [1, 0, 1], 'AC');
  add(2, [0, 1, 1], 'BC');
  const ds: Dataset = { languages, innovations, matrix };

  it('reproduces the worked example from the paper', () => {
    const g = new Glottometry(ds, 'half');
    // k_AB = 12 / (12 + 4 + 2) = 2/3; sigma_AB = 12 * 2/3 = 8
    const ab = g.stats(maskOf([0, 1], 3));
    expect(ab.kappa).toBeCloseTo(2 / 3, 12);
    expect(ab.sigma).toBeCloseTo(8, 12);
  });
});
