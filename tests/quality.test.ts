/**
 * Innovation quality: the label-prefix grammar, and the precedence that turns
 * recorded fields into a judgement.
 */

import { describe, it, expect } from 'vitest';
import { splitPrefix, typeOf } from '../src/core/innovationTypes.js';
import { assessQuality, labelQuality, qualityCounts } from '../src/core/quality.js';
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
