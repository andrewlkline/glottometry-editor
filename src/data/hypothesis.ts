/**
 * Hypotheses as stored in a project: named sets of subgroups, linkages and
 * contact zones over the languages.
 *
 * Members are stored by language label, like manual order and coordinates, so
 * a hypothesis survives reordering and re-import; the edit operations in
 * edit.ts carry renames and deletions through. `core/hypothesis.ts` works on
 * indices and does the analysis.
 *
 * A project can hold several hypotheses because the point is comparison:
 * Kaufman (2026: 6–7) stresses that such diagrams "are merely hypotheses in
 * competition with many other possibilities", and his (4) and (5) are two
 * readings of the same four languages.
 */

import type { GroupSpec, RelationKind } from '../core/hypothesis.js';
import { RELATION_KINDS } from '../core/hypothesis.js';
import type { Project } from './project.js';

export interface HypothesisGroup {
  id: string;
  name: string;
  kind: RelationKind;
  /** Language labels. */
  members: string[];
  notes?: string;
}

export interface Hypothesis {
  id: string;
  name: string;
  groups: HypothesisGroup[];
  notes?: string;
}

let counter = 0;

/** Unique within a project, stable across a save. */
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function activeHypothesis(project: Project): Hypothesis | null {
  const all = project.hypotheses ?? [];
  return all.find((h) => h.id === project.activeHypothesis) ?? all[0] ?? null;
}

function mapHypothesis(
  project: Project, id: string, fn: (h: Hypothesis) => Hypothesis,
): Project {
  return {
    ...project,
    hypotheses: (project.hypotheses ?? []).map((h) => (h.id === id ? fn(h) : h)),
  };
}

export function addHypothesis(project: Project, name: string): Project {
  const h: Hypothesis = { id: newId('h'), name, groups: [] };
  return {
    ...project,
    hypotheses: [...(project.hypotheses ?? []), h],
    activeHypothesis: h.id,
  };
}

/** A copy, to try an alternative without losing the original. */
export function duplicateHypothesis(project: Project, id: string, name: string): Project {
  const source = (project.hypotheses ?? []).find((h) => h.id === id);
  if (!source) return project;
  const copy: Hypothesis = {
    ...source,
    id: newId('h'),
    name,
    groups: source.groups.map((g) => ({ ...g, id: newId('g'), members: [...g.members] })),
  };
  return {
    ...project,
    hypotheses: [...(project.hypotheses ?? []), copy],
    activeHypothesis: copy.id,
  };
}

export function renameHypothesis(project: Project, id: string, name: string): Project {
  return mapHypothesis(project, id, (h) => ({ ...h, name }));
}

export function removeHypothesis(project: Project, id: string): Project {
  const hypotheses = (project.hypotheses ?? []).filter((h) => h.id !== id);
  return {
    ...project,
    hypotheses,
    activeHypothesis: project.activeHypothesis === id
      ? hypotheses[0]?.id
      : project.activeHypothesis,
  };
}

export function setActiveHypothesis(project: Project, id: string): Project {
  return { ...project, activeHypothesis: id };
}

export function addGroup(
  project: Project,
  hypothesisId: string,
  group: Omit<HypothesisGroup, 'id'>,
): { project: Project; id: string } {
  const id = newId('g');
  return {
    project: mapHypothesis(project, hypothesisId, (h) => ({
      ...h, groups: [...h.groups, { ...group, id }],
    })),
    id,
  };
}

export function updateGroup(
  project: Project,
  hypothesisId: string,
  groupId: string,
  changes: Partial<Omit<HypothesisGroup, 'id'>>,
): Project {
  return mapHypothesis(project, hypothesisId, (h) => ({
    ...h,
    groups: h.groups.map((g) => (g.id === groupId ? { ...g, ...changes } : g)),
  }));
}

export function removeGroup(project: Project, hypothesisId: string, groupId: string): Project {
  return mapHypothesis(project, hypothesisId, (h) => ({
    ...h, groups: h.groups.filter((g) => g.id !== groupId),
  }));
}

/**
 * Groups as the analysis needs them: member indices, in language order.
 * Labels no longer in the dataset are dropped and reported, not guessed at.
 */
export function resolveGroups(
  hypothesis: Hypothesis,
  languages: string[],
): { specs: GroupSpec[]; unknown: { groupId: string; labels: string[] }[] } {
  const index = new Map(languages.map((l, i) => [l, i]));
  const unknown: { groupId: string; labels: string[] }[] = [];
  const specs = hypothesis.groups.map((g) => {
    const missing = g.members.filter((m) => !index.has(m));
    if (missing.length > 0) unknown.push({ groupId: g.id, labels: missing });
    return {
      id: g.id,
      kind: g.kind,
      members: g.members
        .filter((m) => index.has(m))
        .map((m) => index.get(m)!)
        .sort((a, b) => a - b),
    };
  });
  return { specs, unknown };
}

// ---------------------------------------------------------------------------
// Cascades from language edits

export function renameLanguageInHypotheses(
  hypotheses: Hypothesis[] | undefined, from: string, to: string,
): Hypothesis[] | undefined {
  return hypotheses?.map((h) => ({
    ...h,
    groups: h.groups.map((g) => ({
      ...g, members: g.members.map((m) => (m === from ? to : m)),
    })),
  }));
}

export function removeLanguageFromHypotheses(
  hypotheses: Hypothesis[] | undefined, label: string,
): Hypothesis[] | undefined {
  return hypotheses?.map((h) => ({
    ...h,
    groups: h.groups.map((g) => ({ ...g, members: g.members.filter((m) => m !== label) })),
  }));
}

// ---------------------------------------------------------------------------
// Loading

/** Accept what is well-formed in a saved file and drop the rest. */
export function sanitizeHypotheses(raw: unknown): Hypothesis[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const out: Hypothesis[] = [];
  for (const h of raw) {
    if (typeof h !== 'object' || h === null) continue;
    const o = h as Record<string, unknown>;
    const id = str(o.id);
    if (!id) continue;
    const groups: HypothesisGroup[] = [];
    for (const g of Array.isArray(o.groups) ? o.groups : []) {
      if (typeof g !== 'object' || g === null) continue;
      const go = g as Record<string, unknown>;
      const gid = str(go.id);
      const kind = str(go.kind) as RelationKind | undefined;
      if (!gid || !kind || !RELATION_KINDS.includes(kind)) continue;
      groups.push({
        id: gid,
        name: str(go.name) ?? '',
        kind,
        members: Array.isArray(go.members) ? go.members.filter((m): m is string => typeof m === 'string') : [],
        notes: str(go.notes),
      });
    }
    out.push({ id, name: str(o.name) ?? 'hypothesis', groups, notes: str(o.notes) });
  }
  return out;
}
