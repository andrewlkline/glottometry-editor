import type { Dataset } from '../core/types.js';
import {
  INNOVATION_TYPES, TYPE_LABELS, typeOf, type InnovationType,
} from '../core/innovationTypes.js';
import type { InnovationMeta } from '../data/innovationMeta.js';

export interface InnovationDetailProps {
  dataset: Dataset;
  meta: InnovationMeta[];
  row: number;
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
  dataset, meta, row, onRename, onUpdate, onClose,
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

const S: Record<string, React.CSSProperties> = {
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
