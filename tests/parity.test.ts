/**
 * Parity against the Python reference implementation.
 *
 * This is the spine of the test suite: two independent implementations of the
 * same formulas must agree. Fixtures come from prototype/glottometry.py via
 * `npm run fixtures`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Glottometry, maskOf } from '../src/core/metrics.js';
import type { Cell, Dataset, NaPolicy } from '../src/core/types.js';

interface FixtureSubgroup {
  members: number[];
  epsilon: number;
  kappa: number;
  sigma: number;
  p: number;
  q: number;
}

interface MetricsFixture {
  languages: string[];
  innovations: string[];
  matrix: (number | null)[][];
  byPolicy: Record<string, FixtureSubgroup[]>;
}

const fixturePath = fileURLToPath(new URL('./fixtures/metrics.json', import.meta.url));
const fixture: MetricsFixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

const dataset: Dataset = {
  languages: fixture.languages,
  innovations: fixture.innovations,
  matrix: fixture.matrix as Cell[][],
};

const TOLERANCE = 1e-9;
const policies = Object.keys(fixture.byPolicy) as NaPolicy[];

describe('metrics parity with the Python reference', () => {
  it('loads a fixture that looks like the demo dataset', () => {
    expect(fixture.languages.length).toBe(18);
    expect(fixture.matrix.length).toBe(473);
    expect(policies.length).toBeGreaterThan(0);
  });

  for (const policy of policies) {
    describe(`NA policy: ${policy}`, () => {
      const expected = fixture.byPolicy[policy]!;
      const actual = new Glottometry(dataset, policy).subgroups();

      it('finds the same number of attested subgroups', () => {
        expect(actual.length).toBe(expected.length);
      });

      it('agrees on every subgroup membership and score', () => {
        // Compare as a map so ties in sigma cannot cause spurious failures.
        const key = (m: number[]) => m.join(',');
        const actualByKey = new Map(actual.map((s) => [key(s.members), s]));

        for (const exp of expected) {
          const got = actualByKey.get(key(exp.members));
          expect(got, `missing subgroup ${key(exp.members)}`).toBeDefined();
          expect(got!.epsilon).toBeCloseTo(exp.epsilon, 9);
          expect(got!.kappa).toBeCloseTo(exp.kappa, 9);
          expect(got!.sigma).toBeCloseTo(exp.sigma, 9);
          expect(got!.p).toBeCloseTo(exp.p, 9);
          expect(got!.q).toBeCloseTo(exp.q, 9);
        }
      });

      it('agrees on the sigma ranking', () => {
        const expOrder = expected.map((s) => s.members.join(','));
        const gotOrder = actual.map((s) => s.members.join(','));
        // Only compare where sigma values are distinct enough to define an order.
        for (let i = 0; i + 1 < expected.length; i++) {
          if (Math.abs(expected[i]!.sigma - expected[i + 1]!.sigma) > TOLERANCE) {
            expect(gotOrder.indexOf(expOrder[i]!))
              .toBeLessThan(gotOrder.indexOf(expOrder[i + 1]!));
          }
        }
      });
    });
  }

  it('scores an individual subgroup identically to the fixture', () => {
    const g = new Glottometry(dataset, 'half');
    const first = fixture.byPolicy['half']![0]!;
    const s = g.stats(maskOf(first.members, fixture.languages.length));
    expect(s.epsilon).toBeCloseTo(first.epsilon, 9);
    expect(s.kappa).toBeCloseTo(first.kappa, 9);
  });

  it('keeps candidate patterns independent of NA policy', () => {
    // Which subgroups are *attested* is a fact about the data; only the scores
    // may move when the policy changes.
    const counts = policies.map((p) => new Glottometry(dataset, p).candidates().length);
    expect(new Set(counts).size).toBe(1);
  });
});
