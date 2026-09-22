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
}

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
