/**
 * Editing operations.
 *
 * The interesting cases are all cascades. A language is referenced from the
 * matrix columns, the coordinates, the manual order, the manual positions and
 * every innovation's reflexes; renaming or deleting one has to reach all five,
 * and forgetting the fifth leaves orphaned keys that only surface later as a
 * reflex attached to a language that no longer exists.
 */

import { describe, it, expect } from 'vitest';
import {
  addInnovation, addLanguage, blankDataset, cycleCell, nextCellValue,
  removeInnovation, removeLanguage, renameInnovation, renameLanguage,
  setCell, setRow, updateMeta,
} from '../src/data/edit.js';
import { createProject } from '../src/data/project.js';
import { isBlank, reconcile } from '../src/data/innovationMeta.js';
import { Glottometry } from '../src/core/metrics.js';
import type { Cell, Dataset } from '../src/core/types.js';
import type { Project } from '../src/data/project.js';

const dataset = (): Dataset => ({
  languages: ['A', 'B', 'C'],
  innovations: ['ISC: one', 'Lex: two'],
  matrix: [[1, 1, 0], [0, 1, null]],
});

const base = (): Project => ({
  ...createProject('test', dataset(), { A: { lat: 1, lon: 1 }, B: { lat: 2, lon: 2 }, C: { lat: 3, lon: 3 } }),
  innovationMeta: reconcile(undefined, 2),
  manualOrder: ['C', 'A', 'B'],
  manualPositions: { A: [10, 20], C: [30, 40] },
});

describe('cell values', () => {
  it('cycles 1 → 0 → unknown → 1', () => {
    expect(nextCellValue(1)).toBe(0);
    expect(nextCellValue(0)).toBe(null);
    expect(nextCellValue(null)).toBe(1);
  });

  it('sets a cell without touching its neighbours', () => {
    const before = base();
    const after = setCell(before, 0, 1, null);
    expect(after.dataset.matrix[0]).toEqual([1, null, 0]);
    expect(after.dataset.matrix[1]).toEqual(before.dataset.matrix[1]);
  });

  it('does not mutate the original', () => {
    const before = base();
    const snapshot = JSON.stringify(before.dataset.matrix);
    cycleCell(before, 0, 0);
    expect(JSON.stringify(before.dataset.matrix)).toBe(snapshot);
  });

  it('cycles in place', () => {
    let p = base();
    p = cycleCell(p, 1, 2);      // null → 1
    expect(p.dataset.matrix[1]![2]).toBe(1);
    p = cycleCell(p, 1, 2);      // 1 → 0
    expect(p.dataset.matrix[1]![2]).toBe(0);
  });

  it('sets a whole row', () => {
    const after = setRow(base(), 0, [0, 0, 0] as Cell[]);
    expect(after.dataset.matrix[0]).toEqual([0, 0, 0]);
  });

  it('feeds straight back into scoring', () => {
    // An edit has to change the numbers, or the editor is decorative.
    const before = new Glottometry(base().dataset, 'half').subgroups();
    const edited = setCell(base(), 1, 0, 1);   // make row 2 an A+B innovation
    const after = new Glottometry(edited.dataset, 'half').subgroups();
    expect(after).not.toEqual(before);
  });
});

describe('innovations', () => {
  it('appends a blank row with unknown cells', () => {
    const after = addInnovation(base(), 'ISC: three');
    expect(after.dataset.innovations).toHaveLength(3);
    expect(after.dataset.matrix[2]).toEqual([null, null, null]);
    expect(isBlank(after.innovationMeta![2]!)).toBe(true);
  });

  it('inserts at a position', () => {
    const after = addInnovation(base(), 'inserted', 0);
    expect(after.dataset.innovations[0]).toBe('inserted');
    expect(after.dataset.matrix[1]).toEqual([1, 1, 0]);
  });

  it('keeps metadata aligned when inserting', () => {
    let p = updateMeta(base(), 0, { gloss: 'first' });
    p = addInnovation(p, 'inserted', 0);
    expect(p.innovationMeta![1]!.gloss).toBe('first');
    expect(p.innovationMeta![0]!.gloss).toBeUndefined();
  });

  it('gives every innovation a distinct id', () => {
    let p = base();
    for (let i = 0; i < 5; i++) p = addInnovation(p, `row ${i}`);
    const ids = p.innovationMeta!.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('removes a row from matrix, labels and metadata together', () => {
    let p = updateMeta(base(), 1, { gloss: 'second' });
    p = removeInnovation(p, 0);
    expect(p.dataset.innovations).toEqual(['Lex: two']);
    expect(p.dataset.matrix).toHaveLength(1);
    expect(p.innovationMeta).toHaveLength(1);
    expect(p.innovationMeta![0]!.gloss).toBe('second');
  });

  it('drops ordering links to a deleted innovation', () => {
    // A row that no longer exists cannot still be ordered against.
    let p = base();
    const deletedId = p.innovationMeta![0]!.id;
    p = updateMeta(p, 1, { precedes: [deletedId, 'other'] });
    p = removeInnovation(p, 0);
    expect(p.innovationMeta![0]!.precedes).toEqual(['other']);
  });

  it('ignores an out-of-range removal', () => {
    const p = base();
    expect(removeInnovation(p, 99)).toBe(p);
  });

  it('renames without disturbing the data', () => {
    const after = renameInnovation(base(), 0, 'ISC: renamed');
    expect(after.dataset.innovations[0]).toBe('ISC: renamed');
    expect(after.dataset.matrix).toEqual(base().dataset.matrix);
  });

  it('never lets metadata overwrite an id', () => {
    const before = base();
    const after = updateMeta(before, 0, { id: 'hijacked' } as never);
    expect(after.innovationMeta![0]!.id).toBe(before.innovationMeta![0]!.id);
  });
});

describe('adding a language', () => {
  it('adds a column of unknowns', () => {
    const after = addLanguage(base(), 'D');
    expect(after.dataset.languages).toEqual(['A', 'B', 'C', 'D']);
    expect(after.dataset.matrix[0]).toEqual([1, 1, 0, null]);
  });

  it('inserts at a position', () => {
    const after = addLanguage(base(), 'D', 1);
    expect(after.dataset.languages).toEqual(['A', 'D', 'B', 'C']);
    expect(after.dataset.matrix[0]).toEqual([1, null, 1, 0]);
  });

  it('avoids colliding with an existing label', () => {
    // Labels key coordinates, positions and reflexes, so duplicates would make
    // those references ambiguous.
    const after = addLanguage(base(), 'A');
    expect(after.dataset.languages).toEqual(['A', 'B', 'C', 'A 2']);
  });
});

describe('removing a language', () => {
  const removed = () => {
    let p = updateMeta(base(), 0, { reflexes: { A: 'mɪjɪt', B: 'məlit', C: 'mɛlɛt' } });
    return removeLanguage(p, 0);   // drop A
  };

  it('drops the column', () => {
    const p = removed();
    expect(p.dataset.languages).toEqual(['B', 'C']);
    expect(p.dataset.matrix[0]).toEqual([1, 0]);
  });

  it('drops its coordinates', () => {
    expect(removed().coordinates).toEqual({ B: { lat: 2, lon: 2 }, C: { lat: 3, lon: 3 } });
  });

  it('drops it from the manual order and positions', () => {
    const p = removed();
    expect(p.manualOrder).toEqual(['C', 'B']);
    expect(p.manualPositions).toEqual({ C: [30, 40] });
  });

  it('drops its reflexes — the reference it is easiest to forget', () => {
    expect(removed().innovationMeta![0]!.reflexes).toEqual({ B: 'məlit', C: 'mɛlɛt' });
  });

  it('refuses to remove the last language', () => {
    let p = removeLanguage(base(), 0);
    p = removeLanguage(p, 0);
    const final = removeLanguage(p, 0);
    expect(final.dataset.languages).toHaveLength(1);
  });
});

describe('renaming a language', () => {
  const renamed = () => {
    const p = updateMeta(base(), 0, { reflexes: { A: 'mɪjɪt', B: 'məlit' } });
    return renameLanguage(p, 0, 'Hiw');
  };

  it('renames the column', () => {
    expect(renamed().dataset.languages).toEqual(['Hiw', 'B', 'C']);
  });

  it('carries coordinates, order, positions and reflexes across', () => {
    const p = renamed();
    expect(p.coordinates!.Hiw).toEqual({ lat: 1, lon: 1 });
    expect(p.coordinates!.A).toBeUndefined();
    expect(p.manualOrder).toEqual(['C', 'Hiw', 'B']);
    expect(p.manualPositions).toEqual({ Hiw: [10, 20], C: [30, 40] });
    expect(p.innovationMeta![0]!.reflexes).toEqual({ Hiw: 'mɪjɪt', B: 'məlit' });
  });

  it('leaves the matrix untouched', () => {
    expect(renamed().dataset.matrix).toEqual(base().dataset.matrix);
  });

  it('refuses a duplicate or empty name', () => {
    const p = base();
    expect(renameLanguage(p, 0, 'B')).toBe(p);
    expect(renameLanguage(p, 0, '   ')).toBe(p);
    expect(renameLanguage(p, 0, 'A')).toBe(p);
  });

  it('trims surrounding whitespace', () => {
    expect(renameLanguage(base(), 0, '  Hiw  ').dataset.languages[0]).toBe('Hiw');
  });
});

describe('reconcile', () => {
  it('pads a short metadata array', () => {
    expect(reconcile([], 3)).toHaveLength(3);
  });

  it('truncates a long one', () => {
    expect(reconcile(reconcile([], 5), 2)).toHaveLength(2);
  });

  it('leaves a matching one alone', () => {
    const meta = reconcile([], 3);
    expect(reconcile(meta, 3)).toEqual(meta);
  });
});

describe('building a dataset from scratch', () => {
  it('goes from empty to scorable', () => {
    // The Phase 3 acceptance criterion, in miniature.
    let p = createProject('new', blankDataset(3));
    expect(p.dataset.innovations).toHaveLength(0);

    p = addInnovation(p, 'ISC: first');
    p = setRow(p, 0, [1, 1, 0]);
    p = addInnovation(p, 'ISC: second');
    p = setRow(p, 1, [1, 1, 0]);
    p = addInnovation(p, 'Lex: third');
    p = setRow(p, 2, [0, 1, 1]);

    const subgroups = new Glottometry(p.dataset, 'half').subgroups();
    const ab = subgroups.find((s) => s.members.join() === '0,1');
    expect(ab).toBeDefined();
    expect(ab!.epsilon).toBeCloseTo(2, 9);
  });
});
