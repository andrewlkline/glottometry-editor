import { useMemo, useState } from 'react';
import { evidenceFor, maskOf, type Glottometry } from '../core/metrics.js';
import type { Dataset, EvidenceItem, Subgroup } from '../core/types.js';
import { QUALITY_CLASSES, type QualityClass, type QualityJudgement } from '../core/quality.js';
import { QUALITY_COLOUR, QualityMark } from './QualityMark.js';

export interface EvidencePanelProps {
  glottometry: Glottometry;
  /** The dataset `glottometry` scored — after type filtering, not before. */
  dataset: Dataset;
  subgroup: Subgroup;
  /** Quality of a row of `dataset`. */
  qualityOf: (row: number) => QualityJudgement | undefined;
  onClose: () => void;
}

const TOTAL: Record<Tab, string> = { exclusive: 'ε', supporting: 'p', conflicting: 'q' };

type Tab = 'exclusive' | 'supporting' | 'conflicting';

const BLURB: Record<Tab, string> = {
  exclusive: 'Affect exactly these languages and no others. Their total is ε.',
  supporting: 'Affect all of them; others may share too. Their total is p.',
  conflicting: 'Affect some but not all, plus an outsider. Their total is q.',
};

/**
 * Which innovations produced a subgroup's score.
 *
 * The published tables stop at ε, κ and ς, leaving you to go back to the
 * spreadsheet to find out which sound change is doing the work. This is the
 * answer to "why is this a subgroup?", which is the question a comparativist
 * actually has.
 */
export function EvidencePanel({
  glottometry, dataset, subgroup, qualityOf, onClose,
}: EvidencePanelProps) {
  const [tab, setTab] = useState<Tab>('exclusive');

  const evidence = useMemo(
    () => evidenceFor(glottometry, dataset, maskOf(subgroup.members, glottometry.nLanguages)),
    [glottometry, dataset, subgroup],
  );

  const counts: Record<Tab, number> = {
    exclusive: evidence.exclusive.length,
    supporting: evidence.supporting.length,
    conflicting: evidence.conflicting.length,
  };
  const items = evidence[tab];
  const memberSet = new Set(subgroup.members);

  // How much of this total rests on high- and low-quality innovations. The
  // metrics are untouched; this only says what they are made of.
  const byQuality: Record<QualityClass, number> = { high: 0, low: 0, undetermined: 0 };
  for (const item of items) {
    byQuality[qualityOf(item.index)?.quality ?? 'undetermined'] += item.weight;
  }
  const total = items.reduce((a, i) => a + i.weight, 0);

  return (
    <aside style={S.panel}>
      <div style={S.header}>
        <div>
          <strong style={S.title}>{subgroup.memberNames.join(' + ')}</strong>
          <div style={S.metrics}>
            ς {subgroup.sigma.toFixed(2)} · κ {subgroup.kappa.toFixed(2)} · ε{' '}
            {subgroup.epsilon.toFixed(2)}
          </div>
        </div>
        <button onClick={onClose} style={S.close} aria-label="Close">×</button>
      </div>

      <div style={S.tabs}>
        {(Object.keys(BLURB) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
          >
            {t} <span style={S.count}>{counts[t]}</span>
          </button>
        ))}
      </div>

      <p style={S.blurb}>{BLURB[tab]}</p>

      {items.length > 0 && (
        <div style={S.composition} aria-label="total by quality">
          <span>{TOTAL[tab]} {total.toFixed(2)} =</span>
          {QUALITY_CLASSES.filter((q) => byQuality[q] > 0.0005).map((q, i) => (
            <span key={q} style={{ color: QUALITY_COLOUR[q] }}>
              {i > 0 && <span style={S.plus}>+ </span>}
              {byQuality[q].toFixed(2)} {q}
            </span>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p style={S.empty}>None.</p>
      ) : (
        <ol style={S.list}>
          {items.map((item) => (
            <li key={item.index} style={S.item}>
              <div style={S.itemHead}>
                <span style={S.labelLine}>
                  {qualityOf(item.index) && <QualityMark judgement={qualityOf(item.index)!} />}
                  <span style={S.label}>{item.label}</span>
                </span>
                {item.weight / item.multiplier < 0.999 && (
                  <span
                    style={S.weight}
                    title="Fractional because some cells are unknown"
                  >
                    {(item.weight / item.multiplier).toFixed(2)}
                  </span>
                )}
                {item.multiplier !== 1 && (
                  <span style={S.weight} title="Scaled by its type weight">
                    ×{item.multiplier}
                  </span>
                )}
              </div>
              <Pattern item={item} memberSet={memberSet} languages={dataset.languages} />
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

/** The innovation's distribution, with members marked off from outsiders. */
function Pattern({
  item, memberSet, languages,
}: {
  item: EvidenceItem;
  memberSet: Set<number>;
  languages: string[];
}) {
  const participants = new Set(item.participants);
  const unknown = new Set(item.unknown);

  return (
    <div style={S.pattern}>
      {languages.map((label, i) => {
        const inGroup = memberSet.has(i);
        const style: React.CSSProperties = {
          ...S.cell,
          ...(participants.has(i) ? S.cellOn : unknown.has(i) ? S.cellUnknown : S.cellOff),
          ...(inGroup ? S.cellMember : {}),
        };
        return (
          <span key={i} style={style} title={`${label}${inGroup ? ' (member)' : ''}`}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: '0.75rem',
    fontSize: '0.8rem',
    maxHeight: 620,
    overflowY: 'auto',
    background: '#fff',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: '0.88rem' },
  metrics: { color: '#666', fontVariantNumeric: 'tabular-nums' },
  close: { border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 },
  tabs: { display: 'flex', gap: '0.25rem', margin: '0.6rem 0 0.35rem' },
  tab: {
    flex: 1,
    padding: '0.25rem 0.3rem',
    fontSize: '0.72rem',
    borderWidth: 1, borderStyle: 'solid', borderColor: '#ddd',
    borderRadius: 4,
    background: '#fafafa',
    cursor: 'pointer',
  },
  tabActive: { background: '#fff', borderColor: '#999', fontWeight: 600 },
  count: { color: '#888', fontVariantNumeric: 'tabular-nums' },
  blurb: { color: '#666', fontSize: '0.72rem', margin: '0 0 0.5rem' },
  empty: { color: '#999' },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  item: { padding: '0.35rem 0', borderTop: '1px solid #f0f0f0' },
  itemHead: { display: 'flex', justifyContent: 'space-between', gap: '0.5rem' },
  labelLine: { display: 'flex', gap: '0.3rem', alignItems: 'baseline', minWidth: 0, flex: 1 },
  composition: {
    display: 'flex', gap: '0.35rem', flexWrap: 'wrap', fontSize: '0.72rem',
    margin: '0 0 0.5rem', fontVariantNumeric: 'tabular-nums',
  },
  plus: { color: '#999' },
  label: { fontFamily: 'ui-monospace, monospace', fontSize: '0.74rem' },
  weight: { color: '#a60', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' },
  pattern: { display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 },
  cell: {
    fontSize: '0.6rem',
    padding: '0 3px',
    borderRadius: 2,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
    lineHeight: 1.6,
  },
  cellOn: { background: '#d33', color: '#fff' },
  cellOff: { background: '#f2f2f2', color: '#aaa' },
  cellUnknown: { background: '#fff3d6', color: '#a60' },
  cellMember: { borderColor: '#333' },
};
