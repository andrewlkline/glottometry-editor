/**
 * Two hypotheses side by side: the counts, the drawings, and the innovations
 * whose explanation changes between them.
 *
 * The list is the heart of it. Totals say one reading needs more borrowings
 * than another; the list says which innovations those are, so the reader can
 * judge whether the extra borrowings are plausible ones — a lexical item
 * spreading is easy to believe, an irregular sound change much less so.
 */

import { useMemo, useState } from 'react';
import {
  differences, summarise, type ChangeKind, type HypothesisSummary,
} from '../core/compare.js';
import type { QualityClass } from '../core/quality.js';
import type { Dataset } from '../core/types.js';
import type { Hypothesis } from '../data/hypothesis.js';
import { Diagram } from '../render/Diagram.js';
import { QUALITY_COLOUR, QUALITY_GLYPH } from '../render/styles.js';
import { describeExplanation } from './HypothesisPanel.js';
import type { HypothesisView } from './hypothesisView.js';

export interface ComparePanelProps {
  hypotheses: Hypothesis[];
  a: Hypothesis | null;
  b: Hypothesis | null;
  viewA: HypothesisView | null;
  viewB: HypothesisView | null;
  onPick: (a: string, b: string) => void;
  /** The scored dataset the analyses ran on. */
  scored: Dataset;
  classOf: (row: number) => QualityClass;
  onCopyActive: () => void;
  onExport: () => void;
}

const CHANGE_LABELS: Record<ChangeKind, string> = {
  'inherited-areal': 'inherited ↔ areal',
  'explained-unexplained': 'explained ↔ unexplained',
  regrouped: 'different group or losses',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Row = {
  label: string;
  value: (s: HypothesisSummary) => number | string;
  /** Which is fewer, if lower is worth pointing out. */
  lowerIsFewer?: boolean;
  title?: string;
};

const ROWS: Row[] = [
  {
    label: 'groups',
    value: (s) => [
      plural(s.groups.subgroup, 'subgroup', 'subgroups'),
      plural(s.groups.linkage, 'linkage', 'linkages'),
      plural(s.groups.contact, 'contact zone', 'contact zones'),
    ].join(' · '),
  },
  {
    label: 'extra origins',
    value: (s) => (s.extraGains === null ? 'not a tree' : s.extraGains),
    lowerIsFewer: true,
    title: 'Borrowings or parallel developments the tree needs, if nothing is lost (a lower bound)',
  },
  { label: 'losses recorded', value: (s) => s.losses.recorded },
  { label: 'losses not recorded', value: (s) => s.losses.unrecorded, lowerIsFewer: true },
  { label: 'inherited', value: (s) => s.explained.inherited },
  { label: 'areal', value: (s) => s.explained.areal },
  { label: 'unexplained', value: (s) => s.explained.unexplained, lowerIsFewer: true },
  {
    label: 'high-quality: inherited',
    value: (s) => s.byQuality.high.inherited,
    title: 'Innovations judged high quality that the hypothesis explains by inheritance',
  },
  {
    label: 'high-quality: areal',
    value: (s) => s.byQuality.high.areal,
    lowerIsFewer: true,
    title: 'High-quality innovations the hypothesis has to explain as spread by contact',
  },
  { label: 'high-quality: unexplained', value: (s) => s.byQuality.high.unexplained, lowerIsFewer: true },
];

export function ComparePanel(props: ComparePanelProps) {
  const { hypotheses, a, b, viewA, viewB, scored, classOf } = props;
  const [filter, setFilter] = useState<ChangeKind | 'all'>('all');
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  const summaries = useMemo(() => (viewA && viewB ? [
    summarise(viewA.analysis, viewA.resolved.specs, classOf),
    summarise(viewB.analysis, viewB.resolved.specs, classOf),
  ] as const : null), [viewA, viewB, classOf]);

  const diffs = useMemo(() => (viewA && viewB
    ? differences(viewA.analysis, viewB.analysis, viewA.resolved.specs, viewB.resolved.specs)
      .sort((x, y) => QUALITY_RANK[classOf(x.row)] - QUALITY_RANK[classOf(y.row)])
    : []), [viewA, viewB, classOf]);

  if (hypotheses.length < 2) {
    return (
      <section style={S.box}>
        <p style={S.note}>
          Comparison needs two hypotheses. Copy the current one and change it — make a subgroup a
          linkage, move a language — to see what each reading costs.
        </p>
        <button onClick={props.onCopyActive}>copy the current hypothesis</button>
      </section>
    );
  }
  if (!a || !b || !viewA || !viewB || !summaries) return null;

  const counts: Record<ChangeKind | 'all', number> = {
    all: diffs.length, 'inherited-areal': 0, 'explained-unexplained': 0, regrouped: 0,
  };
  for (const d of diffs) counts[d.kind]++;
  const shown = diffs.filter((d) => filter === 'all' || d.kind === filter);

  const nameOf = (l: number) => scored.languages[l] ?? `#${l}`;
  const groupNamer = (h: Hypothesis) => (id: string) => {
    const g = h.groups.find((x) => x.id === id);
    return g ? (g.name || g.members.join(' + ')) : id;
  };

  const nodeFill = hoverRow === null ? undefined : (language: number) => {
    const cell = scored.matrix[hoverRow]?.[language];
    return cell === 1 ? '#f4c0c0' : cell === null ? '#e8e8e8' : undefined;
  };

  return (
    <section style={S.box} aria-label="hypothesis comparison">
      <div style={S.pickers}>
        <strong>A</strong>
        <select value={a.id} onChange={(e) => props.onPick(e.target.value, b.id)} aria-label="hypothesis A">
          {hypotheses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <button onClick={() => props.onPick(b.id, a.id)} title="Swap A and B">⇄</button>
        <strong>B</strong>
        <select value={b.id} onChange={(e) => props.onPick(a.id, e.target.value)} aria-label="hypothesis B">
          {hypotheses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <span style={S.spacer} />
        <button onClick={props.onExport}>export comparison SVG</button>
      </div>
      {a.id === b.id && <p style={S.note}>Pick two different hypotheses to compare.</p>}

      <table style={S.table}>
        <thead>
          <tr><th style={S.th} /><th style={S.th}>A: {a.name}</th><th style={S.th}>B: {b.name}</th></tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const va = row.value(summaries[0]);
            const vb = row.value(summaries[1]);
            const fewer = row.lowerIsFewer && typeof va === 'number' && typeof vb === 'number' && va !== vb
              ? (va < vb ? 0 : 1) : null;
            return (
              <tr key={row.label} title={row.title}>
                <td style={S.rowLabel}>{row.label}</td>
                {[va, vb].map((v, i) => (
                  <td key={i} style={{ ...S.td, ...(fewer === i ? S.fewer : {}) }}>
                    {v}{fewer === i && <span style={S.fewerTag}> fewer</span>}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr>
            <td style={S.rowLabel}>of informative</td>
            <td style={S.td}>{summaries[0].informative}</td>
            <td style={S.td}>{summaries[1].informative}</td>
          </tr>
        </tbody>
      </table>
      <p style={S.hint}>
        Fewer extra origins is more parsimonious, not more true: check which innovations the
        difference consists of, below.
      </p>

      <div style={S.diagrams}>
        {[{ h: a, v: viewA, tag: 'A' }, { h: b, v: viewB, tag: 'B' }].map(({ h, v, tag }) => (
          <figure key={tag} style={S.figure}>
            <figcaption style={S.figcaption}>
              <strong>{tag}: {h.name}</strong>
              {v.treeUnavailable && v.tree === null && h.groups.some((g) => g.kind === 'subgroup')
                ? <span style={S.hint}> — no tree: {v.treeUnavailable}</span> : null}
            </figcaption>
            {v.scene ? <Diagram scene={v.scene} nodeFill={nodeFill} /> : <p style={S.note}>Nothing to draw.</p>}
          </figure>
        ))}
      </div>

      <div style={S.diffHead}>
        <strong>Explained differently</strong>
        {(['all', 'inherited-areal', 'explained-unexplained', 'regrouped'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{ ...S.chip, ...(filter === k ? S.chipOn : {}) }}
          >
            {k === 'all' ? 'all' : CHANGE_LABELS[k]} ({counts[k]})
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p style={S.note}>{diffs.length === 0 ? 'Both hypotheses explain every innovation the same way.' : 'None of this kind.'}</p>
      ) : (
        <table style={S.table}>
          <thead>
            <tr><th style={S.th}>innovation</th><th style={S.th}>A</th><th style={S.th}>B</th></tr>
          </thead>
          <tbody>
            {shown.map((d) => {
              const q = classOf(d.row);
              return (
                <tr
                  key={d.row}
                  onMouseEnter={() => setHoverRow(d.row)}
                  onMouseLeave={() => setHoverRow(null)}
                  style={hoverRow === d.row ? S.hoverRow : undefined}
                >
                  <td style={S.innovation}>
                    <span style={{ color: QUALITY_COLOUR[q] }} title={`${q} quality`}>{QUALITY_GLYPH[q]} </span>
                    {scored.innovations[d.row]}
                  </td>
                  <td style={S.td}>{describeExplanation(d.a, groupNamer(a), nameOf)}</td>
                  <td style={S.td}>{describeExplanation(d.b, groupNamer(b), nameOf)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p style={S.hint}>Hover an innovation to mark the languages that have it in both diagrams.</p>
    </section>
  );
}

const QUALITY_RANK: Record<QualityClass, number> = { high: 0, undetermined: 1, low: 2 };

const S: Record<string, React.CSSProperties> = {
  box: {
    border: '1px solid #ddd', borderRadius: 6, padding: '0.7rem', background: '#fff',
    fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0,
  },
  pickers: { display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' },
  spacer: { flex: 1 },
  note: { color: '#777', margin: 0, lineHeight: 1.45 },
  hint: { color: '#999', fontSize: '0.7rem', margin: 0 },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: '0.74rem' },
  th: { textAlign: 'left', borderBottom: '2px solid #333', padding: '0.2rem 0.4rem', fontWeight: 600 },
  td: { borderBottom: '1px solid #eee', padding: '0.2rem 0.4rem', verticalAlign: 'top' },
  rowLabel: { borderBottom: '1px solid #eee', padding: '0.2rem 0.4rem', color: '#666', whiteSpace: 'nowrap' },
  fewer: { fontWeight: 700 },
  fewerTag: { color: '#2a6f3e', fontWeight: 400, fontSize: '0.66rem' },
  diagrams: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' },
  figure: { margin: 0, minWidth: 0, border: '1px solid #f0f0f0', borderRadius: 4, padding: '0.4rem' },
  figcaption: { marginBottom: '0.3rem' },
  diffHead: { display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' },
  chip: {
    border: '1px solid #ccc', borderRadius: 12, background: '#fafafa', cursor: 'pointer',
    padding: '0.05rem 0.55rem', fontSize: '0.7rem',
  },
  chipOn: { background: '#333', color: '#fff', border: '1px solid #333' },
  innovation: {
    borderBottom: '1px solid #eee', padding: '0.2rem 0.4rem', fontFamily: 'ui-monospace, monospace',
    fontSize: '0.7rem', verticalAlign: 'top',
  },
  hoverRow: { background: '#fff7f7' },
};
