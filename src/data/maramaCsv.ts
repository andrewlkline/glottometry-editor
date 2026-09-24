/**
 * Import/export for the Marama (Kalyan & François) innovations CSV.
 *
 * Layout: first column is the innovation label, remaining columns are
 * languages. Cells are 1, 0, blank or 'NA'. This is the only interchange
 * format the field has, so round-tripping it losslessly is a hard requirement.
 *
 * Reading and validation live in `csv.ts` and `csvCheck.ts`; these wrappers
 * are for callers that want a value or an exception.
 */

import type { Dataset } from '../core/types.js';
import { checkCoordinatesCsv, checkInnovationsCsv, type Issue } from './csvCheck.js';

/** Summarise a failed check as one message, for callers that just throw. */
function failure(issues: Issue[]): Error {
  const errors = issues.filter((i) => i.severity === 'error');
  return new Error(errors.map((e) => e.message).join(' '));
}

/**
 * Parse, throwing on anything the checker blocks. The app calls the checker
 * directly so it can show every issue; this is for code that trusts its input.
 */
export function parseMaramaCsv(text: string): Dataset {
  const { value, issues } = checkInnovationsCsv(text);
  if (!value) throw failure(issues);
  return value;
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

export interface LanguageCoordinates {
  /** Keyed by the language label used in the innovations CSV. */
  [label: string]: { lat: number; lon: number };
}

/**
 * Parse the Marama coordinates CSV: `label, latitude, longitude`.
 *
 * Their guidance says row headings must match the innovations file's column
 * headings and that the columns are latitude then longitude, whatever they are
 * titled — so position is authoritative here, not the header text.
 */
export function parseCoordinatesCsv(text: string): LanguageCoordinates {
  const { value, issues } = checkCoordinatesCsv(text);
  if (!value) throw failure(issues);
  return value;
}
