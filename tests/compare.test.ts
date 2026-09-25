/**
 * Comparing hypotheses: the counts, and which innovations change explanation.
 */

import { describe, it, expect } from 'vitest';
import { analyseHypothesis, type GroupSpec } from '../src/core/hypothesis.js';
import { differences, explanationClass, summarise } from '../src/core/compare.js';
import type { Dataset } from '../src/core/types.js';
import type { QualityClass } from '../src/core/quality.js';
import { Glottometry } from '../src/core/metrics.js';
import { chainLayout } from '../src/core/layout.js';
import { hypothesisScene } from '../src/render/hypothesisScene.js';
import { exportComparison } from '../src/render/exportComparison.js';

// Kaufman (2026: 6): *p > f in A B, *s > h in C D, *a > ə in B C.
const ds: Dataset = {
  languages: ['A', 'B', 'C', 'D'],
  innovations: ['*p > f', '*s > h', '*a > ə'],
  matrix: [[1, 1, 0, 0], [0, 0, 1, 1], [0, 1, 1, 0]],
};
const four: GroupSpec[] = [
  { id: 'AB', kind: 'subgroup', members: [0, 1] },
  { id: 'CD', kind: 'subgroup', members: [2, 3] },
  { id: 'BC', kind: 'linkage', members: [1, 2] },
];
const five: GroupSpec[] = [
  { id: 'x', kind: 'subgroup', members: [1, 2] },
  { id: 'y', kind: 'linkage', members: [0, 1] },
  { id: 'z', kind: 'linkage', members: [2, 3] },
];
// *a > ə judged high quality, the others low.
const quality: QualityClass[] = ['low', 'low', 'high'];
const classOf = (r: number) => quality[r]!;
const A = analyseHypothesis(ds, four, classOf);
const B = analyseHypothesis(ds, five, classOf);

describe('summarise', () => {
  it("reproduces Kaufman's count: one areal event for (4), two for (5)", () => {
    expect(summarise(A, four, classOf)).toMatchObject({
      groups: { subgroup: 2, linkage: 1, contact: 0 },
      treeValid: true, extraGains: 1, informative: 3,
      explained: { inherited: 2, areal: 1, unexplained: 0 },
    });
    expect(summarise(B, five, classOf)).toMatchObject({
      extraGains: 2, explained: { inherited: 1, areal: 2, unexplained: 0 },
    });
  });

  it('shows how the high-quality innovations fare under each', () => {
    // (4) treats the high-quality *a > ə as areal; (5) inherits it.
    expect(summarise(A, four, classOf).byQuality.high).toEqual({ inherited: 0, areal: 1, unexplained: 0 });
    expect(summarise(B, five, classOf).byQuality.high).toEqual({ inherited: 1, areal: 0, unexplained: 0 });
  });
});

describe('differences', () => {
  it('finds every innovation whose explanation flips between inherited and areal', () => {
    const d = differences(A, B, four, five);
    expect(d.map((x) => [x.row, x.kind])).toEqual([
      [0, 'inherited-areal'], [1, 'inherited-areal'], [2, 'inherited-areal'],
    ]);
    expect(explanationClass(d[2]!.a)).toBe('areal');
    expect(explanationClass(d[2]!.b)).toBe('inherited');
  });

  it('matches groups by members, so an untouched copy shows no change', () => {
    const copy = four.map((g) => ({ ...g, id: `copy-${g.id}` }));
    expect(differences(A, analyseHypothesis(ds, copy, classOf), four, copy)).toEqual([]);
  });

  it('separates explained ↔ unexplained from a change of group or of losses', () => {
    const noLinkage = four.slice(0, 2);
    const d = differences(A, analyseHypothesis(ds, noLinkage, classOf), four, noLinkage);
    expect(d).toEqual([expect.objectContaining({ row: 2, kind: 'explained-unexplained' })]);

    const wider: GroupSpec[] = [...four.slice(0, 2), { id: 'W', kind: 'linkage', members: [0, 1, 2] }];
    const regrouped = differences(A, analyseHypothesis(ds, wider, classOf), four, wider);
    expect(regrouped).toEqual([expect.objectContaining({ row: 2, kind: 'regrouped' })]);

    const lossy: Dataset = { ...ds, matrix: [[1, 1, 0, 0], [0, 0, 1, 1], [0, 1, 0, 0]] };
    const tree: GroupSpec[] = [{ id: 'ABC', kind: 'subgroup', members: [0, 1, 2] }];
    const plain = analyseHypothesis(lossy, tree, classOf, undefined,
      (r) => (r === 0 ? { groupId: 'ABC', lostIn: [2] } : undefined));
    const withLoss = analyseHypothesis(lossy, tree, classOf, undefined,
      (r) => (r === 0 ? { groupId: 'ABC', lostIn: [] } : undefined));
    expect(differences(plain, withLoss, tree, tree).map((x) => x.kind)).toEqual(['regrouped']);
  });
});

describe('exportComparison', () => {
  const g = new Glottometry(ds, 'half');
  const layout = chainLayout([0, 1, 2, 3], ds.languages);
  const sceneA = hypothesisScene(layout, g, four, (id) => `(4) ${id}`);
  const sceneB = hypothesisScene(layout, g, five, (id) => `(5) ${id}`);
  const svg = exportComparison(
    [
      { scene: sceneA, heading: 'A: (4)', summary: '1 extra origin' },
      { scene: sceneB, heading: 'B: (5)', summary: '2 extra origins' },
    ],
    'Hypotheses compared', 'Kaufman (4) and (5)',
  );

  it('nests each panel as its own svg, side by side', () => {
    const nested = [...svg.matchAll(/<svg x="(\d+)" y="44" /g)].map((m) => Number(m[1]));
    expect(nested).toEqual([0, sceneA.width + 32]);
    expect(svg.match(/<\?xml/g)).toHaveLength(1);
    expect(svg).toMatch(/width="\d+" height="\d+" viewBox="0 0 \d+ \d+"/);
  });

  it('heads each panel and keeps each group identifiable', () => {
    expect(svg).toMatch(/>A: \(4\)<\/text>/);
    expect(svg).toMatch(/>2 extra origins<\/text>/);
    expect(svg).toMatch(/data-kind="linkage" data-name="\(4\) BC"/);
    expect(svg).toMatch(/data-kind="subgroup" data-name="\(5\) x"/);
  });
});
