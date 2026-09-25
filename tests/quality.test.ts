/**
 * Innovation quality: the label-prefix grammar, and the precedence that turns
 * recorded fields into a judgement.
 */

import { describe, it, expect } from 'vitest';
import { splitPrefix, typeOf } from '../src/core/innovationTypes.js';
import {
  assessQuality, exclusiveByQuality, highQualitySubset, labelQuality, qualityCounts, supportClass,
} from '../src/core/quality.js';
import { Glottometry, maskOf } from '../src/core/metrics.js';
import { weightsFor } from '../src/core/innovationTypes.js';
import { chainLayout, orderFor } from '../src/core/layout.js';
import { buildScene } from '../src/render/scene.js';
import { exportSvg } from '../src/render/exportSvg.js';
import { FADED_OPACITY, supportDash } from '../src/render/styles.js';
import { applyQualityOverlay } from '../src/render/qualityOverlay.js';
import type { Dataset } from '../src/core/types.js';
import { createProject, parseProject, serializeProject } from '../src/data/project.js';
import { updateMeta } from '../src/data/edit.js';

describe('label prefix modifiers', () => {
  it('splits a prefix into type, status letter and mark', () => {
    expect(splitPrefix('Lex-R+: water')).toEqual({ base: 'Lex', status: 'R', mark: '+' });
    expect(splitPrefix('ISC-: bite')).toEqual({ base: 'ISC', status: undefined, mark: '-' });
    expect(splitPrefix('lex-s: x')).toEqual({ base: 'lex', status: 'S', mark: undefined });
    expect(splitPrefix('no prefix here')).toBeNull();
    expect(splitPrefix('two words: x')).toBeNull();
  });

  it('still reads the type underneath the modifiers', () => {
    expect(typeOf('Lex-R+: water')).toBe('Lex');
    expect(typeOf('ISC-: bite')).toBe('ISC');
    expect(typeOf('Sytx+: order')).toBe('Syn');
    expect(typeOf('Lex R: spaced')).toBe('untyped');
  });

  it('reads status only on lexical innovations, and marks on any', () => {
    expect(labelQuality("Lex-R: 'gills'")).toEqual({ lexicalStatus: 'replacement' });
    expect(labelQuality('Lex-S-: rat')).toEqual({ lexicalStatus: 'synonymic', quality: 'low' });
    expect(labelQuality('ISC-R: bite')).toEqual({});
    expect(labelQuality('Lex-X: odd')).toEqual({});
    expect(labelQuality('RSC+: *w > c')).toEqual({ quality: 'high' });
  });
});

describe('assessQuality', () => {
  it('infers nothing from type alone', () => {
    for (const label of ['RSC: *s > h', 'ISC: bite', 'Mrp: 1sg', 'untyped thing']) {
      expect(assessQuality(label)).toMatchObject({ quality: 'undetermined', source: 'none' });
    }
  });

  it("follows Smith's lexical statuses", () => {
    expect(assessQuality("Lex-R: 'gills'").quality).toBe('high');
    expect(assessQuality("Lex-S: 'rat'").quality).toBe('low');
    expect(assessQuality("Lex-N: 'maize'").quality).toBe('low');
    expect(assessQuality("Lex-I: 'x'")).toMatchObject({
      quality: 'undetermined', reason: expect.stringMatching(/indeterminate/),
    });
    expect(assessQuality("Lex: 'x'")).toMatchObject({
      quality: 'undetermined', reason: 'lexical status not recorded',
    });
  });

  it('lets recorded fields override the label', () => {
    expect(assessQuality("Lex-R: 'x'", { lexicalStatus: 'synonymic' }).quality).toBe('low');
    expect(assessQuality('RSC+: x', { quality: 'low' })).toMatchObject({
      quality: 'low', source: 'explicit',
    });
  });

  it('treats irregular correspondences as a loan, whatever the status', () => {
    expect(assessQuality("Lex-R: 'x'", { correspondences: 'irregular' })).toMatchObject({
      quality: 'low', reason: expect.stringMatching(/loan/),
    });
    expect(assessQuality("Lex-R: 'x'", { correspondences: 'regular' }).quality).toBe('high');
  });

  it('puts an explicit judgement above everything derived', () => {
    expect(assessQuality("Lex-S: 'x'", { correspondences: 'irregular', quality: 'high' }))
      .toMatchObject({ quality: 'high', source: 'explicit' });
    // A mark in the label is a judgement too.
    expect(assessQuality('ISC+: x', { correspondences: 'irregular' }))
      .toMatchObject({ quality: 'high', source: 'label' });
  });

  it('uses the explicit type, not the prefix, to decide whether status applies', () => {
    expect(assessQuality('no prefix', { type: 'Lex', lexicalStatus: 'replacement' }).quality)
      .toBe('high');
    expect(assessQuality("Lex-R: 'x'", { type: 'ISC' }).quality).toBe('undetermined');
  });

  it('counts classes', () => {
    const js = ["Lex-R: a", "Lex-S: b", 'ISC: c', 'ISC+: d'].map((l) => assessQuality(l));
    expect(qualityCounts(js)).toEqual({ high: 2, low: 1, undetermined: 1 });
  });
});

describe('quality fields in a project', () => {
  it('survive save and load', () => {
    const base = createProject('t', {
      languages: ['A', 'B', 'C'],
      innovations: ["Lex: 'x'"],
      matrix: [[1, 1, 0]],
    });
    const edited = updateMeta(base, 0, {
      lexicalStatus: 'replacement', correspondences: 'irregular', quality: 'high',
    });
    const loaded = parseProject(serializeProject(edited));
    expect(loaded.innovationMeta![0]).toMatchObject({
      lexicalStatus: 'replacement', correspondences: 'irregular', quality: 'high',
    });
  });

  it('can be cleared back to derived', () => {
    const base = createProject('t', { languages: ['A', 'B'], innovations: ['ISC: x'], matrix: [[1, 0]] });
    const set = updateMeta(base, 0, { quality: 'high' });
    const cleared = parseProject(serializeProject(updateMeta(set, 0, { quality: undefined })));
    expect(cleared.innovationMeta![0]!.quality).toBeUndefined();
    expect(assessQuality('ISC: x', cleared.innovationMeta![0]).quality).toBe('undetermined');
  });
});

describe('quality in the diagram', () => {
  // A and B share one replacement, one synonymic innovation and one
  // unassessed sound change; C and D share only a synonymic one.
  const ds: Dataset = {
    languages: ['A', 'B', 'C', 'D'],
    innovations: ['Lex-R: a', 'Lex-S: b', 'ISC: c', 'Lex-S: d', 'Lex-R: e'],
    matrix: [[1, 1, 0, 0], [1, 1, 0, 0], [1, 1, 0, 0], [0, 0, 1, 1], [1, 1, null, 0]],
  };
  const classOf = (r: number) => assessQuality(ds.innovations[r]!).quality;

  it('splits exclusive support by class, as expected counts', () => {
    const g = new Glottometry(ds, 'half');
    const split = exclusiveByQuality(g, maskOf([0, 1], 4), classOf);
    // Row e has an unknown cell in C: exclusive with probability 0.5.
    expect(split).toEqual({ high: 1.5, low: 1, undetermined: 1 });
    expect(split.high + split.low + split.undetermined).toBeCloseTo(g.stats(maskOf([0, 1], 4)).epsilon, 12);
  });

  it('ignores type weights, which say how much an innovation counts, not whether it exists', () => {
    const weights = weightsFor(ds, { Lex: 0.1 })!;
    const g = new Glottometry(ds, 'half', weights);
    expect(exclusiveByQuality(g, maskOf([0, 1], 4), classOf).high).toBe(1.5);
  });

  it('classifies support, keeping "not assessed" apart from "low"', () => {
    expect(supportClass({ high: 0.5, low: 9, undetermined: 9 })).toBe('high');
    expect(supportClass({ high: 0.49, low: 2, undetermined: 0.2 })).toBe('low');
    expect(supportClass({ high: 0, low: 2, undetermined: 1 })).toBe('unassessed');
    expect(supportClass({ high: 0, low: 0, undetermined: 0 })).toBe('low');
    const g = new Glottometry(ds, 'half');
    expect(supportClass(exclusiveByQuality(g, maskOf([2, 3], 4), classOf))).toBe('low');
  });

  it('keeps weights aligned when taking the high-quality subset', () => {
    const weights = weightsFor(ds, { Lex: 0.5, ISC: 3 })!;
    const sub = highQualitySubset(ds, weights, (r) => classOf(r) === 'high');
    expect(sub.dataset.innovations).toEqual(['Lex-R: a', 'Lex-R: e']);
    expect(sub.dataset.matrix).toEqual([ds.matrix[0], ds.matrix[4]]);
    expect(Array.from(sub.weights!)).toEqual([0.5, 0.5]);
    expect(highQualitySubset(ds, null, () => false).weights).toBeNull();
  });

  it('draws low-only dashed and unassessed dotted, scaled to the stroke', () => {
    expect(supportDash('high', 5)).toBeUndefined();
    expect(supportDash('low', 1)).toBe('4 5');
    expect(supportDash('low', 10)).toBe('16 24');
    expect(supportDash('unassessed', 10)).toBe('0 21');
    // Round caps close a gap by the stroke width; the gap must exceed it.
    for (const w of [1, 3, 7, 11]) {
      const [, gap] = supportDash('low', w)!.split(' ').map(Number);
      expect(gap!).toBeGreaterThan(w + 2);
    }
  });

  it('writes line style, fading and data attributes into the export', () => {
    const g = new Glottometry(ds, 'half');
    const shown = g.subgroups().filter((s) => s.epsilon >= 1);
    const { order } = orderFor(shown, ds.languages.length);
    const scene = buildScene(chainLayout(order, ds.languages), shown);
    const plain = exportSvg(scene);
    expect(plain).not.toMatch(/stroke-dasharray|opacity=|data-support/);

    const decorated = {
      ...scene,
      contours: scene.contours.map((c) => ({
        ...c,
        style: { ...c.style, dasharray: '4 5', opacity: 0.22 },
        quality: { support: 'low' as const, survives: false },
      })),
    };
    const svg = exportSvg(decorated);
    expect(svg).toMatch(/stroke-dasharray="4 5"/);
    expect(svg).toMatch(/opacity="0.22"/);
    expect(svg).toMatch(/data-support="low" data-survives="false"/);
  });
});

describe('applyQualityOverlay', () => {
  const ds: Dataset = {
    languages: ['A', 'B', 'C', 'D'],
    innovations: ['Lex-R: a', 'Lex-S: b', 'Lex-S: c', 'ISC: d'],
    matrix: [[1, 1, 0, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 1, 1]],
  };
  const g = new Glottometry(ds, 'half');
  const shown = g.subgroups();
  const { order } = orderFor(shown, 4);
  const scene = buildScene(chainLayout(order, ds.languages), shown);
  const classOf = (r: number) => assessQuality(ds.innovations[r]!).quality;
  const byName = (s: typeof scene, members: string) =>
    s.contours.find((c) => c.key === members)!;

  it('returns the scene untouched when off', () => {
    expect(applyQualityOverlay(scene, g, classOf, { lines: false })).toBe(scene);
  });

  it('restyles by support class without touching the geometry', () => {
    const out = applyQualityOverlay(scene, g, classOf, { lines: true });
    expect(byName(out, '0,1').quality).toEqual({ support: 'high', survives: undefined });
    expect(byName(out, '0,1').style.dasharray).toBeUndefined();
    expect(byName(out, '1,2').quality!.support).toBe('low');
    expect(byName(out, '1,2').style.dasharray).toBeDefined();
    expect(byName(out, '2,3').quality!.support).toBe('unassessed');
    expect(byName(out, '2,3').style.dasharray).toMatch(/^0 /);
    out.contours.forEach((c, i) => expect(c.paths).toBe(scene.contours[i]!.paths));
    expect(out.contours.every((c) => c.style.opacity === undefined)).toBe(true);
  });

  it('fades exactly the groups that do not survive, independently of line style', () => {
    const out = applyQualityOverlay(scene, g, classOf, { lines: false, survives: (k) => k === '0,1' });
    expect(byName(out, '0,1').style.opacity).toBeUndefined();
    expect(byName(out, '1,2').style.opacity).toBe(FADED_OPACITY);
    expect(out.contours.every((c) => c.style.dasharray === undefined)).toBe(true);
  });
});
