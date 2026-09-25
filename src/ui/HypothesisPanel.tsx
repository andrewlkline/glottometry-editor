/**
 * Authoring a hybrid hypothesis, and reading how well the matrix fits it.
 *
 * The panel is where the claims are made (groups and their kinds) and where
 * the evidence answers back (the findings under each group, and the summary).
 * Nothing here changes a glottometric score.
 */

import { useState } from 'react';
import {
  RELATION_KINDS, RELATION_LABELS, groupFindings,
  type Finding, type HypothesisAnalysis, type RelationKind,
} from '../core/hypothesis.js';
import type { Hypothesis, HypothesisGroup } from '../data/hypothesis.js';
import { HYPOTHESIS_STYLE } from '../render/styles.js';

export interface HypothesisPanelProps {
  hypotheses: Hypothesis[];
  active: Hypothesis | null;
  languages: string[];
  /** Labels of the rows the analysis ran on (the scored dataset). */
  innovations: string[];
  analysis: HypothesisAnalysis | null;
  unknown: { groupId: string; labels: string[] }[];
  /** Drawn computed subgroups, to copy members from. */
  computed: { key: string; names: string[] }[];
  selected: string | null;
  onSelect: (groupId: string | null) => void;
  onHover: (groupId: string | null) => void;
  onNew: (name: string) => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSetActive: (id: string) => void;
  onAddGroup: (group: Omit<HypothesisGroup, 'id'>) => void;
  onUpdateGroup: (id: string, changes: Partial<Omit<HypothesisGroup, 'id'>>) => void;
  onRemoveGroup: (id: string) => void;
}

interface Draft {
  id: string | null;
  name: string;
  kind: RelationKind;
  members: string[];
}

const ICON: Record<Finding['level'], string> = { ok: '✓', note: '·', warn: '!' };

export function HypothesisPanel(props: HypothesisPanelProps) {
  const {
    hypotheses, active, languages, innovations, analysis, unknown, computed,
    selected, onSelect, onHover,
  } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showResidue, setShowResidue] = useState(false);

  if (!active) {
    return (
      <aside style={S.panel}>
        <strong>Hypotheses</strong>
        <p style={S.note}>
          A hypothesis is your reading of the family: which languages form subgroups (a common,
          exclusive ancestor), which a linkage (innovations spread through a dialect network), and
          which a contact zone (low-quality shared vocabulary with no chain-like pattern) — Smith's
          (2025) three relation types. The matrix then says how well each claim fits.
        </p>
        <button onClick={() => props.onNew('hypothesis 1')}>new hypothesis</button>
      </aside>
    );
  }

  const nameOf = (l: number) => languages[l] ?? `#${l}`;
  const reportOf = (id: string) => analysis?.groups.find((g) => g.id === id);
  const groupName = (g: HypothesisGroup) => g.name || g.members.join(' + ') || '(empty)';
  const groupNameById = (id: string) => {
    const g = active.groups.find((x) => x.id === id);
    return g ? groupName(g) : id;
  };

  const counts = { tree: 0, linkage: 0, contact: 0, residue: 0 };
  for (const e of analysis?.explanations ?? []) {
    if (e.kind in counts) counts[e.kind as keyof typeof counts]++;
  }

  const saveDraft = () => {
    if (!draft) return;
    const group = { name: draft.name.trim(), kind: draft.kind, members: draft.members };
    if (draft.id) props.onUpdateGroup(draft.id, group);
    else props.onAddGroup(group);
    setDraft(null);
  };

  return (
    <aside style={S.panel}>
      <div style={S.row}>
        <select
          value={active.id}
          onChange={(e) => props.onSetActive(e.target.value)}
          style={S.grow}
          aria-label="hypothesis"
        >
          {hypotheses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <button onClick={() => props.onNew(`hypothesis ${hypotheses.length + 1}`)} title="New empty hypothesis">new</button>
        <button onClick={props.onDuplicate} title="Copy this hypothesis to try an alternative">copy</button>
        <button onClick={props.onDelete} title="Delete this hypothesis (undoable)">delete</button>
      </div>
      <label style={S.field}>
        <span style={S.label}>name</span>
        <input value={active.name} onChange={(e) => props.onRename(e.target.value)} style={S.input} />
      </label>

      {analysis && (
        <section style={S.summary} aria-label="hypothesis summary">
          {analysis.conflicts.length > 0 ? (
            <p style={S.warn}>
              ! Not a tree: {analysis.conflicts.map((c) =>
                `${groupNameById(c.a)} and ${groupNameById(c.b)}`).join('; ')} overlap without
              one containing the other. Make one a linkage, or change the members.
            </p>
          ) : (
            <p style={S.line}>
              The tree needs <strong>{analysis.extraGains}</strong> extra{' '}
              {analysis.extraGains === 1 ? 'origin' : 'origins'} beyond one per innovation
              {' '}(<span title="The same count with no subgroups at all">{analysis.extraGainsFlat} with no subgroups</span>):
              each is a borrowing or a parallel development, if nothing is ever lost.
            </p>
          )}
          <p style={S.line}>
            Of {analysis.informative} informative innovations: {counts.tree} inherited in a
            subgroup, {counts.linkage} within a linkage, {counts.contact} within a contact
            zone, <strong style={counts.residue ? S.warnText : undefined}>{counts.residue} unexplained</strong>.
            {counts.residue > 0 && (
              <button style={S.link} onClick={() => setShowResidue((v) => !v)}>
                {showResidue ? 'hide' : 'show'}
              </button>
            )}
          </p>
          {showResidue && (
            <ol style={S.residue}>
              {analysis.residue.slice(0, 60).map((r) => {
                const e = analysis.explanations[r]!;
                const hint = e.kind === 'residue' && e.withinSubgroup
                  ? `within ${groupNameById(e.withinSubgroup.groupId)}` +
                    (e.withinSubgroup.missing.length
                      ? `, absent from ${e.withinSubgroup.missing.map(nameOf).join(', ')}` : '')
                  : e.kind === 'residue' ? `${e.gains} separate origins` : '';
                return (
                  <li key={r}>
                    <span style={S.mono}>{innovations[r]}</span>
                    {hint && <span style={S.hint}> — {hint}</span>}
                  </li>
                );
              })}
              {analysis.residue.length > 60 && <li style={S.hint}>…and {analysis.residue.length - 60} more</li>}
            </ol>
          )}
        </section>
      )}

      {unknown.length > 0 && (
        <p style={S.warn}>
          ! Some members are not languages in the dataset and are ignored:{' '}
          {unknown.map((u) => `${groupNameById(u.groupId)}: ${u.labels.join(', ')}`).join('; ')}
        </p>
      )}

      <div style={S.groupsHead}>
        <strong>Groups</strong>
        <button onClick={() => setDraft({ id: null, name: '', kind: 'subgroup', members: [] })}>
          + group
        </button>
      </div>

      {draft && (
        <GroupEditor
          draft={draft}
          languages={languages}
          computed={computed}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
        />
      )}

      {active.groups.length === 0 && !draft && (
        <p style={S.note}>No groups yet. Add a subgroup, linkage or contact zone.</p>
      )}

      <ul style={S.groups}>
        {active.groups.map((g) => {
          const report = reportOf(g.id);
          const findings = report ? groupFindings(report, nameOf) : [];
          const isSelected = selected === g.id;
          return (
            <li
              key={g.id}
              style={{ ...S.card, ...(isSelected ? S.cardSelected : {}) }}
              onMouseEnter={() => onHover(g.id)}
              onMouseLeave={() => onHover(null)}
            >
              <div style={S.cardHead}>
                <button style={S.cardTitle} onClick={() => onSelect(isSelected ? null : g.id)}>
                  <Swatch kind={g.kind} />
                  <span>{groupName(g)}</span>
                  <span style={S.kind}>{RELATION_LABELS[g.kind]}</span>
                </button>
                <button
                  style={S.tiny}
                  onClick={() => setDraft({ id: g.id, name: g.name, kind: g.kind, members: g.members })}
                >edit</button>
                <button style={S.tiny} onClick={() => props.onRemoveGroup(g.id)} title="Delete group">×</button>
              </div>
              {g.name && <div style={S.members}>{g.members.join(', ')}</div>}
              <ul style={S.findings}>
                {findings.map((f, i) => (
                  <li key={i} style={S.finding}>
                    <span style={{ ...S.icon, ...LEVEL_STYLE[f.level] }}>{ICON[f.level]}</span>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function GroupEditor({ draft, languages, computed, onChange, onSave, onCancel }: {
  draft: Draft;
  languages: string[];
  computed: { key: string; names: string[] }[];
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const chosen = new Set(draft.members);
  const toggle = (l: string) =>
    onChange({
      ...draft,
      // Kept in dataset order, so stored groups read the same way the diagram does.
      members: languages.filter((x) => (x === l ? !chosen.has(l) : chosen.has(x))),
    });

  return (
    <div style={S.editor}>
      <div style={S.row}>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="name, e.g. Proto-North"
          style={{ ...S.input, ...S.grow }}
          aria-label="group name"
        />
        <select
          value={draft.kind}
          onChange={(e) => onChange({ ...draft, kind: e.target.value as RelationKind })}
          aria-label="relation type"
        >
          {RELATION_KINDS.map((k) => <option key={k} value={k}>{RELATION_LABELS[k]}</option>)}
        </select>
      </div>
      {computed.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const c = computed.find((x) => x.key === e.target.value);
            if (c) onChange({ ...draft, members: languages.filter((l) => c.names.includes(l)) });
          }}
          style={S.input}
          aria-label="copy members from a computed subgroup"
        >
          <option value="">copy members from a drawn subgroup…</option>
          {computed.map((c) => <option key={c.key} value={c.key}>{c.names.join(' + ')}</option>)}
        </select>
      )}
      <div style={S.checks}>
        {languages.map((l) => (
          <label key={l} style={S.check}>
            <input type="checkbox" checked={chosen.has(l)} onChange={() => toggle(l)} />
            {l}
          </label>
        ))}
      </div>
      <div style={S.row}>
        <button onClick={onSave} disabled={draft.members.length === 0}>
          {draft.id ? 'save' : 'add'}
        </button>
        <button onClick={onCancel}>cancel</button>
        <span style={S.hint}>{draft.members.length} selected</span>
      </div>
    </div>
  );
}

function Swatch({ kind }: { kind: RelationKind }) {
  const s = HYPOTHESIS_STYLE[kind];
  return (
    <svg width={22} height={8} aria-hidden style={{ flexShrink: 0 }}>
      <line x1={2} y1={4} x2={20} y2={4} stroke={s.stroke} strokeWidth={s.strokeWidth}
        strokeDasharray={s.dasharray ? '4 3' : undefined} strokeLinecap="round" />
    </svg>
  );
}

export function HypothesisLegend({ name }: { name: string }) {
  return (
    <div style={S.legend}>
      <strong>Hypothesis “{name}”</strong>
      <span style={S.hint}>authored, not computed</span>
      {RELATION_KINDS.map((k) => (
        <span key={k} style={S.legendItem}><Swatch kind={k} /> {RELATION_LABELS[k]}</span>
      ))}
    </div>
  );
}

const LEVEL_STYLE: Record<Finding['level'], React.CSSProperties> = {
  ok: { color: '#2a6f3e' },
  note: { color: '#777' },
  warn: { color: '#b00', fontWeight: 700 },
};

const S: Record<string, React.CSSProperties> = {
  panel: {
    border: '1px solid #ddd', borderRadius: 6, padding: '0.6rem',
    fontSize: '0.76rem', background: '#fff', maxHeight: 720, overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '0.45rem',
  },
  row: { display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 0 },
  field: { display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  label: { color: '#666', fontSize: '0.68rem' },
  input: { fontSize: '0.76rem', padding: '0.2rem 0.3rem', boxSizing: 'border-box', width: '100%' },
  note: { color: '#777', fontSize: '0.72rem', lineHeight: 1.45, margin: '0.3rem 0' },
  summary: {
    background: '#f7f8fa', border: '1px solid #e6e8ec', borderRadius: 4,
    padding: '0.4rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
  },
  line: { margin: 0, lineHeight: 1.45 },
  warn: { color: '#b00', margin: 0, lineHeight: 1.45 },
  warnText: { color: '#b00' },
  link: {
    border: 'none', background: 'none', padding: '0 0 0 0.3rem', cursor: 'pointer',
    color: '#246', textDecoration: 'underline', fontSize: '0.72rem',
  },
  residue: { margin: 0, paddingLeft: '1.2rem', maxHeight: 200, overflowY: 'auto', fontSize: '0.7rem' },
  mono: { fontFamily: 'ui-monospace, monospace' },
  hint: { color: '#999', fontSize: '0.7rem' },
  groupsHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' },
  groups: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  card: { border: '1px solid #e6e6e6', borderRadius: 4, padding: '0.35rem 0.45rem' },
  cardSelected: { border: '1px solid #333', boxShadow: '0 0 0 1px #333' },
  cardHead: { display: 'flex', gap: '0.3rem', alignItems: 'center' },
  cardTitle: {
    flex: 1, display: 'flex', gap: '0.4rem', alignItems: 'center', border: 'none',
    background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontSize: '0.76rem',
    fontWeight: 600, minWidth: 0,
  },
  kind: { color: '#888', fontWeight: 400, fontSize: '0.7rem' },
  members: { color: '#888', fontSize: '0.7rem', margin: '0.1rem 0 0 1.75rem' },
  tiny: { fontSize: '0.68rem', padding: '0 0.3rem' },
  findings: { listStyle: 'none', padding: 0, margin: '0.3rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  finding: { display: 'flex', gap: '0.35rem', lineHeight: 1.4, fontSize: '0.72rem' },
  icon: { width: '0.8em', flexShrink: 0, textAlign: 'center' },
  editor: {
    border: '1px solid #cfd6e0', borderRadius: 4, padding: '0.45rem', background: '#fafbfd',
    display: 'flex', flexDirection: 'column', gap: '0.35rem',
  },
  checks: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.1rem 0.4rem' },
  check: { display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden' },
  legend: {
    display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', alignItems: 'center',
    fontSize: '0.74rem', color: '#444', margin: '0 0 0.5rem',
  },
  legendItem: { display: 'inline-flex', gap: '0.3rem', alignItems: 'center' },
};
