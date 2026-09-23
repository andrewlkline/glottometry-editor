/**
 * Editing operations on a project.
 *
 * Every one is Project → Project and pure, so they compose with the undo
 * history without special handling.
 *
 * They exist as a layer of their own because a language is referenced from
 * five places — the matrix columns, the coordinates, the manual order, the
 * manual positions, and every innovation's reflexes — and renaming or deleting
 * one has to reach all of them. Doing that at the call site would guarantee
 * that some caller eventually forgets the reflexes and leaves orphaned keys
 * behind.
 */

import type { Cell, Dataset } from '../core/types.js';
import type { Project } from './project.js';
import { emptyMeta, reconcile, type InnovationMeta } from './innovationMeta.js';

/** Cells cycle 1 → 0 → unknown, which is the order a coder works in. */
export function nextCellValue(current: Cell): Cell {
  if (current === 1) return 0;
  if (current === 0) return null;
  return 1;
}

export function setCell(
  project: Project, row: number, column: number, value: Cell,
): Project {
  const matrix = project.dataset.matrix.map((r, i) =>
    (i === row ? r.map((c, j) => (j === column ? value : c)) : r));
  return { ...project, dataset: { ...project.dataset, matrix } };
}

export function cycleCell(project: Project, row: number, column: number): Project {
  const current = project.dataset.matrix[row]?.[column] ?? null;
  return setCell(project, row, column, nextCellValue(current));
}

/** Set a whole row at once — used by "mark all", and by paste later. */
export function setRow(project: Project, row: number, values: Cell[]): Project {
  const matrix = project.dataset.matrix.map((r, i) => (i === row ? [...values] : r));
  return { ...project, dataset: { ...project.dataset, matrix } };
}

export function renameInnovation(project: Project, row: number, label: string): Project {
  const innovations = project.dataset.innovations.map((l, i) => (i === row ? label : l));
  return { ...project, dataset: { ...project.dataset, innovations } };
}

export function updateMeta(
  project: Project, row: number, changes: Partial<InnovationMeta>,
): Project {
  const meta = reconcile(project.innovationMeta, project.dataset.innovations.length);
  const next = meta.map((m, i) => (i === row ? { ...m, ...changes, id: m.id } : m));
  return { ...project, innovationMeta: next };
}

/** Insert a blank innovation, by default at the end. */
export function addInnovation(
  project: Project, label = 'new innovation', at?: number,
): Project {
  const { dataset } = project;
  const index = at ?? dataset.innovations.length;
  const blank: Cell[] = new Array(dataset.languages.length).fill(null);

  const innovations = [...dataset.innovations];
  innovations.splice(index, 0, label);
  const matrix = [...dataset.matrix];
  matrix.splice(index, 0, blank);

  const meta = reconcile(project.innovationMeta, dataset.innovations.length);
  meta.splice(index, 0, emptyMeta());

  return { ...project, dataset: { ...dataset, innovations, matrix }, innovationMeta: meta };
}

export function removeInnovation(project: Project, row: number): Project {
  const { dataset } = project;
  if (row < 0 || row >= dataset.innovations.length) return project;

  const meta = reconcile(project.innovationMeta, dataset.innovations.length);
  const removedId = meta[row]!.id;
  const remaining = meta.filter((_, i) => i !== row);

  return {
    ...project,
    dataset: {
      ...dataset,
      innovations: dataset.innovations.filter((_, i) => i !== row),
      matrix: dataset.matrix.filter((_, i) => i !== row),
    },
    // A deleted innovation cannot still be ordered against.
    innovationMeta: remaining.map((m) =>
      (m.precedes?.includes(removedId)
        ? { ...m, precedes: m.precedes.filter((id) => id !== removedId) }
        : m)),
  };
}

/** A label that does not collide with an existing language. */
function uniqueLabel(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function addLanguage(project: Project, label = 'new', at?: number): Project {
  const { dataset } = project;
  const name = uniqueLabel(dataset.languages, label);
  const index = at ?? dataset.languages.length;

  const languages = [...dataset.languages];
  languages.splice(index, 0, name);
  const matrix = dataset.matrix.map((row) => {
    const next = [...row];
    next.splice(index, 0, null);
    return next;
  });

  return { ...project, dataset: { ...dataset, languages, matrix } };
}

/**
 * Remove a language, and everything keyed by its name.
 *
 * Coordinates, manual positions, the manual order and every reflex all
 * reference the label, so all of them have to be cleaned up together.
 */
export function removeLanguage(project: Project, column: number): Project {
  const { dataset } = project;
  const label = dataset.languages[column];
  if (label === undefined || dataset.languages.length <= 1) return project;

  const coordinates = project.coordinates ? { ...project.coordinates } : undefined;
  if (coordinates) delete coordinates[label];

  const manualPositions = project.manualPositions
    ? { ...project.manualPositions } : undefined;
  if (manualPositions) delete manualPositions[label];

  return {
    ...project,
    dataset: {
      ...dataset,
      languages: dataset.languages.filter((_, i) => i !== column),
      matrix: dataset.matrix.map((row) => row.filter((_, i) => i !== column)),
    },
    coordinates,
    manualPositions,
    manualOrder: project.manualOrder?.filter((l) => l !== label),
    innovationMeta: project.innovationMeta?.map((m) => {
      if (!m.reflexes || !(label in m.reflexes)) return m;
      const reflexes = { ...m.reflexes };
      delete reflexes[label];
      return { ...m, reflexes };
    }),
  };
}

/** Rename a language, carrying every label-keyed reference across with it. */
export function renameLanguage(project: Project, column: number, label: string): Project {
  const { dataset } = project;
  const previous = dataset.languages[column];
  const name = label.trim();
  if (previous === undefined || !name || name === previous) return project;
  if (dataset.languages.includes(name)) return project;   // labels must stay unique

  const move = <T>(record: Record<string, T> | undefined) => {
    if (!record || !(previous in record)) return record;
    const next = { ...record };
    next[name] = next[previous]!;
    delete next[previous];
    return next;
  };

  return {
    ...project,
    dataset: {
      ...dataset,
      languages: dataset.languages.map((l, i) => (i === column ? name : l)),
    },
    coordinates: move(project.coordinates),
    manualPositions: move(project.manualPositions),
    manualOrder: project.manualOrder?.map((l) => (l === previous ? name : l)),
    innovationMeta: project.innovationMeta?.map((m) =>
      (m.reflexes && previous in m.reflexes ? { ...m, reflexes: move(m.reflexes)! } : m)),
  };
}

/** An empty dataset to start a project from scratch. */
export function blankDataset(languageCount = 3): Dataset {
  return {
    languages: Array.from({ length: languageCount }, (_, i) =>
      String.fromCharCode(65 + i)),
    innovations: [],
    matrix: [],
  };
}
