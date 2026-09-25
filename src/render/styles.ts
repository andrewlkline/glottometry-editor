/**
 * Visual encoding, per Kalyan & François (2018: 80-81):
 *
 *   "we represented each subgroup's strength by having line thickness
 *    proportional to its subgroupiness. In addition, the degree of redness
 *    (brightness value of the contour line) was made proportional to its
 *    cohesiveness, with more cohesive subgroups appearing more intensely red."
 *
 * So sigma drives stroke width and kappa drives colour. Both are on the
 * contour, which is why the diagram can be read at a glance: thick means
 * well-attested, vivid means internally consistent.
 */

export interface ContourStyle {
  strokeWidth: number;
  stroke: string;
  /** SVG dash pattern; solid when absent. */
  dasharray?: string;
  /** 0–1; fully opaque when absent. */
  opacity?: number;
}

/**
 * Line style for what a group's exclusive support rests on.
 *
 * Solid for high-quality support, so a diagram where it holds looks like an
 * ordinary glottometric diagram. Dashes and dots are scaled to the stroke:
 * with round caps each dash grows by the stroke width and each gap shrinks by
 * it, so fixed patterns would close up on thick lines and vanish on thin ones.
 * Dotted is zero-length dashes, which round caps turn into dots.
 */
export function supportDash(
  support: 'high' | 'low' | 'unassessed',
  strokeWidth: number,
): string | undefined {
  const w = strokeWidth;
  if (support === 'low') {
    return `${fmt(Math.max(4, 1.6 * w))} ${fmt(w + Math.max(4, 1.4 * w))}`;
  }
  if (support === 'unassessed') return `0 ${fmt(w + Math.max(3, 1.1 * w))}`;
  return undefined;
}

/** Opacity of a group that does not survive on high-quality evidence alone. */
export const FADED_OPACITY = 0.22;

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export interface StyleScale {
  /** Largest sigma in the current dataset, for normalising widths. */
  maxSigma: number;
  minStrokeWidth?: number;
  maxStrokeWidth?: number;
}

export function contourStyle(
  sigma: number,
  kappa: number,
  scale: StyleScale,
): ContourStyle {
  const { maxSigma, minStrokeWidth = 1, maxStrokeWidth = 11 } = scale;

  // Linear in sigma, as in the paper ("1 shared innovation = 1 pixel" in their
  // worked example). Normalised so the strongest subgroup in any dataset sits
  // at maxStrokeWidth rather than depending on absolute counts.
  const t = maxSigma > 0 ? Math.min(1, sigma / maxSigma) : 0;
  const strokeWidth = minStrokeWidth + t * (maxStrokeWidth - minStrokeWidth);

  return { strokeWidth, stroke: cohesivenessColour(kappa) };
}

/**
 * Cohesiveness to colour. Hue is fixed red; kappa drives lightness, so a
 * highly cohesive subgroup is a deep vivid red and a barely-cohesive one
 * fades towards pink.
 *
 * The range stops short of both extremes: pure white would vanish on the page
 * and near-black would read as "just a line" rather than as red. Real kappa
 * values cluster between 0.1 and 0.9 (K&F report most of theirs between 10%
 * and 30%), so the usable band matters more than the endpoints.
 */
export function cohesivenessColour(kappa: number): string {
  const k = Math.max(0, Math.min(1, kappa));
  const lightness = 74 - k * 40; // 74% at k=0 down to 34% at k=1
  const saturation = 62 + k * 28; // washed out when weak, vivid when strong
  return `hsl(0 ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

/**
 * Node fill. Phase 1 uses a flat neutral.
 *
 * K&F colour their nodes by running 3-D MDS on the pairwise cohesiveness
 * distances and mapping the axes to RGB (2018: 84 fn. 13), which reads as a
 * smooth gradient along the chain. That needs an eigendecomposition and is
 * independent of the contour work, so it is deliberately deferred rather than
 * approximated badly.
 */
export const NODE_FILL = '#f7f7f5';
export const NODE_STROKE = '#333';
export const NODE_TEXT = '#111';

/**
 * Half-width of a node sized to hold its label.
 *
 * K&F's figures use three-letter codes (HIW, LTG, LHI), and a circle sized for
 * those cannot hold "Kairui-Midiki". Rather than silently abbreviating someone
 * else's language names, the node grows into a pill. Beyond `maxHalfWidth` the
 * label is truncated and the full name kept in a tooltip.
 *
 * Width is estimated from character count — measuring text needs a DOM, and
 * the exporter has to produce identical geometry headlessly. The factor is
 * tuned for system-ui at the label size; being a little generous is harmless,
 * since the only cost is a slightly wide node.
 */
export function labelHalfWidth(
  label: string, nodeRadius: number, fontSize = 11, maxHalfWidth = 64,
): number {
  const estimated = label.length * fontSize * 0.55;
  return Math.max(nodeRadius, Math.min(maxHalfWidth, estimated / 2 + 7));
}

/** The label as drawn, truncated when it cannot fit. */
export function fitLabel(
  label: string, halfWidth: number, fontSize = 11,
): string {
  const capacity = Math.floor((halfWidth * 2 - 10) / (fontSize * 0.55));
  return label.length <= capacity ? label : `${label.slice(0, Math.max(1, capacity - 1))}…`;
}
