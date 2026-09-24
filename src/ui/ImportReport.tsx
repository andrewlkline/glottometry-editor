/**
 * What happened when a file was opened, and what to do about it.
 *
 * Shown whenever an import is refused, and whenever one succeeds with
 * anything worth knowing. A refused import leaves the current project
 * untouched, and the report says so — otherwise "nothing changed" is
 * indistinguishable from "it loaded and the diagram happens to look the same".
 */

import type { Issue, Severity } from '../data/csvCheck.js';

export interface ImportReportData {
  fileName: string;
  kind: 'innovations' | 'coordinates' | 'project';
  imported: boolean;
  issues: Issue[];
}

const ORDER: Severity[] = ['error', 'warning', 'info'];

const ICON: Record<Severity, string> = { error: '✕', warning: '!', info: 'i' };

export function ImportReport({ report, onClose, onShowFormat }: {
  report: ImportReportData;
  onClose: () => void;
  onShowFormat: () => void;
}) {
  const { fileName, kind, imported, issues } = report;
  const count = (s: Severity) => issues.filter((i) => i.severity === s).length;
  const errors = count('error');
  const warnings = count('warning');

  const headline = imported
    ? `Loaded ${fileName}` +
      (warnings ? ` with ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : '')
    : `Could not load ${fileName} — ${errors} ${errors === 1 ? 'problem' : 'problems'} to fix`;

  const sorted = [...issues].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));

  return (
    <section
      style={{ ...S.box, ...(imported ? (warnings ? S.boxWarn : S.boxOk) : S.boxError) }}
      role={imported ? 'status' : 'alert'}
      aria-label="import report"
    >
      <div style={S.head}>
        <strong>{headline}</strong>
        <span style={S.spacer} />
        {kind !== 'project' && (
          <button style={S.link} onClick={onShowFormat}>expected format &amp; templates</button>
        )}
        <button style={S.close} onClick={onClose} aria-label="dismiss">×</button>
      </div>
      {!imported && (
        <p style={S.unchanged}>Nothing was changed. Fix these in the file and open it again.</p>
      )}
      <ul style={S.list}>
        {sorted.map((issue, i) => (
          <li key={i} style={S.item}>
            <span style={{ ...S.icon, ...ICON_STYLE[issue.severity] }} aria-label={issue.severity}>
              {ICON[issue.severity]}
            </span>
            <div style={S.body}>
              <div>{issue.message}</div>
              {issue.examples && issue.examples.length > 0 && (
                <div style={S.examples}>
                  {issue.examples.join(' · ')}
                  {issue.count && issue.count > issue.examples.length
                    ? ` · …and ${issue.count - issue.examples.length} more`
                    : ''}
                </div>
              )}
              {issue.hint && <div style={S.hint}>{issue.hint}</div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ICON_STYLE: Record<Severity, React.CSSProperties> = {
  error: { background: '#b00', color: '#fff' },
  warning: { background: '#e0a030', color: '#fff' },
  info: { background: '#ccd', color: '#445' },
};

const S: Record<string, React.CSSProperties> = {
  box: {
    border: '1px solid', borderRadius: 6, padding: '0.55rem 0.7rem',
    margin: '0.7rem 0 0', fontSize: '0.78rem',
  },
  boxError: { borderColor: '#e8b4b4', background: '#fff6f6' },
  boxWarn: { borderColor: '#f2e2c4', background: '#fffaf0' },
  boxOk: { borderColor: '#dde', background: '#f8f8fc' },
  head: { display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' },
  spacer: { flex: 1 },
  link: {
    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
    color: '#246', textDecoration: 'underline', fontSize: '0.74rem',
  },
  close: {
    border: 'none', background: 'none', cursor: 'pointer',
    fontSize: '1rem', lineHeight: 1, color: '#888', padding: '0 0.2rem',
  },
  unchanged: { margin: '0.25rem 0 0', color: '#733' },
  list: { listStyle: 'none', padding: 0, margin: '0.45rem 0 0', display: 'grid', gap: '0.45rem' },
  item: { display: 'flex', gap: '0.5rem', alignItems: 'flex-start' },
  icon: {
    flex: '0 0 auto', width: 15, height: 15, borderRadius: '50%', fontSize: '0.62rem',
    fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  body: { minWidth: 0 },
  examples: {
    fontFamily: 'ui-monospace, monospace', fontSize: '0.7rem', color: '#555',
    marginTop: '0.1rem', overflowWrap: 'anywhere',
  },
  hint: { color: '#777', fontSize: '0.72rem', marginTop: '0.15rem', lineHeight: 1.45 },
};
