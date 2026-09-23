/**
 * The `.glot.json` project file.
 *
 * One file holding the dataset, the settings, and every manual adjustment, so
 * a diagram you tuned last month reopens exactly as you left it. This is what
 * makes the tool a replacement for "export an SVG and fix it in Illustrator"
 * rather than another way to generate one: the fixes live in the project and
 * survive a change of threshold, policy or data.
 *
 * Manual positions are keyed by language *label*, not column index, so the
 * file still applies after a column is inserted or the dataset is re-exported
 * in a different order.
 */

import type { Cell, Dataset, NaPolicy, StrengthMeasure } from '../core/types.js';
import type { InnovationType } from '../core/innovationTypes.js';
import type { LayoutKind } from '../core/layout.js';
import type { LanguageCoordinates } from './maramaCsv.js';

export const PROJECT_VERSION = 1;

export interface ProjectSettings {
  policy: NaPolicy;
  layoutKind: LayoutKind;
  /** Which measure the display threshold applies to. */
  measure: StrengthMeasure;
  /** Threshold on that measure. */
  minStrength: number;
  /** Innovation types included in scoring; undefined means all of them. */
  enabledTypes?: InnovationType[];
  /** Per-type multipliers. Undefined means unweighted, which is the default. */
  typeWeights?: Partial<Record<InnovationType, number>>;
}

export interface Project {
  version: number;
  name: string;
  dataset: Dataset;
  coordinates?: LanguageCoordinates;
  settings: ProjectSettings;
  /** Chain layout: the language order the user settled on, by label. */
  manualOrder?: string[];
  /** 2-D layouts: positions the user dragged nodes to, by label. */
  manualPositions?: Record<string, [number, number]>;
  /** Subgroup keys (comma-joined member indices) the user hid. */
  hidden?: string[];
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  policy: 'half',
  layoutKind: 'chain',
  measure: 'sigma',
  minStrength: 1,
};

export function createProject(
  name: string,
  dataset: Dataset,
  coordinates?: LanguageCoordinates,
): Project {
  return { version: PROJECT_VERSION, name, dataset, settings: { ...DEFAULT_SETTINGS }, coordinates };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

class ProjectError extends Error {}

/**
 * Parse a project file, rejecting anything that would fail confusingly later.
 *
 * Validation is deliberately strict about shape and lenient about extras: a
 * file written by a newer version may carry fields this build ignores, but a
 * malformed matrix should fail here with a readable message rather than
 * somewhere deep in the scorer.
 */
export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError('Not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new ProjectError('Project file must be a JSON object.');
  }

  const obj = raw as Record<string, unknown>;
  const dataset = obj.dataset as Dataset | undefined;
  if (!dataset || !Array.isArray(dataset.languages) || !Array.isArray(dataset.matrix)) {
    throw new ProjectError('Project file has no dataset.');
  }
  if (dataset.languages.length === 0) {
    throw new ProjectError('Dataset has no languages.');
  }
  for (const row of dataset.matrix) {
    if (!Array.isArray(row) || row.length !== dataset.languages.length) {
      throw new ProjectError(
        `Every matrix row must have ${dataset.languages.length} cells, one per language.`,
      );
    }
  }

  const innovations = Array.isArray(dataset.innovations)
    ? dataset.innovations
    : dataset.matrix.map((_, i) => `innovation ${i + 1}`);

  const stored = (obj.settings ?? {}) as Partial<ProjectSettings> & { minSigma?: number };
  // Projects written before the measure was configurable stored `minSigma`.
  const settings: Partial<ProjectSettings> = { ...stored };
  if (settings.minStrength === undefined && typeof stored.minSigma === 'number') {
    settings.minStrength = stored.minSigma;
    settings.measure = 'sigma';
  }
  delete (settings as { minSigma?: number }).minSigma;

  return {
    version: typeof obj.version === 'number' ? obj.version : PROJECT_VERSION,
    name: typeof obj.name === 'string' && obj.name ? obj.name : 'untitled',
    dataset: {
      languages: dataset.languages,
      innovations,
      matrix: dataset.matrix.map((row) =>
        row.map((c) => (c === 1 || c === 0 ? c : null) as Cell),
      ),
    },
    coordinates: obj.coordinates as LanguageCoordinates | undefined,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    manualOrder: Array.isArray(obj.manualOrder) ? (obj.manualOrder as string[]) : undefined,
    manualPositions: (obj.manualPositions ?? undefined) as Project['manualPositions'],
    hidden: Array.isArray(obj.hidden) ? (obj.hidden as string[]) : undefined,
  };
}

/**
 * Resolve a saved order of labels back to column indices.
 *
 * Labels the dataset no longer has are dropped, and languages the saved order
 * did not mention are appended, so an edited dataset degrades to a partial
 * match instead of throwing away the arrangement entirely.
 */
export function resolveOrder(
  manualOrder: string[] | undefined,
  languages: string[],
): number[] | null {
  if (!manualOrder) return null;
  const byLabel = new Map(languages.map((l, i) => [l, i]));
  const seen = new Set<number>();
  const order: number[] = [];
  for (const label of manualOrder) {
    const index = byLabel.get(label);
    if (index !== undefined && !seen.has(index)) {
      order.push(index);
      seen.add(index);
    }
  }
  for (let i = 0; i < languages.length; i++) if (!seen.has(i)) order.push(i);
  return order.length === languages.length ? order : null;
}

/** Trigger a download of the project file. Browser-only. */
export function downloadProject(project: Project): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name}.glot.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
