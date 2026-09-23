/**
 * Undo/redo over a single immutable state object.
 *
 * Snapshots rather than diffs. A project is a shallow object whose bulk — the
 * dataset — is shared by reference and never mutated, so a snapshot costs a
 * handful of fields and the simpler model wins.
 *
 * The real design problem is coalescing. A drag fires an edit per pointer
 * move, and the threshold slider one per step; without merging, reversing a
 * single gesture would take fifty undos. Two mechanisms handle it:
 *
 *   - a **coalesce key**: consecutive edits sharing one (`move:3`, `minSigma`)
 *     collapse into a single entry, so a whole drag is one undo;
 *   - a **recency window**, so returning to the same node minutes later starts
 *     a fresh entry rather than silently extending the old one.
 *
 * `seal` closes the current entry explicitly, which is what a pointer-up
 * should do: the window is a fallback for edits with no natural end, not the
 * primary signal.
 */

import { useCallback, useMemo, useReducer } from 'react';

/** How long consecutive same-key edits keep merging. */
export const COALESCE_WINDOW_MS = 700;

export interface Snapshot<T> {
  state: T;
  /** Shown to the user as "undo <label>". */
  label: string;
  /** Consecutive edits sharing a key merge into one entry. */
  key?: string;
  at: number;
}

export interface History<T> {
  past: Snapshot<T>[];
  present: Snapshot<T>;
  future: Snapshot<T>[];
  limit: number;
}

export type HistoryAction<T> =
  | { type: 'set'; updater: (prev: T) => T; label: string; key?: string; at?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'seal' }
  | { type: 'reset'; state: T; label?: string };

export function createHistory<T>(state: T, limit = 100): History<T> {
  return {
    past: [],
    present: { state, label: 'open', at: 0 },
    future: [],
    limit,
  };
}

export function historyReducer<T>(history: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case 'set': {
      const at = action.at ?? Date.now();
      const next = action.updater(history.present.state);
      if (Object.is(next, history.present.state)) return history;

      const previous = history.present;
      const mergeable =
        action.key !== undefined &&
        previous.key === action.key &&
        at - previous.at < COALESCE_WINDOW_MS;

      if (mergeable) {
        // Replace the open entry, keeping its original label so the user sees
        // "undo move ⓁK" rather than the label of the final pointer move.
        return {
          ...history,
          present: { ...previous, state: next, at },
          future: [],
        };
      }

      const past = [...history.past, previous];
      // Oldest entries fall off the end rather than growing without bound.
      while (past.length > history.limit) past.shift();

      return {
        ...history,
        past,
        present: { state: next, label: action.label, key: action.key, at },
        future: [],
      };
    }

    case 'undo': {
      const previous = history.past[history.past.length - 1];
      if (!previous) return history;
      return {
        ...history,
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      };
    }

    case 'redo': {
      const next = history.future[0];
      if (!next) return history;
      return {
        ...history,
        past: [...history.past, history.present],
        present: next,
        future: history.future.slice(1),
      };
    }

    case 'seal':
      // Close the current entry so the next edit cannot merge into it, even
      // with the same key and inside the window.
      return history.present.key === undefined
        ? history
        : { ...history, present: { ...history.present, key: undefined } };

    case 'reset':
      // Opening a different file is a context switch, not an edit: undoing
      // back into the previous dataset would be more confusing than useful.
      return createHistory(action.state, history.limit);
  }
}

export interface UseHistory<T> {
  state: T;
  set: (updater: (prev: T) => T, label: string, coalesceKey?: string) => void;
  seal: () => void;
  reset: (state: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Label of the edit undo would reverse, for the button tooltip. */
  undoLabel: string | null;
  redoLabel: string | null;
}

export function useHistory<T>(initial: T, limit = 100): UseHistory<T> {
  const [history, dispatch] = useReducer(
    historyReducer as (h: History<T>, a: HistoryAction<T>) => History<T>,
    undefined,
    () => createHistory(initial, limit),
  );

  const set = useCallback(
    (updater: (prev: T) => T, label: string, coalesceKey?: string) =>
      dispatch({ type: 'set', updater, label, key: coalesceKey }),
    [],
  );

  return useMemo(() => ({
    state: history.present.state,
    set,
    seal: () => dispatch({ type: 'seal' }),
    reset: (state: T) => dispatch({ type: 'reset', state }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoLabel: history.present.label === 'open' ? null : history.present.label,
    redoLabel: history.future[0]?.label ?? null,
  }), [history, set]);
}
