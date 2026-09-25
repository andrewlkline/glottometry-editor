/**
 * The two input formats, shown rather than described, with starter files.
 *
 * These are Kalyan & François's formats, so a file that loads here also loads
 * in their online analyzer and vice versa — worth saying, since it is the
 * reason not to invent something friendlier.
 */

import { INNOVATIONS_TEMPLATE, coordinatesTemplate, downloadText } from '../data/templates.js';
import type { LanguageCoordinates } from '../data/maramaCsv.js';

export function FormatGuide({ languages, coordinates, onClose }: {
  /** The loaded dataset's languages, to pre-fill the coordinates template. */
  languages: string[];
  coordinates?: LanguageCoordinates;
  onClose: () => void;
}) {
  return (
    <section style={S.box} aria-label="CSV format guide">
      <div style={S.head}>
        <strong>CSV formats</strong>
        <span style={S.note}>
          The same formats as Kalyan &amp; François's online analyzer, so files work in both.
        </span>
        <span style={S.spacer} />
        <button style={S.close} onClick={onClose} aria-label="close format guide">×</button>
      </div>

      <div style={S.columns}>
        <div>
          <h3 style={S.h3}>Innovations</h3>
          <table style={S.table}>
            <tbody>
              <tr>
                <td style={S.corner} />
                {['Lang A', 'Lang B', 'Lang C', 'Lang D'].map((l) => <th key={l} style={S.th}>{l}</th>)}
              </tr>
              {([
                ["Lex-R: 'water': *wai → *vai", '1', '1', '0', '0'],
                ['ISC: bite: *kaRat → *kat', '1', '1', '1', '0'],
                ['Mrp: 1sg: *au → *nau', '0', '1', '1', ''],
              ] as const).map(([label, ...cells]) => (
                <tr key={label}>
                  <th style={S.rowHead}>{label}</th>
                  {cells.map((c, i) => (
                    <td key={i} style={{ ...S.td, ...(c === '' ? S.unknown : {}) }}>{c || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul style={S.rules}>
            <li>Row 1: a blank first cell, then <b>one language per column</b>.</li>
            <li>Then <b>one innovation per row</b>: its label in column A, then a cell per language.</li>
            <li>
              <code>1</code> = has the innovation · <code>0</code> = does not ·
              blank, <code>NA</code>, <code>-</code> or <code>?</code> = unknown.
              <b> Blank is not the same as 0.</b>
            </li>
            <li>
              An optional prefix types the innovation: <code>Lex:</code> <code>ISC:</code>{' '}
              <code>RSC:</code> <code>Mrp:</code> <code>Syn:</code>. Anything else counts as untyped.
            </li>
            <li>
              Optionally, quality: <code>Lex-R:</code> replacement, <code>Lex-S:</code> synonymic,{' '}
              <code>Lex-N:</code> novel concept, <code>Lex-I:</code> indeterminate (Smith 2025);
              and <code>+</code> or <code>-</code> before the colon for a high or low judgement on
              any type (<code>ISC+:</code>). All of this can be set in the editor instead.
            </li>
            <li>Labels containing commas must be quoted. Spreadsheets do this for you when saving.</li>
          </ul>
          <button onClick={() => downloadText('innovations-template.csv', INNOVATIONS_TEMPLATE)}>
            download innovations template
          </button>
        </div>

        <div>
          <h3 style={S.h3}>Coordinates <span style={S.note}>(optional; for the geographic layout)</span></h3>
          <table style={S.table}>
            <tbody>
              <tr>
                {['language', 'latitude', 'longitude'].map((h) => <th key={h} style={S.th}>{h}</th>)}
              </tr>
              {[['Lang A', '-8.556', '125.573'], ['Lang B', '-8.726', '126.012'], ['Lang C', '-8.487', '126.498']]
                .map(([l, lat, lon]) => (
                  <tr key={l}>
                    <th style={S.rowHead}>{l}</th>
                    <td style={S.td}>{lat}</td>
                    <td style={S.td}>{lon}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <ul style={S.rules}>
            <li>Three columns: <b>language, latitude, longitude</b>, in that order, whatever the headings say.</li>
            <li>Names must match the innovations header <b>exactly</b>.</li>
            <li>Signed decimal degrees: south and west are negative. Not 8°33′S.</li>
            <li>Every language needs a row before the geographic layout is available.</li>
          </ul>
          <button
            onClick={() => downloadText(
              'coordinates-template.csv', coordinatesTemplate(languages, coordinates),
            )}
          >
            download coordinates template
          </button>
          {languages.length > 0 && (
            <span style={S.note}> with the current {languages.length} languages filled in</span>
          )}
        </div>
      </div>

      <p style={S.footer}>
        From Excel, save as <b>CSV UTF-8</b>: the plain "CSV" option cannot hold IPA or diacritics.
        Semicolon- and tab-separated files are read too.
      </p>
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  box: {
    border: '1px solid #ddd', borderRadius: 6, padding: '0.6rem 0.8rem',
    margin: '0.7rem 0 0', fontSize: '0.78rem', background: '#fff',
  },
  head: { display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' },
  spacer: { flex: 1 },
  close: {
    border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '1rem', lineHeight: 1, color: '#888', padding: '0 0.2rem',
  },
  note: { color: '#888', fontSize: '0.72rem', fontWeight: 400 },
  columns: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1.4rem', marginTop: '0.5rem',
  },
  h3: { fontSize: '0.8rem', margin: '0 0 0.4rem' },
  table: {
    borderCollapse: 'collapse', fontSize: '0.72rem', fontFamily: 'ui-monospace, monospace',
    maxWidth: '100%', display: 'block', overflowX: 'auto',
  },
  th: { border: '1px solid #ddd', background: '#f4f4f4', padding: '0.15rem 0.4rem', fontWeight: 600 },
  corner: { border: '1px solid #ddd', background: '#f4f4f4' },
  rowHead: {
    border: '1px solid #ddd', background: '#fafafa', padding: '0.15rem 0.4rem',
    textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap',
  },
  td: { border: '1px solid #ddd', padding: '0.15rem 0.5rem', textAlign: 'center' },
  unknown: { color: '#aaa' },
  rules: { margin: '0.5rem 0 0.6rem', paddingLeft: '1.1rem', lineHeight: 1.55 },
  footer: { color: '#777', fontSize: '0.72rem', margin: '0.7rem 0 0' },
};
