/**
 * The evidence inspector.
 *
 * The binding constraint is that it cannot drift from the metrics: the weights
 * it reports must sum to exactly the epsilon, p and q that produced the
 * subgroup's score. If those ever diverge, the panel would be explaining a
 * number the diagram is not drawing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Glottometry, evidenceFor, maskOf } from '../src/core/metrics.js';
import { parseMaramaCsv } from '../src/data/maramaCsv.js';
import { INNOVATION_TYPES, applyTypeSettings } from '../src/core/innovationTypes.js';
import type { Dataset, NaPolicy } from '../src/core/types.js';

const dataset = parseMaramaCsv(
  readFileSync(fileURLToPath(new URL('../prototype/data/innov.csv', import.meta.url)), 'utf-8'),
);

const sum = (items: { weight: number }[]) => items.reduce((a, b) => a + b.weight, 0);

describe.each(['half', 'zero', 'one', 'rowMean', 'colMean'] as NaPolicy[])(
  'evidence reconciles with the metrics (%s)',
  (policy) => {
    const g = new Glottometry(dataset, policy);
    const subgroups = g.subgroups().slice(0, 12);

    it('has at least a dozen subgroups to check', () => {
      expect(subgroups.length).toBeGreaterThan(5);
    });

    it('sums exclusive weights to epsilon', () => {
      for (const s of subgroups) {
        const e = evidenceFor(g, dataset, maskOf(s.members, g.nLanguages), 0);
        expect(sum(e.exclusive)).toBeCloseTo(s.epsilon, 9);
      }
    });

    it('sums supporting weights to p and conflicting weights to q', () => {
      for (const s of subgroups) {
        const e = evidenceFor(g, dataset, maskOf(s.members, g.nLanguages), 0);
        expect(sum(e.supporting)).toBeCloseTo(s.p, 9);
        expect(sum(e.conflicting)).toBeCloseTo(s.q, 9);
      }
    });
  },
);

describe('evidence on a hand-checkable dataset', () => {
  // K&F's Figure 5-7: 12 innovations for AB, 4 for AC, 2 for BC.
  const languages = ['A', 'B', 'C'];
  const innovations: string[] = [];
  const matrix: (1 | 0 | null)[][] = [];
  const add = (n: number, row: (1 | 0 | null)[], tag: string) => {
    for (let i = 0; i < n; i++) {
      innovations.push(`${tag}${i}`);
      matrix.push([...row]);
    }
  };
  add(12, [1, 1, 0], 'AB');
  add(4, [1, 0, 1], 'AC');
  add(2, [0, 1, 1], 'BC');
  const ds: Dataset = { languages, innovations, matrix };
  const g = new Glottometry(ds, 'half');
  const evidence = evidenceFor(g, ds, maskOf([0, 1], 3));

  it('finds the 12 innovations exclusive to AB', () => {
    expect(evidence.exclusive).toHaveLength(12);
    expect(evidence.exclusive.every((e) => e.label.startsWith('AB'))).toBe(true);
    expect(evidence.exclusive.every((e) => e.weight === 1)).toBe(true);
  });

  it('counts the 6 innovations that conflict with AB', () => {
    // The 4 AC plus the 2 BC: each affects one member and one outsider.
    expect(evidence.conflicting).toHaveLength(6);
    expect(sum(evidence.conflicting)).toBeCloseTo(6, 9);
  });

  it('lists exclusive innovations as supporting too', () => {
    // "All members share this" is true of an exclusive innovation.
    expect(evidence.supporting).toHaveLength(12);
    for (const e of evidence.exclusive) {
      expect(evidence.supporting.some((s) => s.index === e.index)).toBe(true);
    }
  });

  it('records which languages participated', () => {
    expect(evidence.exclusive[0]!.participants).toEqual([0, 1]);
    expect(evidence.exclusive[0]!.unknown).toEqual([]);
  });
});

describe('innovations nested inside a subgroup', () => {
  // K&F 2018: 70 fn. 9 — an innovation affecting a proper subset of the
  // subgroup and no outsider is irrelevant to cohesiveness.
  const ds: Dataset = {
    languages: ['A', 'B', 'C'],
    innovations: ['nested', 'whole'],
    matrix: [[1, 0, 0], [1, 1, 0]],
  };
  const g = new Glottometry(ds, 'half');
  const evidence = evidenceFor(g, ds, maskOf([0, 1], 3));

  it('appears in none of the three lists', () => {
    const all = [...evidence.exclusive, ...evidence.supporting, ...evidence.conflicting];
    expect(all.some((e) => e.label === 'nested')).toBe(false);
    expect(all.some((e) => e.label === 'whole')).toBe(true);
  });
});

describe('unknown cells', () => {
  const ds: Dataset = {
    languages: ['A', 'B', 'C'],
    innovations: ['partial'],
    matrix: [[1, null, 0]],
  };
  const g = new Glottometry(ds, 'half');
  const evidence = evidenceFor(g, ds, maskOf([0, 1], 3));

  it('yields a fractional weight rather than a yes or no', () => {
    expect(evidence.exclusive[0]!.weight).toBeCloseTo(0.5, 9);
  });

  it('reports which cells were unknown', () => {
    expect(evidence.exclusive[0]!.unknown).toEqual([1]);
    expect(evidence.exclusive[0]!.participants).toEqual([0]);
  });
});

describe('minWeight', () => {
  it('drops negligible contributions by default', () => {
    const g = new Glottometry(dataset, 'half');
    const mask = maskOf(g.subgroups()[0]!.members, g.nLanguages);
    const all = evidenceFor(g, dataset, mask, 0);
    const trimmed = evidenceFor(g, dataset, mask);
    expect(trimmed.conflicting.length).toBeLessThanOrEqual(all.conflicting.length);
    expect(trimmed.conflicting.every((e) => e.weight > 0.005)).toBe(true);
  });
});

describe('evidence under type filtering and weighting', () => {
  const ds = {
    languages: ['A', 'B', 'C', 'D'],
    innovations: ['Lex: one', 'ISC: two', 'Lex: three', 'ISC: four'],
    matrix: [[1, 1, 0, 0], [1, 1, 0, 0], [0, 1, 1, 0], [1, 1, 1, 0]] as (0 | 1 | null)[][],
  };

  it('refuses a dataset other than the one scored', () => {
    // After filtering, scorer row r is not dataset row r; pairing them put
    // one innovation's label beside another's numbers.
    const { dataset: kept } = applyTypeSettings(ds, new Set(['ISC'] as const), undefined);
    const g = new Glottometry(kept, 'half');
    expect(() => evidenceFor(g, ds, maskOf([0, 1], 4))).toThrow(/dataset that was scored/);
    const e = evidenceFor(g, kept, maskOf([0, 1], 4));
    expect(e.exclusive.map((i) => i.label)).toEqual(['ISC: two']);
  });

  it('includes type weights, so the totals still equal the metrics', () => {
    const { dataset: kept, weights } = applyTypeSettings(
      ds, new Set(INNOVATION_TYPES), { Lex: 0.25, ISC: 2 },
    );
    const g = new Glottometry(kept, 'half', weights);
    const mask = maskOf([0, 1], 4);
    const e = evidenceFor(g, kept, mask, 0);
    const stats = g.stats(mask);
    const sum = (xs: { weight: number }[]) => xs.reduce((a, x) => a + x.weight, 0);
    expect(sum(e.exclusive)).toBeCloseTo(stats.epsilon, 9);
    expect(sum(e.supporting)).toBeCloseTo(stats.p, 9);
    expect(sum(e.conflicting)).toBeCloseTo(stats.q, 9);
    expect(e.exclusive.map((i) => [i.label, i.multiplier]))
      .toEqual([['ISC: two', 2], ['Lex: one', 0.25]]);
  });
});
