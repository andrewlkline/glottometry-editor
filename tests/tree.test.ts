/**
 * The hypothesis tree: nesting, a chain order that respects it, and a drawing
 * whose labels never collide.
 */

import { describe, it, expect } from 'vitest';
import { buildTree, heightOf, leavesOf, treeOrder, type TreeNode } from '../src/core/tree.js';
import type { GroupSpec } from '../src/core/hypothesis.js';
import { chainLayout } from '../src/core/layout.js';
import { Glottometry } from '../src/core/metrics.js';
import type { Dataset } from '../src/core/types.js';
import { drawTree, type TreeDrawing, type TreeText } from '../src/render/treeDrawing.js';
import { hypothesisTreeScene } from '../src/render/hypothesisScene.js';
import { exportSvg } from '../src/render/exportSvg.js';
import { TREE_TEXT } from '../src/render/treeDrawing.js';

const sub = (id: string, ...members: number[]): GroupSpec => ({ id, kind: 'subgroup', members });

/** A compact picture of a tree: clades as [id: children], leaves as numbers. */
function shape(node: TreeNode): unknown {
  return node.kind === 'leaf' ? node.language : { [node.groupId ?? 'root']: node.children.map(shape) };
}

describe('buildTree', () => {
  it('nests subgroups and hangs each leaf from the smallest clade containing it', () => {
    const tree = buildTree([sub('ABCD', 0, 1, 2, 3), sub('AB', 0, 1), sub('EF', 4, 5)], 7)!;
    expect(shape(tree)).toEqual({
      root: [{ ABCD: [{ AB: [0, 1] }, 2, 3] }, { EF: [4, 5] }, 6],
    });
    expect(heightOf(tree)).toBe(3);
    expect(leavesOf(tree).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('nests identical subgroups one inside the other, in the order given', () => {
    const tree = buildTree([sub('first', 0, 1), sub('second', 0, 1)], 3)!;
    expect(shape(tree)).toEqual({ root: [{ first: [{ second: [0, 1] }] }, 2] });
  });

  it('refuses subgroups that do not nest, whatever their order', () => {
    expect(buildTree([sub('x', 0, 1, 2), sub('y', 2, 3)], 4)).toBeNull();
    expect(buildTree([sub('y', 2, 3), sub('x', 0, 1, 2)], 4)).toBeNull();
    expect(buildTree([sub('big', 0, 1, 2, 3), sub('a', 0, 1), sub('b', 1, 2)], 4)).toBeNull();
  });

  it('ignores linkages, contact zones and empty groups', () => {
    const tree = buildTree([
      sub('AB', 0, 1),
      { id: 'L', kind: 'linkage', members: [1, 2] },
      { id: 'Z', kind: 'contact', members: [0, 2] },
      sub('empty'),
    ], 3)!;
    expect(shape(tree)).toEqual({ root: [{ AB: [0, 1] }, 2] });
  });
});

describe('treeOrder', () => {
  const contiguous = (order: number[], members: number[]) => {
    const pos = members.map((m) => order.indexOf(m)).sort((a, b) => a - b);
    return pos[pos.length - 1]! - pos[0]! === members.length - 1;
  };

  it('keeps the base order where the tree allows it', () => {
    const tree = buildTree([sub('AB', 0, 1), sub('CD', 2, 3)], 5)!;
    expect(treeOrder(tree, [4, 0, 1, 2, 3], [])).toEqual([4, 0, 1, 2, 3]);
  });

  it('makes every subgroup contiguous, pulling split members together', () => {
    const groups = [sub('ACE', 0, 2, 4), sub('AC', 0, 2), sub('BD', 1, 3)];
    const order = treeOrder(buildTree(groups, 5)!, [0, 1, 2, 3, 4], []);
    for (const g of groups) expect(contiguous(order, g.members)).toBe(true);
  });

  it('arranges siblings to keep a linkage in one piece', () => {
    // Three sibling pairs; a linkage joins the first and third. By position
    // alone they would sit in base order, splitting it; one swap keeps it whole.
    const tree = buildTree([sub('P', 0, 1), sub('Q', 2, 3), sub('R', 4, 5)], 6)!;
    const order = treeOrder(tree, [0, 1, 2, 3, 4, 5], [[1, 4]]);
    expect(contiguous(order, [1, 4])).toBe(true);
    for (const m of [[0, 1], [2, 3], [4, 5]]) expect(contiguous(order, m)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The drawing

/** Approximate text box, with the same width estimate the drawing uses. */
function box(t: TreeText) {
  const size = TREE_TEXT[t.role].size;
  const chars = t.text.length + (t.mark ? 2 : 0);
  return { x0: t.x - chars * size * 0.56, x1: t.x, y0: t.y - size, y1: t.y + 2 };
}
const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Segments of an axis-aligned path "Mx,y H x" or "Mx,y V y". */
function segment(d: string) {
  const m = /^M(-?[\d.]+),(-?[\d.]+) ([HV])(-?[\d.]+)$/.exec(d)!;
  const [x, y, v] = [Number(m[1]), Number(m[2]), Number(m[4])];
  return m[3] === 'H'
    ? { x0: Math.min(x, v), x1: Math.max(x, v), y0: y, y1: y }
    : { x0: x, x1: x, y0: Math.min(y, v), y1: Math.max(y, v) };
}
const crosses = (s: ReturnType<typeof segment>, b: ReturnType<typeof box>) =>
  s.x0 <= b.x1 && b.x0 <= s.x1 && s.y0 <= b.y1 && b.y0 <= s.y1;

/** A random nested set of subgroups over n languages. */
function randomTree(n: number, rnd: () => number): GroupSpec[] {
  const groups: GroupSpec[] = [];
  const split = (members: number[], depth: number) => {
    if (members.length < 2 || depth > 4) return;
    let rest = members.slice();
    while (rest.length >= 2) {
      const size = 1 + Math.floor(rnd() * rest.length);
      const part = rest.slice(0, size);
      rest = rest.slice(size);
      if (part.length >= 2 && part.length < members.length && rnd() < 0.8) {
        groups.push(sub(`g${groups.length}`, ...part));
        split(part, depth + 1);
      }
    }
  };
  split(Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5), 0);
  return groups;
}

describe('drawTree', () => {
  const content = (many: number) => (id: string | null) => (id === null ? null : {
    name: `Proto-${id} with a long name`,
    innovations: Array.from({ length: many }, (_, i) => ({
      label: `ISC: gloss ${i}: *pataka → *pataki (a longish label)`,
      quality: (['high', 'low', 'undetermined'] as const)[i % 3]!,
    })),
  });

  it('never lets labels of different clades collide, or cross another clade’s lines', () => {
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 200; trial++) {
      const n = 3 + Math.floor(rnd() * 12);
      const groups = randomTree(n, rnd);
      const tree = buildTree(groups, n)!;
      const layout = chainLayout(treeOrder(tree, Array.from({ length: n }, (_, i) => i), []),
        Array.from({ length: n }, (_, i) => `L${i}`));
      const drawing: TreeDrawing = drawTree(tree, layout, content(1 + Math.floor(rnd() * 12)), {
        leafX: 200,
      });
      const texts = drawing.texts.map((t) => ({ t, b: box(t) }));
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          if (texts[i]!.t.groupId === texts[j]!.t.groupId) continue;
          expect(overlaps(texts[i]!.b, texts[j]!.b), `trial ${trial}`).toBe(false);
        }
        for (const line of drawing.lines) {
          // A clade's own stem runs between its name and its list.
          if (line.groupId === texts[i]!.t.groupId) continue;
          expect(crosses(segment(line.d), texts[i]!.b), `trial ${trial}: ${line.d}`).toBe(false);
        }
      }
      // Within a clade, lines of text do not overlap each other either.
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          if (texts[i]!.t.groupId !== texts[j]!.t.groupId) continue;
          expect(overlaps(texts[i]!.b, texts[j]!.b), `trial ${trial} within`).toBe(false);
        }
      }
    }
  });

  it('lists what fits, then says how many more; the tooltip has them all', () => {
    const tree = buildTree([sub('AB', 0, 1)], 3)!;
    const layout = chainLayout([0, 1, 2], ['A', 'B', 'C']);
    const d = drawTree(tree, layout, content(20), { leafX: 200 });
    const listed = d.texts.filter((t) => t.role === 'innovation');
    const more = d.texts.find((t) => t.role === 'more')!;
    expect(listed.length).toBeGreaterThan(0);
    expect(more.text).toBe(`+ ${20 - listed.length} more`);
    expect(d.titles.AB!.split('\n')).toHaveLength(21);
    // Ordered high → undetermined → low.
    expect(listed[0]!.mark).toBe('high');
  });

  it('says how many instead of listing them when asked', () => {
    const tree = buildTree([sub('AB', 0, 1)], 3)!;
    const d = drawTree(tree, chainLayout([0, 1, 2], ['A', 'B', 'C']), content(7), {
      leafX: 200, listInnovations: false,
    });
    expect(d.texts.map((t) => t.text)).toEqual(['Proto-AB with a long name', '7 defining innovations']);
  });

  it('runs every leaf branch to the edge of its language’s node', () => {
    const tree = buildTree([sub('AB', 0, 1)], 3)!;
    const layout = chainLayout([0, 1, 2], ['A', 'B', 'Cawa-longname']);
    const d = drawTree(tree, layout, () => null, { leafX: 200 });
    const leafLines = d.lines.filter((l) => l.groupId === null && /H/.test(l.d));
    expect(leafLines).toHaveLength(4); // three leaves and the root stub
    const ends = leafLines.map((l) => segment(l.d).x1);
    expect(Math.max(...ends)).toBeLessThan(layout.nodes[0]!.x);
  });
});

describe('the tree scene', () => {
  const ds: Dataset = {
    languages: ['A', 'B', 'C', 'D'],
    innovations: ['ab', 'cd', 'bc'],
    matrix: [[1, 1, 0, 0], [0, 0, 1, 1], [0, 1, 1, 0]],
  };
  const groups: GroupSpec[] = [sub('AB', 0, 1), sub('CD', 2, 3), { id: 'L', kind: 'linkage', members: [1, 2] }];
  const g = new Glottometry(ds, 'half');
  const tree = buildTree(groups, 4)!;
  const layout = chainLayout(treeOrder(tree, [0, 1, 2, 3], [[1, 2]]), ds.languages);
  const scene = hypothesisTreeScene(layout, g, groups, (id) => id, tree, (id) =>
    (id ? { name: id, innovations: [{ label: id.toLowerCase(), quality: 'high' }] } : null));

  it('draws subgroups as the tree and only linkages and contact zones as outlines', () => {
    expect(scene.contours.map((c) => c.key)).toEqual(['L']);
    expect(scene.tree!.texts.map((t) => t.text)).toEqual(expect.arrayContaining(['AB', 'CD', 'ab', 'cd']));
  });

  it('widens the view to hold the tree, and keeps width and view in step', () => {
    expect(scene.viewBox.x).toBeLessThanOrEqual(scene.tree!.minX);
    expect(scene.width).toBe(scene.viewBox.width);
  });

  it('exports the tree as one group per clade, with its innovations in the tooltip', () => {
    const svg = exportSvg(scene);
    expect(svg).toMatch(/<g id="tree"/);
    expect(svg).toMatch(/<g data-clade="AB">\s*<title>AB\nhigh: ab<\/title>/);
    expect(svg).toMatch(/<tspan fill="#2a6f3e">● <\/tspan>ab<\/text>/);
  });
});
