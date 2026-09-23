/**
 * Linkage breaking — Kalyan & François (2019: 171).
 *
 * A language is a connected component of the diagram's hypergraph; the
 * sequence of partitions as the weakest isoglosses drop out is the thing the
 * paper reads as a chronology. What is testable is the graph theory; whether
 * the sequence is a history is exactly what Elgh & Hammarström (2024) dispute,
 * and no test here takes a side on that.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { componentsOf, linkageStages, stageAt } from '../src/core/chronology.js';
import { Glottometry } from '../src/core/metrics.js';
import { parseMaramaCsv } from '../src/data/maramaCsv.js';
import type { Subgroup } from '../src/core/types.js';

const dataset = parseMaramaCsv(
  readFileSync(fileURLToPath(new URL('../prototype/data/innov.csv', import.meta.url)), 'utf-8'),
);
const subgroups = new Glottometry(dataset, 'half').subgroups();
const bySigma = (s: Subgroup) => s.sigma;

/** A minimal stand-in; only members and sigma matter here. */
const edge = (members: number[], sigma: number): Subgroup => ({
  members,
  memberNames: members.map((m) => `L${m}`),
  epsilon: sigma, kappa: 1, sigma, p: sigma, q: 0,
  fisher: { a: 0, b: 0, c: 0, d: 0, pValue: 1, strength: 0 },
  significance: 0,
});

describe('componentsOf', () => {
  it('treats every language as its own component when there are no edges', () => {
    expect(componentsOf([], 4)).toEqual([[0], [1], [2], [3]]);
  });

  it('merges languages joined by an edge', () => {
    expect(componentsOf([edge([0, 1], 1)], 4)).toEqual([[0, 1], [2], [3]]);
  });

  it('chains through shared members', () => {
    // A-B and B-C make one component, not two.
    const components = componentsOf([edge([0, 1], 1), edge([1, 2], 1)], 4);
    expect(components).toEqual([[0, 1, 2], [3]]);
  });

  it('handles a hyperedge over more than two languages', () => {
    expect(componentsOf([edge([0, 2, 3], 1)], 4)).toEqual([[0, 2, 3], [1]]);
  });

  it('is order-independent', () => {
    const a = componentsOf([edge([2, 3], 1), edge([0, 1], 1)], 4);
    const b = componentsOf([edge([0, 1], 1), edge([2, 3], 1)], 4);
    expect(a).toEqual(b);
  });

  it('covers every language exactly once', () => {
    const components = componentsOf(subgroups, dataset.languages.length);
    const seen = components.flat().sort((x, y) => x - y);
    expect(seen).toEqual(Array.from({ length: dataset.languages.length }, (_, i) => i));
  });
});

describe('linkageStages on a hand-built example', () => {
  // Two pairs joined by one weak bridge: the bridge should go first.
  const edges = [
    edge([0, 1], 5),
    edge([2, 3], 4),
    edge([1, 2], 1),   // the bridge
  ];
  const stages = linkageStages(edges, 4, bySigma);

  it('starts with the family in one piece', () => {
    expect(stages[0]!.components).toEqual([[0, 1, 2, 3]]);
    expect(stages[0]!.brokenBy).toBeNull();
  });

  it('breaks first where the bridge was', () => {
    expect(stages[1]!.components).toEqual([[0, 1], [2, 3]]);
    expect(stages[1]!.brokenBy!.members).toEqual([1, 2]);
  });

  it('ends with every language separate', () => {
    const last = stages[stages.length - 1]!;
    expect(last.components).toEqual([[0], [1], [2], [3]]);
  });

  it('records only thresholds where the partition changes', () => {
    // Three edges, but one of them cannot split anything on its own.
    const signatures = stages.map((s) => s.components.length);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('maps every language to its component', () => {
    for (const stage of stages) {
      stage.components.forEach((component, index) => {
        for (const language of component) {
          expect(stage.componentOf[language]).toBe(index);
        }
      });
    }
  });
});

describe('linkageStages on the demo dataset', () => {
  const shown = subgroups.filter((s) => s.sigma >= 1);
  const stages = linkageStages(shown, dataset.languages.length, bySigma);

  it('starts whole and ends fully fragmented', () => {
    expect(stages[0]!.components).toHaveLength(1);
    expect(stages[stages.length - 1]!.components)
      .toHaveLength(dataset.languages.length);
  });

  it('never un-splits: component counts increase monotonically', () => {
    // Removing edges can only break things apart, never rejoin them.
    const counts = stages.map((s) => s.components.length);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThan(counts[i - 1]!);
    }
  });

  it('has increasing thresholds', () => {
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i]!.threshold).toBeGreaterThan(stages[i - 1]!.threshold);
    }
  });

  it('names an isogloss for every stage after the first', () => {
    for (const stage of stages.slice(1)) {
      expect(stage.brokenBy).not.toBeNull();
      expect(stage.brokenBy!.sigma).toBeLessThan(stage.threshold + 1e-9);
    }
  });

  it('refines the partition at each step', () => {
    // Each stage's components must be a refinement of the previous stage's:
    // a language cannot move between groups, only split away.
    for (let i = 1; i < stages.length; i++) {
      for (const component of stages[i]!.components) {
        const previous = stages[i - 1]!.components
          .find((c) => c.includes(component[0]!))!;
        for (const language of component) {
          expect(previous).toContain(language);
        }
      }
    }
  });

  it('agrees with a direct recomputation at each stage threshold', () => {
    for (const stage of stages) {
      const active = shown.filter((s) => s.sigma >= stage.threshold);
      expect(componentsOf(active, dataset.languages.length))
        .toEqual(stage.components);
    }
  });
});

describe('stageAt', () => {
  const edges = [edge([0, 1], 5), edge([2, 3], 4), edge([1, 2], 1)];
  const stages = linkageStages(edges, 4, bySigma);

  it('returns the stage in force at a threshold', () => {
    expect(stageAt(stages, 0)!.components).toHaveLength(1);
    expect(stageAt(stages, 4.5)!.components).toEqual([[0, 1], [2], [3]]);
  });

  it('holds each stage across its whole half-open interval', () => {
    // A stage covers (previous.threshold, threshold]: inclusive at the top,
    // exclusive at the bottom. Getting this backwards returns the partition
    // from one interval earlier, which is subtly wrong rather than obviously.
    for (let i = 1; i < stages.length; i++) {
      const stage = stages[i]!;
      const previous = stages[i - 1]!;
      expect(stageAt(stages, stage.threshold)).toBe(stage);
      expect(stageAt(stages, previous.threshold + 1e-6)).toBe(stage);
      expect(stageAt(stages, previous.threshold)).toBe(previous);
    }
  });

  it('matches a direct recomputation across the whole range', () => {
    const edgeList = edges;
    for (let t = 0; t <= 6; t += 0.25) {
      const active = edgeList.filter((e) => e.sigma >= t);
      expect(stageAt(stages, t)!.components)
        .toEqual(componentsOf(active, 4));
    }
  });

  it('clamps above the last threshold', () => {
    expect(stageAt(stages, 1e6)!.components).toEqual([[0], [1], [2], [3]]);
  });

  it('returns null only when there are no stages', () => {
    expect(stageAt([], 1)).toBeNull();
  });
});

describe('degenerate inputs', () => {
  it('handles no languages', () => {
    expect(linkageStages([], 0, bySigma)).toEqual([]);
  });

  it('handles languages with no isoglosses at all', () => {
    const stages = linkageStages([], 3, bySigma);
    expect(stages).toHaveLength(1);
    expect(stages[0]!.components).toEqual([[0], [1], [2]]);
  });

  it('copes with several isoglosses sharing a weight', () => {
    const stages = linkageStages(
      [edge([0, 1], 2), edge([2, 3], 2), edge([1, 2], 1)], 4, bySigma,
    );
    // Both weight-2 edges vanish together, so one stage covers both splits.
    const last = stages[stages.length - 1]!;
    expect(last.components).toEqual([[0], [1], [2], [3]]);
  });
});

describe('the measure drives the sequence', () => {
  it('produces a different sequence under epsilon than under sigma', () => {
    const shown = subgroups.filter((s) => s.sigma >= 1);
    const bySigmaStages = linkageStages(shown, dataset.languages.length, bySigma);
    const byEpsilon = linkageStages(shown, dataset.languages.length, (s) => s.epsilon);
    // Which isogloss is "weakest" depends on the measure, so the order in
    // which the family comes apart does too. Worth surfacing, since the
    // measure is a user choice.
    expect(byEpsilon.map((s) => s.components.length))
      .not.toEqual(bySigmaStages.map((s) => s.components.length));
  });
});
