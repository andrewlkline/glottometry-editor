import { useCallback, useEffect, useMemo, useState } from 'react';
import { Glottometry } from '../core/metrics.js';
import {
  chainLayout, orderFor, planarLayout, projectGeographic, type Layout, type LayoutKind,
} from '../core/layout.js';
import { classicalMds, cohesivenessMatrix, distanceMatrix } from '../core/mds.js';
import { parseCoordinatesCsv, parseMaramaCsv } from '../data/maramaCsv.js';
import {
  createProject, downloadProject, parseProject, resolveOrder, type Project,
} from '../data/project.js';
import { buildScene } from '../render/scene.js';
import { Diagram } from '../render/Diagram.js';
import { downloadSvg } from '../render/exportSvg.js';
import { EvidencePanel } from './EvidencePanel.js';
import { SubgroupList } from './SubgroupList.js';
import type { NaPolicy } from '../core/types.js';

const POLICIES: NaPolicy[] = ['half', 'zero', 'one', 'rowMean', 'colMean'];
const LAYOUT_LABELS: Record<LayoutKind, string> = {
  chain: 'chain',
  mds: 'MDS (cohesiveness)',
  geographic: 'geographic',
};

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDemo = useCallback(async () => {
    try {
      const [inn, crd] = await Promise.all([
        fetch('demo/innov.csv').then((r) => r.text()),
        fetch('demo/coords.csv').then((r) => (r.ok ? r.text() : '')),
      ]);
      setProject(createProject(
        'demo', parseMaramaCsv(inn), crd ? parseCoordinatesCsv(crd) : undefined,
      ));
      setSelected(null);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { void loadDemo(); }, [loadDemo]);

  const patch = useCallback((changes: Partial<Project>) => {
    setProject((p) => (p ? { ...p, ...changes } : p));
  }, []);

  const setSettings = useCallback((changes: Partial<Project['settings']>) => {
    setProject((p) => (p ? { ...p, settings: { ...p.settings, ...changes } } : p));
  }, []);

  const dataset = project?.dataset ?? null;
  const settings = project?.settings ?? null;

  // Scored once per dataset+policy; independent of threshold, layout and edits.
  const scored = useMemo(() => {
    if (!dataset || !settings) return null;
    const g = new Glottometry(dataset, settings.policy);
    return { g, subgroups: g.subgroups() };
  }, [dataset, settings?.policy]);

  const haveCoords = useMemo(
    () => !!dataset && !!project?.coordinates &&
      dataset.languages.every((l) => project.coordinates![l]),
    [dataset, project?.coordinates],
  );

  const layout = useMemo((): Layout | null => {
    if (!dataset || !scored || !settings || !project) return null;
    const { languages } = dataset;

    if (settings.layoutKind === 'chain') {
      // Seriate over ALL subgroups so the layout does not move when the
      // threshold does — see BUILD_PLAN.md, layout stability. A saved manual
      // order wins outright: the user's arrangement is not a suggestion.
      const order = resolveOrder(project.manualOrder, languages)
        ?? orderFor(scored.subgroups, languages.length).order;
      return chainLayout(order, languages);
    }

    const base = settings.layoutKind === 'geographic' && haveCoords
      ? projectGeographic(languages.map((l) => project.coordinates![l]!))
      : classicalMds(distanceMatrix(cohesivenessMatrix(scored.g)), 2)
          .map((c) => [c[0]!, c[1]!] as [number, number]);

    const computed = planarLayout(base, languages, settings.layoutKind);
    const manual = project.manualPositions;
    if (!manual) return computed;

    // Manual positions override computed ones node by node, so dragging two
    // nodes does not discard the layout for the other sixteen.
    return {
      ...computed,
      nodes: computed.nodes.map((n) => {
        const saved = manual[n.label];
        return saved ? { ...n, x: saved[0], y: saved[1] } : n;
      }),
    };
  }, [dataset, scored, settings, project, haveCoords]);

  const hidden = useMemo(() => new Set(project?.hidden ?? []), [project?.hidden]);

  const scene = useMemo(() => {
    if (!layout || !scored || !settings) return null;
    return buildScene(layout, scored.subgroups.filter((s) => s.sigma >= settings.minSigma));
  }, [layout, scored, settings?.minSigma]);

  const visible = useMemo(
    () => scene?.contours.filter((c) => !hidden.has(c.key)) ?? [],
    [scene, hidden],
  );

  /** The scene actually exported: hidden contours are genuinely absent. */
  const exportScene = useMemo(
    () => (scene ? { ...scene, contours: visible } : null),
    [scene, visible],
  );

  const selectedSubgroup = scene?.contours.find((c) => c.key === selected)?.subgroup ?? null;

  const openFile = async (file: File, kind: 'innovations' | 'coordinates' | 'project') => {
    try {
      const text = await file.text();
      if (kind === 'project') {
        setProject(parseProject(text));
      } else if (kind === 'innovations') {
        setProject(createProject(
          file.name.replace(/\.csv$/i, ''), parseMaramaCsv(text), project?.coordinates,
        ));
      } else {
        patch({ coordinates: parseCoordinatesCsv(text) });
      }
      setSelected(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onReorder = useCallback((language: number, toPosition: number) => {
    if (!layout || !dataset) return;
    const order = [...layout.order];
    const from = order.indexOf(language);
    if (from === -1 || from === toPosition) return;
    order.splice(from, 1);
    order.splice(toPosition, 0, language);
    patch({ manualOrder: order.map((i) => dataset.languages[i]!) });
  }, [layout, dataset, patch]);

  const onMove = useCallback((language: number, x: number, y: number) => {
    if (!dataset) return;
    const label = dataset.languages[language]!;
    setProject((p) => (p
      ? { ...p, manualPositions: { ...(p.manualPositions ?? {}), [label]: [x, y] } }
      : p));
  }, [dataset]);

  const resetLayout = () => patch({ manualOrder: undefined, manualPositions: undefined });
  const edited = !!(project?.manualOrder || project?.manualPositions);

  if (!project || !dataset || !settings) {
    return <main style={S.main}><p style={S.error}>{error ?? 'Loading…'}</p></main>;
  }

  return (
    <main style={S.main}>
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Historical Glottometry</h1>
          <p style={S.sub}>
            Thickness ∝ subgroupiness (ς) · colour intensity ∝ cohesiveness (κ)
          </p>
        </div>
        <div style={S.fileButtons}>
          <FileButton label="open project" accept=".json" onPick={(f) => openFile(f, 'project')} />
          <FileButton label="innovations CSV" accept=".csv" onPick={(f) => openFile(f, 'innovations')} />
          <FileButton label="coordinates CSV" accept=".csv" onPick={(f) => openFile(f, 'coordinates')} />
          <button onClick={() => void loadDemo()}>demo</button>
        </div>
      </header>

      <div style={S.controls}>
        <label>
          layout{' '}
          <select
            value={settings.layoutKind}
            onChange={(e) => setSettings({ layoutKind: e.target.value as LayoutKind })}
          >
            {(Object.keys(LAYOUT_LABELS) as LayoutKind[]).map((k) => (
              <option key={k} value={k} disabled={k === 'geographic' && !haveCoords}>
                {LAYOUT_LABELS[k]}{k === 'geographic' && !haveCoords ? ' — no coordinates' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          NA{' '}
          <select
            value={settings.policy}
            onChange={(e) => setSettings({ policy: e.target.value as NaPolicy })}
          >
            {POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={S.slider}>
          ς ≥ {settings.minSigma.toFixed(2)}
          <input
            type="range" min={0} max={6} step={0.05} value={settings.minSigma}
            onChange={(e) => setSettings({ minSigma: Number(e.target.value) })}
          />
        </label>
        {edited && <button onClick={resetLayout} title="Discard manual positions">reset layout</button>}
        <span style={S.spacer} />
        <button onClick={() => downloadProject(project)}>save project</button>
        <button
          disabled={!exportScene}
          onClick={() => exportScene && downloadSvg(exportScene, `${project.name}-glottometry`, {
            title: `Glottometric diagram — ${project.name}`,
            subtitle: `${visible.length} subgroups with ς ≥ ${settings.minSigma.toFixed(2)} · ${LAYOUT_LABELS[settings.layoutKind]} layout · NA: ${settings.policy}`,
          })}
        >
          export SVG
        </button>
      </div>

      {error && <p style={S.error}>{error}</p>}

      {scene && scored && (
        <>
          <p style={S.stats}>
            {dataset.innovations.length} innovations × {dataset.languages.length} languages
            → {scored.subgroups.length} attested, <strong>{visible.length}</strong> drawn
            {hidden.size > 0 && <> · {hidden.size} hidden</>}
            {scene.routedCount > 0 && (
              <> · <span style={S.warn}>{scene.routedCount} routed around non-members</span></>
            )}
            {' '}· <span style={S.hint}>
              drag a language to {settings.layoutKind === 'chain' ? 'reorder' : 'move'} it
            </span>
          </p>

          <div style={S.workspace}>
            <SubgroupList
              contours={scene.contours}
              selected={selected}
              hidden={hidden}
              onSelect={setSelected}
              onHover={setHighlighted}
              onToggleHidden={(key) => patch({
                hidden: hidden.has(key)
                  ? [...hidden].filter((k) => k !== key)
                  : [...hidden, key],
              })}
              onShowAll={() => patch({ hidden: [] })}
            />

            <div style={S.stage}>
              <Diagram
                scene={scene}
                highlighted={highlighted}
                selected={selected}
                hidden={hidden}
                onHover={setHighlighted}
                onSelect={setSelected}
                onReorder={onReorder}
                onMove={onMove}
              />
            </div>

            {selectedSubgroup && scored ? (
              <EvidencePanel
                glottometry={scored.g}
                dataset={dataset}
                subgroup={selectedSubgroup}
                onClose={() => setSelected(null)}
              />
            ) : (
              <aside style={S.placeholder}>
                Click a contour, or a subgroup in the list, to see the innovations behind it.
              </aside>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function FileButton({ label, accept, onPick }: {
  label: string; accept: string; onPick: (file: File) => void;
}) {
  return (
    <label style={S.fileButton}>
      {label}
      <input
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';   // allow re-picking the same file
        }}
      />
    </label>
  );
}

const S: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 1400,
    margin: '0 auto',
    padding: '1.2rem 1rem 3rem',
    lineHeight: 1.5,
  },
  header: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem',
  },
  h1: { fontSize: '1.25rem', margin: 0 },
  sub: { color: '#666', fontSize: '0.78rem', margin: '0.15rem 0 0' },
  fileButtons: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.78rem' },
  fileButton: {
    border: '1px solid #ccc', borderRadius: 4, padding: '0.2rem 0.5rem',
    cursor: 'pointer', background: '#fafafa',
  },
  controls: {
    display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center',
    padding: '0.6rem 0', margin: '0.7rem 0 0',
    borderTop: '1px solid #ddd', borderBottom: '1px solid #ddd', fontSize: '0.8rem',
  },
  slider: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  spacer: { flex: 1 },
  error: { color: '#b00', fontFamily: 'monospace', fontSize: '0.78rem' },
  stats: { fontSize: '0.78rem', color: '#444', margin: '0.7rem 0 0.4rem' },
  warn: { color: '#a60' },
  hint: { color: '#999' },
  workspace: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 230px) 1fr minmax(240px, 320px)',
    gap: '1rem',
    alignItems: 'start',
  },
  stage: { display: 'flex', justifyContent: 'center', overflowX: 'auto' },
  placeholder: {
    border: '1px dashed #ddd', borderRadius: 6, padding: '0.75rem',
    fontSize: '0.78rem', color: '#999',
  },
};
