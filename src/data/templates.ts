/**
 * Starter files for the two CSV formats.
 *
 * The innovations template is a worked example rather than an empty grid: it
 * shows a type prefix, an unknown cell, and a label that needs quoting, which
 * are the three things people get wrong. The coordinates template is built
 * from the loaded dataset, so the one hard constraint — names matching the
 * innovations header exactly — is satisfied before anyone types anything.
 */

import { toMaramaCsv } from './maramaCsv.js';

export const INNOVATIONS_TEMPLATE = toMaramaCsv({
  languages: ['Lang A', 'Lang B', 'Lang C', 'Lang D', 'Lang E'],
  innovations: [
    "Lex: 'water': *wai → *vai",
    'ISC: bite: *kaRat → *kat',
    'Mrp: 1sg: *au → *nau',
    "Lex: 'eye, face': *mata → *nako",
    'RSC: *k > ʔ',
  ],
  matrix: [
    [1, 1, 0, 0, 0],
    [1, 1, 1, 0, 0],
    [0, 1, 1, null, 0],
    [0, 0, 1, 1, 1],
    [0, 0, 0, 1, 1],
  ],
});

const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * One row per language, with any coordinates already known filled in.
 * Blank rows import as "skipped", so a half-finished template still loads.
 */
export function coordinatesTemplate(
  languages: string[],
  known: Record<string, { lat: number; lon: number }> = {},
): string {
  const names = languages.length > 0 ? languages : ['Lang A', 'Lang B', 'Lang C'];
  const rows = names.map((l) => {
    const c = known[l];
    return [quote(l), c ? String(c.lat) : '', c ? String(c.lon) : ''].join(',');
  });
  return ['language,latitude,longitude', ...rows].join('\n') + '\n';
}

/** Trigger a download of a text file. Browser-only. */
export function downloadText(filename: string, text: string, type = 'text/csv'): void {
  // The BOM makes Excel open the file as UTF-8, so IPA survives a round trip.
  const blob = new Blob([type === 'text/csv' ? `﻿${text}` : text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
