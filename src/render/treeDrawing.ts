/**
 * The tree drawn sideways beside the vertical chain: root on the left, leaves
 * running into the languages, subgroup-defining innovations written at each
 * node — the arrangement Kaufman (2026: 7) calls ideal, after Edwards (2021),
 * turned on its side to fit the chain.
 *
 * ## Where labels go, and why they cannot collide
 *
 * A clade's label sits to the left of its junction, within the vertical span
 * of its own languages (plus half a spacing either side). Nothing else is ever
 * drawn there: its children's branches run to the right of the junction, its
 * parent's label is left of the parent's junction, and siblings own disjoint
 * spans. The only line crossing the region is the clade's own stem, so the
 * name goes just above the stem and the innovations below it, as many as the
 * span holds, then "+ N more". The full list is in the node's tooltip.
 */

import type { Layout } from '../core/layout.js';
import type { QualityClass } from '../core/quality.js';
import { heightOf, leavesOf, type TreeNode } from '../core/tree.js';
import { QUALITY_COLOUR, QUALITY_GLYPH, TREE_STROKE, labelHalfWidth } from './styles.js';

export interface TreeLine {
  d: string;
  groupId: string | null;
}

export interface TreeText {
  x: number;
  y: number;
  /** Leading quality mark, drawn in its class colour. */
  mark?: QualityClass;
  text: string;
  role: 'name' | 'innovation' | 'more';
  groupId: string | null;
}

export interface TreeDrawing {
  lines: TreeLine[];
  texts: TreeText[];
  /** Full name and innovation list per clade (root under ''), for tooltips. */
  titles: Record<string, string>;
  /** Leftmost x used, so the scene can widen its view to include it. */
  minX: number;
}

export interface NodeContent {
  name: string;
  innovations: { label: string; quality: QualityClass }[];
}

export interface TreeDrawingOptions {
  /** x at which the tree meets the chain: left of every contour. */
  leafX: number;
  levelWidth?: number;
  /** List defining innovations under each node's name. */
  listInnovations?: boolean;
  nameSize?: number;
  innovationSize?: number;
}

const QUALITY_ORDER: Record<QualityClass, number> = { high: 0, undetermined: 1, low: 2 };

/** Characters of a font size that fit a width; the same estimate as styles.ts. */
const capacity = (width: number, size: number) => Math.max(4, Math.floor(width / (size * 0.56)));
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`);

export function drawTree(
  tree: TreeNode,
  layout: Layout,
  content: (groupId: string | null) => NodeContent | null,
  opts: TreeDrawingOptions,
): TreeDrawing {
  const {
    leafX, levelWidth = 170, listInnovations = true, nameSize = 11, innovationSize = 9.5,
  } = opts;
  const lineHeight = innovationSize + 2;
  const half = layout.spacing / 2;

  const nodeOf = new Map(layout.nodes.map((n) => [n.language, n]));
  const xOf = (node: TreeNode) => leafX - heightOf(node) * levelWidth;

  const lines: TreeLine[] = [];
  const texts: TreeText[] = [];
  const titles: TreeDrawing['titles'] = {};
  let minX = xOf(tree);

  /** Returns the y at which this node's stem meets its parent. */
  const walk = (node: TreeNode, parentX: number | null): number => {
    if (node.kind === 'leaf') {
      const n = nodeOf.get(node.language)!;
      const end = n.x - labelHalfWidth(n.label, layout.nodeRadius);
      if (parentX !== null) lines.push({ d: `M${f(parentX)},${f(n.y)} H${f(end)}`, groupId: null });
      return n.y;
    }

    const x = xOf(node);
    const ys = node.children.map((c) => walk(c, x));
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const stem = (top + bottom) / 2;

    if (bottom > top) lines.push({ d: `M${f(x)},${f(top)} V${f(bottom)}`, groupId: node.groupId });
    // The root has no parent; a short stub marks it as the root.
    const from = parentX ?? x - 14;
    lines.push({ d: `M${f(from)},${f(stem)} H${f(x)}`, groupId: node.groupId });
    minX = Math.min(minX, from);

    const c = content(node.groupId);
    if (c) {
      const leaves = leavesOf(node).map((l) => nodeOf.get(l)!.y);
      const spanBottom = Math.max(...leaves) + half;
      const right = x - 6;
      // Room from the parent's junction (or, for the root, a fixed column).
      const width = (parentX === null ? levelWidth : x - parentX) - 12;
      const left = right - width;
      minX = Math.min(minX, left);

      if (c.name) {
        texts.push({
          x: right, y: stem - 5, text: clip(c.name, capacity(width, nameSize)),
          role: 'name', groupId: node.groupId,
        });
      }
      const sorted = c.innovations.slice().sort((a, b) =>
        QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality] || a.label.localeCompare(b.label));
      if (listInnovations && sorted.length > 0) {
        const first = stem + 5 + innovationSize;
        const room = Math.max(1, Math.floor((spanBottom - 2 - first) / lineHeight) + 1);
        const shown = sorted.length > room ? room - 1 : sorted.length;
        const chars = capacity(width, innovationSize) - 2;
        sorted.slice(0, shown).forEach((inn, i) => {
          texts.push({
            x: right, y: first + i * lineHeight, mark: inn.quality,
            text: clip(inn.label, chars), role: 'innovation', groupId: node.groupId,
          });
        });
        if (shown < sorted.length) {
          texts.push({
            x: right, y: first + shown * lineHeight,
            text: `+ ${sorted.length - shown} more`, role: 'more', groupId: node.groupId,
          });
        }
      } else if (!listInnovations && sorted.length > 0) {
        texts.push({
          x: right, y: stem + 5 + innovationSize,
          text: `${sorted.length} defining ${sorted.length === 1 ? 'innovation' : 'innovations'}`,
          role: 'more', groupId: node.groupId,
        });
      }

      titles[node.groupId ?? ''] =
        [c.name || 'the whole family', ...sorted.map((i) => `${i.quality}: ${i.label}`)].join('\n');
    }
    return stem;
  };

  walk(tree, null);
  return { lines, texts, titles, minX };
}

const f = (n: number) => String(Math.round(n * 10) / 10);

// ---------------------------------------------------------------------------
// Presentation, shared by the screen and the export

export const TREE_TEXT: Record<TreeText['role'], { size: number; fill: string; weight?: number; italic?: boolean }> = {
  name: { size: 11, fill: TREE_STROKE, weight: 600 },
  innovation: { size: 9.5, fill: '#444' },
  more: { size: 9.5, fill: '#888', italic: true },
};

/** Lines and texts per clade, in drawing order; the root and leaves are under ''. */
export function byClade(drawing: TreeDrawing): { id: string; lines: TreeLine[]; texts: TreeText[] }[] {
  const out = new Map<string, { id: string; lines: TreeLine[]; texts: TreeText[] }>();
  const slot = (id: string | null) => {
    const key = id ?? '';
    if (!out.has(key)) out.set(key, { id: key, lines: [], texts: [] });
    return out.get(key)!;
  };
  drawing.lines.forEach((l) => slot(l.groupId).lines.push(l));
  drawing.texts.forEach((t) => slot(t.groupId).texts.push(t));
  return [...out.values()];
}

/** The tree as SVG markup, for the standalone export. */
export function treeSvg(drawing: TreeDrawing, esc: (s: string) => string): string[] {
  const out: string[] = [];
  out.push(`  <g id="tree" fill="none" stroke="${TREE_STROKE}" stroke-linecap="round" font-family="system-ui, sans-serif">`);
  for (const clade of byClade(drawing)) {
    const title = drawing.titles[clade.id];
    out.push(`    <g${clade.id ? ` data-clade="${esc(clade.id)}"` : ''}>`);
    if (title) out.push(`      <title>${esc(title)}</title>`);
    for (const l of clade.lines) {
      out.push(`      <path d="${l.d}" stroke-width="${l.groupId === null && clade.id === '' ? 1.4 : 2}"/>`);
    }
    for (const t of clade.texts) {
      const st = TREE_TEXT[t.role];
      const mark = t.mark
        ? `<tspan fill="${QUALITY_COLOUR[t.mark]}">${QUALITY_GLYPH[t.mark]} </tspan>` : '';
      out.push(
        `      <text x="${t.x}" y="${t.y}" text-anchor="end" stroke="none" font-size="${st.size}" ` +
          `fill="${st.fill}"${st.weight ? ` font-weight="${st.weight}"` : ''}` +
          `${st.italic ? ' font-style="italic"' : ''}>${mark}${esc(t.text)}</text>`,
      );
    }
    out.push('    </g>');
  }
  out.push('  </g>');
  return out;
}
