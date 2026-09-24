import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { columnLetter, detectDelimiter, tokenize } from '../src/data/csv.js';
import {
  checkCoordinatesCsv, checkInnovationsCsv, crossCheckCoordinates, MAX_EXAMPLES, readCell,
  type Issue, type Severity,
} from '../src/data/csvCheck.js';
import { INNOVATIONS_TEMPLATE, coordinatesTemplate } from '../src/data/templates.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

const only = (issues: Issue[], severity: Severity) => issues.filter((i) => i.severity === severity);
/** The single issue whose message matches, so a test pins one rule. */
const find = (issues: Issue[], pattern: RegExp) => {
  const hits = issues.filter((i) => pattern.test(i.message));
  expect(hits, `expected one issue matching ${pattern}; got ${issues.map((i) => i.message).join(' | ')}`)
    .toHaveLength(1);
  return hits[0]!;
};

describe('tokenize', () => {
  it('numbers rows as a spreadsheet would, blank rows included', () => {
    const { records } = tokenize('h,A\n\nx,1\n,,\ny,0\n');
    expect(records.map((r) => r.row)).toEqual([1, 3, 5]);
  });

  it('keeps a quoted line break inside one row', () => {
    const { records } = tokenize('h,A\n"two\nlines",1\nz,0');
    expect(records[1]!.fields[0]).toBe('two\nlines');
    expect(records[2]!.row).toBe(3);
  });

  it('handles CR-only, CRLF and a byte-order mark', () => {
    expect(tokenize('﻿h,A\rx,1\r').records.map((r) => r.fields)).toEqual([['h', 'A'], ['x', '1']]);
    expect(tokenize('h,A\r\nx,1\r\n').records.map((r) => r.fields)).toEqual([['h', 'A'], ['x', '1']]);
  });

  it('reports the row where an unclosed quote opened', () => {
    expect(tokenize('h,A\nx,1\n"oops,1\ny,0').unclosedQuoteRow).toBe(3);
  });

  it('keeps a quote in mid-field as a literal', () => {
    expect(tokenize('h,A\n5" nail,1').records[1]!.fields).toEqual(['5" nail', '1']);
  });

  it('detects semicolon and tab delimiters, preferring comma on a tie', () => {
    expect(detectDelimiter(';A;B;C\nx;1;0;1')).toBe(';');
    expect(detectDelimiter('\tA\tB\nx\t1\t0')).toBe('\t');
    expect(detectDelimiter('"a;b",A\nx,1')).toBe(',');
  });

  it('letters columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(columnLetter))
      .toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
});

describe('readCell', () => {
  it('accepts the unknown spellings in circulation', () => {
    for (const v of ['', ' ', 'NA', 'na', 'N/A', '-', '–', '—', '?']) expect(readCell(v)).toBeNull();
  });
  it('accepts numeric exports of 1 and 0', () => {
    expect([readCell('1.0'), readCell(' 0 '), readCell('0.00')]).toEqual([1, 0, 0]);
  });
  it('refuses anything else rather than guessing', () => {
    for (const v of ['x', 'yes', '2', '0.5', 'TRUE', '1a']) expect(readCell(v)).toBeUndefined();
  });
});

describe('innovations: files that should load', () => {
  it("loads Kalyan & François's data without errors", () => {
    const { value, issues } = checkInnovationsCsv(read('../prototype/data/innov.csv'));
    expect(only(issues, 'error')).toEqual([]);
    expect(value?.languages).toHaveLength(18);
    // Their ten family-wide innovations are noted, not warned about.
    expect(find(issues, /present in every language/).severity).toBe('info');
  });

  it('has nothing at all to say about the demo or the template', () => {
    expect(checkInnovationsCsv(read('../public/demo/innov.csv')).issues).toEqual([]);
    expect(checkInnovationsCsv(INNOVATIONS_TEMPLATE).issues).toEqual([]);
  });

  it('ignores the empty columns and rows spreadsheets pad files with', () => {
    const { value, issues } = checkInnovationsCsv(',A,B,C,,\nx,1,0,1,,\ny,0,1,1,,\n,,,,,\n');
    expect(issues).toEqual([]);
    expect(value?.languages).toEqual(['A', 'B', 'C']);
    expect(value?.innovations).toEqual(['x', 'y']);
  });

  it('reads semicolon-separated files, and says so', () => {
    const { value, issues } = checkInnovationsCsv(';A;B;C\nx;1;0;1\ny;0;1;1');
    expect(value?.matrix).toEqual([[1, 0, 1], [0, 1, 1]]);
    expect(find(issues, /semicolon/).severity).toBe('info');
  });
});

describe('innovations: files that must be refused', () => {
  it('names the cell, the language and the value for unrecognised cells', () => {
    const { value, issues } = checkInnovationsCsv(',A,B,C\nx,1,x,0\ny,0,1,1');
    expect(value).toBeNull();
    const issue = find(issues, /not 1, 0, or unknown/);
    expect(issue.examples).toEqual(["C2 (B): 'x'"]);
    // An 'x' for "present" usually comes with blanks for "absent".
    expect(issue.hint).toMatch(/blank cell means "unknown", not "absent"/);
  });

  it('aggregates a repeated problem into one issue with a count', () => {
    const rows = Array.from({ length: 20 }, (_, i) => `i${i},x,1,0`).join('\n');
    const issue = find(checkInnovationsCsv(`,A,B,C\n${rows}`).issues, /not 1, 0/);
    expect(issue.count).toBe(20);
    expect(issue.examples).toHaveLength(MAX_EXAMPLES);
    expect(issue.message).toMatch(/^20 cells/);
    expect(issue.hint).toMatch(/'x' ×20/);
  });

  it('catches an unquoted comma in a label, which would shift the row', () => {
    const { value, issues } = checkInnovationsCsv(',A,B,C\nbite, irregular,1,1,0\ny,0,1,1');
    expect(value).toBeNull();
    const issue = find(issues, /more values than there are languages/);
    expect(issue.examples![0]).toMatch(/^row 2 \('bite'\) has 4 values for 3 languages/);
    expect(issue.hint).toMatch(/double quotes/);
    // The half-label now sitting in A's cell is the same mistake, not another.
    expect(issues.filter((i) => /not 1, 0/.test(i.message))).toEqual([]);
  });

  it('refuses a column with data but no language name', () => {
    const issue = find(checkInnovationsCsv(',A,,C\nx,1,0,1\ny,0,1,1').issues, /no language name/);
    expect(issue.severity).toBe('error');
    expect(issue.examples).toEqual(['C1']);
  });

  it('refuses duplicated language names, citing both columns', () => {
    const issue = find(checkInnovationsCsv(',A,B,A\nx,1,0,1\ny,0,1,1').issues, /more than one column/);
    expect(issue.examples).toEqual(["'A' in B1 and D1"]);
  });

  it('notices when row 1 is data rather than a header', () => {
    const { value, issues } = checkInnovationsCsv('x,1,0,1\ny,0,1,1');
    expect(value).toBeNull();
    find(issues, /looks like data/);
  });

  it('refuses a header with no language columns, or no rows under it', () => {
    expect(checkInnovationsCsv('onlyonecolumn\nx').value).toBeNull();
    find(checkInnovationsCsv(',A,B,C\n').issues, /no innovations below/);
    find(checkInnovationsCsv('   \n').issues, /empty/);
  });

  it('refuses an unclosed quote rather than swallowing the rest of the file', () => {
    const issue = find(checkInnovationsCsv(',A,B,C\n"x,1,0,1\ny,0,1,1').issues, /never closes/);
    expect(issue.severity).toBe('error');
    expect(issue.examples).toEqual(['row 2']);
  });

  it('recognises an Excel workbook and a UTF-16 file', () => {
    find(checkInnovationsCsv('PK\u0003\u0004binary').issues, /Excel workbook/);
    find(checkInnovationsCsv(',\u0000A\u0000').issues, /UTF-16/);
  });
});

describe('innovations: loaded, with warnings', () => {
  it('reads missing trailing cells as unknown, and says so', () => {
    const { value, issues } = checkInnovationsCsv(',A,B,C\nx,1,1\ny,0,1,1');
    expect(value?.matrix[0]).toEqual([1, 1, null]);
    expect(find(issues, /shorter than the header/).severity).toBe('warning');
  });

  it('warns about text that cannot have been meant', () => {
    const csv = ',A,B,C,D\nsame,1,1,0,0\nsame,0,1,1,0\n,1,0,0,0\nnothing,0,0,NA,0';
    const { value, issues } = checkInnovationsCsv(csv);
    expect(value).not.toBeNull();
    expect(only(issues, 'error')).toEqual([]);
    expect(find(issues, /used more than once/).examples).toEqual(["'same' in rows 2, 3"]);
    expect(find(issues, /no label/).examples).toEqual(['A4']);
    expect(find(issues, /not present in any language/).examples).toEqual(["'nothing'"]);
    expect(find(issues, /no innovations at all/).examples).toEqual(['D']);
    expect(value!.innovations[2]).toBe('(unlabelled, row 4)');
  });

  it('flags a dataset too small to subgroup, and one that looks transposed', () => {
    find(checkInnovationsCsv(',A,B\nx,1,0\ny,0,1').issues, /no subgroups to find/);
    const wide = `,${Array.from({ length: 12 }, (_, i) => `L${i}`).join(',')}\n` +
      ['x', 'y', 'z'].map((r, k) => `${r},${Array.from({ length: 12 }, (_, i) => ((i + k) % 3 === 0 ? 1 : 0)).join(',')}`).join('\n');
    find(checkInnovationsCsv(wide).issues, /transposed/);
  });

  it('loads but warns when characters are not UTF-8', () => {
    const { value, issues } = checkInnovationsCsv(',A,B,C\n�a,1,0,1\ny,0,1,1');
    expect(value).not.toBeNull();
    expect(find(issues, /not valid UTF-8/).severity).toBe('warning');
  });
});

describe('coordinates', () => {
  it('loads both shipped coordinate files cleanly', () => {
    for (const f of ['../prototype/data/coords.csv', '../public/demo/coords.csv']) {
      const { value, issues } = checkCoordinatesCsv(read(f));
      expect(issues).toEqual([]);
      expect(Object.keys(value!).length).toBeGreaterThan(10);
    }
  });

  it('explains degrees-minutes-seconds, decimal commas and non-numbers separately', () => {
    const issues = checkCoordinatesCsv(
      'lang;lat;lon\nA;8°33′S;125.5\nB;-8,5;125,3\nC;somewhere;125',
    ).issues;
    expect(find(issues, /degrees-minutes-seconds/).examples).toEqual(["B2 (A): '8°33′S'"]);
    expect(find(issues, /decimal comma/).examples).toEqual(["B3 (B): '-8,5'"]);
    expect(find(issues, /not a number/).examples).toEqual(["B4 (C): 'somewhere'"]);
  });

  it('diagnoses swapped columns from the values', () => {
    const { value, issues } = checkCoordinatesCsv('lang,lat,lon\nA,125.5,-8.5');
    expect(value).toBeNull();
    find(issues, /look swapped/);
  });

  it('refuses headings that say longitude comes first', () => {
    const issue = find(checkCoordinatesCsv('lang,longitude,latitude\nA,125.5,-8.5').issues, /headings say/);
    expect(issue.severity).toBe('error');
  });

  it('refuses out-of-range values, duplicates and half-filled rows', () => {
    const { value, issues } = checkCoordinatesCsv('l,lat,lon\nA,10,200\nB,1,2\nB,3,4\nC,5,');
    expect(value).toBeNull();
    find(issues, /outside the valid range/);
    expect(find(issues, /more than once/).examples).toEqual(["'B' in rows 3 and 4"]);
    find(issues, /only one of latitude and longitude/);
  });

  it('reads a file with no header row, and says so', () => {
    const { value, issues } = checkCoordinatesCsv('A,-8.5,125.5\nB,-8.6,126');
    expect(Object.keys(value!)).toEqual(['A', 'B']);
    expect(find(issues, /read as data/).severity).toBe('info');
  });

  it('skips blank rows with a warning, accepts a typographic minus, and doubts 0, 0', () => {
    const { value, issues } = checkCoordinatesCsv('l,lat,lon\nA,−8.5,125.5\nB,,\nC,0,0');
    expect(value!.A).toEqual({ lat: -8.5, lon: 125.5 });
    expect(find(issues, /no coordinates filled in/).examples).toEqual(['B']);
    find(issues, /Gulf of Guinea/);
  });
});

describe('crossCheckCoordinates', () => {
  const where = { lat: -8, lon: 125 };

  it('matches names that differ only in case or spacing, and reports it', () => {
    const { coordinates, matched, issues } =
      crossCheckCoordinates({ 'beri ': where, Anu: where }, ['Anu', 'Beri']);
    expect(matched).toBe(2);
    expect(coordinates.Beri).toEqual(where);
    expect(find(issues, /ignoring case/).severity).toBe('info');
  });

  it('suggests near misses without applying them', () => {
    const { coordinates, matched, issues } =
      crossCheckCoordinates({ Brei: where, Anu: where }, ['Anu', 'Beri']);
    expect(matched).toBe(1);
    expect(coordinates.Beri).toBeUndefined();
    expect(find(issues, /do(es)? not match/).examples).toEqual(["'Brei' — did you mean 'Beri'?"]);
    expect(find(issues, /no coordinates, so the geographic layout/).examples).toEqual(['Beri']);
  });
});

describe('coordinates template', () => {
  it('lists every language, filling in what is known, and loads back', () => {
    const csv = coordinatesTemplate(['Anu', 'Beri, upper'], { Anu: { lat: -8.5, lon: 125 } });
    expect(csv).toContain('"Beri, upper",,');
    const { value, issues } = checkCoordinatesCsv(csv);
    expect(value).toEqual({ Anu: { lat: -8.5, lon: 125 } });
    expect(find(issues, /no coordinates filled in/).examples).toEqual(['Beri, upper']);
  });
});
