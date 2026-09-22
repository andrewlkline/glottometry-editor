/**
 * Layout seriation: find a 1-D ordering of languages in which the displayed
 * subgroups are, as far as possible, contiguous runs.
 *
 * This is what makes K&F's published diagram drawable. When a subgroup occupies
 * a contiguous stretch of the ordering, its contour is a simple capsule; when it
 * doesn't, the contour has to route around excluded nodes. On K&F's own demo
 * data a plain annealing search makes 30 of 31 displayed subgroups contiguous,
 * so the expensive general-case renderer is needed only for the residue.
 *
 * NP-hard in general, trivial at the sizes this method is used at (n <= ~30).
 */

export interface SeriationOptions {
  restarts?: number;
  iterations?: number;
  /** Deterministic when supplied — tests depend on this. */
  seed?: number;
}

export interface SeriationResult {
  /** order[position] = language index. */
  order: number[];
  /** Weighted sum of breaks. 0 means every subgroup is contiguous. */
  cost: number;
  /** Per-subgroup gap counts under `order`, in the input's order. */
  breaks: number[];
}

/** Small deterministic PRNG (mulberry32) so runs are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gaps in a subgroup when its members are read along `order`.
 * 0 means contiguous. Allocation-free; this is the inner loop.
 */
export function countBreaks(order: number[], mask: boolean[]): number {
  let gaps = 0;
  let seenMember = false;
  let inGap = false;
  for (let pos = 0; pos < order.length; pos++) {
    if (mask[order[pos]!]) {
      if (inGap) {
        gaps++;
        inGap = false;
      }
      seenMember = true;
    } else if (seenMember) {
      inGap = true;
    }
  }
  return gaps;
}

export function seriate(
  masks: boolean[][],
  weights: number[],
  nLanguages: number,
  opts: SeriationOptions = {},
): SeriationResult {
  const { restarts = 20, iterations = 6000, seed = 0 } = opts;
  const nSubs = masks.length;

  if (nSubs === 0 || nLanguages === 0) {
    return {
      order: Array.from({ length: nLanguages }, (_, i) => i),
      cost: 0,
      breaks: new Array(nSubs).fill(0),
    };
  }

  // For each language, which subgroups contain it. Used to find the subgroups
  // whose break count a swap can actually change.
  const subsOfLang: number[][] = Array.from({ length: nLanguages }, () => []);
  for (let g = 0; g < nSubs; g++) {
    for (let c = 0; c < nLanguages; c++) {
      if (masks[g]![c]) subsOfLang[c]!.push(g);
    }
  }

  const random = rng(seed);
  const cache = new Float64Array(nSubs); // per-subgroup break counts

  const recomputeAll = (order: number[]): number => {
    let cost = 0;
    for (let g = 0; g < nSubs; g++) {
      const b = countBreaks(order, masks[g]!);
      cache[g] = b;
      cost += weights[g]! * b;
    }
    return cost;
  };

  let bestOrder: number[] | null = null;
  let bestCost = Infinity;
  let bestBreaks: number[] = [];

  for (let restart = 0; restart < restarts; restart++) {
    // Fisher-Yates shuffle for the starting order.
    const order = Array.from({ length: nLanguages }, (_, i) => i);
    for (let i = nLanguages - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }

    let cost = recomputeAll(order);
    let temperature = 5.0;

    for (let iter = 0; iter < iterations; iter++) {
      temperature *= 0.9993;
      const i = Math.floor(random() * nLanguages);
      const j = Math.floor(random() * nLanguages);
      if (i === j) continue;

      const doSwap = random() < 0.5;
      let delta = 0;
      let touched: number[] = [];

      if (doSwap) {
        const a = order[i]!;
        const b = order[j]!;
        // Only subgroups containing exactly one of a, b can change: if both or
        // neither are members, the occupied position set is unchanged.
        const seenSub = new Set<number>();
        for (const g of subsOfLang[a]!) if (!masks[g]![b]) seenSub.add(g);
        for (const g of subsOfLang[b]!) if (!masks[g]![a]) seenSub.add(g);
        touched = [...seenSub];

        [order[i], order[j]] = [order[j]!, order[i]!];
        for (const g of touched) {
          delta += weights[g]! * (countBreaks(order, masks[g]!) - cache[g]!);
        }
      } else {
        // Segment reversal moves many languages; recompute everything.
        const [lo, hi] = i < j ? [i, j] : [j, i];
        for (let l = lo, r = hi; l < r; l++, r--) {
          [order[l], order[r]] = [order[r]!, order[l]!];
        }
        let newCost = 0;
        for (let g = 0; g < nSubs; g++) {
          newCost += weights[g]! * countBreaks(order, masks[g]!);
        }
        delta = newCost - cost;
      }

      const accept =
        delta <= 0 || random() < Math.exp(-delta / Math.max(temperature, 1e-9));

      if (accept) {
        cost += delta;
        if (doSwap) {
          for (const g of touched) cache[g] = countBreaks(order, masks[g]!);
        } else {
          recomputeAll(order);
        }
      } else {
        // Undo.
        if (doSwap) {
          [order[i], order[j]] = [order[j]!, order[i]!];
        } else {
          const [lo, hi] = i < j ? [i, j] : [j, i];
          for (let l = lo, r = hi; l < r; l++, r--) {
            [order[l], order[r]] = [order[r]!, order[l]!];
          }
        }
      }
    }

    // Guard against drift from incremental bookkeeping.
    cost = recomputeAll(order);
    if (cost < bestCost) {
      bestCost = cost;
      bestOrder = [...order];
      bestBreaks = Array.from(cache);
    }
  }

  return { order: bestOrder!, cost: bestCost, breaks: bestBreaks };
}
