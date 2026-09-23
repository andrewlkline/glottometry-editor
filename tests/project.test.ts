/**
 * The `.glot.json` project file.
 *
 * The promise this format makes is that a diagram you tuned reopens exactly as
 * you left it, so the round-trip and the label-keyed position resolution are
 * the things worth pinning down. Parsing is also the one place a user can hand
 * the app arbitrary text, so bad input has to fail readably rather than
 * somewhere deep in the scorer.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createProject, parseProject, resolveOrder, serializeProject, PROJECT_VERSION,
} from '../src/data/project.js';
import { parseCoordinatesCsv, parseMaramaCsv } from '../src/data/maramaCsv.js';
import { reconcile } from '../src/data/innovationMeta.js';
import type { Dataset } from '../src/core/types.js';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf-8');

const dataset = parseMaramaCsv(read('../prototype/data/innov.csv'));
const coordinates = parseCoordinatesCsv(read('../prototype/data/coords.csv'));

describe('round-trip', () => {
  it('preserves a fresh project', () => {
    const before = createProject('demo', dataset, coordinates);
    const after = parseProject(serializeProject(before));
    expect(after.name).toBe('demo');
    expect(after.version).toBe(PROJECT_VERSION);
    expect(after.dataset.languages).toEqual(dataset.languages);
    expect(after.dataset.innovations).toEqual(dataset.innovations);
    expect(after.dataset.matrix).toEqual(dataset.matrix);
    expect(after.coordinates).toEqual(coordinates);
  });

  it('preserves every manual adjustment', () => {
    const before = {
      ...createProject('tuned', dataset),
      settings: {
        policy: 'zero' as const, layoutKind: 'mds' as const,
        measure: 'epsilon' as const, minStrength: 2.5,
        enabledTypes: ['ISC' as const, 'Mrp' as const],
        typeWeights: { Lex: 0.5 },
      },
      manualOrder: [...dataset.languages].reverse(),
      manualPositions: { 'ⓁA': [12.5, 34] as [number, number] },
      hidden: ['0,1', '2,3'],
    };
    const after = parseProject(serializeProject(before));
    expect(after.settings).toEqual(before.settings);
    expect(after.manualOrder).toEqual(before.manualOrder);
    expect(after.manualPositions).toEqual(before.manualPositions);
    expect(after.hidden).toEqual(before.hidden);
  });

  it('preserves the reasoning behind each innovation', () => {
    const before = createProject('meta', dataset);
    before.innovationMeta = reconcile(undefined, dataset.innovations.length);
    before.innovationMeta[0] = {
      ...before.innovationMeta[0]!,
      type: 'ISC',
      protoForm: '*malate',
      innovatedForm: '*malete',
      gloss: "'broken'",
      notes: 'Araki /n̼alare/ points to the form with /a/.',
      sources: ['François 2002: 270'],
      reflexes: { 'ⓁA': 'mɪjɪt', 'ⓁB': 'məlit' },
      precedes: [before.innovationMeta[1]!.id],
    };

    const after = parseProject(serializeProject(before));
    expect(after.innovationMeta).toHaveLength(dataset.innovations.length);
    expect(after.innovationMeta![0]).toEqual(before.innovationMeta[0]);
  });

  it('repairs a metadata array that does not match the row count', () => {
    // Hand-edited or written by another tool: pad rather than refuse to open.
    const p = parseProject(
      '{"dataset": {"languages": ["A", "B"], "innovations": ["x", "y", "z"],'
      + ' "matrix": [[1,0],[0,1],[1,1]]}, "innovationMeta": [{"id": "keep"}]}',
    );
    expect(p.innovationMeta).toHaveLength(3);
    expect(p.innovationMeta![0]!.id).toBe('keep');
    expect(p.innovationMeta![2]!.id).toBeTruthy();
  });

  it('keeps unknown cells distinct from zeros', () => {
    const after = parseProject(serializeProject(createProject('x', dataset)));
    const flat = after.dataset.matrix.flat();
    expect(flat.filter((c) => c === null).length).toBe(313);
    expect(flat.filter((c) => c === 0).length)
      .toBe(dataset.matrix.flat().filter((c) => c === 0).length);
  });
});

describe('parsing bad input', () => {
  const cases: [string, string][] = [
    ['not JSON at all', 'Not valid JSON.'],
    ['[1, 2, 3]', 'no dataset'],
    ['{}', 'no dataset'],
    ['{"dataset": {"languages": [], "matrix": []}}', 'no languages'],
    ['{"dataset": {"languages": ["A", "B"], "matrix": [[1]]}}', 'one per language'],
  ];

  for (const [input, fragment] of cases) {
    it(`rejects ${input.slice(0, 40)}`, () => {
      expect(() => parseProject(input)).toThrow(new RegExp(fragment, 'i'));
    });
  }

  it('fills in missing innovation labels rather than failing', () => {
    const p = parseProject('{"dataset": {"languages": ["A", "B"], "matrix": [[1, 0], [0, 1]]}}');
    expect(p.dataset.innovations).toHaveLength(2);
    expect(p.dataset.innovations[0]).toMatch(/innovation/);
  });

  it('applies default settings when none are stored', () => {
    const p = parseProject('{"dataset": {"languages": ["A", "B"], "matrix": [[1, 1]]}}');
    expect(p.settings.policy).toBe('half');
    expect(p.settings.layoutKind).toBe('chain');
    expect(p.settings.measure).toBe('sigma');
  });

  it('migrates minSigma from projects written before measures were switchable', () => {
    const p = parseProject(
      '{"dataset": {"languages": ["A", "B"], "matrix": [[1, 1]]},'
      + ' "settings": {"policy": "zero", "minSigma": 2.25}}',
    );
    expect(p.settings.minStrength).toBe(2.25);
    expect(p.settings.measure).toBe('sigma');
    expect(p.settings.policy).toBe('zero');
    expect((p.settings as unknown as Record<string, unknown>).minSigma).toBeUndefined();
  });

  it('prefers a stored minStrength over a legacy minSigma', () => {
    const p = parseProject(
      '{"dataset": {"languages": ["A", "B"], "matrix": [[1, 1]]},'
      + ' "settings": {"minSigma": 9, "minStrength": 3, "measure": "epsilon"}}',
    );
    expect(p.settings.minStrength).toBe(3);
    expect(p.settings.measure).toBe('epsilon');
  });

  it('coerces stray cell values to unknown', () => {
    const p = parseProject('{"dataset": {"languages": ["A"], "matrix": [["yes"], [7], [null]]}}');
    expect(p.dataset.matrix).toEqual([[null], [null], [null]]);
  });

  it('keeps fields a newer version might add', () => {
    // Forward compatibility: an unknown key must not make the file unopenable.
    const p = parseProject(
      '{"version": 99, "dataset": {"languages": ["A", "B"], "matrix": [[1, 1]]}, "futureThing": 1}',
    );
    expect(p.version).toBe(99);
    expect(p.dataset.languages).toEqual(['A', 'B']);
  });
});

describe('resolveOrder', () => {
  const languages = ['A', 'B', 'C', 'D'];

  it('maps labels back to column indices', () => {
    expect(resolveOrder(['C', 'A', 'D', 'B'], languages)).toEqual([2, 0, 3, 1]);
  });

  it('returns null when there is no saved order', () => {
    expect(resolveOrder(undefined, languages)).toBeNull();
  });

  it('drops labels the dataset no longer has', () => {
    // Keyed by label precisely so an edited dataset degrades gracefully.
    const order = resolveOrder(['C', 'GONE', 'A'], languages);
    expect(order).toHaveLength(4);
    expect(order!.slice(0, 2)).toEqual([2, 0]);
  });

  it('appends languages the saved order did not mention', () => {
    const order = resolveOrder(['D'], languages);
    expect(order![0]).toBe(3);
    expect([...order!].sort()).toEqual([0, 1, 2, 3]);
  });

  it('ignores duplicates', () => {
    const order = resolveOrder(['A', 'A', 'B'], languages);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4);
  });

  it('survives a saved order for a completely different dataset', () => {
    const order = resolveOrder(['X', 'Y', 'Z'], languages);
    expect([...order!].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('a project carrying a whole workflow', () => {
  it('reopens to the same diagram inputs', () => {
    // End to end: the state the app derives its scene from must be identical
    // before and after a save/load cycle.
    const original: ReturnType<typeof createProject> = {
      ...createProject('vanuatu', dataset, coordinates),
      settings: {
        policy: 'rowMean', layoutKind: 'geographic',
        measure: 'significance', minStrength: 1.75,
      },
      manualPositions: { 'ⓁC': [100, 200], 'ⓁD': [150, 250] },
      hidden: ['4,5'],
    };
    const reopened = parseProject(serializeProject(original));

    expect(reopened.settings).toEqual(original.settings);
    expect(reopened.manualPositions).toEqual(original.manualPositions);
    expect(reopened.hidden).toEqual(original.hidden);
    expect(reopened.coordinates).toEqual(original.coordinates);

    const before: Dataset = original.dataset;
    expect(reopened.dataset).toEqual(before);
  });
});
