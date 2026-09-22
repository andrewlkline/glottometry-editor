/**
 * Assigning contours to nesting "tracks" so they don't collapse into a smear.
 *
 * In a chain layout each subgroup occupies an interval of positions. Two
 * contours need visually distinct widths whenever their intervals overlap at
 * all — whether one nests inside the other, or they merely cross. Crossing is
 * not a defect to be avoided here: intersecting isoglosses are the entire
 * point of glottometry, and K&F's Figure 5-11 is full of them. They just have
 * to be separable by eye.
 *
 * That makes this interval-graph colouring, which greedy assignment by left
 * endpoint solves optimally. Sorting by span first means small subgroups take
 * the inner tracks and larger ones are pushed outward, which is also how the
 * published figure reads.
 */

export interface TrackInput {
  /** Inclusive position ranges the subgroup occupies. */
  runs: [number, number][];
}

/**
 * Returns a track index per input, lowest = innermost.
 *
 * A subgroup with several runs is treated as spanning from its first position
 * to its last: the drawn contour reaches across the gap, so it must clear
 * everything in between.
 */
export function assignTracks(items: TrackInput[]): number[] {
  const spans = items.map((it, index) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [a, b] of it.runs) {
      if (a < lo) lo = a;
      if (b > hi) hi = b;
    }
    return { index, lo, hi, size: hi - lo };
  });

  // Small spans first so they land on inner tracks; ties by position for
  // determinism.
  spans.sort((a, b) => a.size - b.size || a.lo - b.lo || a.index - b.index);

  const tracks = new Array<number>(items.length).fill(0);
  const placed: { lo: number; hi: number; track: number }[] = [];

  for (const span of spans) {
    const taken = new Set<number>();
    for (const p of placed) {
      // Closed intervals overlap when neither lies wholly before the other.
      if (p.lo <= span.hi && span.lo <= p.hi) taken.add(p.track);
    }
    let track = 0;
    while (taken.has(track)) track++;
    tracks[span.index] = track;
    placed.push({ lo: span.lo, hi: span.hi, track });
  }

  return tracks;
}

/**
 * Track assignment for 2-D layouts, where there are no intervals to colour.
 *
 * Two subgroups need visually distinct contours when their member sets
 * intersect — nested or merely overlapping. That is graph colouring on the
 * intersection graph, which is not an interval graph, so greedy is no longer
 * optimal; it is still fast and good enough, and smaller sets go inside.
 */
export function assignTracksByOverlap(memberSets: number[][]): number[] {
  const sets = memberSets.map((members, index) => ({
    index,
    members: new Set(members),
    size: members.length,
  }));
  sets.sort((a, b) => a.size - b.size || a.index - b.index);

  const tracks = new Array<number>(memberSets.length).fill(0);
  const placed: { members: Set<number>; track: number }[] = [];

  for (const set of sets) {
    const taken = new Set<number>();
    for (const other of placed) {
      for (const m of set.members) {
        if (other.members.has(m)) {
          taken.add(other.track);
          break;
        }
      }
    }
    let track = 0;
    while (taken.has(track)) track++;
    tracks[set.index] = track;
    placed.push({ members: set.members, track });
  }

  return tracks;
}
