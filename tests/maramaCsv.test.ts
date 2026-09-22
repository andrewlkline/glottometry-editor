import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseMaramaCsv, toMaramaCsv } from '../src/data/maramaCsv.js';

const demoPath = fileURLToPath(
  new URL('../prototype/data/innov.csv', import.meta.url),
);

describe('Marama CSV import', () => {
  const text = readFileSync(demoPath, 'utf-8');
  const ds = parseMaramaCsv(text);

  it('reads the demo dataset', () => {
    expect(ds.languages.length).toBe(18);
    expect(ds.innovations.length).toBe(473);
    expect(ds.matrix.every((r) => r.length === 18)).toBe(true);
  });

  it('preserves unicode language labels', () => {
    expect(ds.languages[0]).toBe('ⓁA');
    expect(ds.languages[17]).toBe('ⓁR');
  });

  it('distinguishes 0 from unknown', () => {
    const flat = ds.matrix.flat();
    expect(flat.filter((c) => c === null).length).toBe(313);
    expect(flat.some((c) => c === 0)).toBe(true);
    expect(flat.some((c) => c === 1)).toBe(true);
  });

  it('handles CR-only line endings', () => {
    // K&F's own demo files ship with classic-Mac line endings.
    const cr = 'lbl,A,B\nx,1,0'.replace(/\n/g, '\r');
    const parsed = parseMaramaCsv(cr);
    expect(parsed.languages).toEqual(['A', 'B']);
    expect(parsed.matrix).toEqual([[1, 0]]);
  });

  it('treats blank, NA and dash alike', () => {
    const parsed = parseMaramaCsv('lbl,A,B,C,D\nx,,NA,-,?');
    expect(parsed.matrix[0]).toEqual([null, null, null, null]);
  });

  it('handles quoted labels containing commas', () => {
    const parsed = parseMaramaCsv('lbl,A,B\n"bite, irregular",1,0');
    expect(parsed.innovations[0]).toBe('bite, irregular');
    expect(parsed.matrix[0]).toEqual([1, 0]);
  });

  it('rejects input without language columns', () => {
    expect(() => parseMaramaCsv('onlyonecolumn\nx')).toThrow();
  });
});

describe('Marama CSV round-trip', () => {
  it('survives parse -> serialise -> parse unchanged', () => {
    const original = parseMaramaCsv(readFileSync(demoPath, 'utf-8'));
    const again = parseMaramaCsv(toMaramaCsv(original));
    expect(again.languages).toEqual(original.languages);
    expect(again.innovations).toEqual(original.innovations);
    expect(again.matrix).toEqual(original.matrix);
  });

  it('quotes labels that need it', () => {
    const csv = toMaramaCsv({
      languages: ['A'],
      innovations: ['has, comma'],
      matrix: [[1]],
    });
    expect(csv).toContain('"has, comma"');
  });
});
