import type { LinkageStage } from '../core/chronology.js';
import type { StrengthMeasure } from '../core/types.js';

export interface ChronologyPanelProps {
  stages: LinkageStage[];
  current: LinkageStage | null;
  languages: string[];
  measure: StrengthMeasure;
  /** Jump the threshold to a stage. */
  onGoTo: (threshold: number) => void;
}

const MEASURE_SYMBOL: Record<StrengthMeasure, string> = {
  sigma: 'ς', epsilon: 'ε', significance: '−log₁₀p',
};

/**
 * The fragmentation sequence, per Kalyan & François (2019: 171).
 *
 * Deliberately not called a chronology in the interface. K&F present the
 * sequence as one — a proto-language breaking into daughters — but Elgh &
 * Hammarström (2024: 312) argue the weakness formula "offers no guarantee that
 * the weakest isogloss lines are the earliest links to be broken", and that
 * Historical Glottometry is "simply a data display system, with no explicit
 * time dimension". The order in which the evidence thins out is a fact; that
 * it is the order history happened in is a claim, and the disagreement is
 * printed at the bottom of the panel rather than resolved silently.
 */
export function ChronologyPanel({
  stages, current, languages, measure, onGoTo,
}: ChronologyPanelProps) {
  const symbol = MEASURE_SYMBOL[measure];

  if (stages.length <= 1) {
    return (
      <aside style={S.panel}>
        <strong>fragmentation</strong>
        <p style={S.note}>
          The diagram stays in one piece at every threshold, so there is no
          sequence to read. That usually means a strong isogloss spans the whole
          family.
        </p>
      </aside>
    );
  }

  return (
    <aside style={S.panel}>
      <div style={S.head}>
        <strong>fragmentation</strong>
        <span style={S.meta}>{stages.length} stages</span>
      </div>

      <p style={S.note}>
        A <em>language</em> is a connected component of the diagram. Raising the
        threshold drops the weakest isoglosses, and the family breaks apart.
      </p>

      <ol style={S.list}>
        {stages.map((stage) => {
          const isCurrent = current?.threshold === stage.threshold;
          return (
            <li key={stage.threshold}>
              <button
                onClick={() => onGoTo(stage.threshold)}
                style={{ ...S.stage, ...(isCurrent ? S.stageCurrent : {}) }}
                title={`Set the threshold to ${stage.threshold.toFixed(2)}`}
              >
                <span style={S.stageHead}>
                  <span style={S.count}>
                    {stage.components.length}{' '}
                    {stage.components.length === 1 ? 'language' : 'languages'}
                  </span>
                  <span style={S.threshold}>
                    {symbol} ≥ {stage.threshold.toFixed(2)}
                  </span>
                </span>
                {stage.brokenBy && (
                  <span style={S.broke}>
                    lost {stage.brokenBy.memberNames.join('+')}
                  </span>
                )}
                <span style={S.components}>
                  {stage.components.map((component, i) => (
                    <span key={i} style={{ ...S.component, background: tint(i) }}>
                      {component.map((l) => languages[l]).join(' ')}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p style={S.caveat}>
        Kalyan &amp; François (2019: 171) read this sequence as a chronology of
        lineage splits. Elgh &amp; Hammarström (2024: 312) disagree: the weakness
        formula “offers no guarantee that the weakest isogloss lines are the
        earliest links to be broken. Rather, weaker lines may be indicative of
        shorter time spans, not of when those time spans occurred.” The order the
        evidence thins out in is solid; that it is the order events happened in
        is not.
      </p>
    </aside>
  );
}

/**
 * Distinguishable pastel per component.
 *
 * Golden-angle hue steps so neighbouring components stay far apart in hue
 * however many there are; kept pale so node labels remain readable on top.
 */
export function tint(index: number): string {
  return `hsl(${(index * 137.508) % 360} 62% 88%)`;
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    border: '1px solid #ddd', borderRadius: 6, padding: '0.6rem',
    fontSize: '0.78rem', background: '#fff', maxHeight: 620, overflowY: 'auto',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  meta: { color: '#888', fontSize: '0.72rem' },
  note: { color: '#777', fontSize: '0.7rem', margin: '0.3rem 0 0.5rem', lineHeight: 1.45 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  stage: {
    width: '100%', textAlign: 'left', border: '1px solid transparent',
    borderRadius: 4, background: '#fafafa', cursor: 'pointer',
    padding: '0.3rem 0.35rem', display: 'flex', flexDirection: 'column', gap: '0.15rem',
    font: 'inherit',
  },
  stageCurrent: { background: '#eef4ff', borderColor: '#9bbdf0' },
  stageHead: { display: 'flex', justifyContent: 'space-between', gap: '0.5rem' },
  count: { fontWeight: 600, fontSize: '0.74rem' },
  threshold: { color: '#888', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' },
  broke: { color: '#a60', fontSize: '0.68rem' },
  components: { display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 },
  component: {
    fontSize: '0.62rem', padding: '0 3px', borderRadius: 2,
    border: '1px solid rgba(0,0,0,0.08)', lineHeight: 1.6,
  },
  caveat: {
    color: '#666', fontSize: '0.67rem', lineHeight: 1.45, marginTop: '0.6rem',
    paddingTop: '0.5rem', borderTop: '1px solid #f0f0f0',
  },
};
