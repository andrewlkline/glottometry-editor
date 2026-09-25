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

import type { Assignment, GroupSpec, RelationKind } from '../core/hypothesis.js';
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

/** The analyst's explanation of one innovation within a hypothesis. */
export interface StoredAssignment {
  groupId: string;
  /** Language labels in which the innovation is claimed to have been lost. */
  lostIn?: string[];
}

export interface Hypothesis {
  id: string;
  name: string;
  groups: HypothesisGroup[];
  /**
   * Keyed by innovation id (InnovationMeta.id), so assignments survive
   * relabelling and reordering of innovations. Per hypothesis: the same
   * innovation is inherited in one reading and borrowed in another.
   */
  assignments?: Record<string, StoredAssignment>;
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
    groups: [],
    assignments: undefined,
  };
  // Fresh group ids, and assignments carried across to them.
  const idMap = new Map<string, string>();
  copy.groups = source.groups.map((g) => {
    const id = newId('g');
    idMap.set(g.id, id);
    return { ...g, id, members: [...g.members] };
  });
  if (source.assignments) {
    copy.assignments = Object.fromEntries(
      Object.entries(source.assignments)
        .filter(([, a]) => idMap.has(a.groupId))
        .map(([k, a]) => [k, { ...a, groupId: idMap.get(a.groupId)!, lostIn: a.lostIn?.slice() }]),
    );
  }
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

/** Removing a group also drops what was assigned to it. */
export function removeGroup(project: Project, hypothesisId: string, groupId: string): Project {
  return mapHypothesis(project, hypothesisId, (h) => ({
    ...h,
    groups: h.groups.filter((g) => g.id !== groupId),
    assignments: h.assignments && Object.fromEntries(
      Object.entries(h.assignments).filter(([, a]) => a.groupId !== groupId),
    ),
  }));
}

/**
 * Explain an innovation by a group, optionally with losses; `null` clears the
 * assignment, handing it back to the computed explanation.
 */
export function assignInnovation(
  project: Project,
  hypothesisId: string,
  innovationId: string,
  assignment: StoredAssignment | null,
): Project {
  return mapHypothesis(project, hypothesisId, (h) => {
    const assignments = { ...(h.assignments ?? {}) };
    if (assignment) {
      assignments[innovationId] = {
        groupId: assignment.groupId,
        ...(assignment.lostIn?.length ? { lostIn: assignment.lostIn.slice() } : {}),
      };
    } else {
      delete assignments[innovationId];
    }
    return { ...h, assignments };
  });
}

/** Drop assignments for innovations that no longer exist. */
export function forgetInnovation(
  hypotheses: Hypothesis[] | undefined, innovationId: string,
): Hypothesis[] | undefined {
  return hypotheses?.map((h) => {
    if (!h.assignments || !(innovationId in h.assignments)) return h;
    const assignments = { ...h.assignments };
    delete assignments[innovationId];
    return { ...h, assignments };
  });
}

/**
 * Assignments as the analysis needs them: by row of the analysed dataset,
 * with losses as language indices. Assignments to groups that no longer exist
 * are left out and counted.
 */
export function resolveAssignments(
  hypothesis: Hypothesis,
  /** Innovation id of each row of the analysed dataset. */
  rowIds: (string | undefined)[],
  languages: string[],
): { assignmentOf: (row: number) => Assignment | undefined; stale: number } {
  const groupIds = new Set(hypothesis.groups.map((g) => g.id));
  const index = new Map(languages.map((l, i) => [l, i]));
  const byId = hypothesis.assignments ?? {};
  let stale = 0;
  const resolved = rowIds.map((id) => {
    const a = id ? byId[id] : undefined;
    if (!a) return undefined;
    if (!groupIds.has(a.groupId)) {
      stale++;
      return undefined;
    }
    return {
      groupId: a.groupId,
      lostIn: (a.lostIn ?? []).filter((l) => index.has(l)).map((l) => index.get(l)!),
    };
  });
  return { assignmentOf: (row) => resolved[row], stale };
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

function mapLosses(
  h: Hypothesis, fn: (lostIn: string[]) => string[],
): Hypothesis['assignments'] {
  return h.assignments && Object.fromEntries(
    Object.entries(h.assignments).map(([k, a]) => [k, a.lostIn ? { ...a, lostIn: fn(a.lostIn) } : a]),
  );
}

export function renameLanguageInHypotheses(
  hypotheses: Hypothesis[] | undefined, from: string, to: string,
): Hypothesis[] | undefined {
  const swap = (m: string) => (m === from ? to : m);
  return hypotheses?.map((h) => ({
    ...h,
    groups: h.groups.map((g) => ({ ...g, members: g.members.map(swap) })),
    assignments: mapLosses(h, (lost) => lost.map(swap)),
  }));
}

export function removeLanguageFromHypotheses(
  hypotheses: Hypothesis[] | undefined, label: string,
): Hypothesis[] | undefined {
  return hypotheses?.map((h) => ({
    ...h,
    groups: h.groups.map((g) => ({ ...g, members: g.members.filter((m) => m !== label) })),
    assignments: mapLosses(h, (lost) => lost.filter((m) => m !== label)),
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
    let assignments: Record<string, StoredAssignment> | undefined;
    if (typeof o.assignments === 'object' && o.assignments !== null) {
      assignments = {};
      for (const [k, v] of Object.entries(o.assignments as Record<string, unknown>)) {
        if (typeof v !== 'object' || v === null) continue;
        const a = v as Record<string, unknown>;
        const groupId = str(a.groupId);
        if (!groupId) continue;
        const lostIn = Array.isArray(a.lostIn)
          ? a.lostIn.filter((m): m is string => typeof m === 'string') : undefined;
        assignments[k] = { groupId, ...(lostIn?.length ? { lostIn } : {}) };
      }
    }
    out.push({ id, name: str(o.name) ?? 'hypothesis', groups, assignments, notes: str(o.notes) });
  }
  return out;
}
