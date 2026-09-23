# Where these files came from

**These are development fixtures, not application data.** Nothing here is
served by the app or included in a build — `dist/` contains only
`public/demo/`, which is synthetic (see `tools/make_demo.py`).

## Kalyan & François's demo dataset

- `innov.csv` — 473 innovations across 18 fictitious languages (ⓁA–ⓁR)
- `coords.csv` — coordinates for the same
- `marama_reference_output.svg` — the diagram their engine returns for it
- `marama_baseline.json` — the subgroups and scores their engine returns,
  extracted from the `.xlsx` it produces

Downloaded from the [Historical Glottometry online
analyzer](https://marama.huma-num.fr/Glotto/), which distributes the two CSVs
for exactly this purpose: *"we recommend you download these two following
files, which should work for a preliminary demonstration."* The SVG and the
baseline are that engine's output on those inputs, retrieved 22 September 2026.

Cite as:

> Kalyan, Siva & Alexandre François. 2026. *Historical Glottometry online
> analyzer.* Electronic software. ANU, Canberra – CNRS, Paris.
> https://tiny.cc/HGOA

## Why they are still here

`tests/maramaBaseline.test.ts` checks that this implementation ranks subgroups
the way the reference engine does. That test needs **their** engine's output on
**their** data; synthetic data cannot stand in for it, because the whole point
is agreement with an independent implementation. It caught two real spec bugs
that the Python-parity tests could not — both implementations were wrong in the
same way (see BUILD_PLAN.md).

The application's own demo was moved to synthetic data so that the deployed
site stands on its own rather than redistributing theirs.
