/**
 * Two hypotheses as one figure, side by side — Kaufman's (4) and (5) as a
 * reader would want to see them printed.
 *
 * Each panel is the ordinary standalone export nested as its own <svg>, so it
 * keeps its viewBox, its tree and its per-group attributes, and the figure
 * cannot drift from what either hypothesis exports alone.
 */

import type { Scene } from './scene.js';
import { exportSvg, type ExportOptions } from './exportSvg.js';
import { versionStamp } from '../version.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ComparisonPanel {
  scene: Scene;
  /** e.g. "A: hypothesis 1". */
  heading: string;
  /** One line under the heading: the key counts. */
  summary: string;
  options?: ExportOptions;
}

export function exportComparison(panels: ComparisonPanel[], title: string, caption: string): string {
  const gap = 32;
  const headingHeight = 44;
  const captionHeight = 30;
  const widths = panels.map((p) => p.scene.width);
  const heights = panels.map((p) => p.scene.height + 26); // exportSvg's own caption row
  const width = widths.reduce((a, w) => a + w, 0) + gap * (panels.length - 1);
  const height = headingHeight + Math.max(...heights) + captionHeight;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`,
  );
  lines.push(`  <title>${esc(title)}</title>`);
  lines.push(`  <desc>${esc(caption)}. Drawn by ${esc(versionStamp())}.</desc>`);
  lines.push(`  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);

  let x = 0;
  panels.forEach((panel, i) => {
    lines.push(`  <g data-panel="${i}">`);
    lines.push(`    <text x="${x + 8}" y="18" font-size="13" font-weight="600" fill="#1f2d3d">${esc(panel.heading)}</text>`);
    lines.push(`    <text x="${x + 8}" y="34" font-size="10" fill="#666">${esc(panel.summary)}</text>`);
    // The panel's own document, minus its XML declaration, placed as a nested
    // viewport. Its subtitle carries what the panel's lines mean.
    const inner = exportSvg(panel.scene, panel.options ?? {})
      .replace(/^<\?xml[^>]*>\s*/, '')
      .replace(/^<svg /, `<svg x="${x}" y="${headingHeight}" `);
    lines.push(inner.trimEnd().split('\n').map((l) => `    ${l}`).join('\n'));
    lines.push('  </g>');
    x += widths[i]! + gap;
  });

  lines.push(
    `  <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#666">` +
      `${esc(caption)} · ${esc(versionStamp())}</text>`,
  );
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}
