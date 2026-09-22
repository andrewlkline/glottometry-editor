/**
 * Agreement with the official Marama engine — a deliberately *loose* oracle.
 *
 * Absolute epsilon/kappa values differ because the engine's NA handling is
 * undocumented and could not be reproduced (README, "Known discrepancy").
 * BUILD_PLAN.md §1 settles the stance: document our own policy, and hold
 * ourselves to matching the engine's *ranking* of subgroups.
 *
 * The engine also reports 673 candidate subgroups against our 250 — it
 * generates groups beyond distinct innovation patterns by some means we have
 * not identified. So this compares the subgroups both implementations agree
 * exist, not the full listings.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Glottometry } from '../src/core/metrics.js';
import { parseMaramaCsv } from '../src/data/maramaCsv.js';

interface Baseline {
  languages: string[];
  subgroups: { members: number[]; memberNames: string[]; sigma: number }[];
}

const baseline: Baseline = JSON.parse(
  readFileSync(fileURLToPath(new URL('../prototype/data/marama_baseline.json', import.meta.url)), 'utf-8'),
);
const dataset = parseMaramaCsv(
  readFileSync(fileURLToPath(new URL('../prototype/data/innov.csv', import.meta.url)), 'utf-8'),
);

const ours = new Glottometry(dataset, 'half').subgroups();
const key = (m: number[]) => m.join(',');
const ourRank = new Map(ours.map((s, i) => [key(s.members), i]));

describe('Marama baseline', () => {
  it('uses the same language ordering', () => {
    expect(baseline.languages).toEqual(dataset.languages);
  });

  it('agrees on the three strongest subgroups', () => {
    expect(ours.slice(0, 3).map((s) => s.memberNames.join('+')))
      .toEqual(baseline.subgroups.slice(0, 3).map((s) => s.memberNames.join('+')));
  });

  it('puts the same subgroups at the top', () => {
    // Set containment with a fuzzy boundary, not sequence equality. Adjacent
    // near-ties swap under the differing NA schemes, and a hard top-N cut is
    // sensitive to a tie straddling the boundary; our #10 is their #11. See
    // BUILD_PLAN.md §1 for why we do not chase exact parity.
    const theirTop12 = new Set(
      baseline.subgroups.slice(0, 12).map((s) => s.memberNames.join('+')),
    );
    const ourTop10 = ours.slice(0, 10).map((s) => s.memberNames.join('+'));
    for (const name of ourTop10) expect(theirTop12).toContain(name);

    const ourTop12 = new Set(ours.slice(0, 12).map((s) => s.memberNames.join('+')));
    const theirTop10 = baseline.subgroups.slice(0, 10).map((s) => s.memberNames.join('+'));
    for (const name of theirTop10) expect(ourTop12).toContain(name);
  });

  it('never disagrees about a meaningful difference in strength', () => {
    // The substantive claim. We tolerate swapping two subgroups the engine
    // scores 3.51 and 3.61 apart; we must not disagree about two it scores 6
    // and 3. Every discordant pair is a near-tie.
    const shared = baseline.subgroups.filter((s) => ourRank.has(key(s.members)));
    expect(shared.length).toBeGreaterThan(100);

    let concordant = 0;
    let discordant = 0;
    let worstGap = 0;
    for (let i = 0; i < shared.length; i++) {
      for (let j = i + 1; j < shared.length; j++) {
        const a = shared[i]!;
        const b = shared[j]!;
        const gap = Math.abs(a.sigma - b.sigma);
        if (gap < 1e-6) continue;
        const theirOrder = a.sigma > b.sigma;
        const ourOrder = ourRank.get(key(a.members))! < ourRank.get(key(b.members))!;
        if (theirOrder === ourOrder) {
          concordant++;
        } else {
          discordant++;
          worstGap = Math.max(worstGap, gap);
        }
      }
    }

    const tau = (concordant - discordant) / (concordant + discordant);
    expect(tau).toBeGreaterThan(0.85);
    // Observed worst gap is ~0.98; 1.5 leaves headroom without being vacuous.
    expect(worstGap).toBeLessThan(1.5);
  });

  it('finds a strict subset of the engine listing', () => {
    // If we ever report a subgroup the engine does not, that is a real
    // divergence in candidate generation and needs investigating.
    const theirKeys = new Set(baseline.subgroups.map((s) => key(s.members)));
    const extra = ours
      .filter((s) => s.members.length < dataset.languages.length)
      .filter((s) => !theirKeys.has(key(s.members)));
    expect(extra.map((s) => s.memberNames.join('+'))).toEqual([]);
  });
});
