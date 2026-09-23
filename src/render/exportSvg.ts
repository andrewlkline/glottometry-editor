/**
 * Standalone SVG export.
 *
 * The point of the whole project is that this file is publication-ready and
 * you do not have to finish it in Illustrator. So: real `<title>` elements,
 * one `<g>` per subgroup with a readable `data-subgroup`, and no React or
 * app-specific attributes. Opening it in a vector editor should give you named,
 * selectable groups rather than an undifferentiated pile of paths.
 */

import type { Scene } from './scene.js';
import { NODE_FILL, NODE_STROKE, NODE_TEXT } from './styles.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface ExportOptions {
  title?: string;
  /** Adds a small caption recording the display threshold. */
  subtitle?: string;
  /** Per-language node fill, matching what the screen shows. */
  nodeFill?: (language: number) => string | undefined;
}

export function exportSvg(scene: Scene, opts: ExportOptions = {}): string {
  const { layout, contours, width, height } = scene;
  const { title = 'Glottometric diagram', subtitle, nodeFill } = opts;

  const captionHeight = subtitle ? 26 : 0;
  const totalHeight = height + captionHeight;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" ` +
      `viewBox="0 0 ${width} ${totalHeight}">`,
  );
  lines.push(`  <title>${esc(title)}</title>`);
  lines.push(`  <rect width="${width}" height="${totalHeight}" fill="#ffffff"/>`);

  lines.push('  <g id="isoglosses" fill="none" stroke-linejoin="round" stroke-linecap="round">');
  for (const c of contours) {
    const { sigma, kappa, epsilon, memberNames } = c.subgroup;
    const label = memberNames.join(' + ');
    lines.push(
      `    <g data-subgroup="${esc(label)}" ` +
        `data-sigma="${sigma.toFixed(3)}" data-kappa="${kappa.toFixed(3)}" ` +
        `data-epsilon="${epsilon.toFixed(3)}" ` +
        `stroke="${c.style.stroke}" stroke-width="${c.style.strokeWidth.toFixed(2)}">`,
    );
    lines.push(
      `      <title>${esc(label)} — ς ${sigma.toFixed(2)}, κ ${kappa.toFixed(2)}, ε ${epsilon.toFixed(2)}</title>`,
    );
    for (const d of c.paths) {
      lines.push(`      <path d="${d}"/>`);
    }
    lines.push('    </g>');
  }
  lines.push('  </g>');

  lines.push('  <g id="languages" font-family="system-ui, sans-serif" font-size="11">');
  for (const n of layout.nodes) {
    lines.push(`    <g data-language="${esc(n.label)}">`);
    lines.push(
      `      <circle cx="${n.x}" cy="${n.y}" r="${layout.nodeRadius}" ` +
        `fill="${nodeFill?.(n.language) ?? NODE_FILL}" ` +
        `stroke="${NODE_STROKE}" stroke-width="1.2"/>`,
    );
    lines.push(
      `      <text x="${n.x}" y="${n.y}" text-anchor="middle" ` +
        `dominant-baseline="central" fill="${NODE_TEXT}">${esc(n.label)}</text>`,
    );
    lines.push('    </g>');
  }
  lines.push('  </g>');

  if (subtitle) {
    lines.push(
      `  <text x="${width / 2}" y="${totalHeight - 9}" text-anchor="middle" ` +
        `font-family="system-ui, sans-serif" font-size="10" fill="#666">${esc(subtitle)}</text>`,
    );
  }

  lines.push('</svg>');
  return lines.join('\n') + '\n';
}

/** Trigger a download of the exported SVG. Browser-only. */
export function downloadSvg(scene: Scene, filename: string, opts?: ExportOptions): void {
  const blob = new Blob([exportSvg(scene, opts)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
