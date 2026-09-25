import type { Dataset } from '../core/types.js';
import {
  INNOVATION_TYPES, TYPE_LABELS, typeOf, type InnovationType,
} from '../core/innovationTypes.js';
import type { InnovationMeta } from '../data/innovationMeta.js';
import type { HypothesisGroup, StoredAssignment } from '../data/hypothesis.js';
import { RELATION_LABELS, type Explanation } from '../core/hypothesis.js';
import { describeExplanation } from './HypothesisPanel.js';
import {
  LEXICAL_STATUSES, LEXICAL_STATUS_HELP, LEXICAL_STATUS_LABELS, assessQuality, labelQuality,
  type Correspondences, type LexicalStatus, type Quality,
} from '../core/quality.js';
import { QUALITY_COLOUR, QualityMark } from './QualityMark.js';

/** The active hypothesis, as it bears on this innovation. */
export interface HypothesisContext {
  name: string;
  groups: HypothesisGroup[];
  /** How the hypothesis currently explains it; 'filtered' if a type filter excludes it. */
  explanation: Explanation | 'filtered' | null;
  assignment?: StoredAssignment;
  /** Explain it by a group (null: back to computed), with losses by label. */
  onAssign: (groupId: string | null, lostIn?: string[]) => void;
}

export interface InnovationDetailProps {
  dataset: Dataset;
  meta: InnovationMeta[];
  row: number;
  hypothesis?: HypothesisContext;
  onRename: (label: string) => void;
  onUpdate: (changes: Partial<InnovationMeta>) => void;
  onClose: () => void;
}

/**
 * The reasoning behind one innovation.
 *
 * K&F reason from a list of reflexes to competing proto-forms and then to
 * which is innovative (2018: 76). That argument is what makes a row auditable,
 * and in the CSV interchange format there is nowhere to put it. Here there is.
 *
 * Kept to free text on purpose. A structured lexical entry would be a better
 * database and a worse fit: this tool edits innovations and their
 * distributions, and anything richer belongs in CLDF.
 */
export function InnovationDetail({
  dataset, meta, row, hypothesis, onRename, onUpdate, onClose,
}: InnovationDetailProps) {
  const label = dataset.innovations[row] ?? '';
  const current = meta[row];
  if (!current) return null;

  const derived = typeOf(label);
  const type = current.type ?? derived;
  const reflexes = current.reflexes ?? {};
  const sources = current.sources ?? [];

  const others = dataset.innovations
    .map((l, i) => ({ label: l, id: meta[i]?.id, index: i }))
    .filter((o) => o.index !== row && o.id);
  const precedes = new Set(current.precedes ?? []);

  return (
    <aside style={S.panel}>
      <div style={S.head}>
        <strong>innovation {row + 1}</strong>
        <button onClick={onClose} style={S.close} aria-label="Close">×</button>
      </div>

      <label style={S.field}>
        <span style={S.labelText}>label</span>
        <input value={label} onChange={(e) => onRename(e.target.value)} style={S.input} />
      </label>

      <label style={S.field}>
        <span style={S.labelText}>type</span>
        <select
          value={type}
          onChange={(e) => onUpdate({ type: e.target.value as InnovationType })}
          style={S.input}
        >
          {INNOVATION_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </label>
      {!current.type && (
        <p style={S.hint}>
          Read from the label prefix. Choosing one here makes it explicit, so it
          stops depending on the label staying well-formed.
        </p>
      )}

      <QualitySection label={label} type={type} current={current} onUpdate={onUpdate} />

      {hypothesis && (
        <HypothesisSection context={hypothesis} languages={dataset.languages} cells={dataset.matrix[row] ?? []} />
      )}

      <div style={S.pair}>
        <label style={S.field}>
          <span style={S.labelText}>proto-form</span>
          <input
            value={current.protoForm ?? ''}
            onChange={(e) => onUpdate({ protoForm: e.target.value })}
            placeholder="*malate"
            style={S.input}
          />
        </label>
        <label style={S.field}>
          <span style={S.labelText}>innovated</span>
          <input
            value={current.innovatedForm ?? ''}
            onChange={(e) => onUpdate({ innovatedForm: e.target.value })}
            placeholder="*malete"
            style={S.input}
          />
        </label>
      </div>

      <label style={S.field}>
        <span style={S.labelText}>gloss</span>
        <input
          value={current.gloss ?? ''}
          onChange={(e) => onUpdate({ gloss: e.target.value })}
          placeholder="'broken'"
          style={S.input}
        />
      </label>

      <fieldset style={S.group}>
        <legend style={S.legend}>reflexes</legend>
        <p style={S.hint}>
          The forms the argument rests on. Only the languages that participated
          are prefilled as worth recording; any can be filled in.
        </p>
        {dataset.languages.map((language, column) => {
          const participates = dataset.matrix[row]?.[column] === 1;
          return (
            <label key={language} style={S.reflex}>
              <span style={{ ...S.reflexName, ...(participates ? S.reflexOn : {}) }}>
                {language}
              </span>
              <input
                value={reflexes[language] ?? ''}
                onChange={(e) =>
                  onUpdate({ reflexes: { ...reflexes, [language]: e.target.value } })}
                style={S.reflexInput}
              />
            </label>
          );
        })}
      </fieldset>

      <label style={S.field}>
        <span style={S.labelText}>notes</span>
        <textarea
          value={current.notes ?? ''}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          rows={3}
          placeholder="Why this direction of change; external evidence; doubts."
          style={S.textarea}
        />
      </label>

      <label style={S.field}>
        <span style={S.labelText}>sources</span>
        <input
          value={sources.join('; ')}
          onChange={(e) => onUpdate({
            sources: e.target.value.split(';').map((s) => s.trim()).filter(Boolean),
          })}
          placeholder="François 2005: 470; Clark 2009"
          style={S.input}
        />
      </label>

      <fieldset style={S.group}>
        <legend style={S.legend}>precedes</legend>
        <p style={S.hint}>
          Innovations this one must have happened before. K&amp;F recorded such
          orderings and never used them — only 92 of their 474 rows participate
          in any — but they are impossible to reconstruct later, so they are
          captured here even though no published method consumes them yet.
        </p>
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id) onUpdate({ precedes: [...precedes, id] });
          }}
          style={S.input}
        >
          <option value="">add an ordering…</option>
          {others.filter((o) => !precedes.has(o.id!)).map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        {[...precedes].map((id) => {
          const target = others.find((o) => o.id === id);
          return (
            <span key={id} style={S.chip}>
              {target?.label ?? '(deleted)'}
              <button
                onClick={() => onUpdate({
                  precedes: [...precedes].filter((p) => p !== id),
                })}
                style={S.chipRemove}
                aria-label="Remove ordering"
              >
                ×
              </button>
            </span>
          );
        })}
      </fieldset>
    </aside>
  );
}

/**
 * How the active hypothesis explains this innovation, and the place to say
 * otherwise. Losses are ticked per member; one the matrix contradicts (the
 * language has the innovation) cannot be ticked.
 */
function HypothesisSection({ context, languages, cells }: {
  context: HypothesisContext;
  languages: string[];
  cells: (0 | 1 | null)[];
}) {
  const { name, groups, explanation, assignment, onAssign } = context;
  const nameOf = (l: number) => languages[l] ?? `#${l}`;
  const groupName = (id: string) => {
    const g = groups.find((x) => x.id === id);
    return g ? (g.name || g.members.join(' + ')) : id;
  };
  const group = assignment && groups.find((g) => g.id === assignment.groupId);
  const lost = new Set(assignment?.lostIn ?? []);
  const has = (label: string) => cells[languages.indexOf(label)] === 1;
  const detail = explanation && explanation !== 'filtered' && 'assigned' in explanation
    ? explanation.assigned : undefined;

  return (
    <fieldset style={S.group}>
      <legend style={S.legend}>in hypothesis “{name}”</legend>
      <p style={S.explained}>
        {explanation === 'filtered'
          ? 'Excluded by the current type filter, so the hypothesis does not see it.'
          : explanation
            ? <>{assignment ? 'Assigned: ' : 'Computed: '}{describeExplanation(explanation, groupName, nameOf)}.</>
            : 'No analysis.'}
      </p>
      {explanation !== 'filtered' && (
        <label style={S.field}>
          <span style={S.labelText}>explained by</span>
          <select
            value={assignment?.groupId ?? ''}
            onChange={(e) => onAssign(e.target.value || null)}
            style={S.input}
          >
            <option value="">computed (no assignment)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name || g.members.join(' + ')} — {RELATION_LABELS[g.kind]}</option>
            ))}
          </select>
        </label>
      )}
      {group?.kind === 'subgroup' && (
        <div style={S.field}>
          <span style={S.labelText}>lost in</span>
          <div style={S.lossGrid}>
            {group.members.map((m) => (
              <label key={m} style={{ ...S.loss, ...(has(m) ? S.lossDisabled : {}) }} title={has(m) ? `${m} has it` : undefined}>
                <input
                  type="checkbox"
                  checked={lost.has(m)}
                  disabled={has(m) && !lost.has(m)}
                  onChange={() => onAssign(group.id, group.members.filter((x) =>
                    (x === m ? !lost.has(m) : lost.has(x))))}
                />
                {m}
              </label>
            ))}
          </div>
        </div>
      )}
      {detail && detail.unrecorded.length > 0 && (
        <p style={S.flag}>! Absent from {detail.unrecorded.map(nameOf).join(', ')} with no loss recorded.</p>
      )}
      {detail && detail.contradicted.length > 0 && (
        <p style={S.flag}>! Recorded as lost in {detail.contradicted.map(nameOf).join(', ')}, which {detail.contradicted.length === 1 ? 'has' : 'have'} it.</p>
      )}
      {detail && detail.noneInside && <p style={S.flag}>! No member of this group has it.</p>}
      {detail && detail.outside.length > 0 && (
        <p style={group?.kind === 'subgroup' ? S.hint : S.flag}>
          {group?.kind === 'subgroup' ? '' : '! '}Also in {detail.outside.map(nameOf).join(', ')}
          {group?.kind === 'subgroup' ? ', outside the subgroup: counted as borrowing.' : ', outside the group.'}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Quality, kept apart from type: Smith's (2025) replacement distinction lives
 * inside the lexical type, and correspondences apply to any reflex set. The
 * judgement line shows what the fields add up to, and why.
 */
function QualitySection({ label, type, current, onUpdate }: {
  label: string;
  type: InnovationType;
  current: InnovationMeta;
  onUpdate: (changes: Partial<InnovationMeta>) => void;
}) {
  const judgement = assessQuality(label, { ...current, type });
  // What the fields would give without an explicit override, for the
  // "derived" option's label.
  const derived = assessQuality(label, { ...current, type, quality: undefined });
  const fromLabel = labelQuality(label);
  const status = current.lexicalStatus ?? (type === 'Lex' ? fromLabel.lexicalStatus : undefined);

  return (
    <fieldset style={S.group}>
      <legend style={S.legend}>quality</legend>

      <div style={S.judgement}>
        <QualityMark judgement={judgement} />
        <strong style={{ color: QUALITY_COLOUR[judgement.quality] }}>{judgement.quality}</strong>
        <span style={S.reason}>— {judgement.reason}</span>
      </div>

      {type === 'Lex' && (
        <label style={S.field}>
          <span style={S.labelText}>lexical status</span>
          <select
            value={current.lexicalStatus ?? ''}
            onChange={(e) => onUpdate({
              lexicalStatus: (e.target.value || undefined) as LexicalStatus | undefined,
            })}
            style={S.input}
          >
            <option value="">
              {fromLabel.lexicalStatus
                ? `from label: ${LEXICAL_STATUS_LABELS[fromLabel.lexicalStatus]}`
                : 'not recorded'}
            </option>
            {LEXICAL_STATUSES.map((st) => (
              <option key={st} value={st} title={LEXICAL_STATUS_HELP[st]}>
                {LEXICAL_STATUS_LABELS[st]}
              </option>
            ))}
          </select>
          {status && <span style={S.hint}>{LEXICAL_STATUS_HELP[status]}</span>}
        </label>
      )}

      <label style={S.field}>
        <span style={S.labelText}>sound correspondences</span>
        <select
          value={current.correspondences ?? ''}
          onChange={(e) => onUpdate({
            correspondences: (e.target.value || undefined) as Correspondences | undefined,
          })}
          style={S.input}
        >
          <option value="">not checked</option>
          <option value="regular">regular</option>
          <option value="irregular">irregular — suggests a loan</option>
        </select>
      </label>

      <label style={S.field}>
        <span style={S.labelText}>judgement</span>
        <select
          value={current.quality ?? ''}
          onChange={(e) => onUpdate({ quality: (e.target.value || undefined) as Quality | undefined })}
          style={S.input}
        >
          <option value="">derived: {derived.quality} ({derived.reason})</option>
          <option value="high">high</option>
          <option value="low">low</option>
        </select>
      </label>
      {type !== 'Lex' && !current.quality && !fromLabel.quality && (
        <p style={S.hint}>
          Nothing is inferred from the type: a natural sound change can recur
          independently, an idiosyncratic one rarely does (Kaufman 2026: 3). Set a
          judgement if you have one.
        </p>
      )}
    </fieldset>
  );
}

const S: Record<string, React.CSSProperties> = {
  explained: { margin: '0.15rem 0 0', fontSize: '0.72rem', lineHeight: 1.4 },
  lossGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.1rem 0.4rem' },
  loss: { display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.72rem' },
  lossDisabled: { color: '#bbb' },
  flag: { color: '#b00', fontSize: '0.7rem', margin: '0.25rem 0 0', lineHeight: 1.4 },
  judgement: { display: 'flex', gap: '0.3rem', alignItems: 'baseline', fontSize: '0.74rem' },
  reason: { color: '#777' },
  panel: {
    border: '1px solid #ddd', borderRadius: 6, padding: '0.7rem',
    fontSize: '0.78rem', background: '#fff', maxHeight: 640, overflowY: 'auto',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  close: { border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 },
  field: { display: 'flex', flexDirection: 'column', gap: '0.1rem', marginTop: '0.45rem' },
  pair: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' },
  labelText: { color: '#666', fontSize: '0.68rem' },
  input: { fontSize: '0.76rem', padding: '0.2rem 0.3rem', width: '100%', boxSizing: 'border-box' },
  textarea: { fontSize: '0.76rem', padding: '0.2rem 0.3rem', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
  hint: { color: '#999', fontSize: '0.67rem', margin: '0.2rem 0', lineHeight: 1.4 },
  group: { border: '1px solid #eee', borderRadius: 4, padding: '0.4rem', marginTop: '0.6rem' },
  legend: { fontSize: '0.68rem', color: '#666', padding: '0 0.25rem' },
  reflex: { display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: 2 },
  reflexName: {
    width: 42, flexShrink: 0, fontSize: '0.68rem', color: '#aaa',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  reflexOn: { color: '#d33', fontWeight: 600 },
  reflexInput: { flex: 1, fontSize: '0.72rem', padding: '0.1rem 0.25rem', minWidth: 0 },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
    background: '#f2f2f2', borderRadius: 3, padding: '0 0.2rem',
    fontSize: '0.68rem', margin: '0.2rem 0.2rem 0 0',
  },
  chipRemove: { border: 'none', background: 'none', cursor: 'pointer', color: '#888', padding: 0 },
};
