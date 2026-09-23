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
import { chainLayout, orderFor, runsOf } from '../src/core/layout.js';
import { capsuleFor, verticalPadding } from '../src/geometry/capsule.js';
import { pointInRing } from '../src/geometry/blob.js';
import { isSimplePolygon, signedArea } from './helpers.js';
import { parseMaramaCsv } from '../src/data/maramaCsv.js';
import { buildScene } from '../src/render/scene.js';
import { exportSvg } from '../src/render/exportSvg.js';

const dataset = parseMaramaCsv(
  readFileSync(fileURLToPath(new URL('../prototype/data/innov.csv', import.meta.url)), 'utf-8'),
);

const all = new Glottometry(dataset, 'half').subgroups();
const { order } = orderFor(all, dataset.languages.length);
const layout = chainLayout(order, dataset.languages);
const shown = all.filter((s) => s.sigma >= 1);
const scene = buildScene(layout, shown);
const maxTrack = Math.max(...scene.contours.map((c) => c.track));

/** Rebuild a contour's geometry with the same parameters buildScene uses. */
function outlineFor(track: number, runs: [number, number][]) {
  return capsuleFor(runs, {
    cx: scene.layout.nodes[0]!.x,
    top: scene.layout.nodes[0]!.y,
    spacing: scene.layout.spacing,
    halfWidth: scene.layout.nodeRadius + 8 + track * 7,
    verticalPadding: verticalPadding(
      track, maxTrack, 8, scene.layout.spacing, scene.layout.nodeRadius,
    ),
  });
}

describe('scene on the demo dataset', () => {
  it('builds a contour per displayed subgroup', () => {
    expect(scene.contours).toHaveLength(shown.length);
    expect(shown.length).toBeGreaterThan(20);
  });

  it('draws every subgroup as a single connected shape', () => {
    // Routing means even a split subgroup is one outline, not two plus a hint.
    for (const c of scene.contours) expect(c.paths).toHaveLength(1);
  });

  it('routes only the subgroups that are actually split', () => {
    for (const c of scene.contours) {
      const runs = runsOf(c.subgroup.members, scene.layout.position);
      expect(c.routed).toBe(runs.length > 1);
    }
    expect(scene.routedCount).toBeGreaterThan(0);  // the demo data has some
  });

  it('produces a simple, non-degenerate outline for every contour', () => {
    // Containment alone is satisfiable by a self-intersecting shape that
    // traces a region twice and cancels it under even-odd. The contour also
    // has to be a polygon you could cut out.
    for (const c of scene.contours) {
      const runs = runsOf(c.subgroup.members, scene.layout.position);
      const { outlines } = outlineFor(c.track, runs);
      for (const outline of outlines) {
        expect(
          isSimplePolygon(outline),
          `${c.subgroup.memberNames.join('+')} self-intersects`,
        ).toBe(true);
        expect(
          Math.abs(signedArea(outline)),
          `${c.subgroup.memberNames.join('+')} encloses no area`,
        ).toBeGreaterThan(1);
      }
    }
  });

  it('orders a routed outline from the topmost run downward', () => {
    for (const c of scene.contours.filter((x) => x.routed)) {
      const runs = runsOf(c.subgroup.members, scene.layout.position);
      const { outlines } = outlineFor(c.track, runs);
      const firstY = outlines[0]![0]![1];
      const topNodeY = Math.min(
        ...c.subgroup.members.map((m) => scene.layout.nodes
          .find((n) => n.language === m)!.y),
      );
      expect(firstY).toBeLessThan(topNodeY);
    }
  });

  it('contains every member and excludes every non-member', () => {
    // Point-in-polygon on the real outline, not bounding boxes: a routed
    // contour's box spans the gap it deliberately excludes, so a box test
    // would pass while the shape was wrong.
    for (const c of scene.contours) {
      const runs = runsOf(c.subgroup.members, scene.layout.position);
      const { outlines } = outlineFor(c.track, runs);
      const memberSet = new Set(c.subgroup.members);

      for (const node of scene.layout.nodes) {
        const inside = outlines.some((o) => pointInRing([node.x, node.y], o));
        expect(
          inside,
          `${node.label} in ${c.subgroup.memberNames.join('+')}`,
        ).toBe(memberSet.has(node.language));
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
      const s = buildScene(layout, all.filter((x) => x.sigma >= t));
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
      chainLayout([0, 1], ['<script>', 'A&B']),
      [{ members: [0, 1], memberNames: ['<script>', 'A&B'], epsilon: 1, kappa: 1, sigma: 1, p: 1, q: 0 }],
    );
    const out = exportSvg(nasty);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('A&amp;B');
  });
});
