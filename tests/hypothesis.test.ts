/**
 * Hybrid hypotheses: the checks against the matrix, and the stored form.
 */

import { describe, it, expect } from 'vitest';
import {
  analyseHypothesis, bestChain, groupFindings, rowSets, treeConflicts, type GroupSpec,
} from '../src/core/hypothesis.js';
import type { Cell, Dataset } from '../src/core/types.js';
import type { QualityClass } from '../src/core/quality.js';
import { createProject, parseProject, serializeProject } from '../src/data/project.js';
import {
  activeHypothesis, addGroup, addHypothesis, duplicateHypothesis, removeGroup,
  removeHypothesis, resolveGroups, updateGroup,
} from '../src/data/hypothesis.js';
import { removeLanguage, renameLanguage } from '../src/data/edit.js';
import { Glottometry } from '../src/core/metrics.js';
import { chainLayout, orderFor } from '../src/core/layout.js';
import { hypothesisScene } from '../src/render/hypothesisScene.js';
import { exportSvg } from '../src/render/exportSvg.js';
import { HYPOTHESIS_STYLE } from '../src/render/styles.js';

const undetermined = (): QualityClass => 'undetermined';

describe("Kaufman's (4) and (5)", () => {
  // Kaufman (2026: 6): *p > f in A and B, *s > h in C and D, and *a > ə in B
  // and C. Read as (4), AB and CD are subgroups and *a > ə is areal; read as
  // (5), BC is the subgroup and the other two are areal. (5) needs two areal
  // events to (4)'s one.
  const ds: Dataset = {
    languages: ['A', 'B', 'C', 'D'],
    innovations: ['*p > f', '*s > h', '*a > ə'],
    matrix: [[1, 1, 0, 0], [0, 0, 1, 1], [0, 1, 1, 0]],
  };
  const four: GroupSpec[] = [
    { id: 'AB', kind: 'subgroup', members: [0, 1] },
    { id: 'CD', kind: 'subgroup', members: [2, 3] },
    { id: 'BC', kind: 'linkage', members: [1, 2] },
  ];
  const five: GroupSpec[] = [
    { id: 'BC', kind: 'subgroup', members: [1, 2] },
    { id: 'AB', kind: 'linkage', members: [0, 1] },
    { id: 'CD', kind: 'linkage', members: [2, 3] },
  ];

  it('counts one extra origin for (4) and two for (5)', () => {
    expect(analyseHypothesis(ds, four, undetermined).extraGains).toBe(1);
    expect(analyseHypothesis(ds, five, undetermined).extraGains).toBe(2);
    expect(analyseHypothesis(ds, [], undetermined).extraGainsFlat).toBe(3);
  });

  it('explains every innovation under both, by tree or by linkage', () => {
    expect(analyseHypothesis(ds, four, undetermined).explanations).toEqual([
      { kind: 'tree', groupId: 'AB' },
      { kind: 'tree', groupId: 'CD' },
      { kind: 'linkage', groupId: 'BC' },
    ]);
    expect(analyseHypothesis(ds, five, undetermined).residue).toEqual([]);
  });

  it('leaves the areal change as residue if nothing accounts for it', () => {
    const a = analyseHypothesis(ds, four.slice(0, 2), undetermined);
    expect(a.residue).toEqual([2]);
    expect(a.explanations[2]).toEqual({ kind: 'residue', gains: 2, withinSubgroup: undefined });
  });
});

describe('the tree', () => {
  it('rejects subgroups that overlap without nesting', () => {
    const groups: GroupSpec[] = [
      { id: 'x', kind: 'subgroup', members: [0, 1, 2] },
      { id: 'y', kind: 'subgroup', members: [2, 3] },
      { id: 'z', kind: 'subgroup', members: [0, 1] },
      // Linkages may overlap anything.
      { id: 'l', kind: 'linkage', members: [1, 2, 3] },
    ];
    expect(treeConflicts(groups)).toEqual([{ a: 'x', b: 'y' }]);
    const ds: Dataset = { languages: ['A', 'B', 'C', 'D'], innovations: ['i'], matrix: [[1, 1, 0, 0]] };
    expect(analyseHypothesis(ds, groups, undetermined).extraGains).toBeNull();
  });

  it('counts gains through nested clades, with unknown cells as wildcards', () => {
    const ds: Dataset = {
      languages: ['A', 'B', 'C', 'D', 'E'],
      innovations: ['whole ABC', 'AB + D', 'ABC, C unknown', 'A B E'],
      matrix: [
        [1, 1, 1, 0, 0],
        [1, 1, 0, 1, 0],
        [1, 1, null, 0, 0],
        [1, 1, 0, 0, 1],
      ],
    };
    const tree: GroupSpec[] = [
      { id: 'ABC', kind: 'subgroup', members: [0, 1, 2] },
      { id: 'AB', kind: 'subgroup', members: [0, 1] },
    ];
    const a = analyseHypothesis(ds, tree, undetermined);
    // AB+D: one origin at AB, one at D. ABC with C unknown fits ABC.
    expect(a.explanations[0]).toEqual({ kind: 'tree', groupId: 'ABC' });
    expect(a.explanations[1]).toMatchObject({ kind: 'residue', gains: 2 });
    expect(a.explanations[2]).toEqual({ kind: 'tree', groupId: 'ABC' });
    expect(a.extraGains).toBe(0 + 1 + 0 + 1);
  });

  it('points a residue at the subgroup it falls within, and the members lacking it', () => {
    const ds: Dataset = {
      languages: ['A', 'B', 'C', 'D'],
      innovations: ['lost in C'],
      matrix: [[1, 1, 0, 0]],
    };
    const a = analyseHypothesis(ds, [{ id: 'ABC', kind: 'subgroup', members: [0, 1, 2] }], undetermined);
    // With no AB clade, A and B need separate origins if nothing is lost; or
    // one origin at ABC and a loss in C, which is the analyst's call.
    expect(a.explanations[0]).toEqual({
      kind: 'residue', gains: 2, withinSubgroup: { groupId: 'ABC', missing: [2] },
    });
  });

  it('sets aside single-language and family-wide innovations', () => {
    const ds: Dataset = {
      languages: ['A', 'B', 'C'],
      innovations: ['one', 'all', 'all but unknown'],
      matrix: [[1, 0, 0], [1, 1, 1], [1, null, 1]],
    };
    const a = analyseHypothesis(ds, [], undetermined);
    expect(a.explanations.map((e) => e.kind)).toEqual(['single', 'family', 'family']);
    expect(a.informative).toBe(0);
  });
});

describe('group reports', () => {
  const ds: Dataset = {
    languages: ['A', 'B', 'C', 'D', 'E'],
    innovations: ['def 1', 'def 2', 'gap', 'leak', 'leak 2', 'cross'],
    matrix: [
      [1, 1, 1, 0, 0],
      [1, 1, null, 0, 0],
      [1, 1, 0, 0, 0],
      [1, 1, 1, 1, 0],
      [1, 1, 1, 1, 0],
      [0, 1, 0, 1, 0],
    ],
  };
  const quality: QualityClass[] = ['high', 'low', 'low', 'low', 'low', 'low'];
  const a = analyseHypothesis(ds, [{ id: 'ABC', kind: 'subgroup', members: [0, 1, 2] }], (r) => quality[r]!);
  const r = a.groups[0]!;

  it('finds defining innovations, gaps, leakage and conflicts', () => {
    expect(r.exclusive).toEqual([0, 1]);
    expect(r.exclusiveQuality).toEqual({ high: 1, low: 1, undetermined: 0 });
    expect(r.gaps).toEqual([{ row: 2, missing: [2] }]);
    expect(r.leakage).toEqual([3, 4]);
    expect(r.leakageTo.get(3)).toBe(2);
    expect(r.conflicts).toEqual([5]);
  });

  it("does not count an ancestor's innovations as leakage", () => {
    const nested: Dataset = {
      languages: ['A', 'B', 'C', 'D'],
      innovations: ['ABC', 'AB', 'all', 'AB + D'],
      matrix: [[1, 1, 1, 0], [1, 1, 0, 0], [1, 1, 1, 1], [1, 1, 0, 1]],
    };
    const a = analyseHypothesis(nested, [
      { id: 'ABC', kind: 'subgroup', members: [0, 1, 2] },
      { id: 'AB', kind: 'subgroup', members: [0, 1] },
    ], undetermined);
    // Only 'AB + D' leaks from AB; 'ABC' is the parent's and 'all' the family's.
    expect(a.groups[1]!.leakage).toEqual([3]);
    expect(a.groups[0]!.leakage).toEqual([]);
  });

  it('puts them into words', () => {
    const text = groupFindings(r, (l) => ds.languages[l]!).map((f) => `${f.level}: ${f.text}`);
    expect(text[0]).toMatch(/^ok: Defined by 2 exclusive innovations, 1 of them high quality/);
    expect(text.some((t) => /note: 1 innovation is in most members but absent/.test(t))).toBe(true);
    expect(text.some((t) => /2 of its innovations also occur outside it \(D ×2\)/.test(t))).toBe(true);
    expect(text.some((t) => /1 innovation cuts across/.test(t))).toBe(true);
  });

  it('warns when a subgroup rests on low-quality innovations only, or none', () => {
    const low = analyseHypothesis(ds, [{ id: 'x', kind: 'subgroup', members: [0, 1, 2] }], () => 'low');
    expect(groupFindings(low.groups[0]!, String)[0]).toMatchObject({
      level: 'warn', text: expect.stringMatching(/only by low-quality/),
    });
    const none = analyseHypothesis(ds, [{ id: 'y', kind: 'subgroup', members: [0, 4] }], undetermined);
    expect(groupFindings(none.groups[0]!, String)[0]).toMatchObject({
      level: 'warn', text: expect.stringMatching(/No innovation is shared by exactly/),
    });
  });
});

describe('chain test', () => {
  const sets = (rows: Cell[][]) => rows.map(rowSets);

  it("recognises Smith's even step-ladder distribution (Table 2)", () => {
    // Seven lects, each pair of neighbours sharing one innovation, given in a
    // scrambled order: the test has to find the chain, not be handed it.
    const rows: Cell[][] = [0, 1, 2, 3, 4, 5].map((i) =>
      Array.from({ length: 7 }, (_, c) => (c === i || c === i + 1 ? 1 : 0)));
    const members = [3, 0, 6, 1, 5, 2, 4];
    const exact = bestChain(sets(rows), members.slice(0, 7));
    expect(exact.contiguous).toBe(6);
    expect(exact.exact).toBe(true);
  });

  it("recognises a centre of diffusion (Table 3)", () => {
    const table3: Cell[][] = [
      [0, 0, 0, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 0, 0, 0],
    ].map((r) => r as Cell[]);
    const internal = sets(table3).filter((r) => r.ones.length >= 2 && r.ones.length < 7);
    expect(bestChain(internal, [6, 5, 4, 3, 2, 1, 0]).contiguous).toBe(internal.length);
  });

  it('finds that a scattered distribution fits no chain', () => {
    // Every pair of four lects shares one innovation. A line of four has only
    // three adjacent pairs, so no ordering makes more than three contiguous.
    const pairs: Cell[][] = [];
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      pairs.push([0, 1, 2, 3].map((c) => (c === a || c === b ? 1 : 0)) as Cell[]);
    }
    expect(bestChain(sets(pairs), [0, 1, 2, 3]).contiguous).toBe(3);
  });

  it('uses the heuristic above the exact limit, and still finds a clean chain', () => {
    const n = 10;
    const rows: Cell[][] = Array.from({ length: n - 1 }, (_, i) =>
      Array.from({ length: n }, (_, c) => (c === i || c === i + 1 ? 1 : 0)));
    const scrambled = [4, 9, 0, 7, 2, 5, 1, 8, 3, 6];
    const found = bestChain(sets(rows), scrambled, scrambled);
    expect(found.exact).toBe(false);
    expect(found.contiguous).toBe(n - 1);
  });

  it('reads a linkage and a contact zone against their distributions', () => {
    const ds: Dataset = {
      languages: ['A', 'B', 'C', 'D', 'E'],
      innovations: ['ab', 'bc', 'cd', 'de'],
      matrix: [[1, 1, 0, 0, 0], [0, 1, 1, 0, 0], [0, 0, 1, 1, 0], [0, 0, 0, 1, 1]],
    };
    const a = analyseHypothesis(ds, [
      { id: 'L', kind: 'linkage', members: [0, 1, 2, 3, 4] },
      { id: 'Z', kind: 'contact', members: [0, 1, 2, 3, 4] },
    ], undetermined);
    expect(a.groups[0]!.chain).toMatchObject({ contiguous: 4, total: 4 });
    const name = (l: number) => ds.languages[l]!;
    expect(groupFindings(a.groups[0]!, name).some((f) => f.level === 'ok' && /step-ladder/.test(f.text))).toBe(true);
    expect(groupFindings(a.groups[1]!, name).some((f) => /more like a linkage than a contact zone/.test(f.text))).toBe(true);
  });
});

describe('stored hypotheses', () => {
  const base = createProject('t', {
    languages: ['Anu', 'Beri', 'Cawa'],
    innovations: ['x'],
    matrix: [[1, 1, 0]],
  });

  it('adds, edits, duplicates and removes, keeping one active', () => {
    let p = addHypothesis(base, 'first');
    const h = activeHypothesis(p)!;
    const added = addGroup(p, h.id, { name: 'north', kind: 'subgroup', members: ['Anu', 'Beri'] });
    p = updateGroup(added.project, h.id, added.id, { kind: 'linkage' });
    expect(activeHypothesis(p)!.groups[0]).toMatchObject({ name: 'north', kind: 'linkage' });

    p = duplicateHypothesis(p, h.id, 'second');
    const second = activeHypothesis(p)!;
    expect(second.name).toBe('second');
    expect(second.groups[0]!.id).not.toBe(added.id);

    p = removeGroup(p, h.id, added.id);
    expect(p.hypotheses![0]!.groups).toEqual([]);
    expect(activeHypothesis(p)!.groups).toHaveLength(1);

    p = removeHypothesis(p, second.id);
    expect(activeHypothesis(p)!.id).toBe(h.id);
  });

  it('follows language renames and deletions', () => {
    let p = addHypothesis(base, 'h');
    const h = activeHypothesis(p)!;
    p = addGroup(p, h.id, { name: 'g', kind: 'subgroup', members: ['Anu', 'Beri'] }).project;
    p = renameLanguage(p, 1, 'Berri');
    expect(activeHypothesis(p)!.groups[0]!.members).toEqual(['Anu', 'Berri']);
    p = removeLanguage(p, 0);
    expect(activeHypothesis(p)!.groups[0]!.members).toEqual(['Berri']);
  });

  it('resolves members to indices, reporting labels it cannot find', () => {
    const { specs, unknown } = resolveGroups(
      { id: 'h', name: 'h', groups: [{ id: 'g', name: '', kind: 'contact', members: ['Cawa', 'Zed', 'Anu'] }] },
      ['Anu', 'Beri', 'Cawa'],
    );
    expect(specs[0]!.members).toEqual([0, 2]);
    expect(unknown).toEqual([{ groupId: 'g', labels: ['Zed'] }]);
  });

  it('survives save and load, dropping malformed entries', () => {
    let p = addHypothesis(base, 'h');
    p = addGroup(p, activeHypothesis(p)!.id, { name: 'g', kind: 'contact', members: ['Anu'] }).project;
    const loaded = parseProject(serializeProject(p));
    expect(loaded.hypotheses).toEqual(p.hypotheses);
    expect(loaded.activeHypothesis).toBe(p.activeHypothesis);

    const raw = JSON.parse(serializeProject(p));
    raw.hypotheses[0].groups.push({ id: 'bad', kind: 'clade', members: [] }, 'junk');
    raw.hypotheses.push({ name: 'no id' });
    const cleaned = parseProject(JSON.stringify(raw));
    expect(cleaned.hypotheses).toHaveLength(1);
    expect(cleaned.hypotheses![0]!.groups).toHaveLength(1);
  });
});

describe('drawing a hypothesis', () => {
  const ds: Dataset = {
    languages: ['A', 'B', 'C', 'D'],
    innovations: ['i', 'j'],
    matrix: [[1, 1, 1, 0], [0, 1, 1, 1]],
  };
  const g = new Glottometry(ds, 'half');
  const { order } = orderFor(g.subgroups(), 4);
  const layout = chainLayout(order, ds.languages);

  it('draws a subgroup and a linkage with the same members as two contours', () => {
    // Smith (2025: 655, fig. 8): a subgroup whose members also form a linkage.
    const scene = hypothesisScene(layout, g, [
      { id: 's', kind: 'subgroup', members: [0, 1, 2] },
      { id: 'l', kind: 'linkage', members: [0, 1, 2] },
      { id: 'empty', kind: 'contact', members: [] },
    ], (id) => `name ${id}`);
    expect(scene.contours.map((c) => c.key).sort()).toEqual(['l', 's']);
    const s = scene.contours.find((c) => c.key === 's')!;
    const l = scene.contours.find((c) => c.key === 'l')!;
    expect(s.track).not.toBe(l.track);
    expect(s.style).toEqual(HYPOTHESIS_STYLE.subgroup);
    expect(l.hypothesis).toEqual({ kind: 'linkage', name: 'name l' });
  });

  it('labels the export as a hypothesis', () => {
    const scene = hypothesisScene(layout, g, [{ id: 'z', kind: 'contact', members: [1, 2, 3] }], () => 'East');
    const svg = exportSvg(scene, { title: 'Hypothesis: h', subtitle: 'authored, not computed' });
    expect(svg).toMatch(/data-kind="contact" data-name="East"/);
    expect(svg).toMatch(/<title>East — contact: B \+ C \+ D<\/title>/);
    expect(svg).toMatch(/stroke-dasharray="6 6"/);
    const described = exportSvg(scene, { method: 'A hybrid hypothesis' });
    expect(described).toMatch(/<desc>A hybrid hypothesis\. Drawn by/);
    expect(exportSvg(scene)).toMatch(/after Kalyan &amp; François \(2018\)/);
  });
});
