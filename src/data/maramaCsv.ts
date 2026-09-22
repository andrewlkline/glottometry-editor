/**
 * Import/export for the Marama (Kalyan & François) innovations CSV.
 *
 * Layout: first column is the innovation label, remaining columns are
 * languages. Cells are 1, 0, blank or 'NA'. This is the only interchange
 * format the field has, so round-tripping it losslessly is a hard requirement.
 *
 * Note K&F's own demo files use CR-only line endings (classic Mac), which is
 * why line splitting handles \r, \n and \r\n.
 */

import type { Cell, Dataset } from '../core/types.js';

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
}

/** Minimal RFC-4180-ish field splitter: handles quoted fields with commas. */
function splitFields(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

function parseCell(raw: string): Cell {
  const v = raw.trim();
  if (v === '1') return 1;
  if (v === '0') return 0;
  // Blank, '-', 'NA', 'na', '?' all mean "unknown".
  return null;
}

export function parseMaramaCsv(text: string): Dataset {
  const lines = splitLines(text);
  if (lines.length < 2) {
    throw new Error('CSV needs a header row and at least one innovation row.');
  }

  const header = splitFields(lines[0]!);
  const languages = header.slice(1).map((h) => h.trim()).filter((h) => h.length > 0);
  if (languages.length === 0) {
    throw new Error('No language columns found in the header row.');
  }

  const innovations: string[] = [];
  const matrix: Cell[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = splitFields(lines[i]!);
    const label = (fields[0] ?? '').trim();
    innovations.push(label || `innovation ${i}`);
    const row: Cell[] = new Array(languages.length);
    for (let c = 0; c < languages.length; c++) {
      row[c] = parseCell(fields[c + 1] ?? '');
    }
    matrix.push(row);
  }

  return { languages, innovations, matrix };
}

export function toMaramaCsv(dataset: Dataset): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [];
  lines.push(['', ...dataset.languages].map(esc).join(','));
  dataset.matrix.forEach((row, r) => {
    const cells = row.map((c) => (c === null ? 'NA' : String(c)));
    lines.push([esc(dataset.innovations[r] ?? ''), ...cells].join(','));
  });
  return lines.join('\n') + '\n';
}
