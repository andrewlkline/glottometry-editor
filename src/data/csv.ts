/**
 * CSV tokenising, kept separate from what the fields mean.
 *
 * Everything downstream reports problems by spreadsheet cell ("D14"), because
 * that is where the user will go to fix them. So each record carries the row
 * number a spreadsheet would show it on: blank rows still count, and a quoted
 * label that spans two physical lines is still one row.
 *
 * Deliberately lenient where leniency cannot change the data — a quote in the
 * middle of an unquoted field is kept as a literal character, as spreadsheets
 * do — and loud where it can: an unclosed quote swallows the rest of the file,
 * so it is reported rather than repaired.
 */

export type Delimiter = ',' | ';' | '\t';

export interface CsvRecord {
  fields: string[];
  /** 1-based row, as a spreadsheet opening this file would number it. */
  row: number;
}

export interface Tokenized {
  records: CsvRecord[];
  delimiter: Delimiter;
  /** Row where a quoted field opened and never closed. */
  unclosedQuoteRow?: number;
}

/**
 * Guess the delimiter from the first non-blank line.
 *
 * Excel in much of Europe saves "CSV" with semicolons, because the comma is
 * the decimal separator there; tab-separated text is what you get pasting
 * out of a spreadsheet. All three are unambiguous once you count outside
 * quotes, and a header row is the one line guaranteed to have many fields.
 */
export function detectDelimiter(text: string): Delimiter {
  const line = text.split(/\r\n|\r|\n/).find((l) => l.trim().length > 0) ?? '';
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as Delimiter]++;
  }
  // Ties go to the comma: it is the format's actual delimiter.
  let best: Delimiter = ',';
  for (const d of [';', '\t'] as const) {
    if (counts[d] > counts[best]) best = d;
  }
  return best;
}

export function tokenize(input: string, delimiter?: Delimiter): Tokenized {
  const text = input.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(text);

  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let row = 1;
  let quoteRow = 0;

  const endRecord = () => {
    fields.push(field);
    // Rows of nothing but delimiters are what spreadsheets leave below the
    // data; they are not innovations with a blank label.
    if (fields.some((f) => f.trim() !== '')) records.push({ fields, row });
    fields = [];
    field = '';
    row++;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        field += '\n';
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      quoted = true;
      quoteRow = row;
      field = '';
    } else if (ch === d) {
      fields.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      // \r alone is a line ending too: K&F's demo files use classic-Mac CR.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else {
      field += ch;
    }
  }
  if (field !== '' || fields.length > 0) endRecord();

  return { records, delimiter: d, unclosedQuoteRow: quoted ? quoteRow : undefined };
}

/** Spreadsheet column letter for a 0-based index: 0 → A, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Drop empty cells off the end: spreadsheets pad rows to the widest one. */
export function trimTrailing(fields: string[]): string[] {
  let end = fields.length;
  while (end > 0 && fields[end - 1]!.trim() === '') end--;
  return fields.slice(0, end);
}
