/**
 * Undo/redo, and especially coalescing.
 *
 * Coalescing is the part that fails quietly: get it wrong in one direction and
 * a single drag costs fifty undos, wrong in the other and one undo throws away
 * work the user did minutes apart. Timestamps are injected so the window is
 * tested directly rather than with sleeps.
 */

import { describe, it, expect } from 'vitest';
import {
  COALESCE_WINDOW_MS, createHistory, historyReducer,
  type History, type HistoryAction,
} from '../src/ui/history.js';

interface State { value: number; other?: string }

const start = (value = 0, limit = 100): History<State> =>
  createHistory<State>({ value }, limit);

const apply = (h: History<State>, ...actions: HistoryAction<State>[]) =>
  actions.reduce(historyReducer<State>, h);

const set = (
  value: number, label: string, key?: string, at?: number,
): HistoryAction<State> => ({
  type: 'set', updater: (p) => ({ ...p, value }), label, key, at,
});

describe('basic undo and redo', () => {
  it('starts with nothing to undo', () => {
    const h = start();
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
  });

  it('walks back and forward through edits', () => {
    let h = apply(start(), set(1, 'a'), set(2, 'b'), set(3, 'c'));
    expect(h.present.state.value).toBe(3);

    h = historyReducer(h, { type: 'undo' });
    expect(h.present.state.value).toBe(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.state.value).toBe(1);

    h = historyReducer(h, { type: 'redo' });
    expect(h.present.state.value).toBe(2);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.state.value).toBe(3);
  });

  it('returns all the way to the initial state', () => {
    let h = apply(start(7), set(1, 'a'), set(2, 'b'));
    h = apply(h, { type: 'undo' }, { type: 'undo' });
    expect(h.present.state.value).toBe(7);
    expect(h.past).toHaveLength(0);
  });

  it('is a no-op at either end', () => {
    const h = start();
    expect(historyReducer(h, { type: 'undo' })).toBe(h);
    expect(historyReducer(h, { type: 'redo' })).toBe(h);
  });

  it('discards the redo stack once a new edit lands', () => {
    let h = apply(start(), set(1, 'a'), set(2, 'b'));
    h = historyReducer(h, { type: 'undo' });
    expect(h.future).toHaveLength(1);
    h = historyReducer(h, set(9, 'c'));
    expect(h.future).toHaveLength(0);
    expect(h.present.state.value).toBe(9);
  });

  it('ignores an edit that changes nothing', () => {
    const h = apply(start(), set(1, 'a'));
    const same = historyReducer(h, { type: 'set', updater: (p) => p, label: 'noop' });
    expect(same).toBe(h);
  });

  it('carries the label of the edit undo would reverse', () => {
    const h = apply(start(), set(1, 'move ⓁA'));
    expect(h.present.label).toBe('move ⓁA');
  });
});

describe('coalescing', () => {
  it('merges a whole drag into one entry', () => {
    // Fifty pointer moves, one undo.
    let h = start();
    for (let i = 1; i <= 50; i++) h = historyReducer(h, set(i, 'move ⓁK', 'move:10', i * 10));
    expect(h.past).toHaveLength(1);
    expect(h.present.state.value).toBe(50);

    h = historyReducer(h, { type: 'undo' });
    expect(h.present.state.value).toBe(0);
  });

  it('keeps the first label rather than the last move', () => {
    let h = historyReducer(start(), set(1, 'move ⓁK', 'move:10', 0));
    h = historyReducer(h, set(2, 'move ⓁK again', 'move:10', 50));
    expect(h.present.label).toBe('move ⓁK');
  });

  it('starts a new entry for a different key', () => {
    let h = historyReducer(start(), set(1, 'move ⓁA', 'move:0', 0));
    h = historyReducer(h, set(2, 'move ⓁB', 'move:1', 10));
    expect(h.past).toHaveLength(2);
  });

  it('starts a new entry once the window lapses', () => {
    // Coming back to the same node minutes later is a separate edit.
    let h = historyReducer(start(), set(1, 'move ⓁA', 'move:0', 0));
    h = historyReducer(h, set(2, 'move ⓁA', 'move:0', COALESCE_WINDOW_MS + 1));
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.state.value).toBe(1);
  });

  it('never merges keyless edits', () => {
    // Discrete actions — hiding a subgroup, switching layout — each stand alone.
    let h = start();
    for (let i = 1; i <= 4; i++) h = historyReducer(h, set(i, `hide ${i}`, undefined, i));
    expect(h.past).toHaveLength(4);
  });

  it('does not merge across an intervening keyless edit', () => {
    let h = historyReducer(start(), set(1, 'move', 'move:0', 0));
    h = historyReducer(h, set(2, 'hide', undefined, 10));
    h = historyReducer(h, set(3, 'move', 'move:0', 20));
    expect(h.past).toHaveLength(3);
  });
});

describe('seal', () => {
  it('stops a later edit merging into a finished gesture', () => {
    // What pointer-up does: the window is a fallback, not the signal.
    let h = historyReducer(start(), set(1, 'move ⓁA', 'move:0', 0));
    h = historyReducer(h, { type: 'seal' });
    h = historyReducer(h, set(2, 'move ⓁA', 'move:0', 10));
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.state.value).toBe(1);
  });

  it('is a no-op when nothing is open', () => {
    const h = apply(start(), set(1, 'a'));
    expect(historyReducer(h, { type: 'seal' })).toBe(h);
  });

  it('leaves the state untouched', () => {
    let h = historyReducer(start(), set(5, 'a', 'k', 0));
    h = historyReducer(h, { type: 'seal' });
    expect(h.present.state.value).toBe(5);
  });
});

describe('reset', () => {
  it('clears history, because opening a file is not an edit', () => {
    let h = apply(start(), set(1, 'a'), set(2, 'b'));
    h = historyReducer(h, { type: 'reset', state: { value: 99 } });
    expect(h.present.state.value).toBe(99);
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
    expect(historyReducer(h, { type: 'undo' })).toBe(h);
  });

  it('keeps the configured limit', () => {
    const h = historyReducer(start(0, 5), { type: 'reset', state: { value: 1 } });
    expect(h.limit).toBe(5);
  });
});

describe('the limit', () => {
  it('drops the oldest entries rather than growing without bound', () => {
    let h = start(0, 10);
    for (let i = 1; i <= 40; i++) h = historyReducer(h, set(i, `edit ${i}`, undefined, i));
    expect(h.past).toHaveLength(10);
    expect(h.present.state.value).toBe(40);
  });

  it('still undoes as far as it has kept', () => {
    let h = start(0, 3);
    for (let i = 1; i <= 10; i++) h = historyReducer(h, set(i, `e${i}`, undefined, i));
    for (let i = 0; i < 3; i++) h = historyReducer(h, { type: 'undo' });
    expect(h.present.state.value).toBe(7);
    expect(historyReducer(h, { type: 'undo' })).toBe(h);
  });
});

describe('snapshots share unchanged structure', () => {
  it('does not deep-copy the state', () => {
    // A project snapshot must stay cheap: the dataset is the bulk of it and is
    // shared by reference, never cloned.
    const shared = { big: 'dataset' };
    type WithRef = { value: number; ref: typeof shared };
    let h = createHistory<WithRef>({ value: 0, ref: shared });
    h = historyReducer<WithRef>(h, {
      type: 'set', updater: (p) => ({ ...p, value: 1 }), label: 'edit',
    });
    expect(h.present.state.ref).toBe(shared);
    expect(h.past[0]!.state.ref).toBe(shared);
  });
});
