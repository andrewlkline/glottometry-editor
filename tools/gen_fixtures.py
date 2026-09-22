#!/usr/bin/env python3
"""Generate parity fixtures from the Python reference implementation.

The TypeScript core in src/core/ must reproduce these to 1e-9. Regenerate with:

    npm run fixtures

Outputs tests/fixtures/*.json (gitignored — they are derived artefacts).
"""

from __future__ import annotations

import json
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "prototype"))

from glottometry import NA_POLICIES, Glottometry, load_matrix, seriate, _breaks  # noqa: E402

OUT = ROOT / "tests" / "fixtures"
DEMO = ROOT / "prototype" / "data" / "innov.csv"


def cells(matrix: np.ndarray) -> list[list[int | None]]:
    """numpy matrix -> JSON-safe nested list with None for NA."""
    return [[None if np.isnan(v) else int(v) for v in row] for row in matrix]


def build_metrics_fixture() -> dict:
    M, langs, inns = load_matrix(DEMO)
    fixture = {
        "source": "prototype/data/innov.csv",
        "languages": langs,
        "innovations": inns,
        "matrix": cells(M),
        "byPolicy": {},
    }

    for policy in NA_POLICIES:
        g = Glottometry(M, langs, na_policy=policy)
        subs = []
        for mask in g.candidates():
            s = g.stats(mask)
            if s["epsilon"] < 1.0:      # K&F 2018: 80 — attested means eps >= 1
                continue
            subs.append({
                "members": [i for i, m in enumerate(mask) if m],
                "epsilon": s["epsilon"], "kappa": s["kappa"],
                "sigma": s["sigma"], "p": s["p"], "q": s["q"],
            })
        subs.sort(key=lambda r: -r["sigma"])
        fixture["byPolicy"][policy] = subs
        print(f"  {policy:>8}: {len(subs)} attested subgroups")

    return fixture


def build_seriation_fixture() -> dict:
    """Break counts for a known ordering — checks countBreaks, not the search.

    The annealing search itself is stochastic and implementation-specific, so
    asserting on its output across two languages would be brittle. What must
    agree is the cost function.
    """
    M, langs, _ = load_matrix(DEMO)
    g = Glottometry(M, langs)
    shown = g.subgroups()
    shown = shown[shown.sigma >= 1.0]

    masks = [m.tolist() for m in shown["mask"]]
    weights = [float(w) for w in shown.sigma]

    # A fixed, arbitrary-but-reproducible ordering plus the identity ordering.
    rng = np.random.default_rng(12345)
    orders = [list(range(len(langs))), rng.permutation(len(langs)).tolist()]

    cases = []
    for order in orders:
        arr = np.array(order)
        cases.append({
            "order": order,
            "breaks": [_breaks(arr, np.array(m)) for m in masks],
            "cost": sum(w * _breaks(arr, np.array(m))
                        for w, m in zip(weights, masks)),
        })

    # Also record what the Python search achieves, as a quality floor: the TS
    # search must do at least this well, not match it exactly.
    best_order, best_cost = seriate(
        [np.array(m) for m in masks], weights, len(langs), restarts=20, seed=0
    )
    return {
        "masks": masks,
        "weights": weights,
        "nLanguages": len(langs),
        "cases": cases,
        "referenceBestCost": float(best_cost),
        "referenceBestOrder": [int(i) for i in best_order],
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    print("metrics fixture:")
    metrics = build_metrics_fixture()
    (OUT / "metrics.json").write_text(json.dumps(metrics), encoding="utf-8")

    print("seriation fixture:")
    seriation = build_seriation_fixture()
    (OUT / "seriation.json").write_text(json.dumps(seriation), encoding="utf-8")
    print(f"  reference best cost {seriation['referenceBestCost']:.4f}")

    print(f"\nwrote {OUT}/metrics.json, {OUT}/seriation.json")


if __name__ == "__main__":
    main()
