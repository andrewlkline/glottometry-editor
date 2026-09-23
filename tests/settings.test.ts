/**
 * The contested method settings: innovation types, filtering, weighting, and
 * Fisher's exact test.
 *
 * These exist because the literature disagrees about them, so the tests are
 * mostly about the claims being checkable: that the type parser reproduces
 * K&F's own Table 5-1 counts, that excluding a category really can make a
 * subgroup vanish rather than merely weaken, and that weighting is off unless
 * asked for.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Glottometry } from '../src/core/metrics.js';
import { fisherExact, fisherStrength } from '../src/core/fisher.js';
import {
  INNOVATION_TYPES, filterByType, typeCounts, typeOf, weightsFor,
  type InnovationType,
} from '../src/core/innovationTypes.js';
import { parseMaramaCsv } from '../src/data/maramaCsv.js';
import type { Dataset } from '../src/core/types.js';

const dataset = parseMaramaCsv(
  readFileSync(fileURLToPath(new URL('../prototype/data/innov.csv', import.meta.url)), 'utf-8'),
);
const all = (except?: InnovationType) =>
  new Set(INNOVATION_TYPES.filter((t) => t !== except));

describe('typeOf', () => {
  it('reads K&F’s prefixes', () => {
    expect(typeOf('ISC: bite: *ɣaRat → *ɣaRati')).toBe('ISC');
    expect(typeOf('Lex: knife: *ɣa-sali')).toBe('Lex');
    expect(typeOf('Mrp: 3sg suffix: *ɣi')).toBe('Mrp');
    expect(typeOf('RSC: labialvelar: *gbʷ>kpʷ')).toBe('RSC');
  });

  it('groups the syntactic prefixes as Table 5-1 does', () => {
    // K&F's "syntactic change" row covers Sytx, Prg and Phr; splitting them
    // would invent categories the published typology does not have.
    expect(typeOf('Sytx: verbal number: (certain verbs)')).toBe('Syn');
    expect(typeOf('Prg: space: merger of scales1')).toBe('Syn');
    expect(typeOf('Phr: story: *ɸaɸa ta mʷoa(ʔa)')).toBe('Syn');
  });

  it('is case-insensitive and tolerates spacing', () => {
    expect(typeOf('lex : thing')).toBe('Lex');
    expect(typeOf('  ISC: thing')).toBe('ISC');
  });

  it('falls back to untyped rather than guessing', () => {
    expect(typeOf('no colon here')).toBe('untyped');
    expect(typeOf('Wat: unknown prefix')).toBe('untyped');
    expect(typeOf(': leading colon')).toBe('untyped');
    expect(typeOf('')).toBe('untyped');
  });
});

describe('typeCounts on the demo dataset', () => {
  const counts = typeCounts(dataset);

  it('reproduces the shape of K&F Table 5-1', () => {
    // Their published counts are RSC 21, ISC 116, Mrp 91, Syn 10, Lex 236 over
    // 474 innovations. The demo file is a relabelled 473-row variant, so ISC
    // and Lex differ slightly; the small categories should match exactly.
    expect(counts.get('RSC')).toBe(21);
    expect(counts.get('Syn')).toBe(10);
    expect(counts.get('Mrp')).toBe(91);
    expect(counts.get('ISC')).toBeGreaterThan(110);
    expect(counts.get('Lex')).toBeGreaterThan(220);
  });

  it('leaves nothing untyped', () => {
    expect(counts.get('untyped') ?? 0).toBe(0);
  });

  it('accounts for every innovation', () => {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(dataset.innovations.length);
  });
});

describe('filterByType', () => {
  it('returns the same object when nothing is excluded', () => {
    expect(filterByType(dataset, all())).toBe(dataset);
  });

  it('drops exactly the excluded rows', () => {
    const lexCount = typeCounts(dataset).get('Lex')!;
    const filtered = filterByType(dataset, all('Lex'));
    expect(filtered.innovations).toHaveLength(dataset.innovations.length - lexCount);
    expect(filtered.matrix).toHaveLength(filtered.innovations.length);
    expect(filtered.innovations.some((l) => typeOf(l) === 'Lex')).toBe(false);
  });

  it('keeps labels aligned with their rows', () => {
    const filtered = filterByType(dataset, new Set<InnovationType>(['RSC']));
    const originalIndex = dataset.innovations.indexOf(filtered.innovations[0]!);
    expect(filtered.matrix[0]).toEqual(dataset.matrix[originalIndex]);
  });

  it('leaves the languages untouched', () => {
    expect(filterByType(dataset, all('Lex')).languages).toBe(dataset.languages);
  });
});

describe('excluding lexical replacement', () => {
  // The Jacques & List (2019) critique made checkable: half the dataset is the
  // category most open to borrowing, so what survives without it?
  const withAll = new Glottometry(dataset, 'half').subgroups();
  const withoutLex = new Glottometry(filterByType(dataset, all('Lex')), 'half').subgroups();

  it('removes subgroups outright, not merely weakens them', () => {
    // Candidates come from distinct innovation patterns, so dropping rows can
    // make a grouping unattested. This is the substantive point of the control.
    expect(withoutLex.length).toBeLessThan(withAll.length);

    const surviving = new Set(withoutLex.map((s) => s.members.join(',')));
    const vanished = withAll
      .filter((s) => s.sigma >= 1)
      .filter((s) => !surviving.has(s.members.join(',')));
    expect(vanished.length).toBeGreaterThan(0);
  });

  it('leaves the strongest subgroups standing', () => {
    // If ⓁA+ⓁB depended entirely on lexical evidence that would be worth
    // knowing; it does not.
    const top = withAll[0]!.members.join(',');
    expect(withoutLex.some((s) => s.members.join(',') === top)).toBe(true);
  });
});

describe('weightsFor', () => {
  it('is null when unweighted, so the scorer can skip the work', () => {
    expect(weightsFor(dataset, undefined)).toBeNull();
    expect(weightsFor(dataset, {})).toBeNull();
    expect(weightsFor(dataset, { Lex: 1, ISC: 1 })).toBeNull();
  });

  it('assigns each row its type’s multiplier', () => {
    const w = weightsFor(dataset, { Lex: 0.5 })!;
    expect(w).not.toBeNull();
    expect(w.length).toBe(dataset.innovations.length);
    dataset.innovations.forEach((label, i) => {
      expect(w[i]).toBe(typeOf(label) === 'Lex' ? 0.5 : 1);
    });
  });

  it('changes the scores when applied', () => {
    const plain = new Glottometry(dataset, 'half').subgroups();
    const weights = weightsFor(dataset, { Lex: 0 })!;
    const downweighted = new Glottometry(dataset, 'half', weights).subgroups();
    const key = plain[0]!.members.join(',');
    const before = plain[0]!;
    const after = downweighted.find((s) => s.members.join(',') === key)!;
    expect(after.epsilon).toBeLessThan(before.epsilon);
  });

  it('leaves scores untouched at weight 1', () => {
    const plain = new Glottometry(dataset, 'half').subgroups();
    const ones = new Float64Array(dataset.innovations.length).fill(1);
    const weighted = new Glottometry(dataset, 'half', ones).subgroups();
    expect(weighted.map((s) => s.sigma)).toEqual(plain.map((s) => s.sigma));
  });
});

describe('fisherExact', () => {
  it('matches a hand-computable table', () => {
    // The classic tea-tasting table: p = 1/70.
    expect(fisherExact(4, 0, 0, 4)).toBeCloseTo(1 / 70, 12);
  });

  it('returns 1 when there is no positive association to speak of', () => {
    expect(fisherExact(0, 4, 4, 0)).toBeCloseTo(1, 12);
    expect(fisherExact(2, 2, 2, 2)).toBeGreaterThan(0.5);
  });

  it('stays within [0, 1]', () => {
    for (const cell of [[1, 2, 3, 4], [10, 1, 1, 10], [0, 0, 0, 1], [50, 50, 50, 50]]) {
      const p = fisherExact(cell[0]!, cell[1]!, cell[2]!, cell[3]!);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('gets more significant as the association strengthens', () => {
    expect(fisherExact(8, 2, 2, 8)).toBeLessThan(fisherExact(6, 4, 4, 6));
  });

  it('handles an empty table', () => {
    expect(fisherExact(0, 0, 0, 0)).toBe(1);
  });

  it('copes with counts large enough to overflow a naive factorial', () => {
    const p = fisherExact(200, 100, 100, 200);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1e-10);
  });
});

describe('fisherStrength', () => {
  it('reports -log10(p), so bigger is stronger', () => {
    const r = fisherStrength({ a: 4, b: 0, c: 0, d: 4 });
    expect(r.strength).toBeCloseTo(-Math.log10(1 / 70), 9);
  });

  it('rounds fractional counts from the NA policy', () => {
    const r = fisherStrength({ a: 3.7, b: 0.2, c: 0.1, d: 4.4 });
    expect(r.a).toBe(4);
    expect(r.b).toBe(0);
  });
});

describe('significance on the demo dataset', () => {
  const subgroups = new Glottometry(dataset, 'half').subgroups();

  it('agrees with sigma about the single strongest subgroup', () => {
    const bySigma = [...subgroups].sort((a, b) => b.sigma - a.sigma)[0]!;
    const byP = [...subgroups].sort((a, b) => b.significance - a.significance)[0]!;
    expect(byP.members).toEqual(bySigma.members);
  });

  it('ranks differently further down, which is the point of offering it', () => {
    // Significance accounts for how many innovations there are; sigma does
    // not. If they agreed everywhere the extra measure would be pointless.
    const bySigma = [...subgroups].sort((a, b) => b.sigma - a.sigma).slice(0, 10)
      .map((s) => s.members.join(','));
    const byP = [...subgroups].sort((a, b) => b.significance - a.significance).slice(0, 10)
      .map((s) => s.members.join(','));
    expect(byP).not.toEqual(bySigma);
  });

  it('keeps the contingency table consistent with the metrics', () => {
    for (const s of subgroups.slice(0, 10)) {
      const { a, b, c, d } = s.fisher;
      // Cells are rounded independently, so the total can sit one off.
      expect(Math.abs((a + b + c + d) - dataset.innovations.length))
        .toBeLessThanOrEqual(1);
      // a + b is "all of G participated", which is p before weighting. Cells
      // are rounded independently, so the sum can sit one off.
      expect(Math.abs((a + b) - s.p)).toBeLessThanOrEqual(1);
    }
  });
});

describe('what significance sees that epsilon does not', () => {
  /**
   * Both datasets give {A,B} ten exclusively shared innovations, so epsilon
   * cannot separate them. In the first, almost nothing else reaches both
   * members or stops at the boundary, so the overlap is striking. In the
   * second it is buried among innovations that reach both members and keep
   * going, and others confined to one — the association vanishes.
   *
   * Note all four cells must be populated for the test to say anything: a
   * table with an empty row or column is degenerate and correctly yields
   * p = 1, there being no variation to explain.
   */
  const build = (a: number, b: number, c: number, d: number): Dataset => {
    const innovations: string[] = [];
    const matrix: (1 | 0 | null)[][] = [];
    const push = (n: number, row: (1 | 0 | null)[], tag: string) => {
      for (let i = 0; i < n; i++) {
        innovations.push(`Lex: ${tag} ${i}`);
        matrix.push([...row]);
      }
    };
    push(a, [1, 1, 0, 0], 'exclusive');   // all of G, no outsider
    push(b, [1, 1, 1, 0], 'leaky');       // all of G, outsider too
    push(c, [1, 0, 0, 0], 'partial');     // not all of G, no outsider
    push(d, [1, 0, 1, 0], 'elsewhere');   // not all of G, outsider
    return { languages: ['A', 'B', 'C', 'D'], innovations, matrix };
  };

  const score = (d: Dataset) =>
    new Glottometry(d, 'half').subgroups().find((s) => s.members.join() === '0,1')!;

  const clean = score(build(10, 1, 1, 10));
  const muddled = score(build(10, 20, 20, 10));

  it('gives both the same exclusively shared innovations', () => {
    expect(muddled.epsilon).toBeCloseTo(clean.epsilon, 9);
    expect(clean.epsilon).toBeCloseTo(10, 9);
  });

  it('but finds a signal only in the clean one', () => {
    expect(clean.fisher.pValue).toBeLessThan(0.001);
    expect(muddled.fisher.pValue).toBeGreaterThan(0.5);
    expect(muddled.significance).toBeLessThan(clean.significance);
  });

  it('disagrees with kappa, which is a real difference and not a bug', () => {
    // Cohesiveness counts an innovation that reaches every member as
    // supporting even when it spreads outside, because all members did
    // innovate together. This table counts that same innovation against,
    // because reaching everyone while continuing past the boundary says
    // nothing about where the group ends. So the two can rank subgroups
    // oppositely. Pinned here so the divergence cannot drift unnoticed.
    expect(muddled.kappa).toBeGreaterThan(clean.kappa);
    expect(muddled.significance).toBeLessThan(clean.significance);
  });
});

describe('significance is not a correction for dataset size', () => {
  it('rises when unrelated innovations are added', () => {
    // A real property of this contingency table, documented in fisher.ts so
    // nobody reads a significance score as "adjusted for how much data".
    const base = fisherStrength({ a: 2, b: 0, c: 0, d: 2 }).strength;
    const padded = fisherStrength({ a: 2, b: 0, c: 0, d: 200 }).strength;
    expect(padded).toBeGreaterThan(base);
  });
});
