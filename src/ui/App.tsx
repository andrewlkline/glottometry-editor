import { useCallback, useEffect, useMemo, useState } from 'react';
import { Glottometry } from '../core/metrics.js';
import {
  chainLayout, orderFor, planarLayout, projectGeographic, type Layout, type LayoutKind,
} from '../core/layout.js';
import { classicalMds, cohesivenessMatrix, distanceMatrix } from '../core/mds.js';
import { parseCoordinatesCsv, parseMaramaCsv, type LanguageCoordinates } from '../data/maramaCsv.js';
import { buildScene } from '../render/scene.js';
import { Diagram } from '../render/Diagram.js';
import { downloadSvg } from '../render/exportSvg.js';
import type { Dataset, NaPolicy } from '../core/types.js';

const POLICIES: NaPolicy[] = ['half', 'zero', 'one', 'rowMean', 'colMean'];

const LAYOUT_LABELS: Record<LayoutKind, string> = {
  chain: 'chain',
  mds: 'MDS (cohesiveness)',
  geographic: 'geographic',
};

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [coords, setCoords] = useState<LanguageCoordinates | null>(null);
  const [name, setName] = useState('demo');
  const [policy, setPolicy] = useState<NaPolicy>('half');
  const [layoutKind, setLayoutKind] = useState<LayoutKind>('chain');
  const [minSigma, setMinSigma] = useState(1);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDemo = useCallback(async () => {
    try {
      const [inn, crd] = await Promise.all([
        fetch('demo/innov.csv').then((r) => r.text()),
        fetch('demo/coords.csv').then((r) => (r.ok ? r.text() : '')),
      ]);
      setDataset(parseMaramaCsv(inn));
      setCoords(crd ? parseCoordinatesCsv(crd) : null);
      setName('demo');
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void loadDemo();
  }, [loadDemo]);

  // Scored once per dataset+policy, independent of threshold and layout.
  const scored = useMemo(() => {
    if (!dataset) return null;
    const t0 = performance.now();
    const g = new Glottometry(dataset, policy);
    const subgroups = g.subgroups();
    return { g, subgroups, elapsedMs: performance.now() - t0 };
  }, [dataset, policy]);

  const haveCoords = useMemo(
    () => !!dataset && !!coords && dataset.languages.every((l) => coords[l]),
    [dataset, coords],
  );

  const layout = useMemo((): Layout | null => {
    if (!dataset || !scored) return null;
    const { languages } = dataset;

    if (layoutKind === 'geographic' && haveCoords) {
      const points = projectGeographic(languages.map((l) => coords![l]!));
      return planarLayout(points, languages, 'geographic');
    }
    if (layoutKind === 'mds') {
      const points = classicalMds(distanceMatrix(cohesivenessMatrix(scored.g)), 2)
        .map((c) => [c[0]!, c[1]!] as [number, number]);
      return planarLayout(points, languages, 'mds');
    }
    // Seriate over ALL subgroups so the layout does not move when the
    // threshold does — see BUILD_PLAN.md, layout stability.
    const { order } = orderFor(scored.subgroups, languages.length);
    return chainLayout(order, languages);
  }, [dataset, scored, layoutKind, haveCoords, coords]);

  const scene = useMemo(() => {
    if (!layout || !scored) return null;
    return buildScene(layout, scored.subgroups.filter((s) => s.sigma >= minSigma));
  }, [layout, scored, minSigma]);

  const onInnovations = async (file: File) => {
    try {
      setDataset(parseMaramaCsv(await file.text()));
      setName(file.name.replace(/\.csv$/i, ''));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const onCoordinates = async (file: File) => {
    try {
      setCoords(parseCoordinatesCsv(await file.text()));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const shown = scene?.contours.length ?? 0;
  const hovered = scene?.contours.find((c) => c.key === highlighted)?.subgroup;

  return (
    <main style={S.main}>
      <header>
        <h1 style={S.h1}>Historical Glottometry</h1>
        <p style={S.sub}>
          Thickness ∝ subgroupiness (ς) · colour intensity ∝ cohesiveness (κ)
        </p>
      </header>

      <div style={S.controls}>
        <label>
          innovations{' '}
          <input type="file" accept=".csv,text/csv" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onInnovations(f);
          }} />
        </label>
        <label>
          coordinates{' '}
          <input type="file" accept=".csv,text/csv" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onCoordinates(f);
          }} />
        </label>
        <button onClick={() => void loadDemo()}>demo</button>
      </div>

      <div style={S.controls}>
        <label>
          layout{' '}
          <select
            value={layoutKind}
            onChange={(e) => setLayoutKind(e.target.value as LayoutKind)}
          >
            {(Object.keys(LAYOUT_LABELS) as LayoutKind[]).map((k) => (
              <option key={k} value={k} disabled={k === 'geographic' && !haveCoords}>
                {LAYOUT_LABELS[k]}
                {k === 'geographic' && !haveCoords ? ' — no coordinates' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          NA{' '}
          <select value={policy} onChange={(e) => setPolicy(e.target.value as NaPolicy)}>
            {POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={S.slider}>
          ς ≥ {minSigma.toFixed(2)}
          <input
            type="range" min={0} max={6} step={0.05} value={minSigma}
            onChange={(e) => setMinSigma(Number(e.target.value))}
          />
        </label>
        <button
          disabled={!scene}
          onClick={() => scene && downloadSvg(scene, `${name}-glottometry`, {
            title: `Glottometric diagram — ${name}`,
            subtitle: `${shown} subgroups with ς ≥ ${minSigma.toFixed(2)} · ${LAYOUT_LABELS[layoutKind]} layout · NA: ${policy}`,
          })}
        >
          export SVG
        </button>
      </div>

      {error && <p style={S.error}>{error}</p>}

      {dataset && scored && scene && (
        <>
          <p style={S.stats}>
            {dataset.innovations.length} innovations × {dataset.languages.length} languages
            → {scored.subgroups.length} attested, <strong>{shown}</strong> drawn
            {scene.splitCount > 0 && (
              <> · <span style={S.warn}>{scene.splitCount} in multiple regions</span></>
            )}
          </p>

          <div style={S.stage}>
            <Diagram scene={scene} highlighted={highlighted} onHover={setHighlighted} />
          </div>

          <div style={S.readout}>
            {hovered ? (
              <span>
                <strong>{hovered.memberNames.join(' + ')}</strong>
                {'  '}ς {hovered.sigma.toFixed(2)} · κ {hovered.kappa.toFixed(2)} · ε{' '}
                {hovered.epsilon.toFixed(2)}
              </span>
            ) : (
              <span style={S.hint}>hover a contour for its values</span>
            )}
          </div>
        </>
      )}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 900,
    margin: '0 auto',
    padding: '1.5rem 1rem 3rem',
    lineHeight: 1.5,
  },
  h1: { fontSize: '1.3rem', margin: 0 },
  sub: { color: '#666', fontSize: '0.8rem', margin: '0.15rem 0 0' },
  controls: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: '0.55rem 0',
    borderTop: '1px solid #ddd',
    fontSize: '0.82rem',
  },
  slider: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  error: { color: '#b00', fontFamily: 'monospace', fontSize: '0.8rem' },
  stats: { fontSize: '0.82rem', color: '#444', marginTop: '0.8rem' },
  warn: { color: '#a60' },
  stage: { display: 'flex', justifyContent: 'center', padding: '0.5rem 0', overflowX: 'auto' },
  readout: {
    fontSize: '0.85rem',
    minHeight: '1.5em',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  hint: { color: '#999' },
};
