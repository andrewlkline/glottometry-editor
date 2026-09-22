/**
 * Contour geometry for the chain layout.
 *
 * A subgroup occupying a contiguous run of positions becomes a rounded
 * rectangle enclosing exactly its members. That is what K&F drew by hand, and
 * seriation makes it the common case: measured at 28 of 31 displayed
 * subgroups on the demo data.
 *
 * A subgroup whose members are split across the ordering gets one shape per
 * run plus a connector. Drawing a single shape spanning the gap would enclose
 * languages that are not members, which is exactly the error the Marama
 * engine's convex hulls make. Separate shapes say something true; the general
 * routed contour (BubbleSets) is deferred work, not a correctness gap here.
 *
 * Horizontal and vertical padding are deliberately independent. Horizontal
 * offset is where nesting room comes from and can grow freely. Vertical
 * padding cannot: the next node up the chain is only `spacing` away, so a
 * contour that padded vertically as much as it does horizontally would
 * enclose languages that are not its members. See `verticalPadding`.
 */

export interface CapsuleGeometry {
  /** One path per contiguous run. */
  paths: string[];
  /** Connectors between runs, for a split subgroup. Empty when contiguous. */
  connectors: string[];
  /** Half the width of the shape, i.e. how far it sits from the node column. */
  halfWidth: number;
}

export interface CapsuleOptions {
  /** Column x of the node centres. */
  cx: number;
  /** y of position 0. */
  top: number;
  /** Vertical distance between adjacent positions. */
  spacing: number;
  /** Distance from the node column to this contour's edge. */
  halfWidth: number;
  /** Distance above the first member and below the last. */
  verticalPadding: number;
  /**
   * Ceiling on the corner radius. Without it a wide contour becomes a stadium
   * whose caps balloon far past the end nodes; K&F's figure uses a consistent,
   * modest radius.
   */
  maxCornerRadius?: number;
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

/**
 * The largest vertical padding that still keeps non-member nodes outside.
 *
 * The nearest non-member sits `spacing` below the last member (or above the
 * first). Its circle must stay clear of the contour edge, so the padding has
 * to stop short of `spacing - nodeRadius`.
 */
export function maxVerticalPadding(spacing: number, nodeRadius: number, gap = 3): number {
  return Math.max(1, spacing - nodeRadius - gap);
}

/**
 * Vertical padding for a track, compressed to fit the room available.
 *
 * Contours still nest vertically — otherwise two shapes over the same span
 * would have collinear top edges — but the growth per track is scaled so the
 * outermost track lands exactly on the limit rather than sailing past it.
 */
export function verticalPadding(
  track: number,
  maxTrack: number,
  basePadding: number,
  spacing: number,
  nodeRadius: number,
): number {
  const base = nodeRadius + basePadding;
  const limit = maxVerticalPadding(spacing, nodeRadius);
  if (maxTrack <= 0 || limit <= base) return Math.min(base, limit);
  const perTrack = (limit - base) / maxTrack;
  return base + track * perTrack;
}

/** Rounded rectangle enclosing positions yTop..yBottom. */
function roundedRect(
  cx: number,
  yTop: number,
  yBottom: number,
  halfWidth: number,
  vPad: number,
  maxCornerRadius: number,
): string {
  const left = cx - halfWidth;
  const right = cx + halfWidth;
  const top = yTop - vPad;
  const bottom = yBottom + vPad;
  const r = Math.min(halfWidth, maxCornerRadius, (bottom - top) / 2);

  return [
    `M ${fmt(left)} ${fmt(top + r)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(left + r)} ${fmt(top)}`,
    `L ${fmt(right - r)} ${fmt(top)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(right)} ${fmt(top + r)}`,
    `L ${fmt(right)} ${fmt(bottom - r)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(right - r)} ${fmt(bottom)}`,
    `L ${fmt(left + r)} ${fmt(bottom)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(left)} ${fmt(bottom - r)}`,
    'Z',
  ].join(' ');
}

export function capsuleFor(
  runs: [number, number][],
  opts: CapsuleOptions,
): CapsuleGeometry {
  const {
    cx, top, spacing, halfWidth, verticalPadding: vPad,
    maxCornerRadius = halfWidth,
  } = opts;

  const yOf = (pos: number) => top + pos * spacing;

  const sorted = [...runs].sort((a, b) => a[0] - b[0]);
  const paths = sorted.map(([a, b]) =>
    roundedRect(cx, yOf(a), yOf(b), halfWidth, vPad, maxCornerRadius),
  );

  const connectors: string[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    // Run the connector down the outer edge, clear of the intervening
    // non-member nodes.
    const x = cx + halfWidth;
    const from = yOf(sorted[i]![1]) + vPad;
    const to = yOf(sorted[i + 1]![0]) - vPad;
    connectors.push(`M ${fmt(x)} ${fmt(from)} L ${fmt(x)} ${fmt(to)}`);
  }

  return { paths, connectors, halfWidth };
}
