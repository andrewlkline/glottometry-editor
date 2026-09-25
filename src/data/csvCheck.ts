/**
 * Validation for the two CSV inputs, with feedback a person can act on.
 *
 * The old parser never refused anything: a cell reading 'x' became "unknown",
 * a coordinate reading 14°12'S dropped the language from the map, and a comma
 * in an unquoted label shifted every value in its row one language to the
 * right. Each produced a plausible-looking diagram that was simply wrong, which
 * for a tool whose output is evidence about a language family is the worst
 * failure available.
 *
 * So every rule here either **blocks** the import (the data would be misread)
 * or **warns** (it will be read as written, but probably isn't what was meant).
 * Problems are reported by spreadsheet cell, aggregated per rule so a file with
 * four hundred 'x' cells yields one message rather than four hundred, and each
 * carries a hint saying how to fix it.
 */

import type { Cell, Dataset } from '../core/types.js';
import type { LanguageCoordinates } from './maramaCsv.js';
import { splitPrefix, typeOf } from '../core/innovationTypes.js';
import { STATUS_LETTERS } from '../core/quality.js';
import { columnLetter, tokenize, trimTrailing, type Delimiter, type Tokenized } from './csv.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  /** `error` blocks the import; `warning` and `info` do not. */
  severity: Severity;
  message: string;
  /** Where, as a spreadsheet shows it — "D14 (Beri): 'x'". Capped. */
  examples?: string[];
  /** Total occurrences, when there are more than `examples` shows. */
  count?: number;
  /** How to fix it. */
  hint?: string;
}

export interface CheckResult<T> {
  /** Null when any issue is an error: nothing should be imported. */
  value: T | null;
  issues: Issue[];
}

export const MAX_EXAMPLES = 6;

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** One aggregated issue per rule, however many places it occurs. */
function aggregate(
  issues: Issue[], severity: Severity, found: string[],
  message: (n: number) => string, hint?: string,
): void {
  if (found.length === 0) return;
  issues.push({
    severity,
    message: message(found.length),
    examples: found.slice(0, MAX_EXAMPLES),
    count: found.length,
    hint,
  });
}

const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === 'error');

const show = (s: string, max = 32) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return `'${t.length > max ? `${t.slice(0, max - 1)}…` : t}'`;
};

// ---------------------------------------------------------------------------
// Problems with the file itself, before it is read as a table

const DELIMITER_NAMES: Record<Delimiter, string> = {
  ',': 'comma', ';': 'semicolon', '\t': 'tab',
};

/**
 * Catch files that are not UTF-8 text at all.
 *
 * Linguists' labels are full of IPA and diacritics, and Excel for Mac's plain
 * "CSV" option still writes Mac Roman, which turns ŋ into garbage without any
 * error. The browser's decoder marks what it could not read with U+FFFD.
 */
function sniffFile(text: string): Issue | null {
  if (text.startsWith('PK\u0003\u0004')) {
    return {
      severity: 'error',
      message: 'This is an Excel workbook (.xlsx), not a CSV file.',
      hint: 'In Excel choose File → Save As… and pick "CSV UTF-8 (Comma delimited)".',
    };
  }
  if (text.includes('\u0000')) {
    return {
      severity: 'error',
      message: 'The file looks UTF-16 encoded, so it cannot be read as text here.',
      hint: 'Re-save it as "CSV UTF-8". (Excel\'s "Unicode Text" option produces UTF-16.)',
    };
  }
  if (text.includes('�')) {
    return {
      severity: 'warning',
      message: 'Some characters are not valid UTF-8 and will appear as �.',
      hint:
        'Labels with IPA or diacritics will be garbled. Re-save as "CSV UTF-8" — ' +
        'Excel\'s plain "CSV" option uses an older encoding that cannot hold them.',
    };
  }
  return null;
}

/** File-level checks shared by both formats. Returns null when it is hopeless. */
function readTable(text: string, issues: Issue[]): Tokenized | null {
  if (text.trim() === '') {
    issues.push({ severity: 'error', message: 'The file is empty.' });
    return null;
  }
  const sniffed = sniffFile(text);
  if (sniffed) {
    issues.push(sniffed);
    if (sniffed.severity === 'error') return null;
  }
  const table = tokenize(text);
  if (table.delimiter !== ',') {
    issues.push({
      severity: 'info',
      message: `Read as ${DELIMITER_NAMES[table.delimiter]}-separated rather than comma-separated.`,
    });
  }
  if (table.unclosedQuoteRow !== undefined) {
    issues.push({
      severity: 'error',
      message:
        `A quotation mark in row ${table.unclosedQuoteRow} opens a quoted cell that never ` +
        'closes, so everything after it would be read as a single cell.',
      examples: [`row ${table.unclosedQuoteRow}`],
      hint:
        'A cell that starts with " is read as quoted up to the next ". Remove the stray ' +
        'quote, or double it ("") if it belongs in the label.',
    });
  }
  return table;
}

// ---------------------------------------------------------------------------
// Innovations

const UNKNOWN_TOKENS = new Set(['', 'na', 'n/a', '-', '–', '—', '?']);

/** 1, 0 or unknown; undefined when the cell is none of those. */
export function readCell(raw: string): Cell | undefined {
  const v = raw.trim();
  // "1.0" is what pandas and R write for a numeric column.
  if (/^1(\.0*)?$/.test(v)) return 1;
  if (/^0(\.0*)?$/.test(v)) return 0;
  if (UNKNOWN_TOKENS.has(v.toLowerCase())) return null;
  return undefined;
}

export function checkInnovationsCsv(text: string): CheckResult<Dataset> {
  const issues: Issue[] = [];
  const table = readTable(text, issues);
  if (!table) return { value: null, issues };

  const [head, ...rows] = table.records;
  if (!head) {
    issues.push({ severity: 'error', message: 'The file has no rows.' });
    return { value: null, issues };
  }

  const header = trimTrailing(head.fields);
  if (header.length < 2) {
    issues.push({
      severity: 'error',
      message: 'The first row has only one cell, so there are no language columns.',
      hint:
        'Row 1 should hold a blank cell (or a title) in column A, then one language ' +
        'name per column: B1, C1, D1…',
    });
    return { value: null, issues };
  }

  const languages = header.slice(1).map((h) => h.trim());
  const at = (col: number, row: number) => `${columnLetter(col)}${row}`;

  if (languages.every((l) => l !== '' && readCell(l) !== undefined)) {
    issues.push({
      severity: 'error',
      message: 'Row 1 looks like data (1s and 0s) rather than language names.',
      examples: [`B${head.row}: ${show(languages[0]!)}`],
      hint: 'Insert a header row above it naming each language column. Its first cell can be blank.',
    });
    return { value: null, issues };
  }

  aggregate(
    issues, 'error',
    languages.flatMap((l, i) => (l === '' ? [`${at(i + 1, head.row)}`] : [])),
    (n) => `${n} ${plural(n, 'column has', 'columns have')} no language name in row 1.`,
    'Every column after the first needs a language name in row 1. Delete the column if it is not a language.',
  );

  const firstSeen = new Map<string, number>();
  const duplicateLanguages: string[] = [];
  languages.forEach((l, i) => {
    if (l === '') return;
    const prior = firstSeen.get(l);
    if (prior === undefined) firstSeen.set(l, i);
    else duplicateLanguages.push(`${show(l)} in ${at(prior + 1, head.row)} and ${at(i + 1, head.row)}`);
  });
  aggregate(
    issues, 'error', duplicateLanguages,
    (n) => `${n} language ${plural(n, 'name appears', 'names appear')} in more than one column.`,
    'Each language needs its own unique column heading; merge or rename the duplicates.',
  );

  if (rows.length === 0) {
    issues.push({
      severity: 'error',
      message: 'There is a header row but no innovations below it.',
      hint: 'Add one row per innovation: its label in column A, then 1 / 0 / blank for each language.',
    });
    return { value: null, issues };
  }

  const tooLong: string[] = [];
  const tooShort: string[] = [];
  const badCells: string[] = [];
  const badValues = new Map<string, number>();
  const unlabelled: string[] = [];
  const labelRows = new Map<string, number[]>();
  const noOnes: string[] = [];
  const statusOffLex: string[] = [];
  const unknownStatus: string[] = [];
  const allOnes: string[] = [];
  const onesPerLanguage = new Array<number>(languages.length).fill(0);
  const knownPerLanguage = new Array<number>(languages.length).fill(0);

  const innovations: string[] = [];
  const matrix: Cell[][] = [];

  for (const record of rows) {
    const { fields, row } = record;
    const label = (fields[0] ?? '').trim();
    const shown = label ? show(label, 28) : `row ${row}`;

    const used = trimTrailing(fields).length;
    const shifted = used > header.length;
    if (shifted) {
      tooLong.push(`row ${row} ${label ? `(${show(label, 24)}) ` : ''}has ${used - 1} values for ${languages.length} languages`);
    } else if (fields.length < header.length) {
      tooShort.push(`row ${row}: ${fields.length - 1} of ${languages.length}`);
    }

    if (!label) unlabelled.push(`A${row}`);
    else labelRows.set(label, [...(labelRows.get(label) ?? []), row]);

    const prefix = splitPrefix(label);
    if (prefix?.status) {
      const where = `A${row}: ${show(label.slice(0, label.indexOf(':') + 1), 16)}`;
      if (typeOf(label) !== 'Lex') statusOffLex.push(where);
      else if (!STATUS_LETTERS[prefix.status]) unknownStatus.push(where);
    }

    const cells: Cell[] = new Array(languages.length);
    let ones = 0;
    for (let c = 0; c < languages.length; c++) {
      const raw = fields[c + 1] ?? '';
      // In a shifted row the half-label lands in a language's cell; reporting
      // it as a bad value too would count one mistake twice.
      const v = shifted ? readCell(raw) ?? null : readCell(raw);
      if (v === undefined) {
        badCells.push(`${at(c + 1, row)} (${languages[c]}): ${show(raw, 16)}`);
        const key = raw.trim();
        badValues.set(key, (badValues.get(key) ?? 0) + 1);
        cells[c] = null;
        continue;
      }
      cells[c] = v;
      if (v !== null) knownPerLanguage[c]!++;
      if (v === 1) {
        ones++;
        onesPerLanguage[c]!++;
      }
    }
    if (ones === 0) noOnes.push(shown);
    else if (ones === languages.length) allOnes.push(shown);

    innovations.push(label || `(unlabelled, row ${row})`);
    matrix.push(cells);
  }

  aggregate(
    issues, 'error', tooLong,
    (n) => `${n} ${plural(n, 'row has', 'rows have')} more values than there are languages.`,
    `Usually an innovation label that contains a ${DELIMITER_NAMES[table.delimiter]}, which splits ` +
      'it into two cells and shifts every value after it one language to the right. Wrap such ' +
      'labels in double quotes — "bite, irregular" — or save from a spreadsheet, which does this for you.',
  );

  if (badCells.length > 0) {
    const found = [...badValues.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `${show(v, 12)} ×${n}`)
      .join(', ');
    const marksPresence = [...badValues.keys()].some((v) => /^(x|✓|✔|y|yes|true|\+)$/i.test(v));
    aggregate(
      issues, 'error', badCells,
      (n) => `${n} ${plural(n, 'cell is', 'cells are')} not 1, 0, or unknown.`,
      'Each cell should be 1 (the language has the innovation), 0 (it does not), or blank, ' +
        `NA, - or ? when unknown. Found: ${found}.` +
        (marksPresence
          ? ' If a mark means "present", replace it with 1 — and fill the languages that ' +
            'lack the innovation with 0, since a blank cell means "unknown", not "absent".'
          : ''),
    );
  }

  aggregate(
    issues, 'warning', tooShort,
    (n) => `${n} ${plural(n, 'row is', 'rows are')} shorter than the header; the missing cells are read as unknown.`,
    'If those languages lack the innovation, put 0 in their cells: blank means "unknown".',
  );

  aggregate(
    issues, 'warning', unknownStatus,
    (n) => `${n} lexical ${plural(n, 'prefix has', 'prefixes have')} an unrecognised status letter.`,
    'After Lex- use R (replacement), S (synonymic), N (novel concept) or I (indeterminate). ' +
      'The letter is ignored, so the row reads as plain Lex.',
  );

  aggregate(
    issues, 'warning', statusOffLex,
    (n) => `${n} ${plural(n, 'prefix has', 'prefixes have')} a status letter on a type other than Lex.`,
    'Replacement status (-R, -S, -N, -I) only applies to lexical innovations, so it is ignored ' +
      'here. To mark the quality of any innovation, end the prefix with + or - instead: ISC+:',
  );

  aggregate(
    issues, 'warning', unlabelled,
    (n) => `${n} ${plural(n, 'innovation has', 'innovations have')} no label in column A.`,
    'They are kept and named by row number, but the evidence panel will be hard to read without labels.',
  );

  aggregate(
    issues, 'warning',
    [...labelRows.entries()].filter(([, r]) => r.length > 1)
      .map(([l, r]) => `${show(l, 28)} in rows ${r.join(', ')}`),
    (n) => `${n} innovation ${plural(n, 'label is', 'labels are')} used more than once.`,
    'Each row counts as separate evidence, so a pasted duplicate inflates the subgroup it supports.',
  );

  aggregate(
    issues, 'warning', noOnes,
    (n) => `${n} ${plural(n, 'innovation is', 'innovations are')} not present in any language (no 1s).`,
    'Such a row supports no subgroup. Check it was not filled in with the wrong symbols.',
  );

  // Not a warning: K&F's own data has ten of these, the innovations defining
  // the family as a whole. They are not inert either — each adds equally to
  // every subgroup's p, compressing kappa towards 1 — so they are noted.
  aggregate(
    issues, 'info', allOnes,
    (n) => `${n} ${plural(n, 'innovation is', 'innovations are')} present in every language.`,
    'Expected if they define the family as a whole. They exclude no language, so they ' +
      "support every subgroup equally and raise every subgroup's cohesiveness (κ) alike.",
  );

  aggregate(
    issues, 'warning',
    languages.flatMap((l, c) => (l && onesPerLanguage[c] === 0
      ? [`${l}${knownPerLanguage[c] === 0 ? ' (every cell unknown)' : ''}`]
      : [])),
    (n) => `${n} ${plural(n, 'language has', 'languages have')} no innovations at all (no 1s).`,
    'It will sit outside every subgroup. Check the column was not shifted or left blank.',
  );

  if (languages.length < 3) {
    issues.push({
      severity: 'warning',
      message: `Only ${languages.length} ${plural(languages.length, 'language')}: there are no subgroups to find.`,
      hint: 'Glottometry compares groups within a family, so it needs at least three languages.',
    });
  } else if (languages.length >= 10 && languages.length > innovations.length) {
    issues.push({
      severity: 'warning',
      message:
        `${languages.length} language columns but only ${innovations.length} innovation rows — ` +
        'is the table transposed?',
      hint: 'Languages go across the top (one per column), innovations down the side (one per row).',
    });
  }

  return {
    value: hasErrors(issues) ? null : { languages, innovations, matrix },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Coordinates

/** Accepts the typographic minus copied from Wikipedia and similar. */
function readNumber(raw: string): number | undefined {
  const v = raw.trim().replace(/^[−–]/, '-');
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const LAT_HEADING = /^(lat|lat\.|latitude|y)$/i;
const LON_HEADING = /^(lon|long|lng|lon\.|long\.|longitude|x)$/i;

export function checkCoordinatesCsv(text: string): CheckResult<LanguageCoordinates> {
  const issues: Issue[] = [];
  const table = readTable(text, issues);
  if (!table) return { value: null, issues };

  let records = table.records;
  if (records.length === 0) {
    issues.push({ severity: 'error', message: 'The file has no rows.' });
    return { value: null, issues };
  }

  const width = Math.max(...records.map((r) => trimTrailing(r.fields).length));
  if (width < 3) {
    issues.push({
      severity: 'error',
      message: `Found ${width} ${plural(width, 'column')}; coordinates need three: language, latitude, longitude.`,
      hint:
        'Decimal degrees in separate columns, e.g. Anu, -14.20, 171.10.' +
        (table.delimiter === ';' ? '' : ' If your spreadsheet writes decimal commas, save with semicolons as the separator.'),
    });
    return { value: null, issues };
  }

  const head = records[0]!;
  const headerIsData =
    readNumber(head.fields[1] ?? '') !== undefined && readNumber(head.fields[2] ?? '') !== undefined;
  if (headerIsData) {
    issues.push({
      severity: 'info',
      message: 'Row 1 has numbers in it, so it was read as data rather than as a header.',
    });
  } else {
    const [h1, h2] = [(head.fields[1] ?? '').trim(), (head.fields[2] ?? '').trim()];
    if (LON_HEADING.test(h1) && LAT_HEADING.test(h2)) {
      issues.push({
        severity: 'error',
        message: `The headings say ${show(h1)} then ${show(h2)}, but the columns are read as latitude then longitude.`,
        examples: [`B${head.row}: ${show(h1)}`, `C${head.row}: ${show(h2)}`],
        hint:
          'Swap the two columns so latitude comes first. Columns are read by position, not by ' +
          "heading, which keeps files interchangeable with Kalyan & François's own analyzer.",
      });
    }
    records = records.slice(1);
  }

  if (records.some((r) => trimTrailing(r.fields).length > 3)) {
    issues.push({ severity: 'info', message: 'Columns after the third (C) are ignored.' });
  }

  const out: LanguageCoordinates = {};
  const seen = new Map<string, number>();
  const noName: string[] = [];
  const blank: string[] = [];
  const half: string[] = [];
  const dms: string[] = [];
  const decimalComma: string[] = [];
  const notNumber: string[] = [];
  const swapped: string[] = [];
  const outOfRange: string[] = [];
  const duplicates: string[] = [];
  const nullIsland: string[] = [];

  for (const { fields, row } of records) {
    const label = (fields[0] ?? '').trim();
    const [latRaw, lonRaw] = [(fields[1] ?? '').trim(), (fields[2] ?? '').trim()];

    if (!label) {
      noName.push(`A${row}`);
      continue;
    }
    if (!latRaw && !lonRaw) {
      blank.push(label);
      continue;
    }
    if (!latRaw || !lonRaw) {
      half.push(`${label} (row ${row})`);
      continue;
    }

    const lat = readNumber(latRaw);
    const lon = readNumber(lonRaw);
    if (lat === undefined || lon === undefined) {
      const [col, raw] = lat === undefined ? ['B', latRaw] : ['C', lonRaw];
      const where = `${col}${row} (${label}): ${show(raw, 16)}`;
      if (/[°º'′"″]|\d\s*[NSEW]$/i.test(raw)) dms.push(where);
      else if (/^-?\d+,\d+$/.test(raw)) decimalComma.push(where);
      else notNumber.push(where);
      continue;
    }

    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
      swapped.push(`${label} (row ${row}): ${latRaw}, ${lonRaw}`);
      continue;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      outOfRange.push(`${label} (row ${row}): ${latRaw}, ${lonRaw}`);
      continue;
    }

    const prior = seen.get(label);
    if (prior !== undefined) {
      duplicates.push(`${show(label)} in rows ${prior} and ${row}`);
      continue;
    }
    seen.set(label, row);
    if (lat === 0 && lon === 0) nullIsland.push(label);
    out[label] = { lat, lon };
  }

  aggregate(
    issues, 'error', noName,
    (n) => `${n} ${plural(n, 'row has', 'rows have')} coordinates but no language name.`,
    'Column A must hold the language name exactly as it appears in the innovations header.',
  );
  aggregate(
    issues, 'error', half,
    (n) => `${n} ${plural(n, 'row has', 'rows have')} only one of latitude and longitude.`,
  );
  aggregate(
    issues, 'error', dms,
    (n) => `${n} ${plural(n, 'value is', 'values are')} in degrees-minutes-seconds.`,
    'Use signed decimal degrees: 8°33′S 125°34′E becomes -8.55, 125.567. South and west are negative.',
  );
  aggregate(
    issues, 'error', decimalComma,
    (n) => `${n} ${plural(n, 'value uses', 'values use')} a decimal comma.`,
    'Use a decimal point (-8.55, not -8,55).',
  );
  aggregate(
    issues, 'error', notNumber,
    (n) => `${n} ${plural(n, 'value is', 'values are')} not a number.`,
    'Latitude and longitude must be decimal degrees, e.g. -8.55 and 125.57.',
  );
  aggregate(
    issues, 'error', swapped,
    (n) => `${n} ${plural(n, 'row has', 'rows have')} a latitude beyond ±90° — longitude and latitude look swapped.`,
    'Column B is latitude (−90 to 90) and column C longitude (−180 to 180).',
  );
  aggregate(
    issues, 'error', outOfRange,
    (n) => `${n} ${plural(n, 'row is', 'rows are')} outside the valid range.`,
    'Latitude must be between −90 and 90, longitude between −180 and 180.',
  );
  aggregate(
    issues, 'error', duplicates,
    (n) => `${n} ${plural(n, 'language appears', 'languages appear')} more than once.`,
    'Keep one row per language.',
  );
  aggregate(
    issues, 'warning', blank,
    (n) => `${n} ${plural(n, 'language has', 'languages have')} no coordinates filled in and ${plural(n, 'was', 'were')} skipped.`,
  );
  aggregate(
    issues, 'warning', nullIsland,
    (n) => `${n} ${plural(n, 'language is', 'languages are')} placed at 0, 0, in the Gulf of Guinea.`,
    'That is usually a placeholder rather than a real location.',
  );

  return { value: hasErrors(issues) ? null : out, issues };
}

// ---------------------------------------------------------------------------
// Do the two files agree?

/** Case, spacing and Unicode normalisation only — nothing that changes a name. */
const normalise = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Edit distance counting a swap of adjacent letters as one edit (optimal
 * string alignment). Transposition is the commonest typo, and under plain
 * Levenshtein "Brei" would be as far from "Beri" as "Bxxi" is.
 */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

export interface CrossCheck {
  /** Keyed by the innovations file's labels wherever a match was found. */
  coordinates: LanguageCoordinates;
  /** How many languages ended up with a location. */
  matched: number;
  issues: Issue[];
}

/**
 * Match coordinate rows to the innovation file's languages.
 *
 * Names differing only in case or spacing are matched and reported, since the
 * intent is unambiguous. Anything further is only suggested: "Beri" and
 * "Berri" might be one lect or two, and that is not a call to make silently.
 */
export function crossCheckCoordinates(
  coordinates: LanguageCoordinates, languages: string[],
): CrossCheck {
  const issues: Issue[] = [];
  const out: LanguageCoordinates = {};
  const wanted = new Set(languages);
  const byNormal = new Map<string, string[]>();
  for (const l of languages) byNormal.set(normalise(l), [...(byNormal.get(normalise(l)) ?? []), l]);

  const loose: string[] = [];
  const unmatched: string[] = [];

  for (const [label, where] of Object.entries(coordinates)) {
    if (wanted.has(label)) {
      out[label] = where;
      continue;
    }
    const candidates = (byNormal.get(normalise(label)) ?? []).filter((l) => !(l in coordinates));
    if (candidates.length === 1 && !(candidates[0]! in out)) {
      out[candidates[0]!] = where;
      loose.push(`${show(label)} → ${show(candidates[0]!)}`);
      continue;
    }
    const near = languages
      .filter((l) => !(l in coordinates))
      .map((l) => ({ l, d: editDistance(normalise(l), normalise(label)) }))
      .filter(({ l, d }) => d <= 2 && d < Math.max(l.length, label.length) / 2)
      .sort((a, b) => a.d - b.d)[0];
    unmatched.push(near ? `${show(label)} — did you mean ${show(near.l)}?` : show(label));
    // Kept, not dropped: renaming the language later should find it again.
    out[label] = where;
  }

  aggregate(
    issues, 'info', loose,
    (n) => `${n} ${plural(n, 'name was', 'names were')} matched ignoring case and spacing.`,
  );
  aggregate(
    issues, 'warning', unmatched,
    (n) => `${n} ${plural(n, 'name', 'names')} in the coordinates file ${plural(n, 'does', 'do')} not match any language in the innovations file.`,
    'Names must match the innovations header exactly; unmatched rows are ignored.',
  );

  const missing = languages.filter((l) => !(l in out));
  aggregate(
    issues, 'warning', missing,
    (n) => `${n} ${plural(n, 'language has', 'languages have')} no coordinates, so the geographic layout is unavailable.`,
    'Every language needs a location to be placed on a map. Under "CSV format", "download ' +
      'coordinates template" gives a file with every language name already filled in.',
  );

  return { coordinates: out, matched: languages.length - missing.length, issues };
}
