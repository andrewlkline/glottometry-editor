import type { ContourShape } from '../render/scene.js';

export interface SubgroupListProps {
  contours: ContourShape[];
  selected: string | null;
  hidden: Set<string>;
  onSelect: (key: string | null) => void;
  onHover: (key: string | null) => void;
  onToggleHidden: (key: string) => void;
  onShowAll: () => void;
}

/**
 * Every drawn subgroup, strongest first, with per-contour visibility.
 *
 * Thresholding alone is a blunt instrument: it can only remove subgroups in
 * order of strength, so hiding one busy contour means losing everything weaker
 * than it. Being able to hide a single isogloss is what makes a dense region
 * readable without misrepresenting the data as sparser than it is.
 */
export function SubgroupList({
  contours, selected, hidden, onSelect, onHover, onToggleHidden, onShowAll,
}: SubgroupListProps) {
  const ordered = [...contours].sort((a, b) => b.subgroup.sigma - a.subgroup.sigma);

  return (
    <aside style={S.panel}>
      <div style={S.head}>
        <strong>subgroups</strong>
        <span style={S.meta}>
          {ordered.length - hidden.size}/{ordered.length} shown
          {hidden.size > 0 && (
            <button onClick={onShowAll} style={S.showAll}>show all</button>
          )}
        </span>
      </div>

      <ul style={S.list}>
        {ordered.map((c) => {
          const isHidden = hidden.has(c.key);
          const isSelected = selected === c.key;
          return (
            <li
              key={c.key}
              style={{
                ...S.row,
                ...(isSelected ? S.rowSelected : {}),
                ...(isHidden ? S.rowHidden : {}),
              }}
              onMouseEnter={() => !isHidden && onHover(c.key)}
              onMouseLeave={() => onHover(null)}
            >
              <button
                onClick={() => onToggleHidden(c.key)}
                style={S.eye}
                title={isHidden ? 'Show' : 'Hide'}
                aria-label={isHidden ? 'Show' : 'Hide'}
              >
                {isHidden ? '○' : '●'}
              </button>
              <button
                onClick={() => onSelect(isSelected ? null : c.key)}
                style={S.name}
                title="Show the innovations behind this subgroup"
              >
                <span
                  style={{ ...S.swatch, background: c.style.stroke, height: Math.max(2, c.style.strokeWidth) }}
                />
                {c.subgroup.memberNames.join('+')}
                {c.routed && <span style={S.routed} title="Routed around non-members">↳</span>}
              </button>
              <span style={S.sigma}>{c.subgroup.sigma.toFixed(2)}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: '0.6rem',
    fontSize: '0.78rem',
    maxHeight: 620,
    overflowY: 'auto',
    background: '#fff',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  meta: { color: '#888', fontSize: '0.72rem' },
  showAll: {
    marginLeft: '0.4rem', border: 'none', background: 'none',
    color: '#06c', cursor: 'pointer', fontSize: '0.72rem', padding: 0,
  },
  list: { listStyle: 'none', margin: '0.4rem 0 0', padding: 0 },
  row: {
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    padding: '1px 2px', borderRadius: 3,
  },
  rowSelected: { background: '#eef4ff' },
  rowHidden: { opacity: 0.4 },
  eye: {
    border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '0.62rem', color: '#666', padding: '0 2px', lineHeight: 1,
  },
  name: {
    flex: 1, textAlign: 'left', border: 'none', background: 'none',
    cursor: 'pointer', padding: '1px 0', fontSize: '0.74rem',
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  swatch: { display: 'inline-block', width: 14, borderRadius: 1, flexShrink: 0 },
  routed: { color: '#a60' },
  sigma: { color: '#666', fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem' },
};
