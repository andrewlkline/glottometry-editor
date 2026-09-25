/**
 * Hybrid hypotheses: a tree of subgroups, with linkages and contact zones laid
 * over it, checked against the innovations matrix.
 *
 * Glottometry computes; a hypothesis is authored. The analyst says "these
 * languages form a subgroup, those a linkage, these a contact zone" — the
 * three relation types of Smith (2025: 654–659), drawn together in the manner
 * Kaufman (2026: 7) holds up as ideal (Edwards 2021's Rote-Meto tree overlaid
 * with areal changes). What the matrix can do is say how well each claim fits
 * the evidence. That is all this module does: it never proposes a hypothesis,
 * and nothing here feeds back into the glottometric scores.
 *
 * ## Sets, not probabilities
 *
 * The checks reason about which languages have an innovation, so they work on
 * definite cells: a 1 is present, a 0 absent, and an unknown cell is a
 * wildcard that may fall either way — whichever lets the claim fit. That is
 * deliberately generous to the hypothesis: an unknown cell never counts
 * against it. The headline ε/κ/ς shown alongside still come from the scorer,
 * under whatever NA policy is set.
 *
 * ## What is counted
 *
 * - **Tree validity.** Subgroups must nest or be disjoint.
 * - **Gains.** For each innovation, the fewest independent origins the tree
 *   needs if an innovation, once acquired, is never lost: the number of
 *   maximal clades inside its distribution. Every origin beyond the first is a
 *   horizontal transfer or a parallel development — Kaufman's (2026: 6)
 *   parsimony comparison of competing trees, made quantitative. A lower bound:
 *   allowing losses can lower it, and deciding a gap is a loss is the
 *   analyst's call (Kaufman 2026: 10–11 on "the meaning of zero").
 * - **Explanation.** An innovation is explained by the tree if it is exactly
 *   one subgroup's distribution; otherwise by the smallest linkage or contact
 *   zone containing it; otherwise it is residue — evidence the hypothesis does
 *   not account for.
 * - **Per group**: its defining (exclusive) innovations and their quality,
 *   gaps (members lacking one), leakage (outsiders having one — Kaufman 2026:
 *   20, "the crispness of their borders"), conflicts, and for linkages and
 *   contact zones whether their internal innovations fit a single chain
 *   ordering (Smith 2025: 657, Tables 2–4).
 */

import type { Cell, Dataset } from './types.js';
import type { QualityClass } from './quality.js';

export type RelationKind = 'subgroup' | 'linkage' | 'contact';

export const RELATION_KINDS: RelationKind[] = ['subgroup', 'linkage', 'contact'];

export const RELATION_LABELS: Record<RelationKind, string> = {
  subgroup: 'subgroup',
  linkage: 'linkage',
  contact: 'contact zone',
};

export interface GroupSpec {
  id: string;
  kind: RelationKind;
  /** Language indices. */
  members: number[];
}

/** One innovation's distribution, as sets of language indices. */
export interface RowSets {
  ones: number[];
  /** Present or unknown: where the innovation might be. */
  maybe: Set<number>;
  zeros: Set<number>;
}

export function rowSets(row: Cell[]): RowSets {
  const ones: number[] = [];
  const maybe = new Set<number>();
  const zeros = new Set<number>();
  row.forEach((cell, c) => {
    if (cell === 1) {
      ones.push(c);
      maybe.add(c);
    } else if (cell === 0) {
      zeros.add(c);
    } else {
      maybe.add(c);
    }
  });
  return { ones, maybe, zeros };
}

const isSubset = (a: Iterable<number>, b: Set<number>) => {
  for (const x of a) if (!b.has(x)) return false;
  return true;
};

/** Does the innovation fit exactly this set, unknown cells permitting? */
function fitsExactly(sets: RowSets, members: Set<number>): boolean {
  return sets.ones.length > 0 && isSubset(sets.ones, members) && isSubset(members, sets.maybe);
}

// ---------------------------------------------------------------------------
// The tree

export interface TreeConflict {
  a: string;
  b: string;
}

/** Pairs of subgroups that overlap without one containing the other. */
export function treeConflicts(groups: GroupSpec[]): TreeConflict[] {
  const subs = groups.filter((g) => g.kind === 'subgroup');
  const out: TreeConflict[] = [];
  for (let i = 0; i < subs.length; i++) {
    const a = new Set(subs[i]!.members);
    for (let j = i + 1; j < subs.length; j++) {
      const b = subs[j]!.members;
      const shared = b.filter((x) => a.has(x)).length;
      if (shared > 0 && shared < a.size && shared < b.length) {
        out.push({ a: subs[i]!.id, b: subs[j]!.id });
      }
    }
  }
  return out;
}

/**
 * Fewest origins of an innovation on the tree, if it is never lost.
 *
 * Each present language needs to sit under an origin, and an origin at a clade
 * puts the innovation in every language of it — so the clade must lie within
 * where the innovation is or might be. For each present language, take the
 * largest such clade containing it; with a nested tree these are disjoint,
 * and their number is the minimum. Clades are sorted largest first.
 */
function gainsOn(sets: RowSets, clades: Set<number>[]): { gains: number; roots: Set<number>[] } {
  const roots: Set<number>[] = [];
  for (const language of sets.ones) {
    if (roots.some((r) => r.has(language))) continue;
    const clade = clades.find((c) => c.has(language) && isSubset(c, sets.maybe));
    roots.push(clade ?? new Set([language]));
  }
  return { gains: roots.length, roots };
}

// ---------------------------------------------------------------------------
// Chain test

/** Is the innovation's presence one unbroken run in this order? */
function contiguousIn(sets: RowSets, order: number[]): boolean {
  const positions = sets.ones.map((l) => order.indexOf(l));
  const lo = Math.min(...positions);
  const hi = Math.max(...positions);
  for (let i = lo; i <= hi; i++) if (!sets.maybe.has(order[i]!)) return false;
  return true;
}

function countContiguous(rows: RowSets[], order: number[]): number {
  let n = 0;
  for (const r of rows) if (contiguousIn(r, order)) n++;
  return n;
}

function* permutations(items: number[]): Generator<number[]> {
  if (items.length <= 1) {
    yield items.slice();
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i]!, ...p];
  }
}

/** Exhaustive up to this many members (7! = 5040 orders); heuristic above. */
export const EXACT_CHAIN_LIMIT = 7;

/**
 * The ordering of a group's members that puts the most of its internal
 * innovations in unbroken runs.
 *
 * Smith's step-ladder and centre-of-diffusion distributions (2025: 657–658,
 * Tables 2–4) both have an ordering in which every innovation is a run; his
 * contact zones, with "random" distributions, do not. Exhaustive for small
 * groups. Above that, a heuristic that can miss the best ordering but never
 * overstates the one it reports: greedy chains grown from every member by
 * strongest co-occurrence, plus the given starting order, each improved by
 * moving one language or reversing a stretch until neither helps.
 */
export function bestChain(
  rows: RowSets[],
  members: number[],
  start: number[] = members,
): { order: number[]; contiguous: number; exact: boolean } {
  if (members.length <= EXACT_CHAIN_LIMIT) {
    let best = { order: members.slice(), contiguous: -1 };
    for (const order of permutations(members)) {
      const n = countContiguous(rows, order);
      if (n > best.contiguous) best = { order, contiguous: n };
      if (n === rows.length) break;
    }
    return { ...best, contiguous: Math.max(0, best.contiguous), exact: true };
  }

  const together = (a: number, b: number) =>
    rows.reduce((k, r) => k + (r.maybe.has(a) && r.maybe.has(b) && r.ones.length > 0 ? 1 : 0), 0);
  const greedyFrom = (first: number): number[] => {
    const order = [first];
    const left = new Set(members.filter((m) => m !== first));
    while (left.size > 0) {
      const end = order[order.length - 1]!;
      let next = -1;
      let best = -1;
      for (const m of left) {
        const k = together(end, m);
        if (k > best) {
          best = k;
          next = m;
        }
      }
      order.push(next);
      left.delete(next);
    }
    return order;
  };

  const improve = (initial: number[]) => {
    let order = initial;
    let score = countContiguous(rows, order);
    let improved = true;
    while (improved && score < rows.length) {
      improved = false;
      const tryOrder = (next: number[]) => {
        const k = countContiguous(rows, next);
        if (k > score) {
          order = next;
          score = k;
          improved = true;
        }
      };
      for (let i = 0; i < order.length; i++) {
        for (let j = 0; j < order.length; j++) {
          if (i === j) continue;
          const moved = order.slice();
          const [x] = moved.splice(i, 1);
          moved.splice(j, 0, x!);
          tryOrder(moved);
          if (j > i + 1) {
            tryOrder([...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)]);
          }
        }
      }
    }
    return { order, contiguous: score };
  };

  const seeded = start.filter((l) => members.includes(l));
  for (const l of members) if (!seeded.includes(l)) seeded.push(l);
  let best = improve(seeded);
  for (const first of members) {
    if (best.contiguous === rows.length) break;
    const candidate = improve(greedyFrom(first));
    if (candidate.contiguous > best.contiguous) best = candidate;
  }
  return { ...best, exact: false };
}

// ---------------------------------------------------------------------------
// The analysis

/**
 * The analyst's own explanation of one innovation, overriding the computed
 * one: "inherited in this subgroup, and lost in these members", or "spread
 * through this linkage". Deciding that an absence is a loss is exactly the
 * judgement the matrix cannot make (Kaufman 2026: 10–11), so it is recorded
 * rather than inferred, and checked rather than trusted.
 */
export interface Assignment {
  groupId: string;
  /** Members in which the innovation is claimed to have been lost. */
  lostIn: number[];
}

/** How an assignment squares with the matrix. */
export interface AssignedDetail {
  /** Recorded losses the matrix bears out (absent or unknown there). */
  lost: number[];
  /** Members lacking it (a 0) with no loss recorded. Subgroups only. */
  unrecorded: number[];
  /** Losses recorded where the matrix says the language has it. */
  contradicted: number[];
  /** Outsiders that have it: borrowing, for a subgroup; a misfit for a zone. */
  outside: number[];
  /** No member of the group has it at all. */
  noneInside: boolean;
}

export type Explanation =
  | { kind: 'single' }
  | { kind: 'family' }
  | { kind: 'tree'; groupId: string; assigned?: AssignedDetail }
  | { kind: 'linkage' | 'contact'; groupId: string; assigned?: AssignedDetail }
  | {
    kind: 'residue';
    gains: number;
    /** The smallest subgroup containing it, and which members lack it. */
    withinSubgroup?: { groupId: string; missing: number[] };
  };

export interface QualityTally {
  high: number;
  low: number;
  undetermined: number;
}

export interface GroupReport {
  id: string;
  kind: RelationKind;
  members: number[];
  /** Rows shared by exactly these languages (unknown cells permitting). */
  exclusive: number[];
  exclusiveQuality: QualityTally;
  /** Rows within the group, in ≥ half its members, missing from some (a 0). */
  gaps: { row: number; missing: number[] }[];
  /**
   * Rows in every member (unknowns permitting) and in some outsider, other
   * than those inherited from an ancestor subgroup or family-wide.
   */
  leakage: number[];
  /** Outsider → how many of those rows it has. */
  leakageTo: Map<number, number>;
  /** Rows in some members and absent (0) from others, and in an outsider. */
  conflicts: number[];
  /** Rows within the group, in ≥ 2 members but not all of them. */
  internal: number[];
  internalQuality: QualityTally;
  /** For linkages and contact zones with internal rows. */
  chain?: { order: number[]; contiguous: number; total: number; exact: boolean };
  /** Rows the analyst assigned to this group, with how they fit. */
  assigned: { row: number; detail: AssignedDetail }[];
  /**
   * For subgroups, the innovations the hypothesis credits to this node: those
   * fitting it exactly that are not assigned elsewhere, plus those assigned
   * to it. What the tree lists at the node.
   */
  credited: { row: number; lost: number[] }[];
}

export interface HypothesisAnalysis {
  conflicts: TreeConflict[];
  groups: GroupReport[];
  /** Per row of the dataset. */
  explanations: Explanation[];
  /** Rows that are neither single-language nor family-wide. */
  informative: number;
  /** Σ(gains − 1) over informative rows, on this tree. Null if the tree is invalid. */
  extraGains: number | null;
  /** The same with no subgroups at all, for comparison. */
  extraGainsFlat: number;
  residue: number[];
  /** Losses implied by assignments to subgroups: recorded, and not. */
  losses: { recorded: number; unrecorded: number };
}

const tally = (rows: number[], classOf: (row: number) => QualityClass): QualityTally => {
  const t: QualityTally = { high: 0, low: 0, undetermined: 0 };
  for (const r of rows) t[classOf(r)]++;
  return t;
};

export function analyseHypothesis(
  dataset: Dataset,
  groups: GroupSpec[],
  classOf: (row: number) => QualityClass,
  /** Starting order for the heuristic chain search, e.g. the chain layout's. */
  layoutOrder?: number[],
  /** The analyst's explanation of a row, if any. */
  assignmentOf?: (row: number) => Assignment | undefined,
): HypothesisAnalysis {
  const n = dataset.languages.length;
  const rows = dataset.matrix.map(rowSets);
  const conflicts = treeConflicts(groups);

  const subgroups = groups.filter((g) => g.kind === 'subgroup');
  const subgroupSets = new Map(subgroups.map((g) => [g.id, new Set(g.members)]));
  const everyone = new Set(Array.from({ length: n }, (_, i) => i));

  // Clades: subgroups, largest first so `gainsOn` finds the maximal one. The
  // root and the leaves are implicit — gainsOn falls back to a leaf.
  const clades = subgroups
    .map((g) => subgroupSets.get(g.id)!)
    .sort((a, b) => b.size - a.size);
  const treeValid = conflicts.length === 0;

  const explanations: Explanation[] = [];
  let informative = 0;
  let extraGains = 0;
  let extraGainsFlat = 0;
  const residue: number[] = [];
  const losses = { recorded: 0, unrecorded: 0 };
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const byMembersAsc = <T extends GroupSpec>(gs: T[]) =>
    gs.slice().sort((a, b) => a.members.length - b.members.length);
  const zones = byMembersAsc(groups.filter((g) => g.kind !== 'subgroup'));
  const subsAsc = byMembersAsc(subgroups);

  rows.forEach((sets, r) => {
    if (sets.ones.length <= 1) {
      explanations.push({ kind: 'single' });
      return;
    }
    if (isSubset(everyone, sets.maybe)) {
      explanations.push({ kind: 'family' });
      return;
    }
    informative++;
    extraGainsFlat += sets.ones.length - 1;

    const assignment = assignmentOf?.(r);
    const target = assignment && groupsById.get(assignment.groupId);
    if (assignment && target) {
      const members = new Set(target.members);
      const has = new Set(sets.ones);
      const outside = sets.ones.filter((l) => !members.has(l));
      const claimed = new Set(assignment.lostIn);
      const detail: AssignedDetail = {
        lost: target.kind === 'subgroup'
          ? target.members.filter((m) => claimed.has(m) && !has.has(m)) : [],
        unrecorded: target.kind === 'subgroup'
          ? target.members.filter((m) => sets.zeros.has(m) && !claimed.has(m)) : [],
        contradicted: assignment.lostIn.filter((m) => has.has(m)),
        outside,
        noneInside: !sets.ones.some((l) => members.has(l)),
      };
      if (target.kind === 'subgroup') {
        // One origin at the node, losses below it, and whatever origins the
        // outsiders need — on the rest of the tree, not through this node.
        const rest: RowSets = {
          ones: outside,
          maybe: new Set([...sets.maybe].filter((l) => !members.has(l))),
          zeros: sets.zeros,
        };
        const gains = treeValid ? 1 + gainsOn(rest, clades).gains : sets.ones.length;
        extraGains += gains - 1;
        losses.recorded += detail.lost.length;
        losses.unrecorded += detail.unrecorded.length;
        explanations.push({ kind: 'tree', groupId: target.id, assigned: detail });
      } else {
        const { gains } = treeValid ? gainsOn(sets, clades) : { gains: sets.ones.length };
        extraGains += gains - 1;
        explanations.push({ kind: target.kind, groupId: target.id, assigned: detail });
      }
      return;
    }

    const { gains } = treeValid ? gainsOn(sets, clades) : { gains: sets.ones.length };
    extraGains += gains - 1;

    const clade = subgroups.find((g) => fitsExactly(sets, subgroupSets.get(g.id)!));
    if (treeValid && clade) {
      explanations.push({ kind: 'tree', groupId: clade.id });
      return;
    }
    const zone = zones.find((g) => isSubset(sets.ones, new Set(g.members)));
    if (zone) {
      explanations.push({ kind: zone.kind as 'linkage' | 'contact', groupId: zone.id });
      return;
    }
    const within = subsAsc.find((g) => isSubset(sets.ones, subgroupSets.get(g.id)!));
    explanations.push({
      kind: 'residue',
      gains,
      withinSubgroup: within
        ? { groupId: within.id, missing: within.members.filter((m) => sets.zeros.has(m)) }
        : undefined,
    });
    residue.push(r);
  });

  const assignedTo = new Map<string, { row: number; detail: AssignedDetail }[]>();
  const creditedTo = new Map<string, { row: number; lost: number[] }[]>();
  explanations.forEach((e, row) => {
    if (e.kind !== 'tree' && e.kind !== 'linkage' && e.kind !== 'contact') return;
    if (e.assigned) {
      assignedTo.set(e.groupId, [...(assignedTo.get(e.groupId) ?? []), { row, detail: e.assigned }]);
    }
    if (e.kind === 'tree') {
      creditedTo.set(e.groupId, [
        ...(creditedTo.get(e.groupId) ?? []), { row, lost: e.assigned?.lost ?? [] },
      ]);
    }
  });
  const isAssigned = (row: number) => {
    const e = explanations[row]!;
    return 'assigned' in e && !!e.assigned;
  };

  const reports = groups.map((g): GroupReport => {
    const members = new Set(g.members);
    const exclusive: number[] = [];
    const gaps: { row: number; missing: number[] }[] = [];
    const leakage: number[] = [];
    const leakageTo = new Map<number, number>();
    const conflictRows: number[] = [];
    const internal: number[] = [];
    const halfOrTwo = Math.max(2, Math.ceil(members.size / 2));

    rows.forEach((sets, r) => {
      const inside = sets.ones.filter((l) => members.has(l));
      if (inside.length === 0) return;
      const outside = sets.ones.filter((l) => !members.has(l));
      const missing = g.members.filter((m) => sets.zeros.has(m));

      if (outside.length === 0) {
        if (fitsExactly(sets, members)) {
          exclusive.push(r);
        } else {
          if (inside.length >= 2) internal.push(r);
          // A gap only if no smaller subgroup of the tree accounts for it.
          const lower = subgroups.some((s) =>
            s.id !== g.id && s.members.length < members.size
            && fitsExactly(sets, subgroupSets.get(s.id)!));
          // Nor if the analyst has already said what explains it.
          if (missing.length > 0 && inside.length >= halfOrTwo && !lower && !isAssigned(r)) {
            gaps.push({ row: r, missing });
          }
        }
      } else if (isSubset(members, sets.maybe)) {
        // Inherited from further up the tree is not leakage: an ancestor
        // subgroup's innovations are bound to occur outside its children, and
        // family-wide ones outside everything.
        const inherited = isSubset(everyone, sets.maybe) || subgroups.some((s) =>
          s.id !== g.id && s.members.length > members.size
          && isSubset(members, subgroupSets.get(s.id)!)
          && fitsExactly(sets, subgroupSets.get(s.id)!));
        if (!inherited) {
          leakage.push(r);
          for (const o of outside) leakageTo.set(o, (leakageTo.get(o) ?? 0) + 1);
        }
      } else if (missing.length > 0) {
        conflictRows.push(r);
      }
    });

    let chain: GroupReport['chain'];
    if (g.kind !== 'subgroup' && internal.length > 0) {
      const found = bestChain(internal.map((r) => rows[r]!), g.members, layoutOrder);
      chain = { ...found, total: internal.length };
    }

    return {
      id: g.id,
      kind: g.kind,
      members: g.members,
      exclusive,
      exclusiveQuality: tally(exclusive, classOf),
      gaps,
      leakage,
      leakageTo,
      conflicts: conflictRows,
      internal,
      internalQuality: tally(internal, classOf),
      chain,
      assigned: assignedTo.get(g.id) ?? [],
      credited: g.kind === 'subgroup' ? creditedTo.get(g.id) ?? [] : [],
    };
  });

  return {
    conflicts,
    groups: reports,
    explanations,
    informative,
    extraGains: treeValid ? extraGains : null,
    extraGainsFlat,
    residue,
    losses,
  };
}

// ---------------------------------------------------------------------------
// Findings: the reports in words

export interface Finding {
  level: 'ok' | 'note' | 'warn';
  text: string;
}

/** Share of internal innovations a chain ordering must hold to read as one. */
export const CHAIN_FIT = 0.8;

export function groupFindings(
  report: GroupReport,
  nameOf: (language: number) => string,
): Finding[] {
  const out: Finding[] = [];
  const q = report.exclusiveQuality;
  const nExclusive = report.exclusive.length;

  if (report.kind === 'subgroup') {
    if (nExclusive === 0) {
      out.push({
        level: 'warn',
        text: 'No innovation is shared by exactly these languages. A subgroup is defined by ' +
          'innovations present in all its members and exclusive to them (Smith 2025: 654).',
      });
    } else if (q.high > 0) {
      out.push({
        level: 'ok',
        text: `Defined by ${nExclusive} exclusive ${nExclusive === 1 ? 'innovation' : 'innovations'}, ` +
          `${q.high} of them high quality.`,
      });
    } else if (q.undetermined > 0) {
      out.push({
        level: 'note',
        text: `Defined by ${nExclusive} exclusive ${nExclusive === 1 ? 'innovation' : 'innovations'}; ` +
          'none assessed as high quality yet.',
      });
    } else {
      out.push({
        level: 'warn',
        text: `Defined only by low-quality innovations (${nExclusive}). Smith (2025: 659) would not ` +
          'accept these as subgrouping evidence on their own: a linkage or contact zone?',
      });
    }
    if (report.gaps.length > 0) {
      out.push({
        level: 'note',
        text: `${report.gaps.length} ${report.gaps.length === 1 ? 'innovation is' : 'innovations are'} ` +
          'in most members but absent from some — inherited here only if later lost there.',
      });
    }
  } else {
    if (report.internal.length === 0 && nExclusive === 0) {
      out.push({ level: 'warn', text: 'No innovations lie within this group.' });
    }
    if (nExclusive > 0) {
      out.push({
        level: 'note',
        text: `${nExclusive} ${nExclusive === 1 ? 'innovation is' : 'innovations are'} shared by all ` +
          'members and no others: this could also be a subgroup with internal linkage ' +
          '(Smith 2025: 655, fig. 8).',
      });
    }
    const c = report.chain;
    if (c && c.total >= 3) {
      const share = c.contiguous / c.total;
      const order = c.order.map(nameOf).join(' – ');
      if (share >= CHAIN_FIT) {
        out.push({
          level: report.kind === 'linkage' ? 'ok' : 'note',
          text: `${c.contiguous} of ${c.total} internal innovations fit one chain ordering ` +
            `(${order}): a step-ladder distribution` +
            (report.kind === 'contact' ? ', more like a linkage than a contact zone.' : '.'),
        });
      } else {
        out.push({
          level: report.kind === 'linkage' ? 'note' : 'ok',
          text: `Only ${c.contiguous} of ${c.total} internal innovations fit any one chain ordering` +
            `${c.exact ? '' : ' found'}: a scattered distribution` +
            (report.kind === 'linkage'
              ? ' — more like a contact zone, unless the network is two-dimensional.'
              : ', as expected of a contact zone.'),
        });
      }
    }
    const iq = report.internalQuality;
    const assessed = iq.high + iq.low;
    if (assessed > 0 && iq.undetermined === 0) {
      if (report.kind === 'linkage' && iq.high === 0) {
        out.push({
          level: 'note',
          text: 'Every internal innovation is low quality: the profile Smith (2025: 658–659) ' +
            'gives for a contact zone.',
        });
      }
      if (report.kind === 'contact' && iq.high > iq.low) {
        out.push({
          level: 'note',
          text: 'Most internal innovations are high quality: more like a linkage.',
        });
      }
    }
  }

  out.push(...assignmentFindings(report, nameOf));

  if (report.leakage.length > 0) {
    const top = [...report.leakageTo.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([l, k]) => `${nameOf(l)} ×${k}`)
      .join(', ');
    out.push({
      level: 'note',
      text: `${report.leakage.length} of its innovations also occur outside it (${top}) — ` +
        'leakage, which blurs its borders (Kaufman 2026: 20).',
    });
  }
  if (report.conflicts.length > 0) {
    out.push({
      level: 'note',
      text: `${report.conflicts.length} ${report.conflicts.length === 1 ? 'innovation cuts' : 'innovations cut'} ` +
        'across its boundary.',
    });
  }
  return out;
}

/** Tally languages across rows, as "C ×3, D ×1". */
function tallyNames(lists: number[][], nameOf: (l: number) => string): string {
  const counts = new Map<number, number>();
  for (const list of lists) for (const l of list) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([l, k]) => `${nameOf(l)} ×${k}`)
    .join(', ');
}

/** What the analyst's assignments to this group say, and where they misfit. */
function assignmentFindings(report: GroupReport, nameOf: (l: number) => string): Finding[] {
  const a = report.assigned;
  if (a.length === 0) return [];
  const out: Finding[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const withLosses = a.filter((x) => x.detail.lost.length > 0);
  out.push({
    level: 'note',
    text: `${plural(a.length, 'innovation is', 'innovations are')} assigned here` +
      (withLosses.length
        ? `, ${withLosses.length} with recorded losses (${tallyNames(withLosses.map((x) => x.detail.lost), nameOf)}).`
        : '.'),
  });

  const unrecorded = a.filter((x) => x.detail.unrecorded.length > 0);
  if (unrecorded.length) {
    out.push({
      level: 'warn',
      text: `${plural(unrecorded.length, 'assigned innovation is', 'assigned innovations are')} ` +
        `absent from members with no loss recorded (${tallyNames(unrecorded.map((x) => x.detail.unrecorded), nameOf)}): ` +
        'record the losses, or assign elsewhere.',
    });
  }
  const contradicted = a.filter((x) => x.detail.contradicted.length > 0);
  if (contradicted.length) {
    out.push({
      level: 'warn',
      text: `A loss is recorded where the language has the innovation ` +
        `(${tallyNames(contradicted.map((x) => x.detail.contradicted), nameOf)}), in ` +
        `${plural(contradicted.length, 'innovation', 'innovations')}.`,
    });
  }
  const empty = a.filter((x) => x.detail.noneInside);
  if (empty.length) {
    out.push({
      level: 'warn',
      text: `${plural(empty.length, 'assigned innovation is', 'assigned innovations are')} ` +
        'not present in any member of this group.',
    });
  }
  const outside = a.filter((x) => x.detail.outside.length > 0);
  if (outside.length) {
    const names = tallyNames(outside.map((x) => x.detail.outside), nameOf);
    out.push(report.kind === 'subgroup'
      ? {
        level: 'note',
        text: `${plural(outside.length, 'assigned innovation also occurs', 'assigned innovations also occur')} ` +
          `outside (${names}): each such language needs a borrowing, counted in the extra origins.`,
      }
      : {
        level: 'warn',
        text: `${plural(outside.length, 'assigned innovation occurs', 'assigned innovations occur')} ` +
          `outside this group (${names}), so spread within it does not account for it.`,
      });
  }
  return out;
}
