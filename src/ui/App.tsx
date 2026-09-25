import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from './history.js';
import { Glottometry } from '../core/metrics.js';
import type { Subgroup } from '../core/types.js';
import {
  chainLayout, orderFor, planarLayout, projectGeographic, type Layout, type LayoutKind,
} from '../core/layout.js';
import { classicalMds, cohesivenessMatrix, distanceMatrix } from '../core/mds.js';
import { parseCoordinatesCsv, parseMaramaCsv } from '../data/maramaCsv.js';
import {
  checkCoordinatesCsv, checkInnovationsCsv, crossCheckCoordinates, type Issue,
} from '../data/csvCheck.js';
import { ImportReport, type ImportReportData } from './ImportReport.js';
import { FormatGuide } from './FormatGuide.js';
import { QualityLegend } from './QualityLegend.js';
import { HypothesisLegend, HypothesisPanel } from './HypothesisPanel.js';
import { analyseHypothesis } from '../core/hypothesis.js';
import { hypothesisScene } from '../render/hypothesisScene.js';
import {
  activeHypothesis, addGroup, addHypothesis, duplicateHypothesis, removeGroup, removeHypothesis,
  renameHypothesis, resolveGroups, setActiveHypothesis, updateGroup,
} from '../data/hypothesis.js';
import {
  createProject, downloadProject, parseProject, resolveOrder, type Project,
} from '../data/project.js';
import { buildScene } from '../render/scene.js';
import { Diagram } from '../render/Diagram.js';
import { downloadSvg } from '../render/exportSvg.js';
import { EvidencePanel } from './EvidencePanel.js';
import { SubgroupList } from './SubgroupList.js';
import { SettingsPanel } from './SettingsPanel.js';
import { ChronologyPanel, tint } from './ChronologyPanel.js';
import { MatrixEditor } from './MatrixEditor.js';
import { InnovationDetail } from './InnovationDetail.js';
import {
  addInnovation, addLanguage, cycleCell, removeInnovation, removeLanguage,
  renameInnovation, renameLanguage, setRow, updateMeta,
} from '../data/edit.js';
import { reconcile } from '../data/innovationMeta.js';
import { assessQuality, highQualitySubset } from '../core/quality.js';
import { applyQualityOverlay } from '../render/qualityOverlay.js';
import { linkageStages, stageAt } from '../core/chronology.js';
import {
  INNOVATION_TYPES, applyTypeSettings, describeTypeSettings, typeCounts as countTypes,
  type TypeOverrides,
} from '../core/innovationTypes.js';

const LAYOUT_LABELS: Record<LayoutKind, string> = {
  chain: 'chain',
  mds: 'MDS (cohesiveness)',
  geographic: 'geographic',
};

export function App() {
  const history = useHistory<Project | null>(null);
  const project = history.state;
  const [selected, setSelected] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReportData | null>(null);
  const [showFormat, setShowFormat] = useState(false);

  const loadDemo = useCallback(async () => {
    try {
      const [inn, crd] = await Promise.all([
        fetch('demo/innov.csv').then((r) => r.text()),
        fetch('demo/coords.csv').then((r) => (r.ok ? r.text() : '')),
      ]);
      history.reset(createProject(
        'demo', parseMaramaCsv(inn), crd ? parseCoordinatesCsv(crd) : undefined,
      ));
      setSelected(null);
      setError(null);
      setReport(null);
    } catch (e) {
      setError(String(e));
    }
  }, [history]);

  useEffect(() => { void loadDemo(); }, []);

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y), skipped while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave text entry alone, but a checkbox, radio or slider is not
      // somewhere anyone types, and having focus land on one should not
      // silently disable undo.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const type = (target as HTMLInputElement).type;
        const typing = tag === 'TEXTAREA'
          || (tag === 'INPUT'
            && !['checkbox', 'radio', 'range', 'button', 'submit', 'file'].includes(type));
        if (typing || target.isContentEditable) return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history]);

  /** Every mutation goes through here, which is what makes undo tractable. */
  const patch = useCallback(
    (changes: Partial<Project>, label: string, coalesceKey?: string) => {
      history.set((p) => (p ? { ...p, ...changes } : p), label, coalesceKey);
    },
    [history],
  );

  const setSettings = useCallback(
    (changes: Partial<Project['settings']>, label: string, coalesceKey?: string) => {
      history.set(
        (p) => (p ? { ...p, settings: { ...p.settings, ...changes } } : p),
        label, coalesceKey,
      );
    },
    [history],
  );

  const dataset = project?.dataset ?? null;
  const settings = project?.settings ?? null;

  const meta = useMemo(
    () => reconcile(project?.innovationMeta, dataset?.innovations.length ?? 0),
    [project?.innovationMeta, dataset?.innovations.length],
  );

  // Recomputed on every metadata edit, which is fine: it is a pass over the
  // rows, and nothing downstream of scoring depends on it.
  const qualities = useMemo(
    () => (dataset ? dataset.innovations.map((l, i) => assessQuality(l, meta[i])) : []),
    [dataset, meta],
  );

  // Types set explicitly in the editor override the label prefix when
  // filtering and weighting. Keyed on the types alone: metadata changes on
  // every keystroke in a note, and that must not re-score and re-seriate.
  const typeKey = meta.map((m) => m.type ?? '').join('|');
  const typeOverrides = useMemo<TypeOverrides>(
    () => meta.map((m) => m.type),
    [typeKey],
  );

  // Scored once per dataset + method settings; independent of threshold,
  // layout and manual edits, all of which only affect presentation.
  const scored = useMemo(() => {
    if (!dataset || !settings) return null;
    const enabled = new Set(settings.enabledTypes ?? INNOVATION_TYPES);
    // Filtering removes rows, so it can make a subgroup unattested rather than
    // merely weaker. That is the point of the control.
    const { dataset: filtered, weights, rows } = applyTypeSettings(
      dataset, enabled, settings.typeWeights, typeOverrides,
    );
    const g = new Glottometry(filtered, settings.policy, weights);
    return { g, dataset: filtered, rows, weights, subgroups: g.subgroups() };
  }, [dataset, settings?.policy, settings?.enabledTypes, settings?.typeWeights, typeOverrides]);

  const strengthOf = useCallback(
    (s: { sigma: number; epsilon: number; significance: number }) =>
      settings?.measure === 'epsilon' ? s.epsilon
        : settings?.measure === 'significance' ? s.significance
        : s.sigma,
    [settings?.measure],
  );

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

  const baseScene = useMemo(() => {
    if (!layout || !scored || !settings) return null;
    return buildScene(
      layout, scored.subgroups.filter((s) => strengthOf(s) >= settings.minStrength),
    );
  }, [layout, scored, settings?.minStrength, strengthOf]);

  const [showQuality, setShowQuality] = useState(false);
  const [showSurvival, setShowSurvival] = useState(false);

  /** Quality class of a row of the scored (type-filtered) dataset. */
  const classOfScored = useCallback(
    (r: number) => qualities[scored?.rows[r] ?? -1]?.quality ?? 'undetermined',
    [qualities, scored],
  );

  /**
   * The same analysis on high-quality innovations only, for the survival
   * overlay. Null when off; `count` 0 when nothing is assessed high yet, in
   * which case nothing is faded — "nothing survives" would be a statement
   * about the assessment, not the family.
   */
  const highOnly = useMemo(() => {
    if (!showSurvival || !scored || !settings) return null;
    const subset = highQualitySubset(
      scored.dataset, scored.weights, (r) => classOfScored(r) === 'high',
    );
    const count = subset.dataset.innovations.length;
    const byKey = new Map<string, Subgroup>();
    if (count > 0) {
      const g = new Glottometry(subset.dataset, settings.policy, subset.weights);
      for (const s of g.subgroups()) byKey.set(s.members.join(','), s);
    }
    return { count, byKey };
  }, [showSurvival, scored, settings?.policy, classOfScored]);

  const survives = useCallback(
    (key: string) => {
      const s = highOnly?.byKey.get(key);
      return !!s && strengthOf(s) >= (settings?.minStrength ?? Infinity);
    },
    [highOnly, strengthOf, settings?.minStrength],
  );

  /** The scene as drawn: geometry from `baseScene`, line style from quality. */
  const scene = useMemo(() => {
    if (!baseScene || !scored) return baseScene;
    return applyQualityOverlay(baseScene, scored.g, classOfScored, {
      lines: showQuality,
      survives: highOnly && highOnly.count > 0 ? survives : undefined,
    });
  }, [baseScene, scored, showQuality, highOnly, survives, classOfScored]);

  /**
   * Fragmentation stages over the full scored set, not the displayed subset.
   *
   * The threshold is the position *in* the sequence (K&F 2019: 171), so the
   * sequence itself has to be computed independently of it — otherwise moving
   * the slider would redefine the thing it is supposed to move through.
   */
  const stages = useMemo(() => {
    if (!scored || !dataset || !settings) return [];
    return linkageStages(scored.subgroups, dataset.languages.length, strengthOf);
  }, [scored, dataset, settings, strengthOf]);

  const stage = useMemo(
    () => (settings ? stageAt(stages, settings.minStrength) : null),
    [stages, settings?.minStrength],
  );

  const [showFragmentation, setShowFragmentation] = useState(false);
  const [mode, setMode] = useState<'diagram' | 'data'>('diagram');
  const [editingRow, setEditingRow] = useState<number | null>(null);

  const nodeFill = useMemo(() => {
    if (!showFragmentation || !stage) return undefined;
    return (language: number) => tint(stage.componentOf[language] ?? 0);
  }, [showFragmentation, stage]);

  const visible = useMemo(
    () => scene?.contours.filter((c) => !hidden.has(c.key)) ?? [],
    [scene, hidden],
  );

  /** The scene actually exported: hidden contours are genuinely absent. */
  const exportScene = useMemo(
    () => (scene ? { ...scene, contours: visible } : null),
    [scene, visible],
  );

  // --- Hypotheses -----------------------------------------------------------
  const [view, setView] = useState<'computed' | 'hypothesis'>('computed');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [highlightedGroup, setHighlightedGroup] = useState<string | null>(null);
  const hypothesis = project ? activeHypothesis(project) : null;

  const resolvedHypothesis = useMemo(
    () => (hypothesis && dataset ? resolveGroups(hypothesis, dataset.languages) : null),
    [hypothesis, dataset],
  );

  // Checked against the scored dataset, so the type filter decides what
  // evidence counts here exactly as it does for the computed diagram.
  const hypothesisAnalysis = useMemo(
    () => (resolvedHypothesis && scored
      ? analyseHypothesis(scored.dataset, resolvedHypothesis.specs, classOfScored, layout?.order)
      : null),
    [resolvedHypothesis, scored, classOfScored, layout?.order],
  );

  const hypothesisDrawing = useMemo(() => {
    if (!layout || !scored || !hypothesis || !resolvedHypothesis) return null;
    const names = new Map(hypothesis.groups.map((g) => [g.id, g.name || g.members.join(' + ')]));
    return hypothesisScene(layout, scored.g, resolvedHypothesis.specs, (id) => names.get(id) ?? id);
  }, [layout, scored, hypothesis, resolvedHypothesis]);

  const showingHypothesis = view === 'hypothesis';

  const hypothesisSubtitle = useMemo(() => {
    if (!hypothesis || !hypothesisAnalysis) return '';
    const n = (k: string) => hypothesis.groups.filter((g) => g.kind === k).length;
    const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    const unexplained = hypothesisAnalysis.residue.length;
    return [
      `hypothesis "${hypothesis.name}": authored, not computed`,
      plural(n('subgroup'), 'subgroup', 'subgroups'),
      plural(n('linkage'), 'linkage', 'linkages'),
      plural(n('contact'), 'contact zone', 'contact zones'),
      hypothesisAnalysis.extraGains === null
        ? 'subgroups do not form a tree'
        : `tree needs ${hypothesisAnalysis.extraGains} extra origins (${hypothesisAnalysis.extraGainsFlat} with no subgroups)`,
      `${unexplained} of ${hypothesisAnalysis.informative} informative innovations unexplained`,
      `${LAYOUT_LABELS[settings!.layoutKind]} layout`,
    ].join(' · ');
  }, [hypothesis, hypothesisAnalysis, settings]);

  const hypothesisEdit = useCallback(
    (fn: (p: Project, id: string) => Project, label: string, key?: string) =>
      history.set((p) => {
        const h = p && activeHypothesis(p);
        return p && h ? fn(p, h.id) : p;
      }, label, key),
    [history],
  );

  const selectedSubgroup = scene?.contours.find((c) => c.key === selected)?.subgroup ?? null;

  /**
   * Every CSV goes through the checker, and anything it has to say is shown.
   * A refused file changes nothing; a loaded one may still carry warnings.
   */
  const openFile = async (file: File, kind: 'innovations' | 'coordinates' | 'project') => {
    const text = await file.text();
    const show = (imported: boolean, issues: Issue[]) =>
      setReport(!imported || issues.length > 0
        ? { fileName: file.name, kind, imported, issues }
        : null);
    setError(null);

    if (kind === 'project') {
      try {
        history.reset(parseProject(text));
        setSelected(null);
        show(true, []);
      } catch (e) {
        show(false, [{ severity: 'error', message: e instanceof Error ? e.message : String(e) }]);
      }
      return;
    }

    if (kind === 'innovations') {
      const { value, issues } = checkInnovationsCsv(text);
      if (!value) return show(false, issues);
      // Coordinates already loaded carry over when they belong to these
      // languages. If none of their names match, they were for a different
      // dataset, and warning about every one of them would only be noise.
      let coordinates = project?.coordinates;
      const extra: Issue[] = [];
      if (coordinates) {
        const cross = crossCheckCoordinates(coordinates, value.languages);
        if (cross.matched === 0) coordinates = undefined;
        else {
          coordinates = cross.coordinates;
          extra.push(...cross.issues);
        }
      }
      history.reset(createProject(file.name.replace(/\.csv$/i, ''), value, coordinates));
      setSelected(null);
      return show(true, [...issues, ...extra]);
    }

    const { value, issues } = checkCoordinatesCsv(text);
    if (!value || !dataset) return show(false, issues);
    const cross = crossCheckCoordinates(value, dataset.languages);
    if (cross.matched === 0) {
      return show(false, [...issues, {
        severity: 'error',
        message: 'None of the names in this file match a language in the loaded innovations.',
        examples: Object.keys(value).slice(0, 6).map((l) => `'${l}'`),
        hint: `The languages are: ${dataset.languages.join(', ')}. Names must match exactly.`,
      }]);
    }
    patch({ coordinates: cross.coordinates }, 'load coordinates');
    show(true, [...issues, ...cross.issues]);
  };

  const onReorder = useCallback((language: number, toPosition: number) => {
    if (!layout || !dataset) return;
    const order = [...layout.order];
    const from = order.indexOf(language);
    if (from === -1 || from === toPosition) return;
    order.splice(from, 1);
    order.splice(toPosition, 0, language);
    patch(
      { manualOrder: order.map((i) => dataset.languages[i]!) },
      `reorder ${dataset.languages[language]}`,
      `reorder:${language}`,
    );
  }, [layout, dataset, patch]);

  const onMove = useCallback((language: number, x: number, y: number) => {
    if (!dataset) return;
    const label = dataset.languages[language]!;
    history.set(
      (p) => (p
        ? { ...p, manualPositions: { ...(p.manualPositions ?? {}), [label]: [x, y] } }
        : p),
      `move ${label}`,
      `move:${language}`,
    );
  }, [dataset, history]);

  /** Everything that shaped the diagram, recorded in the exported SVG. */
  const measureName = settings?.measure === 'significance'
    ? '−log₁₀p' : settings?.measure === 'epsilon' ? 'ε' : 'ς';

  const exportSubtitle = useMemo(() => {
    if (!settings || !scored || !dataset) return '';
    const parts = [
      `${visible.length} subgroups with ${measureName} ≥ ${settings.minStrength.toFixed(2)}`,
      `${LAYOUT_LABELS[settings.layoutKind]} layout`,
      `NA: ${settings.policy}`,
    ];
    if (scored.dataset.innovations.length < dataset.innovations.length) {
      parts.push(
        `${scored.dataset.innovations.length}/${dataset.innovations.length} innovations`,
      );
    }
    parts.push(...describeTypeSettings(
      countTypes(dataset, typeOverrides), settings.enabledTypes, settings.typeWeights,
    ));
    if (showFragmentation && stage) {
      parts.push(`${stage.components.length} connected components`);
    }
    // The overlay changes what the lines mean, so the figure has to say so.
    if (showQuality) {
      parts.push('line style: solid = high-quality exclusive support, dashed = low-quality only, '
        + 'dotted = not yet assessed');
    }
    if (highOnly && highOnly.count > 0) {
      parts.push(`faded: below ${measureName} ≥ ${settings.minStrength.toFixed(2)} on the `
        + `${highOnly.count} high-quality innovations alone`);
    }
    return parts.join(' · ');
  }, [settings, scored, dataset, typeOverrides, visible.length, showFragmentation, stage,
    showQuality, highOnly]);

  const edit = useCallback(
    (fn: (p: Project) => Project, label: string, key?: string) =>
      history.set((p) => (p ? fn(p) : p), label, key),
    [history],
  );

  const resetLayout = () =>
    patch({ manualOrder: undefined, manualPositions: undefined }, 'reset layout');
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
          <button onClick={() => setShowFormat((v) => !v)} aria-expanded={showFormat}>
            CSV format
          </button>
        </div>
      </header>

      <div style={S.controls}>
        <label>
          layout{' '}
          <select
            value={settings.layoutKind}
            onChange={(e) => setSettings({ layoutKind: e.target.value as LayoutKind }, 'change layout')}
          >
            {(Object.keys(LAYOUT_LABELS) as LayoutKind[]).map((k) => (
              <option key={k} value={k} disabled={k === 'geographic' && !haveCoords}>
                {LAYOUT_LABELS[k]}{k === 'geographic' && !haveCoords ? ' — no coordinates' : ''}
              </option>
            ))}
          </select>
        </label>
        <span style={S.undoGroup}>
          <button
            onClick={history.undo}
            disabled={!history.canUndo}
            title={history.canUndo ? `Undo ${history.undoLabel ?? ''}` : 'Nothing to undo'}
          >
            ↶ undo
          </button>
          <button
            onClick={history.redo}
            disabled={!history.canRedo}
            title={history.canRedo ? `Redo ${history.redoLabel ?? ''}` : 'Nothing to redo'}
          >
            ↷ redo
          </button>
          {history.canUndo && history.undoLabel && (
            <span style={S.undoLabel}>{history.undoLabel}</span>
          )}
        </span>
        <span style={S.modes}>
          {(['diagram', 'data'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{ ...S.mode, ...(mode === m ? S.modeActive : {}) }}
            >
              {m}
            </button>
          ))}
        </span>
        <span style={S.modes} title="Computed glottometry, or your authored hypothesis">
          {(['computed', 'hypothesis'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{ ...S.mode, ...(view === v ? S.modeActive : {}) }}
            >
              {v}
            </button>
          ))}
        </span>
        {!showingHypothesis && <>
        <label style={S.toggle} title="Show the diagram's connected components">
          <input
            type="checkbox"
            checked={showFragmentation}
            onChange={(e) => setShowFragmentation(e.target.checked)}
          />
          fragmentation
        </label>
        <label
          style={S.toggle}
          title="Line style by what each group's exclusive support rests on"
        >
          <input
            type="checkbox"
            checked={showQuality}
            onChange={(e) => setShowQuality(e.target.checked)}
          />
          quality lines
        </label>
        <label
          style={S.toggle}
          title="Fade groups that do not clear the threshold on high-quality innovations alone"
        >
          <input
            type="checkbox"
            checked={showSurvival}
            onChange={(e) => setShowSurvival(e.target.checked)}
          />
          high-quality survival
        </label>
        </>}
        {edited && <button onClick={resetLayout} title="Discard manual positions">reset layout</button>}
        <span style={S.spacer} />
        <button onClick={() => downloadProject(project)}>save project</button>
        <button
          disabled={showingHypothesis ? !hypothesisDrawing : !exportScene}
          onClick={() => {
            if (showingHypothesis) {
              if (hypothesisDrawing && hypothesis) {
                downloadSvg(hypothesisDrawing, `${project.name}-hypothesis-${hypothesis.name}`, {
                  title: `Hypothesis: ${hypothesis.name} — ${project.name}`,
                  subtitle: hypothesisSubtitle,
                  method: 'A hybrid hypothesis (subgroups, linkages, contact zones), '
                    + 'checked against a glottometric innovations matrix',
                });
              }
            } else if (exportScene) {
              downloadSvg(exportScene, `${project.name}-glottometry`, {
                title: `Glottometric diagram — ${project.name}`,
                subtitle: exportSubtitle,
                nodeFill,
              });
            }
          }}
        >
          export SVG
        </button>
      </div>

      {error && <p style={S.error}>{error}</p>}
      {report && (
        <ImportReport
          report={report}
          onClose={() => setReport(null)}
          onShowFormat={() => setShowFormat(true)}
        />
      )}
      {showFormat && (
        <FormatGuide
          languages={dataset.languages}
          coordinates={project.coordinates}
          onClose={() => setShowFormat(false)}
        />
      )}

      {scene && scored && (
        <>
          <p style={S.stats}>
            {scored.dataset.innovations.length}
            {scored.dataset.innovations.length < dataset.innovations.length &&
              <span style={S.warn}>/{dataset.innovations.length}</span>} innovations ×{' '}
            {dataset.languages.length} languages
            → {scored.subgroups.length} attested, <strong>{visible.length}</strong> drawn
            {hidden.size > 0 && <> · {hidden.size} hidden</>}
            {scene.routedCount > 0 && (
              <> · <span style={S.warn}>{scene.routedCount} routed around non-members</span></>
            )}
            {showFragmentation && stage && (
              <> · <strong>{stage.components.length}</strong>{' '}
                {stage.components.length === 1 ? 'language' : 'languages'}</>
            )}
            {' '}· <span style={S.hint}>
              drag a language to {settings.layoutKind === 'chain' ? 'reorder' : 'move'} it
            </span>
          </p>

          {showingHypothesis && hypothesis && mode === 'diagram' && (
            <HypothesisLegend name={hypothesis.name} />
          )}
          {!showingHypothesis && (showQuality || showSurvival) && mode === 'diagram' && (
            <QualityLegend
              lines={showQuality}
              survival={highOnly && {
                highCount: highOnly.count,
                fadedCount: visible.filter((c) => c.quality?.survives === false).length,
              }}
              measure={measureName}
              threshold={settings.minStrength}
              visibleCount={visible.length}
            />
          )}

          {mode === 'data' ? (
            <div style={S.dataWorkspace}>
              <MatrixEditor
                dataset={dataset}
                meta={meta}
                qualities={qualities}
                selected={editingRow}
                onSelect={setEditingRow}
                onCycleCell={(row, column) => edit(
                  (p) => cycleCell(p, row, column),
                  `edit ${dataset.innovations[row] ?? 'row'}`,
                  `cell:${row}`,
                )}
                onSetRow={(row, values) => edit(
                  (p) => setRow(p, row, values),
                  `fill ${dataset.innovations[row] ?? 'row'}`,
                )}
                onAddInnovation={() => {
                  edit((p) => addInnovation(p), 'add innovation');
                  setEditingRow(dataset.innovations.length);
                }}
                onRemoveInnovation={(row) => {
                  edit((p) => removeInnovation(p, row), 'delete innovation');
                  setEditingRow(null);
                }}
                onAddLanguage={() => edit((p) => addLanguage(p), 'add language')}
                onRenameLanguage={(column, label) => edit(
                  (p) => renameLanguage(p, column, label), 'rename language',
                )}
                onRemoveLanguage={(column) => edit(
                  (p) => removeLanguage(p, column), 'delete language',
                )}
              />
              {editingRow !== null && editingRow < dataset.innovations.length ? (
                <InnovationDetail
                  dataset={dataset}
                  meta={meta}
                  row={editingRow}
                  onRename={(label) => edit(
                    (p) => renameInnovation(p, editingRow, label),
                    'rename innovation', `label:${editingRow}`,
                  )}
                  onUpdate={(changes) => edit(
                    (p) => updateMeta(p, editingRow, changes),
                    'edit innovation', `meta:${editingRow}`,
                  )}
                  onClose={() => setEditingRow(null)}
                />
              ) : (
                <aside style={S.placeholder}>
                  Click an innovation to record the reasoning behind it — proto-form,
                  reflexes, sources, and what it must have preceded.
                </aside>
              )}
            </div>
          ) : (
          <div style={S.workspace}>
            <div style={S.leftColumn}>
              <SettingsPanel
                settings={settings}
                typeCounts={countTypes(dataset, typeOverrides)}
                kept={scored.dataset.innovations.length}
                total={dataset.innovations.length}
                onChange={setSettings}
              />
              <SubgroupList
                contours={scene.contours}
                selected={selected}
                hidden={hidden}
                onSelect={setSelected}
                onHover={setHighlighted}
                onToggleHidden={(key) => {
                const contour = scene.contours.find((c) => c.key === key);
                const name = contour?.subgroup.memberNames.join('+') ?? 'subgroup';
                patch(
                  {
                    hidden: hidden.has(key)
                      ? [...hidden].filter((k) => k !== key)
                      : [...hidden, key],
                  },
                  `${hidden.has(key) ? 'show' : 'hide'} ${name}`,
                );
              }}
                onShowAll={() => patch({ hidden: [] }, 'show all subgroups')}
              />
            </div>

            <div style={S.stage}>
              <Diagram
                scene={showingHypothesis && hypothesisDrawing ? hypothesisDrawing : scene}
                highlighted={showingHypothesis ? highlightedGroup : highlighted}
                selected={showingHypothesis ? selectedGroup : selected}
                hidden={showingHypothesis ? undefined : hidden}
                onHover={showingHypothesis ? setHighlightedGroup : setHighlighted}
                onSelect={showingHypothesis ? setSelectedGroup : setSelected}
                onReorder={onReorder}
                onMove={onMove}
                onDragEnd={history.seal}
                nodeFill={nodeFill}
              />
            </div>

            {showingHypothesis ? (
              <HypothesisPanel
                hypotheses={project.hypotheses ?? []}
                active={hypothesis}
                languages={dataset.languages}
                innovations={scored.dataset.innovations}
                analysis={hypothesisAnalysis}
                unknown={resolvedHypothesis?.unknown ?? []}
                computed={visible.map((c) => ({ key: c.key, names: c.subgroup.memberNames }))}
                selected={selectedGroup}
                onSelect={setSelectedGroup}
                onHover={setHighlightedGroup}
                onNew={(name) => edit((p) => addHypothesis(p, name), 'new hypothesis')}
                onDuplicate={() => hypothesisEdit(
                  (p, id) => duplicateHypothesis(p, id, `${activeHypothesis(p)!.name} (copy)`),
                  'copy hypothesis',
                )}
                onRename={(name) => hypothesisEdit(
                  (p, id) => renameHypothesis(p, id, name), 'rename hypothesis', 'rename-hypothesis',
                )}
                onDelete={() => hypothesisEdit((p, id) => removeHypothesis(p, id), 'delete hypothesis')}
                onSetActive={(id) => edit((p) => setActiveHypothesis(p, id), 'switch hypothesis')}
                onAddGroup={(group) => hypothesisEdit(
                  (p, id) => addGroup(p, id, group).project, `add ${group.kind}`,
                )}
                onUpdateGroup={(groupId, changes) => hypothesisEdit(
                  (p, id) => updateGroup(p, id, groupId, changes), 'edit group',
                )}
                onRemoveGroup={(groupId) => {
                  if (selectedGroup === groupId) setSelectedGroup(null);
                  hypothesisEdit((p, id) => removeGroup(p, id, groupId), 'delete group');
                }}
              />
            ) : showFragmentation && !selectedSubgroup ? (
              <ChronologyPanel
                stages={stages}
                current={stage}
                languages={dataset.languages}
                measure={settings.measure}
                onGoTo={(threshold) =>
                  setSettings({ minStrength: threshold }, 'go to fragmentation stage')}
              />
            ) : selectedSubgroup && scored ? (
              <EvidencePanel
                glottometry={scored.g}
                dataset={scored.dataset}
                qualityOf={(r) => qualities[scored.rows[r]!]}
                support={showQuality
                  ? scene.contours.find((c) => c.key === selected)?.quality?.support
                  : undefined}
                highOnly={highOnly && highOnly.count > 0 && selected
                  ? { subgroup: highOnly.byKey.get(selected) ?? null, survives: survives(selected) }
                  : undefined}
                subgroup={selectedSubgroup}
                onClose={() => setSelected(null)}
              />
            ) : (
              <aside style={S.placeholder}>
                Click a contour, or a subgroup in the list, to see the innovations behind it.
              </aside>
            )}
          </div>
          )}
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
  toggle: { display: 'flex', gap: '0.3rem', alignItems: 'center' },
  undoGroup: { display: 'flex', gap: '0.3rem', alignItems: 'center' },
  undoLabel: {
    color: '#999', fontSize: '0.72rem', maxWidth: 150,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  error: { color: '#b00', fontFamily: 'monospace', fontSize: '0.78rem' },
  stats: { fontSize: '0.78rem', color: '#444', margin: '0.7rem 0 0.4rem' },
  warn: { color: '#a60' },
  hint: { color: '#999' },
  workspace: {
    display: 'grid',
    gridTemplateColumns: 'minmax(210px, 260px) 1fr minmax(240px, 320px)',
    gap: '1rem',
    alignItems: 'start',
  },
  leftColumn: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  dataWorkspace: {
    display: 'grid', gridTemplateColumns: '1fr minmax(260px, 340px)',
    gap: '1rem', alignItems: 'start',
  },
  modes: { display: 'flex', border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden' },
  mode: {
    border: 'none', background: '#fafafa', cursor: 'pointer',
    padding: '0.2rem 0.6rem', fontSize: '0.78rem',
  },
  modeActive: { background: '#333', color: '#fff' },
  stage: { display: 'flex', justifyContent: 'center', overflowX: 'auto' },
  placeholder: {
    border: '1px dashed #ddd', borderRadius: 6, padding: '0.75rem',
    fontSize: '0.78rem', color: '#999',
  },
};
