import { useState } from 'react';
import {
  INNOVATION_TYPES, TYPE_DIAGNOSTIC, TYPE_LABELS, type InnovationType,
} from '../core/innovationTypes.js';
import type { NaPolicy, StrengthMeasure } from '../core/types.js';
import type { ProjectSettings } from '../data/project.js';

export interface SettingsPanelProps {
  settings: ProjectSettings;
  typeCounts: Map<InnovationType, number>;
  /** Innovations kept after filtering, out of the total. */
  kept: number;
  total: number;
  onChange: (changes: Partial<ProjectSettings>, label: string, key?: string) => void;
}

const MEASURES: { id: StrengthMeasure; label: string; note: string; max: number }[] = [
  {
    id: 'sigma', label: 'ς subgroupiness', max: 6,
    note: "K&F's default: exclusively shared innovations weighted by cohesiveness.",
  },
  {
    id: 'epsilon', label: 'ε exclusive innovations', max: 12,
    note: 'Daniels, Barth & Barth (2019) argue a ς cutoff hides real structure — in '
      + 'their Sogeram data it made the pivotal Apalɨ look like it subgroups with '
      + 'nothing — and propose ε ≥ 2. They note the opposite risk too: ε alone '
      + 'over-represents groups built on parallel innovations.',
  },
  {
    id: 'significance', label: 'significance −log₁₀p', max: 8,
    note: 'Fisher’s exact test on whether innovations reaching every member also '
      + 'tend to stop at the boundary. Unlike ς it accounts for how many '
      + 'innovations there are: 2 of 20 is striking, 2 of 500 is not. 2 here is '
      + 'p = 0.01. Our contingency table, not a reimplementation of '
      + 'Hammarström (2017) — see src/core/fisher.ts.',
  },
];

const POLICIES: { id: NaPolicy; note: string }[] = [
  { id: 'half', note: 'Unknown counts as a coin flip. Agnostic; the default.' },
  { id: 'zero', note: 'Unknown means no evidence of participation.' },
  { id: 'one', note: 'Unknown means assume it patterned with the group.' },
  { id: 'rowMean', note: "Unknown takes that innovation's overall rate." },
  { id: 'colMean', note: "Unknown takes that language's overall rate." },
];

/**
 * The settings the literature actually disagrees about.
 *
 * These are live disputes, not defaults to be quietly baked in, so each is
 * exposed with the argument attached. A reader who distrusts the lexical
 * evidence, or thinks ς is the wrong cutoff, can see what their objection does
 * to the diagram instead of taking the author's word for it.
 */
export function SettingsPanel({
  settings, typeCounts, kept, total, onChange,
}: SettingsPanelProps) {
  const [showWeights, setShowWeights] = useState(false);
  const enabled = new Set(settings.enabledTypes ?? INNOVATION_TYPES);
  const measure = MEASURES.find((m) => m.id === settings.measure) ?? MEASURES[0]!;
  const weights = settings.typeWeights ?? {};
  const weighted = Object.values(weights).some((w) => w !== 1);

  const toggleType = (type: InnovationType) => {
    const next = new Set(enabled);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    if (next.size === 0) return;   // never filter everything away
    onChange(
      { enabledTypes: INNOVATION_TYPES.filter((t) => next.has(t)) },
      `${enabled.has(type) ? 'exclude' : 'include'} ${TYPE_LABELS[type]}`,
    );
  };

  const present = INNOVATION_TYPES.filter((t) => (typeCounts.get(t) ?? 0) > 0);

  return (
    <details style={S.panel} open>
      <summary style={S.summary}>
        method settings
        {(kept < total || weighted) && (
          <span style={S.badge}>
            {kept < total && `${kept}/${total} innovations`}
            {kept < total && weighted && ' · '}
            {weighted && 'weighted'}
          </span>
        )}
      </summary>

      <section style={S.section}>
        <h3 style={S.h3}>strength measure</h3>
        <div style={S.row}>
          {MEASURES.map((m) => (
            <label key={m.id} style={S.radio}>
              <input
                type="radio"
                checked={settings.measure === m.id}
                onChange={() => onChange(
                  { measure: m.id, minStrength: m.id === 'epsilon' ? 2 : 1 },
                  `measure by ${m.id}`,
                )}
              />
              {m.label}
            </label>
          ))}
        </div>
        <p style={S.note}>{measure.note}</p>
        <label style={S.slider}>
          show {measure.id === 'significance' ? '−log₁₀p' : measure.id} ≥{' '}
          <strong>{settings.minStrength.toFixed(2)}</strong>
          <input
            type="range" min={0} max={measure.max} step={0.05}
            value={settings.minStrength}
            onChange={(e) => onChange(
              { minStrength: Number(e.target.value) }, 'change threshold', 'minStrength',
            )}
          />
        </label>
      </section>

      <section style={S.section}>
        <h3 style={S.h3}>innovation types</h3>
        <p style={S.note}>
          Half of K&amp;F's dataset is lexical replacement, the category most open to
          borrowing — the substance of Jacques &amp; List's (2019) critique. Excluding a
          type removes those innovations and rescores, which can make a subgroup
          vanish outright, not merely weaken.
        </p>
        {present.map((type) => (
          <label key={type} style={S.check}>
            <input
              type="checkbox"
              checked={enabled.has(type)}
              onChange={() => toggleType(type)}
            />
            <span style={S.typeName}>
              {TYPE_LABELS[type]}
              {TYPE_DIAGNOSTIC[type] && (
                <span style={S.diagnostic} title="Usually held to be strong subgrouping evidence (Greenberg 1957; Ross 1988)">
                  ◆
                </span>
              )}
            </span>
            <span style={S.count}>{typeCounts.get(type)}</span>
          </label>
        ))}
      </section>

      <section style={S.section}>
        <h3 style={S.h3}>
          NA policy{' '}
          <select
            value={settings.policy}
            onChange={(e) => onChange({ policy: e.target.value as NaPolicy }, 'change NA policy')}
            style={S.select}
          >
            {POLICIES.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
        </h3>
        <p style={S.note}>
          {POLICIES.find((p) => p.id === settings.policy)?.note}{' '}
          The published method leaves unknown cells undefined, so this is an explicit
          choice rather than a hidden one.
        </p>
      </section>

      <section style={S.section}>
        <button style={S.disclosure} onClick={() => setShowWeights(!showWeights)}>
          {showWeights ? '▾' : '▸'} weight by type {weighted && <span style={S.on}>on</span>}
        </button>
        {showWeights && (
          <>
            <p style={S.warning}>
              K&amp;F deliberately do not weight. Pelkey (2015: 402) warns that
              weighting “too easily becomes an outlet for comparativists to justify
              their own intuitions.” Off by default; the totals stop being counts of
              innovations once you change it.
            </p>
            {present.map((type) => (
              <label key={type} style={S.check}>
                <span style={S.typeName}>{TYPE_LABELS[type]}</span>
                <input
                  type="number" min={0} max={5} step={0.25}
                  value={weights[type] ?? 1}
                  style={S.number}
                  onChange={(e) => onChange(
                    { typeWeights: { ...weights, [type]: Number(e.target.value) } },
                    `weight ${TYPE_LABELS[type]}`,
                    `weight:${type}`,
                  )}
                />
              </label>
            ))}
            {weighted && (
              <button
                style={S.reset}
                onClick={() => onChange({ typeWeights: undefined }, 'clear weights')}
              >
                reset weights
              </button>
            )}
          </>
        )}
      </section>
    </details>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    border: '1px solid #ddd', borderRadius: 6, padding: '0.6rem',
    fontSize: '0.78rem', background: '#fff', maxHeight: 620, overflowY: 'auto',
  },
  summary: { cursor: 'pointer', fontWeight: 600, display: 'flex', gap: '0.4rem', alignItems: 'baseline' },
  badge: { color: '#a60', fontWeight: 400, fontSize: '0.7rem' },
  section: { marginTop: '0.7rem', paddingTop: '0.55rem', borderTop: '1px solid #f0f0f0' },
  h3: { fontSize: '0.76rem', margin: '0 0 0.3rem', display: 'flex', gap: '0.4rem', alignItems: 'center' },
  row: { display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  radio: { display: 'flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.75rem' },
  note: { color: '#777', fontSize: '0.7rem', margin: '0.3rem 0', lineHeight: 1.45 },
  warning: {
    color: '#a60', fontSize: '0.7rem', margin: '0.3rem 0', lineHeight: 1.45,
    background: '#fffaf0', border: '1px solid #f2e2c4', borderRadius: 4, padding: '0.35rem',
  },
  slider: { display: 'flex', flexDirection: 'column', gap: '0.15rem', marginTop: '0.4rem' },
  check: { display: 'flex', gap: '0.35rem', alignItems: 'center', padding: '1px 0' },
  typeName: { flex: 1 },
  diagnostic: { color: '#a60', marginLeft: '0.25rem', fontSize: '0.65rem' },
  count: { color: '#999', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' },
  select: { fontSize: '0.74rem' },
  disclosure: {
    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
    fontSize: '0.76rem', fontWeight: 600, display: 'flex', gap: '0.3rem', alignItems: 'center',
  },
  on: { color: '#a60', fontWeight: 400, fontSize: '0.7rem' },
  number: { width: 56, fontSize: '0.72rem' },
  reset: { marginTop: '0.3rem', fontSize: '0.72rem' },
};
