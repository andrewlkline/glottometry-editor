import { useMemo, useRef, useState } from 'react';
import type { Cell, Dataset } from '../core/types.js';
import {
  INNOVATION_TYPES, TYPE_LABELS, typeOf, type InnovationType,
} from '../core/innovationTypes.js';
import type { InnovationMeta } from '../data/innovationMeta.js';

export interface MatrixEditorProps {
  dataset: Dataset;
  meta: InnovationMeta[];
  selected: number | null;
  onSelect: (row: number | null) => void;
  onCycleCell: (row: number, column: number) => void;
  onSetRow: (row: number, values: Cell[]) => void;
  onAddInnovation: () => void;
  onRemoveInnovation: (row: number) => void;
  onAddLanguage: () => void;
  onRenameLanguage: (column: number, label: string) => void;
  onRemoveLanguage: (column: number) => void;
}

const ROW_HEIGHT = 24;
const OVERSCAN = 8;

/** The type a row is currently treated as: explicit if set, else from the label. */
export function effectiveType(label: string, meta: InnovationMeta | undefined): InnovationType {
  return meta?.type ?? typeOf(label);
}

/**
 * The innovations × languages grid.
 *
 * Windowed rather than fully rendered: K&F's dataset is 474 rows × 17
 * languages, so a naive grid is eight thousand cells and every keystroke in
 * the filter box would re-render all of them. Only the visible slice is in the
 * DOM, with a spacer above and below to keep the scrollbar honest.
 */
export function MatrixEditor({
  dataset, meta, selected, onSelect, onCycleCell, onSetRow,
  onAddInnovation, onRemoveInnovation, onAddLanguage, onRenameLanguage,
  onRemoveLanguage,
}: MatrixEditorProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<InnovationType | 'all'>('all');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const viewport = useRef<HTMLDivElement>(null);

  // Filtering yields row indices into the real dataset, so every callback
  // still addresses the underlying row rather than a position in the view.
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < dataset.innovations.length; i++) {
      const label = dataset.innovations[i]!;
      if (typeFilter !== 'all' && effectiveType(label, meta[i]) !== typeFilter) continue;
      if (needle && !label.toLowerCase().includes(needle)) continue;
      out.push(i);
    }
    return out;
  }, [dataset.innovations, meta, query, typeFilter]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const window = rows.slice(first, first + visibleCount);

  return (
    <section style={S.wrap}>
      <div style={S.toolbar}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter innovations…"
          style={S.search}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as InnovationType | 'all')}
          style={S.select}
        >
          <option value="all">all types</option>
          {INNOVATION_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <span style={S.count}>
          {rows.length === dataset.innovations.length
            ? `${rows.length} innovations`
            : `${rows.length} of ${dataset.innovations.length}`}
        </span>
        <span style={S.spacer} />
        <button onClick={onAddInnovation}>+ innovation</button>
        <button onClick={onAddLanguage}>+ language</button>
      </div>

      <div style={S.headerRow}>
        <span style={S.headerLabel}>innovation</span>
        {dataset.languages.map((label, column) => (
          <LanguageHeader
            key={label}
            label={label}
            onRename={(next) => onRenameLanguage(column, next)}
            onRemove={dataset.languages.length > 1
              ? () => onRemoveLanguage(column) : undefined}
          />
        ))}
      </div>

      <div
        ref={viewport}
        style={S.viewport}
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop);
          setViewportHeight(e.currentTarget.clientHeight);
        }}
      >
        {rows.length === 0 ? (
          <p style={S.empty}>
            {dataset.innovations.length === 0
              ? 'No innovations yet. Add one to start building a dataset.'
              : 'Nothing matches that filter.'}
          </p>
        ) : (
          <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
            <div style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
              {window.map((row) => (
                <Row
                  key={row}
                  row={row}
                  label={dataset.innovations[row]!}
                  cells={dataset.matrix[row]!}
                  type={effectiveType(dataset.innovations[row]!, meta[row])}
                  selected={selected === row}
                  onSelect={() => onSelect(selected === row ? null : row)}
                  onCycleCell={(column) => onCycleCell(row, column)}
                  onFill={(value) =>
                    onSetRow(row, new Array(dataset.languages.length).fill(value))}
                  onRemove={() => onRemoveInnovation(row)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({
  row, label, cells, type, selected, onSelect, onCycleCell, onFill, onRemove,
}: {
  row: number; label: string; cells: Cell[]; type: InnovationType;
  selected: boolean; onSelect: () => void;
  onCycleCell: (column: number) => void;
  onFill: (value: Cell) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ ...S.row, ...(selected ? S.rowSelected : {}) }}>
      <button
        onClick={onSelect}
        style={S.rowLabel}
        title={`${label}\n${TYPE_LABELS[type]}`}
      >
        <span style={S.typeTag}>{type === 'untyped' ? '—' : type}</span>
        <span style={S.labelText}>{label}</span>
      </button>

      {cells.map((cell, column) => (
        <button
          key={column}
          onClick={() => onCycleCell(column)}
          style={{ ...S.cell, ...cellStyle(cell) }}
          title="Click to cycle 1 → 0 → unknown"
          aria-label={`row ${row + 1}, column ${column + 1}: ${cell ?? 'unknown'}`}
        >
          {cell === 1 ? '1' : cell === 0 ? '0' : '·'}
        </button>
      ))}

      <span style={S.rowActions}>
        <button onClick={() => onFill(0)} style={S.tiny} title="Set every cell to 0">0</button>
        <button onClick={() => onFill(null)} style={S.tiny} title="Set every cell to unknown">·</button>
        <button onClick={onRemove} style={S.tiny} title="Delete this innovation">×</button>
      </span>
    </div>
  );
}

function LanguageHeader({ label, onRename, onRemove }: {
  label: string; onRename: (next: string) => void; onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onRename(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onRename(draft); setEditing(false); }
          if (e.key === 'Escape') { setDraft(label); setEditing(false); }
        }}
        style={S.headerInput}
      />
    );
  }

  return (
    <span style={S.header}>
      <button
        onClick={() => { setDraft(label); setEditing(true); }}
        style={S.headerButton}
        title={`${label} — click to rename`}
      >
        {label}
      </button>
      {onRemove && (
        <button onClick={onRemove} style={S.headerRemove} title={`Remove ${label}`}>×</button>
      )}
    </span>
  );
}

function cellStyle(cell: Cell): React.CSSProperties {
  if (cell === 1) return { background: '#d33', color: '#fff', fontWeight: 600 };
  if (cell === 0) return { background: '#f4f4f4', color: '#bbb' };
  return { background: '#fff8e8', color: '#c90' };
}

const CELL_WIDTH = 30;

const S: Record<string, React.CSSProperties> = {
  wrap: { border: '1px solid #ddd', borderRadius: 6, background: '#fff', overflow: 'hidden' },
  toolbar: {
    display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem',
    borderBottom: '1px solid #eee', fontSize: '0.78rem', flexWrap: 'wrap',
  },
  search: { fontSize: '0.78rem', padding: '0.2rem 0.4rem', minWidth: 190 },
  select: { fontSize: '0.78rem' },
  count: { color: '#888', fontSize: '0.72rem' },
  spacer: { flex: 1 },
  headerRow: {
    display: 'flex', alignItems: 'stretch', gap: 1,
    padding: '0 0.5rem', borderBottom: '2px solid #333',
    fontSize: '0.68rem', background: '#fafafa', position: 'sticky', top: 0,
  },
  headerLabel: { width: 320, flexShrink: 0, padding: '0.3rem 0', color: '#666' },
  header: { width: CELL_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  headerButton: {
    border: 'none', background: 'none', cursor: 'pointer', padding: 0,
    fontSize: '0.66rem', maxWidth: CELL_WIDTH - 8, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  headerRemove: {
    border: 'none', background: 'none', cursor: 'pointer',
    color: '#bbb', fontSize: '0.6rem', padding: 0,
  },
  headerInput: { width: CELL_WIDTH * 2, fontSize: '0.66rem' },
  viewport: { maxHeight: 560, overflowY: 'auto', padding: '0 0.5rem' },
  empty: { color: '#999', fontSize: '0.8rem', padding: '1.5rem 0.5rem', textAlign: 'center' },
  row: { display: 'flex', alignItems: 'center', gap: 1, height: ROW_HEIGHT },
  rowSelected: { background: '#eef4ff' },
  rowLabel: {
    width: 320, flexShrink: 0, textAlign: 'left', border: 'none',
    background: 'none', cursor: 'pointer', fontSize: '0.72rem',
    display: 'flex', gap: '0.35rem', alignItems: 'baseline', overflow: 'hidden',
  },
  typeTag: {
    fontSize: '0.6rem', color: '#888', width: 26, flexShrink: 0,
    fontFamily: 'ui-monospace, monospace',
  },
  labelText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cell: {
    width: CELL_WIDTH, flexShrink: 0, height: ROW_HEIGHT - 4,
    border: '1px solid rgba(0,0,0,0.06)', borderRadius: 2,
    cursor: 'pointer', fontSize: '0.66rem', padding: 0,
    fontFamily: 'ui-monospace, monospace',
  },
  rowActions: { display: 'flex', gap: 1, marginLeft: '0.4rem' },
  tiny: {
    border: '1px solid #eee', background: '#fafafa', cursor: 'pointer',
    fontSize: '0.6rem', width: 18, height: 18, padding: 0, borderRadius: 2, color: '#888',
  },
};
