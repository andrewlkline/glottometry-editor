/**
 * Key for the quality overlay. The swatches are drawn with the same dash
 * function as the contours, so the legend cannot drift from the diagram.
 */

import { FADED_OPACITY, supportDash } from '../render/styles.js';

const WIDTH = 4;

function Swatch({ support, faded }: { support: 'high' | 'low' | 'unassessed'; faded?: boolean }) {
  return (
    <svg width={34} height={10} aria-hidden style={{ verticalAlign: 'middle', flexShrink: 0 }}>
      <line
        x1={WIDTH} y1={5} x2={34 - WIDTH} y2={5}
        stroke="#c0282d" strokeWidth={WIDTH} strokeLinecap="round"
        strokeDasharray={supportDash(support, WIDTH)}
        opacity={faded ? FADED_OPACITY : 1}
      />
    </svg>
  );
}

export function QualityLegend({ lines, survival, measure, threshold, visibleCount }: {
  lines: boolean;
  /** Null when the survival overlay is off. */
  survival: { highCount: number; fadedCount: number } | null;
  measure: string;
  threshold: number;
  visibleCount: number;
}) {
  return (
    <div style={S.box}>
      {lines && (
        <span style={S.group}>
          <span style={S.item}><Swatch support="high" /> high-quality exclusive support</span>
          <span style={S.item}><Swatch support="low" /> low-quality only</span>
          <span style={S.item}><Swatch support="unassessed" /> not yet assessed</span>
        </span>
      )}
      {survival && (survival.highCount === 0 ? (
        <span style={S.warn}>
          No innovations are assessed high yet, so survival has nothing to test and nothing is
          faded. Record quality in the data view.
        </span>
      ) : (
        <span style={S.item}>
          <Swatch support="high" faded />
          {survival.fadedCount} of {visibleCount} fall below {measure} ≥ {threshold.toFixed(2)} on
          the {survival.highCount} high-quality {survival.highCount === 1 ? 'innovation' : 'innovations'} alone
        </span>
      ))}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  box: {
    display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.2rem', alignItems: 'center',
    fontSize: '0.74rem', color: '#555', margin: '0 0 0.5rem',
  },
  group: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' },
  item: { display: 'inline-flex', gap: '0.35rem', alignItems: 'center' },
  warn: { color: '#a60' },
};
