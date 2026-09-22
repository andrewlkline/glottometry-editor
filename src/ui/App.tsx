/**
 * Phase 0 placeholder.
 *
 * This is NOT the product. It exists to prove the core runs unchanged in a
 * browser and that the CSV -> metrics -> seriation pipeline is wired up. The
 * diagram renderer it will be replaced by is Phase 1 (BUILD_PLAN.md §4).
 */

import { useCallback, useEffect, useState } from 'react';
import { Glottometry } from '../core/metrics.js';
import { countBreaks, seriate } from '../core/seriation.js';
import { parseMaramaCsv } from '../data/maramaCsv.js';
import type { Dataset, NaPolicy, Subgroup } from '../core/types.js';

const POLICIES: NaPolicy[] = ['half', 'zero', 'one', 'rowMean', 'colMean'];

interface Analysis {
  subgroups: Subgroup[];
  order: string[];
  contiguous: number;
  shown: number;
  elapsedMs: number;
}

function analyse(dataset: Dataset, policy: NaPolicy, minSigma: number): Analysis {
  const t0 = performance.now();
  const subgroups = new Glottometry(dataset, policy).subgroups();
  const shown = subgroups.filter((s) => s.sigma >= minSigma);
  const masks = shown.map((s) => {
    const m = new Array<boolean>(dataset.languages.length).fill(false);
    for (const i of s.members) m[i] = true;
    return m;
  });
  const { order } = seriate(masks, shown.map((s) => s.sigma), dataset.languages.length, {
    seed: 0,
    restarts: 20,
  });
  return {
    subgroups,
    order: order.map((i) => dataset.languages[i]!),
    contiguous: masks.filter((m) => countBreaks(order, m) === 0).length,
    shown: shown.length,
    elapsedMs: performance.now() - t0,
  };
}

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [policy, setPolicy] = useState<NaPolicy>('half');
  const [minSigma, setMinSigma] = useState(1);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDemo = useCallback(async () => {
    try {
      const text = await fetch('demo/innov.csv').then((r) => r.text());
      setDataset(parseMaramaCsv(text));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void loadDemo();
  }, [loadDemo]);

  useEffect(() => {
    if (!dataset) return;
    try {
      setAnalysis(analyse(dataset, policy, minSigma));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [dataset, policy, minSigma]);

  const onFile = async (file: File) => {
    try {
      setDataset(parseMaramaCsv(await file.text()));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>Glottometry — core check</h1>
      <p style={styles.note}>
        Phase 0 placeholder: confirms the metrics and seriation run in the
        browser. The diagram renderer is Phase 1.
      </p>

      <div style={styles.controls}>
        <label>
          Marama CSV:{' '}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>
        <button onClick={() => void loadDemo()} style={styles.button}>
          reload demo
        </button>
        <label>
          NA policy:{' '}
          <select value={policy} onChange={(e) => setPolicy(e.target.value as NaPolicy)}>
            {POLICIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          ς ≥ {minSigma.toFixed(2)}{' '}
          <input
            type="range"
            min={0}
            max={6}
            step={0.05}
            value={minSigma}
            onChange={(e) => setMinSigma(Number(e.target.value))}
          />
        </label>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {dataset && analysis && (
        <>
          <p style={styles.stats}>
            {dataset.innovations.length} innovations × {dataset.languages.length} languages
            → <strong>{analysis.subgroups.length}</strong> attested subgroups,{' '}
            <strong>{analysis.shown}</strong> above threshold,{' '}
            <strong>{analysis.contiguous}/{analysis.shown}</strong> contiguous in the
            seriated order ({analysis.elapsedMs.toFixed(0)} ms).
          </p>
          <p style={styles.order}>{analysis.order.join('  ')}</p>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ς</th>
                <th style={styles.th}>κ</th>
                <th style={styles.th}>ε</th>
                <th style={{ ...styles.th, textAlign: 'left' }}>members</th>
              </tr>
            </thead>
            <tbody>
              {analysis.subgroups
                .filter((s) => s.sigma >= minSigma)
                .map((s) => (
                  <tr key={s.members.join(',')}>
                    <td style={styles.td}>{s.sigma.toFixed(2)}</td>
                    <td style={styles.td}>{s.kappa.toFixed(2)}</td>
                    <td style={styles.td}>{s.epsilon.toFixed(2)}</td>
                    <td style={{ ...styles.td, textAlign: 'left' }}>
                      {s.memberNames.join(' + ')}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 860,
    margin: '0 auto',
    padding: '2rem 1rem',
    lineHeight: 1.5,
  },
  h1: { fontSize: '1.4rem', marginBottom: '0.25rem' },
  note: { color: '#666', fontSize: '0.85rem', marginTop: 0 },
  controls: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: '0.75rem 0',
    borderTop: '1px solid #ddd',
    borderBottom: '1px solid #ddd',
    fontSize: '0.85rem',
  },
  button: { fontSize: '0.85rem' },
  error: { color: '#b00', fontFamily: 'monospace', fontSize: '0.8rem' },
  stats: { fontSize: '0.9rem' },
  order: { fontFamily: 'monospace', fontSize: '0.85rem', color: '#444' },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' },
  th: { textAlign: 'right', borderBottom: '2px solid #333', padding: '0.3rem 0.5rem' },
  td: { textAlign: 'right', borderBottom: '1px solid #eee', padding: '0.25rem 0.5rem' },
};
