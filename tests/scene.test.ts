/**
 * End-to-end scene construction on the real demo dataset, plus the properties
 * the diagram has to satisfy to be *correct* rather than merely pretty.
 *
 * The headline one is containment: every member inside its contour, every
 * non-member outside. That is precisely the bar the Marama engine's convex
 * hulls fail (README, "Where it falls short").
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Glottometry } from '../src/core/metrics.js';
import { orderFor } from '../src/core/layout.js';
import { parseMaramaCsv } from '../src/data/maramaCsv.js';
import { buildScene } from '../src/render/scene.js';
import { exportSvg } from '../src/render/exportSvg.js';

const dataset = parseMaramaCsv(
  readFileSync(fileURLToPath(new URL('../prototype/data/innov.csv', import.meta.url)), 'utf-8'),
);

const all = new Glottometry(dataset, 'half').subgroups();
const { order } = orderFor(all, dataset.languages.length);
const shown = all.filter((s) => s.sigma >= 1);
const scene = buildScene(order, dataset.languages, shown);

/** Bounding boxes of the rounded rectangles in a path, y-axis only. */
function yRanges(paths: string[]): [number, number][] {
  return paths.map((d) => {
    const ys = [...d.matchAll(/[ML] -?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
    const arcs = [...d.matchAll(/A [\d.]+ [\d.]+ 0 0 1 -?[\d.]+ (-?[\d.]+)/g)].map((m) =>
      Number(m[1]),
    );
    const all = [...ys, ...arcs];
    return [Math.min(...all), Math.max(...all)] as [number, number];
  });
}

describe('scene on the demo dataset', () => {
  it('builds a contour per displayed subgroup', () => {
    expect(scene.contours).toHaveLength(shown.length);
    expect(shown.length).toBeGreaterThan(20);
  });

  it('keeps almost every subgroup to a single contiguous contour', () => {
    const contiguous = scene.contours.filter((c) => c.contiguous).length;
    expect(contiguous / scene.contours.length).toBeGreaterThanOrEqual(0.85);
  });

  it('contains every member and excludes every non-member', () => {
    // The correctness property. Checked in the vertical axis, which is the
    // only one that matters in a chain layout: all shapes are centred on the
    // node column and are wider than the nodes.
    for (const c of scene.contours) {
      const ranges = yRanges(c.paths);
      const memberSet = new Set(c.subgroup.members);

      for (const node of scene.layout.nodes) {
        const inside = ranges.some(([lo, hi]) => node.y >= lo && node.y <= hi);
        const shouldBeInside = memberSet.has(node.language);
        expect(
          inside,
          `${node.label} ${shouldBeInside ? 'should' : 'should not'} be inside ` +
            `${c.subgroup.memberNames.join('+')}`,
        ).toBe(shouldBeInside);
      }
    }
  });

  it('gives overlapping contours distinct tracks', () => {
    const byTrack = new Map<number, number[][]>();
    for (const c of scene.contours) {
      const positions = c.subgroup.members.map((m) => scene.layout.position[m]!);
      const span = [Math.min(...positions), Math.max(...positions)];
      const peers = byTrack.get(c.track) ?? [];
      for (const other of peers) {
        const disjoint = span[1]! < other[0]! || other[1]! < span[0]!;
        expect(disjoint, `two contours share track ${c.track} and overlap`).toBe(true);
      }
      peers.push(span);
      byTrack.set(c.track, peers);
    }
  });

  it('sizes the canvas to fit the widest contour', () => {
    const cx = scene.layout.nodes[0]!.x;
    const widest = Math.max(
      ...scene.contours.map((c) => (c.track + 1) * 7 + scene.layout.nodeRadius),
    );
    expect(cx - widest).toBeGreaterThan(0);
    expect(cx + widest).toBeLessThan(scene.width);
  });

  it('draws wide contours first so thin ones stay on top', () => {
    const tracks = scene.contours.map((c) => c.track);
    expect(tracks).toEqual([...tracks].sort((a, b) => b - a));
  });

  it('is stable under thresholding', () => {
    // The Phase 1 gate: the ordering comes from the full subgroup set, so
    // changing what is displayed must never move a node.
    for (const t of [0.5, 1, 2, 3, 5]) {
      const s = buildScene(order, dataset.languages, all.filter((x) => x.sigma >= t));
      expect(s.layout.order).toEqual(scene.layout.order);
      expect(s.layout.nodes.map((n) => n.y)).toEqual(scene.layout.nodes.map((n) => n.y));
    }
  });
});

describe('SVG export', () => {
  const svg = exportSvg(scene, { title: 'Demo', subtitle: 'test' });

  it('is a well-formed standalone document', () => {
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it('has balanced tags', () => {
    const open = (svg.match(/<g\b/g) ?? []).length;
    const close = (svg.match(/<\/g>/g) ?? []).length;
    expect(open).toBe(close);
  });

  it('labels each subgroup for a vector editor', () => {
    // The point of the project: usable without hand-editing in Illustrator.
    for (const c of scene.contours) {
      expect(svg).toContain(`data-subgroup="${c.subgroup.memberNames.join(' + ')}"`);
    }
  });

  it('carries the metrics as data attributes', () => {
    expect(svg).toMatch(/data-sigma="\d+\.\d{3}"/);
    expect(svg).toMatch(/data-kappa="\d+\.\d{3}"/);
    expect(svg).toMatch(/data-epsilon="\d+\.\d{3}"/);
  });

  it('names every language', () => {
    for (const label of dataset.languages) {
      expect(svg).toContain(`data-language="${label}"`);
    }
  });

  it('escapes markup in labels', () => {
    const nasty = buildScene(
      [0, 1],
      ['<script>', 'A&B'],
      [{ members: [0, 1], memberNames: ['<script>', 'A&B'], epsilon: 1, kappa: 1, sigma: 1, p: 1, q: 0 }],
    );
    const out = exportSvg(nasty);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('A&amp;B');
  });
});
