# Build plan — Historical Glottometry editor

Scope as recommended in [README.md](README.md): **not** another calculator. Two
products in one app — an interactive diagram editor that absorbs the
"fine-tune it in Illustrator" step, and an innovation-matrix editor that makes
building a dataset tractable. Method settings that the literature disputes are
exposed rather than baked in.

---

## 1. Decisions

These are settled unless there's reason to revisit; each has a stated rationale
so a later session can overturn it knowingly.

### Browser app, client-side only, static hosting

No backend, no install, no accounts. Drivers:

- **The compute is 10 ms.** There is nothing for a server to do. (Verified —
  see README's scaling table.)
- **Distribution is the whole game.** The existing analyzer is good work that
  almost nobody uses. A URL a colleague opens and a `.glot` file they drag in
  beats anything requiring Python or R on a linguist's laptop.
- **Unpublished data stays on the machine.** Nothing uploads. This matters for
  fieldwork datasets and removes every privacy and hosting concern at once.
- Static hosting is free and permanent-ish (GitHub Pages / Netlify), which
  matters for an academic tool that must still resolve when someone follows a
  citation in six years.

Cost: no server-side persistence, so project state lives in a file the user
saves. That's the right trade for this audience — they already think in files.

### TypeScript + React + Vite; SVG rendered by hand

React for ecosystem depth and because future Claude sessions maintain it most
reliably. Vite for build speed. **No charting library** — D3 and friends solve
a problem we don't have, and the contour geometry is entirely custom. Use D3
only as a utility grab-bag (`d3-scale`, `d3-polygon`) if convenient.

Heavy work (seriation, contour fields) goes in a **Web Worker** so dragging a
node never janks.

### The Python prototype becomes the test oracle

`prototype/glottometry.py` stays. It is the reference implementation; the
TypeScript core must match it to 1e-9 on generated fixtures. This gives a
genuine second implementation to check against rather than tests that merely
restate the code.

### Native format: a single JSON project file

`.glot.json` — one file, portable, drag-and-drop. Accept the poor diff
behaviour; linguists are not going to code-review a matrix.

**Marama CSV import and export is mandatory**, not a nice-to-have. It is the
only interchange format the field has, it's how users arrive with existing
data, and it keeps the official analyzer usable as a cross-check.

[CLDF](https://cldf.clld.org/) export is a stretch goal — it's the real
interoperability standard in the field (StructureDataset is the plausible
module), and it's what would make the tool's output citable alongside
Glottolog-adjacent resources. Worth doing eventually, not worth blocking v1.

### Do not chase bit-compatibility with the Marama engine

I tried and failed to reverse-engineer their NA handling (fixed substitution,
row/column/global-mean imputation — none reproduce their published figures; for
3+ member subgroups their ε exceeds every scheme tested). Their subgroup count
also differs structurally from ours: 673 vs our 155 on the same data, though
ours is a clean subset of theirs.

So the stance is: **define our NA policy explicitly, expose it as a setting,
document it, and validate that subgroup *rankings* agree with Marama** rather
than the absolute values. Chasing exact parity against an undocumented closed
implementation is an unbounded task. The bounded version is one email — the
authors invite contact, and this is a good reason to make it.

---

## 2. Architecture

```
src/
  core/                 pure, no DOM — mirrors glottometry.py
    types.ts            [built] Cell, Dataset, Subgroup, NaPolicy
    metrics.ts          [built] eps / kappa / sigma; NA policies; candidates
    seriation.ts        [built] ordering search (incremental cost)
    containment.ts              subgroup nesting forest
  geometry/
    capsule.ts            contiguous-run contours (the common case)
    bubbleset.ts          scalar field + marching squares (general case)
    offset.ts             nesting-aware outward offsets
    smooth.ts             Catmull-Rom / Chaikin
  render/
    Diagram.tsx           SVG scene
    styles.ts             stroke width = f(sigma), colour = f(kappa)
    exportSvg.ts          standalone publication-quality SVG
  data/
    project.ts                  schema, load/save
    maramaCsv.ts        [built] import + export
  ui/
    App.tsx             [built] Phase 0 placeholder — Phase 1 replaces it
    DiagramPane, MatrixEditor, InnovationDetail, SettingsPanel, SubgroupList
  workers/
    compute.worker.ts
```

`[built]` marks what Phase 0 delivered. Candidate enumeration ended up inside
`metrics.ts` rather than its own file — it is twenty lines and shares the raw
matrix with the scorer; split it out if it grows.

`core/` must stay importable headlessly so it can be fuzzed against Python.

---

## 3. The contour engine

This is the part that doesn't exist yet anywhere, so it gets designed up front.

**Input**: node positions, subgroup masks with ς and κ.

1. **Containment forest.** Sort subgroups by size; `A ⊃ B` makes B a child.
   Disjoint same-size groups are siblings, not nested.
2. **Offsets.** Each contour sits `base + Σ(stroke widths + gap)` outward of the
   deepest chain of contours nested inside it along the shared boundary. This is
   what stops 37 contours collapsing into a smear.
3. **Geometry, two modes:**
   - **Capsule** — when members form a contiguous run along the layout's
     primary axis, emit a stadium/rounded-rect. Cheap, and it is exactly what
     K&F's published Figure 5-11 uses. Measured to cover **~97%** of displayed
     subgroups on the demo data.
   - **Field (BubbleSets)** — members as attractors, non-members as repulsors,
     marching-squares an isocontour, then smooth. Handles the non-contiguous
     residue. ~300–400 lines; prior art is Collins et al. (2009).
4. **Style.** `stroke-width ∝ ς`; stroke colour red with lightness driven by κ,
   per K&F. Node fill from 3-D MDS on κ-distances mapped to RGB (their fn. 13).

**Density is the real risk**, not correctness — 37 contours over 18 nodes is a
lot of ink. Mitigations are product features, not hacks: the threshold slider,
hover-to-isolate, and a subgroup list with per-contour visibility. This is
precisely why the interactive version beats a batch renderer.

**Layout modes**: chain/seriated (default, matches the published figure),
geographic (lat-long, like Marama but with correct contours), MDS on
κ-distance, and manual. Manual positions persist in the project file and
survive recompute — that is the Illustrator-replacement promise.

---

## 4. Phases

Each phase ends with something usable, not scaffolding.

### Phase 0 — core + oracle — **DONE**

Port metrics, candidate enumeration and seriation to TS. Generate JSON fixtures
from the Python prototype; assert parity to 1e-9. Make seriation incremental
(only subgroups containing a moved language need recosting).

*Done when*: `npm test` green against Python fixtures, and rankings match the
Marama `.xlsx` baseline in `prototype/data/`. — **met**; 54 tests across 5
files, and every mutation in a 6-mutant battery is caught.

Outcomes:

- **Seriation is 279 ms** (20 restarts x 6000 iterations), against 12 s for the
  pure-Python loop — a 43x speedup, comfortably inside the live-editing budget.
  Same cost (1.8074) and same 30/31 contiguity as the reference.
- Scoring 155 subgroups takes ~16 ms in the browser; full pipeline ~170 ms.
- **Spec bug found and fixed** — see "Two corrections" below.
- A throwaway placeholder UI (`src/ui/App.tsx`) proves the core runs unchanged
  in a browser. It is not the product and Phase 1 replaces it.

#### Two corrections Phase 0 surfaced

1. **`epsilon >= 1`, not `epsilon > 0`.** K&F (2018: 80) require a subgroup to
   "have at least one exclusively shared innovation". With integer data the two
   are identical, but NA weighting makes epsilon fractional and `> 0` then
   admits groups resting entirely on partial evidence from unknown cells. This
   was letting through 46 spurious subgroups, all with epsilon < 1, none of
   which the Marama engine reports. Fixing it brought our listing to a clean
   subset of theirs.
2. **The whole family is not a subgroup of itself.** Nothing can conflict with
   the set of all languages, so its kappa is a trivial 1 and it headed the
   ranking. The Marama engine omits it; we now do too.

Both were caught by the external baseline test, not by Python-parity — the two
implementations agreed with each other while both being wrong. Worth
remembering when weighing whether to keep the Marama oracle in the suite.

#### New risk: layout instability under thresholding

Running the placeholder exposed something the static analysis missed. When the
threshold is high, few subgroups constrain the ordering, many permutations tie
at cost 0, and the search returns an arbitrary one — so the layout reshuffles
every time the user moves the slider. For an interactive tool that is
disorienting and unacceptable.

Phase 1 needs a tie-breaking secondary objective. Options, cheapest first:
anchor to a stable reference order (geographic, or the user's manual
arrangement); or add a small penalty on displacement from the previous layout
so it deforms continuously rather than jumping. Decide before building the
renderer, because it constrains the layout API.

### Phase 1 — static renderer — **DONE**

Load a Marama CSV → compute → render → export SVG. Rounded-rectangle contours,
chain layout, nesting offsets by interval colouring, ς/κ styling.

*Done when*: the demo dataset renders as a legible diagram in the style of
Figure 5-11, and the exported SVG opens cleanly in a vector editor with sane
layer structure. — **met**. 95 tests. The export parses as clean XML, renders
standalone, and carries one named `<g data-subgroup="...">` per isogloss with
ς/κ/ε as data attributes, so a vector editor gives named selectable groups
rather than a pile of paths.

Hover-to-isolate landed early, because it was the cheapest answer to the
density risk and the diagram needed it to be readable at all at ς ≥ 1.

#### Layout stability — resolved

**Seriate once over the full subgroup set; the threshold filters only what is
drawn, never the layout.** Measured on the demo data:

| | re-seriate per threshold | seriate once |
|---|---|---|
| nodes moved per slider step | 12–18 of 18 | **0** |
| contiguous at ς ≥ 1 | 30/31 | 28/31 |
| contiguous at ς ≥ 2 and above | identical | identical |
| resulting order | scrambled | the natural chain ⓁA→ⓁR |

Two contours' worth of contiguity buys total stability and a cleaner canonical
ordering. A tie-break term was also added to `seriate`: among orderings that
score equally on breaks, prefer the one closest to a reference order (the
dataset's own column order, which is conventionally geographic). Without it
the search returns an arbitrary member of the tied set and the chain can come
out mirrored for no reason. Its weight is derived to stay below the cheapest
single break, so it can never override a real contiguity gain.

#### The containment bug

Capping the corner radius made wide contours *look* right, but vertical
padding still equalled half-width, so a wide outer contour swallowed the
neighbouring non-member nodes. Horizontal and vertical padding are now
independent: horizontal grows freely with the track (that is where nesting
room comes from), vertical is compressed to fit `spacing - nodeRadius` so a
non-member is never enclosed.

This is the same class of error as the Marama engine's convex hulls, arrived
at from a different direction, and it is now a property test: every member
inside its contour, every non-member outside, for every displayed subgroup.

#### Performance

Seriation gained early stopping (halt after `patience` restarts without
improvement). Full pipeline on load went 1265 ms → ~320 ms with identical cost
and ordering. Restart counts from 2 to 20 all converge on this dataset, so a
fixed low number would have been overfitting to it; early stopping adapts.

#### Deferred out of Phase 1

- **MDS node colours.** K&F colour nodes by 3-D MDS on pairwise cohesiveness
  mapped to RGB (2018: 84 fn. 13). The MDS machinery now exists (see below), so
  this is a small job whenever it is wanted.
- **BubbleSets for the chain layout.** Done — see Phase 1c.

### Phase 1b — 2-D layouts and routed contours — **DONE**

Taken next because it was what most limited fidelity to the published figure:
Figure 5-11 branches around Mota–Nume–Dorig–Mwerlap and a chain cannot say
that. 2-D layout and the general contour engine turned out to be one job, not
two — a chain layout is precisely what *lets* contours be rounded rectangles.

**Layouts.** Three, switchable: chain, MDS on cohesiveness, geographic.

- MDS runs classical scaling on `1 − κ` via power iteration with deflation, no
  linear-algebra dependency; exact on a synthetic grid, 25 ms on the demo data.
  It immediately earns its place: ⓁA+ⓁB come out clearly detached from the
  rest, which the chain flattens into "the top of the column".
- Geographic projects lat/long equirectangularly with longitude scaled by
  cos(mean latitude). This is the head-to-head with the Marama engine — same
  data, same coordinates, correct contours.
- Both need **overlap relaxation**. MDS puts a tightly-knit cluster almost on
  one point, which is exactly the interesting case in a linkage; without
  relaxation six labels were unreadable and splits rose from 3 to 7. Pairs
  closer than a minimum are pushed apart while a weak spring holds each node
  near where the data put it.

**Contours** (`geometry/blob.ts`, `geometry/marchingSquares.ts`): a scalar
field where members attract and non-members repel, traced with marching
squares, Chaikin-smoothed. Genuine holes fall out for free — members encircling
a non-member give an outer ring and an inner one, and containment is tested
even-odd across all rings, matching `fill-rule: evenodd`.

#### Soft repulsion cannot guarantee containment

The first version failed the containment property on real data: ⓁQ fell inside
ⓁL+ⓁM+ⓁN+ⓁO+ⓁP, ⓁK inside ⓁC…ⓁJ. The member term is a *sum*, so enough nearby
members outvote any fixed repulsion, and fattening the blob for an outer track
makes it worse. No amount of parameter tuning fixes that — it is structural.

The fix is a hard exclusion disk: inside a small radius of any non-member the
field is forced below the threshold. Containment stops being a tuning question
and becomes a property of the construction. Soft repulsion stays, because it
still shapes the contour nicely.

#### Export size

Marching squares emits a vertex per grid crossing and each Chaikin pass doubles
it, so the first 2-D export was **392 KB** against 17 KB for the chain — mostly
near-collinear noise, bad for file size and worse for anyone opening it in a
vector editor. Douglas-Peucker simplification at 0.6 world units brings it to
**37 KB** with no visible change and containment tests still green.

### Phase 1c — routed contours in the chain layout — **DONE**

The last correctness gap in the chain renderer. A split subgroup used to draw
as two rounded rectangles joined by a dashed line: never wrong, but it said
"here are two shapes" where the data says "here is one isogloss".

Routing in a column is not the same problem as in 2-D. The members sit on one
vertical line, so a corridor connecting two runs has to pass to one *side* of
the non-members between them. The outline goes down the right-hand side
through corridors, then back up the left, tucking inside each corridor's inner
edge on the way — twelve vertices for two runs, and the column between the runs
finishes outside the shape. The corridor straddles the contour's own edge, so
it reaches only half its width beyond the nominal track and barely disturbs
outer contours.

`roundedPolygon` replaced the bespoke rectangle path: it rounds any polygon,
clamping each corner to half the shorter adjacent edge so the short step in and
out of a corridor degrades to a sharp corner instead of a self-intersecting
arc. Both the plain and routed cases now go through it.

#### Containment is necessary but not sufficient

Worth recording, because it nearly shipped. Mutation testing the new routing
found that **three of four deliberate breakages were not caught** — including
tucking the corridor on the wrong side, which visibly swallows the gap.

The reason is the even-odd rule. A wrong-side corridor makes the outline
self-intersect and trace the gap region *twice*, so a ray from a gap node
crosses the boundary an even number of times and the point still reports as
outside. The containment test passed on a shape that renders visibly wrong.

The missing property is **simplicity**: a contour has to be a polygon you could
cut out. `tests/helpers.ts` adds a self-intersection check (proper crossings
plus collinear overlap, which is how a zero-width corridor shows up) and an
enclosed-area check. With those, all six routing mutations are caught.

### Phase 2 — make it an editor *(3–4 days)*

Live ς/ε threshold slider; drag nodes with contours reflowing; click a contour
to list its supporting, conflicting and exclusive innovations; per-subgroup
visibility; layout-mode switch; undo/redo; project save/load.

*Done when*: a diagram can be taken from raw CSV to publication-ready without
opening a vector editor. This is the core value proposition — treat it as the
v1.0 line.

### Phase 3 — matrix editor *(5–7 days)*

The other half of the product, and the bigger app surface.

```ts
Innovation {
  id; label; type: 'RSC'|'ISC'|'Mrp'|'Syn'|'Lex';
  protoForm?; innovatedForm?; gloss?;
  reflexes: Record<LangId, { value: 1|0|null; form?; note? }>;
  sources: string[]; notes?;
  precedes: InnovationId[];      // relative chronology
}
Language { id; name; abbrev; glottocode?; lat?; lon?; speakers? }
```

Virtualised grid (innovations × languages), click to cycle 1/0/?, detail pane
for the selected row, filter and sort by type, IPA-friendly input. Relative
chronology gets *stored* even though no published method consumes it yet — K&F
recorded orderings and never used them, and it's cheap to capture at entry time
and impossible to reconstruct later.

*Done when*: a new dataset can be built from scratch in the app, and a Marama
CSV round-trips without loss of the columns it carries.

### Phase 4 — the contested settings *(2–3 days)*

- Cutoff on ς **or** ε (Daniels et al. 2019 argue for `ε ≥ 2`)
- Filter by innovation type, with recompute — directly answers Jacques & List's
  borrowing critique, since K&F's data is 50% lexical
- NA policy selector, documented
- Hammarström's (2017) Fisher's exact test as an alternative strength measure
- Per-type weighting: **present but off by default**, with Pelkey's warning in
  the UI that weighting "too easily becomes an outlet for comparativists to
  justify their own intuitions"

*Done when*: every default the literature argues about can be changed in the UI
and the diagram updates live.

### Phase 5 — stretch

CLDF export; geographic basemap; side-by-side dataset comparison; publishable
permalink encoding a diagram in the URL.

**Phases 0–4: roughly 16–23 focused days.** As a part-time academic project,
budget 2–4 months. Phases 0–2 alone (~9–13 days) produce something worth
sharing.

---

## 5. Testing

- **Python parity** — the spine. Fixtures generated from `glottometry.py`.
- **Marama ranking parity** — looser oracle; order must match, values need not,
  pending the NA question.
- **Invariants from the paper** — κ ∈ [0,1]; ς ≤ ε; and a synthetic
  perfectly-tree-like dataset must yield **κ = 1 for every clade**, which is
  K&F's own stated definition of an ideal tree (2018: 69). That last one is a
  strong end-to-end check.
- **Visual regression** on exported SVG.
- **Property tests** on the contour engine: every member inside the curve,
  every non-member outside. This is the correctness bar the existing convex-hull
  renderer fails.

---

## 6. Risks

| risk | severity | response |
|---|---|---|
| Diagram too dense to read at realistic subgroup counts | **high** — it's the reason the published figure was hand-drawn | Thresholding, isolate-on-hover, per-contour toggles are core features, not polish. Validate legibility at Phase 1 before building further. |
| BubbleSets contours look unpredictable or ugly | medium | ~97% of cases use capsules. If the field approach disappoints, fall back to polygon-boolean offsets (buffer members, subtract buffered non-members). |
| NA semantics never reconciled with Marama | low | Already mitigated by the stance in §1 — document our own, match rankings. |
| Scope creep from the matrix editor into a general-purpose comparative-method database | **high** | Hard boundary: this tool edits *innovations and their distributions*. It is not a lexical database, not an etymological dictionary. Point at CLDF for anything beyond. |
| Nobody uses it | medium | Ship Phase 1 to François and Kalyan early. They own the only other implementation, invite contact, and are the natural first reviewers. |

---

## 7. First moves

1. Email François and Kalyan: describe the tool, ask about NA handling and
   candidate enumeration in their engine, ask whether the Torres–Banks dataset
   can be shared as an acceptance fixture. Do this first — it has the longest
   latency and shapes Phase 0.
2. Scaffold Vite + React + TS, port `core/metrics.ts`, wire up Python fixtures.
3. Build the capsule renderer against the demo data before touching any UI
   chrome — if the diagram doesn't read well, everything downstream changes.
