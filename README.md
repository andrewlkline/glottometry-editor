# Historical Glottometry GUI — scope & feasibility

A GUI tool for building **glottometric diagrams**: the wave-model alternative
to family trees developed by Siva Kalyan and Alexandre François.

**Status: Phases 1 and 2 done.** It computes, renders and
exports glottometric diagrams in three layouts — chain, MDS on cohesiveness,
geographic — with live thresholding, draggable languages, per-contour
visibility, an evidence inspector showing which innovations produced each
score, undo/redo, a settings panel for the choices the literature disputes, and
`.glot.json` project save/load, and a fragmentation view implementing K&F's
linkage-breaking proposal, and a matrix editor for building datasets. Every
phase of [BUILD_PLAN.md](BUILD_PLAN.md) is now built.
See [BUILD_PLAN.md](BUILD_PLAN.md).

## What the method is

Given a matrix of **innovations × languages** (1 = language underwent the
innovation, 0 = it did not, blank = unknown), Historical Glottometry scores every
*attested* subgroup — one with at least one exclusively shared innovation — on
two measures (Kalyan & François 2018: §3.2–3.3):

| symbol | name | definition |
|---|---|---|
| `ε` (epsilon) | exclusively shared innovations | innovations affecting exactly this set |
| `κ` (kappa) | **cohesiveness** | `p / (p + q)` |
| `ς` (sigma) | **subgroupiness** | `ε × κ` |

where `p` = innovations shared by *all* members (outsiders may share too) and
`q` = innovations that **conflict** — affecting some-but-not-all members *and* at
least one outsider. Innovations nested strictly inside the subgroup are
irrelevant and excluded from both (K&F 2018: 70 fn. 9).

The output is an Euler-style diagram: nodes are languages, contours enclose
subgroups, **thickness ∝ ς**, **redness ∝ κ**. Contours are allowed to
intersect — that is the whole point, and what a tree cannot express.

The 2018 Kalyan & François chapter is the canonical method statement;
Figure 5-11 (p. 82) is the target output. See **References** below for where to
get the papers — they are not in the repo (see `literature/`, gitignored).

## Prior art — read this before building anything

**An official implementation already exists**: the
[Historical Glottometry online analyzer](https://marama.huma-num.fr/hg/upload)
by Kalyan & François (launched 2021). It is *not* packaged or open source —
there is no CRAN or PyPI package, and the engine is only reachable through
their web form.

- **Input**: two CSVs — innovations matrix, plus optional lat/long coordinates.
- **Output**: an `.xlsx` of all scored subgroups, an auto-generated prose
  interpretation, and an SVG diagram.
- **Backend**: R (the SVG is emitted by `svglite`, plotted with ggplot2) behind
  a PHP frontend.

You can drive it headlessly, which is how the reference output in
`prototype/data/` was produced:

```bash
curl -L -X POST "https://marama.huma-num.fr/hg/upload/do_upload/" -F "langfam=Demo" -F "innofile=@innov.csv;type=text/csv" -F "coordfile=@coords.csv;type=text/csv" -F "threshold=1" -o result.html
```

### Where it falls short — this is the opportunity

1. **It draws convex hulls over geographic coordinates.** Hulls are the wrong
   primitive: they enclose non-members. In the demo output
   (`prototype/data/marama_reference_output.svg`) the ⓁA–ⓁB–ⓁQ–ⓁR contour
   swallows every language in between. The published Figure 5-11 is nothing
   like this — it was hand-drawn.
2. **Its own results page tells you to finish the job elsewhere**: *"download
   this file and fine-tune the placement of isoglosses using a vector graphics
   program such as Inkscape or Adobe Illustrator."*
3. **Batch, not interactive.** Changing the ς threshold means re-uploading.
   There is no way to nudge a node, hide a contour, or inspect which
   innovations support a subgroup.
4. **No data-entry support.** The 474-row matrix behind the published study was
   built by hand, and the etymological reasoning behind each row lives outside
   the CSV entirely.
5. **No metric alternatives**, though the literature disputes the defaults
   (see *Contested choices* below).

## Feasibility findings

### The computation is a non-issue — verified

The paper's mention of "131,070 (=2¹⁷−2) potential groupings" makes this look
like a combinatorics problem. It is not. A subgroup must have `ε ≥ 1` to be
attested, so **candidates are bounded by the number of distinct rows in the
matrix**, never by `2ⁿ`. On the 18-language × 474-innovation demo set that is
250 distinct patterns, of which 155 clear the `ε ≥ 1` bar — all scored in
~10 ms (~16 ms in the browser).

Measured scaling of the vectorised scorer (`prototype/glottometry.py`):

| languages | innovations | candidates | time |
|---|---|---|---|
| 20 | 500 | 162 | <0.01 s |
| 40 | 1 500 | 757 | 0.04 s |
| 60 | 3 000 | 1 813 | 0.36 s |
| 100 | 5 000 | 3 765 | 2.1 s |

Fast enough to recompute live on every keystroke in a GUI.

### The visualization is the real work

Three sub-problems, in increasing difficulty:

1. **Node layout / seriation.** The published diagram is essentially a 1-D
   chain in which every subgroup is a contiguous run, so each contour is a
   simple capsule. Finding such an ordering is a seriation problem — NP-hard in
   general but trivial at n ≤ 30. **Verified**: a plain multi-start simulated
   annealing over the demo data makes **30 of the 31 displayed subgroups
   contiguous**, recovering almost exactly the natural geographic chain. So
   ~97% of contours reduce to rounded rectangles.
2. **Non-convex contours.** The residual cases need a curve that encloses
   members while routing *around* excluded nodes. Established prior art:
   BubbleSets (Collins et al. 2009), LineSets, KelpFusion. This is the one
   genuinely novel piece of engineering.
3. **2-D layouts.** A pure chain is not always enough — Figure 5-11 itself
   branches around Mota–Nume–Dorig–Mwerlap. A general tool needs a 2-D fallback
   (force-directed on κ-derived distances, or MDS) plus manual node dragging.

### Known discrepancy in NA handling

The published method leaves blank cells undefined. Both the official engine and
this prototype produce **fractional** ε, so both weight unknowns somehow, but
the schemes differ:

| subgroup | official ε / κ | prototype ε / κ |
|---|---|---|
| ⓁA+ⓁB | 16.18 / 0.82 | 15.25 / 0.78 |
| ⓁE+ⓁF | 12.16 / 0.91 | 12.25 / 0.87 |

The prototype treats each NA as an independent coin flip (P = 0.5) and takes
the expected count. **The rankings agree** — the prototype reproduces the
official top-11 subgroups in the same order — but exact figures do not. The
official scheme is undocumented and resisted reverse-engineering: neither fixed
substitution (every combination of NA-inside/NA-outside over {0, .25, .5, .75,
1}) nor row-, column- or global-mean imputation reproduces their figures. For
3+ member subgroups their ε is *higher* than any scheme tested (ⓁN+ⓁO+ⓁP:
official 11.42 vs 10.50 best); for pairs it is lower (ⓁA+ⓁB: official 16.18 vs
17.00 best). Subgroups whose rows contain no NA match exactly under every
scheme, confirming the divergence is purely NA-driven. The decision (see
BUILD_PLAN.md §1) is to document our own policy and match rankings rather than
absolute values.

The official engine also reports **673** subgroups against our **155**. Ours
is a clean subset of theirs (verified in `tests/maramaBaseline.test.ts`), so
they generate candidates beyond distinct row patterns — possibly intersections
of isoglosses — and retain some with ε as low as 0.01. Also unresolved.

### Contested choices — now exposed in the UI

These are live disagreements in the literature, not settled defaults, so the
settings panel carries each with its argument attached. What they do to the
demo data:

| control | effect |
|---|---|
| ς ≥ 1 vs ε ≥ 2 | 31 subgroups drawn vs 47 |
| exclude lexical replacement | 473 → 240 innovations, 155 → 99 attested, 31 → 13 drawn |
| significance (Fisher) | ranks differently from both, below the top subgroup |

The lexical filter is the Jacques & List critique made answerable: more than
half the displayed structure depends on the category most open to borrowing,
and three subgroups vanish outright rather than weakening. The exported SVG
records the filter, weighting and threshold in its subtitle, so a figure cannot
be separated from the settings that produced it.

The underlying arguments:

- **Display cutoff on ς vs. ε.** Daniels, Barth & Barth (2019) argue a ς
  threshold hides real structure — in their Sogeram data it made the pivotal
  Apalɨ language look like it subgroups with nothing — and propose `ε ≥ 2`
  instead. They also note the opposite risk: ε alone over-represents groups
  built on parallel innovations.
- **Alternative strength measures.** Hammarström (2017) proposes Fisher's exact
  test as a statistically rigorous replacement for κ and ς. That reference is a
  conference talk with no accessible write-up; Elgh & Hammarström (2024) has
  been checked and does not contain it. The implementation here therefore uses
  its own contingency table and does not claim to be his — see
  `src/core/fisher.ts`.
- **Whether any of this dates anything.** Elgh & Hammarström (2024: 312) hold
  that Historical Glottometry is "simply a data display system, with no
  explicit time dimension", that "innovation" conflates shared ancestry,
  horizontal transfer and parallel development, and that K&F's chronology
  proposal "offers no guarantee that the weakest isogloss lines are the
  earliest links to be broken". Worth reading before presenting a glottometric
  diagram as a history rather than a summary of evidence.
- **Filtering by innovation type.** Datasets are typed (regular sound change,
  irregular sound change, morphological, syntactic, lexical). K&F's own data is
  50% lexical replacement, the most borrowing-prone category. Being able to
  recompute with a type excluded directly addresses Jacques & List's (2019)
  critique.
- **Weighting by innovation type** — deliberately *not* done by K&F, and Pelkey
  (2015: 402) warns weighting "too easily becomes an outlet for comparativists
  to justify their own intuitions." If offered, it should be off by default.
- **Where a row's type comes from.** A type set in the matrix editor (stored
  in `innovationMeta[i].type`) overrides the label prefix (`Lex:`, `ISC:` …);
  the prefix is only the fallback. Filtering, weighting and the type counts all
  go through `applyTypeSettings`/`typesOf` with those overrides — they once
  read the prefix alone, so a retyped row was shown as one type and scored as
  another. The scorer is memoised on the types only, so editing a note does not
  re-score or re-seriate. Exported captions spell out exclusions and weights
  (`excluding Syn · weights ISC ×2, Lex ×0.25`), since "type-weighted" alone
  cannot be reproduced.
- **Relative chronology.** K&F recorded crucial orderings between innovations
  but never used them; only 19.4% of their innovations (92/474) participate in
  any ordering. Storing them is cheap and no existing tool does it.

## Running it

### Node version — read this first

The `node` on `PATH` is **v14**, far too old for the toolchain. Node 25 is
installed via Homebrew but shadowed by it. Every command below assumes:

```bash
export PATH="/usr/local/opt/node/bin:$PATH"
```

To make that permanent, add it to `~/.zshrc`, or run `brew link --overwrite
node`. Deliberately not done for you — it's your global environment.

### Commands

```bash
npm install
npm test          # 305 tests
npm run typecheck
npm run dev       # localhost:5173
npm run build
npm run fixtures  # regenerate parity fixtures from the Python reference
npm run demo      # regenerate the synthetic demo dataset
```

### Deployment

The app is client-side only, so it is a static site: `.github/workflows/deploy.yml`
typechecks, tests and builds on every push to `main`, then publishes `dist/` to
GitHub Pages. Tests gate the deploy — a glottometric diagram is evidence about
a language family, and shipping unverified contour geometry would be worse than
shipping nothing.

`base` is `'./'` and every asset reference is relative, so the build works from
a repository subpath without configuration. Exports carry a version stamp
(`src/version.ts`), because a static URL stays put while the code behind it
moves and a published figure should be able to name the build that drew it.

`.claude/launch.json` points at the Homebrew Node directly, because the `npm`
shebang resolves to the old v14.

### Layout

```
src/core/        metrics, candidates, seriation, layouts, MDS, types, quality, hypothesis, tree — pure
src/geometry/    tracks, capsule (chain contours), blob + marchingSquares (2-D)
src/render/      scene, Diagram.tsx, styles, exportSvg
src/data/        Marama CSV import/export; csv.ts tokeniser, csvCheck.ts validation, templates
src/ui/App.tsx   the app
prototype/       Python reference implementation + demo data
tools/           fixture generation
tests/           parity, invariants, CSV, Marama baseline, geometry, scene, planar
```

### The evidence inspector

Click a contour and the panel lists the innovations behind its score, split
three ways: **exclusive** (their weights sum to ε), **supporting** (to p) and
**conflicting** (to q), each shown with its distribution across the family.
`tests/evidence.test.ts` asserts those sums match the metrics to 1e-9 under
every NA policy and with type weights — otherwise the panel would be explaining
a number the diagram is not drawing.

**It must be given the dataset that was scored**, i.e. after type filtering.
Row r of a filtered scorer is not row r of the full dataset; the panel was once
handed the full one, and with a type excluded it showed one innovation's label
beside another's numbers. `evidenceFor` now throws on a row-count mismatch, and
anything keyed by original rows (metadata, quality) goes through the `rows`
map that `applyTypeSettings` returns.

### Innovation quality

A second axis beside type, after Smith (2025: 659–662): how safely a row can be
read as inherited rather than borrowed. Recorded per row (detail pane, or label
prefix), shown in the grid (● high, ○ low, – undetermined; filterable, with an
"assessed n/N" count) and in the evidence panel, which splits the current total
by class (`ε 5.00 = 2.00 high + 0.50 low + 2.50 undetermined`). **It never
changes a score**; in the diagram it is decoration only (below).

- **Fields:** lexical status (replacement / synonymic / novel concept /
  indeterminate — Smith's ex. 5 and fn. 4, meaningful for Lex only), sound
  correspondences (regular / irregular), and an explicit high/low judgement.
- **Precedence** (`core/quality.ts`): explicit judgement → irregular
  correspondences (low: a borrowed replacement is still a loan) → lexical
  status. Metadata overrides the label prefix.
- **Nothing is inferred from type.** Smith ranks sound change highest, Kaufman
  (2026: 3) notes natural changes recur independently, K&F rank irregular above
  regular. Non-lexical rows stay "undetermined" until judged.
- **Not recorded:** Smith's universality and exclusivity criteria. Those are
  relations to a candidate subgroup, which ε/p/q already compute.
- **CSV:** `Lex-R:` `Lex-S:` `Lex-N:` `Lex-I:` for status; `+`/`-` before the
  colon for a judgement on any type (`ISC+:`, `Lex-S-:`). K&F's analyzer treats
  labels as text, so such files still load there. The checker warns about a
  status letter on a non-Lex type or an unknown letter.

**In the diagram** (`render/qualityOverlay.ts`, two toggles, both off by
default so a plain K&F diagram is unchanged):

- **Quality lines.** Solid = at least one high-quality exclusive innovation
  (expected count ≥ 0.5, i.e. even odds under unknown cells); dashed = none,
  and the support is fully assessed, i.e. it rests on low-quality evidence;
  dotted = none *yet*, with unassessed innovations that could still supply one.
  The dotted class is what keeps "dashed" a finding rather than an artefact of
  an unassessed dataset — the plain demo draws everything dotted. The support
  split uses **expected counts, ignoring type weights**: a weight says how much
  an innovation counts, not whether it exists.
- **High-quality survival.** Re-scores on the high-quality rows only (same NA
  policy, measure, threshold and type weights) and fades groups that no longer
  clear the threshold. This can raise κ as well as lower ε, since low-quality
  conflicting innovations go too. With **no** rows assessed high nothing is
  faded and a notice says why, rather than fading everything.
- **It is harsh by design, and that is worth knowing.** The threshold is in
  units of innovations, so a thin high-quality evidence base fails it: on the
  demo with 20 of 170 rows judged high, all 14 groups fade; with 65, four
  survive. That is Smith's point about lexically defined subgroups, but it also
  means "fades" partly measures how much has been assessed. The evidence panel
  shows each group's high-only ς/κ/ε so the margin is visible.
- Exports carry the meaning in the caption, `stroke-dasharray`/`opacity` on
  each contour, and `data-support` / `data-survives` attributes.

This is the question a comparativist actually has, and no existing tool answers
it. The Marama engine returns totals; the published tables stop at ε, κ and ς.

### Undo/redo

Snapshots over the project object, which is cheap because the dataset is shared
by reference and never mutated. The interesting part is coalescing: a drag
emits an edit per pointer move, so consecutive edits sharing a **coalesce key**
(`move:3`, `minSigma`) merge into one entry, and a 700 ms **recency window**
stops a much later return to the same node from extending it. Pointer-up
dispatches `seal`, which closes the entry explicitly — the window is a fallback
for edits with no natural end. Discrete actions carry no key and never merge;
opening a file resets history rather than recording an edit.

### The matrix editor

A `data` mode beside the diagram: a windowed grid of innovations × languages
with click-to-cycle cells, filtering by text and type, and a detail pane for
the reasoning behind each row — proto-form, innovated form, gloss, reflexes,
notes, sources and relative-chronology links.

Metadata rides **alongside** the dataset rather than inside it. `core/` is held
at parity with the Python reference and scores a plain matrix; `Project`
carries a parallel `innovationMeta` array that `data/edit.ts` keeps aligned. A
note can never affect a score, and the CSV round-trip is untouched.

The edit operations are a module of their own because they cascade: a language
is referenced from the matrix columns, the coordinates, the manual order, the
manual positions, every innovation's reflexes **and** every hypothesis group,
so renaming or deleting one has to reach all six.

### Importing CSVs: validation and feedback

Every CSV goes through `data/csvCheck.ts` before it touches the project. The
old parser accepted anything — an `x` cell became "unknown", a `14°12'S`
coordinate silently dropped the language, and an unquoted comma in a label
shifted its whole row one language to the right — and each produced a
plausible, wrong diagram. Now each rule either **blocks** the import (the data
would be misread; the project is left untouched and the report says so) or
**warns** (read as written, but probably not what was meant). Issues are
aggregated per rule, located by spreadsheet cell (`C14 (Beri): 'x'`), and carry
a fix. The **CSV format** button shows both formats with worked examples and
downloads templates; the coordinates template is pre-filled with the loaded
languages, since exact name matching is the one thing people get wrong.

Decisions that look odd but are deliberate:

- **Blank is unknown, not 0.** Anything other than `1`/`0`/blank/`NA`/`-`/`?`
  is refused rather than guessed, and the hint says so when the file looks like
  it used `x` for "present" and blanks for "absent".
- **"Present in every language" is `info`, not a warning.** K&F's own data has
  ten such rows (family-defining innovations). They are not inert — each adds
  to every subgroup's p — so they are still reported.
- **A shifted row reports once.** Its half-label lands in a language cell;
  flagging that as a bad value too would count one mistake twice.
- **Latitude/longitude are read by position** (K&F's convention), so a header
  that explicitly says `longitude, latitude` is refused, not silently swapped.
- **Coordinate names differing only in case/spacing are matched** (and noted);
  near misses (`Brei` → `Beri`, transposition counts as one edit) are only
  *suggested*, since two similar names may be two lects.
- **Loading a coordinates file replaces** the previous coordinates. Loading an
  innovations file **keeps** the existing coordinates only if some names match.
- Semicolon- and tab-separated files, BOMs, CR-only line endings, `1.0`, and
  the typographic minus `−` are accepted; `.xlsx`, UTF-16 and non-UTF-8 text
  are recognised and explained (Excel for Mac's plain "CSV" is Mac Roman and
  garbles IPA).

`parseMaramaCsv`/`parseCoordinatesCsv` are thin wrappers that throw on any
blocking issue; the UI calls the checker directly so it can show everything.

### Hybrid hypotheses (tree + linkage + contact zone)

The **computed | hypothesis** switch beside diagram/data. A hypothesis is
*authored*: named groups, each a **subgroup**, **linkage** or **contact zone**
(Smith 2025's three relation types), drawn as Kaufman (2026: 7) recommends
after Edwards (2021) — a tree with areal groupings over it. A project can hold
several, because the point is competition between readings (Kaufman's (4)
vs (5), which `tests/hypothesis.test.ts` reproduces: one extra origin vs two).

**Epistemic line, kept deliberately:** the matrix never proposes a hypothesis,
and a hypothesis never touches a glottometric score. The view uses its own
colours (slate subgroup, blue linkage, dashed grey contact zone) at fixed
widths, the legend says "authored, not computed", and exports are titled
"Hypothesis: …" with that phrase in the caption and `data-kind`/`data-name` on
each group.

What the matrix answers back (`core/hypothesis.ts`, per group and overall):

- **Tree validity** — subgroups must nest or be disjoint.
- **Extra origins** — per innovation, the fewest independent gains on the tree
  if nothing is ever lost (maximal clades inside its distribution); the sum of
  gains − 1, shown against the same count with no subgroups. A lower bound:
  whether a gap is a loss is the analyst's call, so it is never assumed.
- **Explained vs unexplained** — an innovation is inherited if it is exactly a
  subgroup's distribution, else within the smallest linkage/contact zone
  containing it, else **residue**, listed with a hint (which subgroup it falls
  within and who lacks it, or how many origins it needs).
- **Per subgroup** — defining (exclusive) innovations and their quality; gaps
  (in ≥ half the members, 0 in others, not explained by a lower subgroup);
  **leakage** (Kaufman's "crispness of borders": in every member and some
  outsider, *excluding* an ancestor subgroup's or the whole family's
  innovations, which are inherited, not leaked); conflicts.
- **Per linkage / contact zone** — internal innovations and their quality, and
  the **chain test**: the ordering that makes the most internal innovations
  unbroken runs (Smith's step-ladder / centre-of-diffusion vs "random"). Exact
  up to 7 members; above that, greedy chains from every member plus the layout
  order, improved by moves and segment reversals — never overstates, found the
  perfect chain in 300/300 random step-ladders of 8–16 lects in ≤ 14 ms. It
  assumes a chain: a genuinely 2-D network can fail it and still be a linkage,
  and the finding says so.

**Set logic, not probabilities:** checks use definite cells, unknown = wildcard
that falls whichever way fits the claim (generous to the hypothesis). They run
on the *scored* dataset, so type filters apply exactly as in the computed view.
Groups store members by **label**; `edit.ts` cascades renames/deletions, and
labels that no longer exist are reported, not guessed. Contours are keyed by
group id (`SceneOptions.keyOf`) because a linkage may have exactly a subgroup's
members (Smith's fig. 8).

### The hypothesis tree (chain layout)

With a valid tree and the chain layout, hypothesis view draws the subgroups as
a **sideways cladogram** beside the vertical chain — root left, leaves running
into the languages — with each subgroup's **defining innovations listed at its
node** (high → unassessed → low, with quality marks), as Kaufman (2026: 7)
recommends after Edwards (2021). Only linkages and contact zones stay as
outlines: the tree carries descent, the outlines carry contact. Toggles: **tree**
(off → the phase-1 nested contours) and **list innovations** (off → a count).
2-D layouts keep the contours; a dendrogram has no place on a map.

- **Order** (`core/tree.ts`, `treeOrder`): every subgroup must be an unbroken
  run, which the glottometric seriation does not guarantee. Children are
  ordered by where their languages sat in the current chain order, then, for
  nodes with ≤ 5 children, by every arrangement, minimising the pieces
  linkages/contact zones are broken into (ties: least drift from the base
  order). **Dragging is off while the tree is shown** — a drag would break a
  subgroup or be silently undone — and the legend says so.
- **Labels cannot collide by construction** (`render/treeDrawing.ts`): a
  clade's label lives left of its junction within its own languages' span ± half
  a spacing, where nothing else is drawn except its own stem (name above,
  list below). The list is cut to what fits, then "+ N more"; the tooltip (and
  the exported `<title>`) has everything. `tests/tree.test.ts` checks the claim
  on 200 random trees — no overlaps between clades, no text crossing another
  clade's lines — and was mutation-checked: widening the label region or
  moving the list onto the stem both fail it.
- Identical subgroups nest one inside the other; overlapping ones mean no tree
  is drawn, with the reason in the legend.
- The export groups each clade (`<g data-clade>` with a `<title>`) so a vector
  editor sees one object per node, and the caption says the tree lists defining
  innovations and what the marks mean.

### The fragmentation view

Kalyan & François (2019: 171) define a glottometric diagram as a weighted
hypergraph in which **a language is a connected component**, and derive a
sequence of splits by successively removing the weakest isoglosses. The
threshold slider already removed them, so the view just reports the partition:
15 stages on the demo data, each naming the isogloss whose loss caused the
break, with nodes tinted by component.

It ships with the objection attached. Elgh & Hammarström (2024: 312) hold that
the weakness formula "offers no guarantee that the weakest isogloss lines are
the earliest links to be broken", and that Historical Glottometry is "simply a
data display system, with no explicit time dimension". The panel quotes them,
and the feature is called *fragmentation* rather than *chronology* throughout —
the order the evidence thins out in is a fact, that it is the order events
happened in is not.

### Layouts

| layout | positions from | contours |
|---|---|---|
| chain | seriation (1-D ordering) | rounded rectangles, routed when split |
| MDS | classical scaling on `1 − κ` | routed blobs |
| geographic | lat/long, equirectangular | routed blobs |

The chain is the one that matches K&F's published figure, and seriation makes
each subgroup a contiguous run so its contour can be a simple shape. The 2-D
layouts say things a chain cannot — on the demo data MDS shows ⓁA+ⓁB genuinely
detached from the rest, which the chain flattens into "the top of the column" —
at the cost of needing the general contour engine.

Contour radii do **not** scale with the node radius. Two members only merge
into one shape when the radius reaches ~0.65× their separation, so a value
tuned for eighteen languages leaves five in the same canvas fragmenting into
one blob per member. The field is seeded along a spanning-tree backbone between
members instead, which keeps the radius tight to the nodes while the shape
stays connected.

Both 2-D layouts apply **overlap relaxation**. MDS places a tightly-knit
cluster almost on a single point, which is exactly the interesting case in a
linkage, so nodes closer than a minimum are pushed apart while a weak spring
holds each near where the data put it.

### How the diagram is built

1. Score every attested subgroup (`core/metrics`).
2. Seriate **all** of them into a 1-D order (`core/layout`) — see *layout
   stability* below.
3. Assign each displayed subgroup a nesting track by interval colouring
   (`geometry/tracks`): any two whose position ranges overlap get different
   widths, whether they nest or merely cross.
4. Emit a rounded rectangle per contiguous run (`geometry/capsule`), sized by
   track.
5. Style by ς (thickness) and κ (colour intensity), and render or export
   (`render/`).

### Layout stability

The ordering is computed from the **full** subgroup set, not from whatever is
currently above the display threshold. Recomputing per threshold reshuffles
12–18 of 18 nodes per slider step, because with few subgroups many orderings
tie at zero cost and the search returns an arbitrary one. Seriating once moves
no nodes at any threshold and costs two contours' worth of contiguity at ς ≥ 1.

### Contour containment

Every member is inside its contour and every non-member outside — the property
the Marama engine's convex hulls violate. It is asserted for every displayed
subgroup in every layout (`tests/scene.test.ts`, `tests/planar.test.ts`).

Getting there took a different fix in each renderer, and both were found by the
tests rather than by looking at the picture:

- **Chain.** Horizontal padding grows freely with the nesting track; vertical
  padding is capped at `spacing - nodeRadius`, or a wide outer contour swallows
  the neighbouring node.
- **2-D.** Soft repulsion alone *cannot* guarantee containment: the member term
  is a sum, so enough nearby members outvote any fixed repulsion, and fattening
  a blob for an outer track makes it worse. A hard exclusion disk around each
  non-member forces the field below the threshold there, which turns
  containment from a tuning question into a property of the construction.

**Containment is not sufficient on its own.** Under the even-odd rule a
self-intersecting outline can trace a region twice and cancel it, so a contour
that renders visibly wrong still reports every member inside and every
non-member outside. Mutation testing caught this: three of four deliberate
breakages of the chain's routing passed the containment test. Contours are
therefore also asserted to be **simple polygons** — no self-intersections, no
collinear overlaps, non-zero area (`tests/helpers.ts`).

### The two-implementation setup

`prototype/glottometry.py` is the reference; `src/core/` must match it to 1e-9.
`tools/gen_fixtures.py` dumps fixtures from Python, and `tests/parity.test.ts`
asserts against them across all five NA policies. **The fixtures are committed
on purpose.** If they regenerated on every run, a bug introduced in the Python
reference would flow straight into them and parity would still pass; pinning
them means any change to the reference shows up as a diff you have to look at.
Run `npm run fixtures` deliberately, and read the diff. On top of that,
`tests/maramaBaseline.test.ts` checks our ranking against the *official* engine
output in `prototype/data/marama_baseline.json`.

That external oracle earned its keep immediately: it caught two spec bugs the
Python-parity tests could not, because both implementations were wrong in the
same way (see BUILD_PLAN.md, "Two corrections Phase 0 surfaced").

### Two datasets, kept apart

- **`public/demo/`** — what the app loads on startup and what a build ships.
  Synthetic, generated by `tools/make_demo.py` (`npm run demo`): a fictitious
  12-lect linkage with a branch, built to show intersecting subgroups, a
  realistic type mix and some unknown cells. Deterministic from a seed.
- **`prototype/data/`** — development fixtures only, never served. Holds K&F's
  own demo dataset and their engine's output on it, because
  `tests/maramaBaseline.test.ts` checks our rankings against an independent
  implementation and synthetic data cannot stand in for that. Provenance and
  citation in [`prototype/data/PROVENANCE.md`](prototype/data/PROVENANCE.md).

Their CSVs ship with **CR-only line endings**; the parser handles them, but
command-line tools may need `tr '\r' '\n'`.

## Build plan

See [BUILD_PLAN.md](BUILD_PLAN.md) for the agreed scope, stack decisions,
contour-engine design, phasing and risks.

## Status / open questions

- [x] Computational core built in TypeScript, at parity with Python.
- [x] Seriation fast enough for live editing (~320 ms for the whole pipeline).
- [x] `epsilon >= 1` and whole-family exclusion corrected to match the paper.
- [x] **Phase 1 — diagram renderer, live thresholding, SVG export.**
- [x] Layout stability resolved: seriate once, threshold filters drawing only.
- [ ] Node colours by 3-D MDS on cohesiveness (K&F 2018: 84 fn. 13). The MDS
      machinery now exists, so this is a small job.
- [x] 2-D layouts: MDS on cohesiveness, and geographic.
- [x] Routed contours (marching squares over an attract/repel field), so a
      contour can wrap any arrangement of members and exclude what sits among
      them.
- [x] Routed contours in the chain layout too, so every subgroup is one
      connected shape whichever layout is in use.
- [x] Evidence inspector, subgroup visibility, draggable languages,
      `.glot.json` project save/load.
- [x] Undo/redo (`⌘Z` / `⌘⇧Z`), coalescing each drag or slider sweep into a
      single entry.
- [x] Innovation-matrix editor with per-row reasoning and relative chronology.
- [x] Contested-settings panel (ε vs ς cutoff, type filters, Fisher's exact).
- [ ] CLDF export — the field's interchange standard, and the natural home for
      anything richer than this tool's free-text reflexes.
- [ ] NA-handling scheme still does not match the official engine. Settled
      policy: document ours, match rankings. Resolving it properly means asking
      the authors.
- [ ] Candidate-generation difference unexplained: they list 673 subgroups, we
      list 155. Ours is now a clean subset of theirs, so they generate groups
      that are not any innovation's exact pattern — by some means unknown.
- [ ] No contact with Kalyan/François. They invite it ("feel free to contact
      us"), and they would be the natural first users and reviewers.
- [x] On GitHub (`andrewlkline/glottometry-editor`), deployed to Pages.
- [x] Innovation quality recorded and shown.
- [x] Quality in the diagram: line style by exclusive support, and a
      high-quality survival overlay.
- [ ] Survival uses the main threshold; a separate or relative survival
      threshold may be wanted once real assessed data shows how harsh it is.
- [x] Hybrid hypotheses, phase 1: authored subgroups / linkages / contact
      zones with checks against the matrix, drawn with the contour engine.
- [x] Hybrid phase 2a: tree drawing beside the chain with defining
      innovations at nodes; leaf order constrained to the tree.
- [ ] Hybrid phase 2b: explicit per-innovation assignments (override the
      computed explanation) and "lost in X" annotations, feeding the gains
      count and the node lists.
- [ ] Hybrid phase 3: side-by-side comparison of hypotheses; an optional
      starting tree from the strongest compatible computed subgroups.

## References

The three source papers are **not committed** — they are third-party
copyrighted PDFs, and this repo is intended to be publishable. Put local copies
in `literature/` (gitignored) if you want them to hand.

- Kalyan, Siva & Alexandre François. 2018. Freeing the Comparative Method from
  the tree model: A framework for Historical Glottometry. In *Let's Talk about
  Trees* (Senri Ethnological Studies 98), 59–89. **The canonical statement of
  the method.** Linked from the [HG homepage](https://marama.huma-num.fr/Glotto/).
- François, Alexandre. 2014. Trees, waves and linkages. In *The Routledge
  Handbook of Historical Linguistics*, 161–189. Also via the HG homepage.
- Pelkey, Jamin & Siva Kalyan. 2026. Wave Model. In *The Wiley Blackwell
  Companion to Diachronic Linguistics*.
  [doi:10.1002/9781119898023.wbcdl060](https://onlinelibrary.wiley.com/doi/10.1002/9781119898023.wbcdl060)
- Kalyan, Siva & Alexandre François. 2019. When the waves meet the trees: A
  response to Jacques & List. *JHL* 9(1): 167–176. **Defines the diagram as a
  weighted hypergraph and proposes the linkage-breaking chronology** — see
  BUILD_PLAN.md.
- Elgh, Erik & Harald Hammarström. 2024. The dialect chain tree. *Diachronica*
  41(3): 307–329. [doi:10.1075/dia.23014.elg](https://doi.org/10.1075/dia.23014.elg)
- Daniels, Don, Danielle Barth & Wolfgang Barth. 2019. Subgrouping the Sogeram
  languages: A critical appraisal of Historical Glottometry. *JHL* 9(1): 92–127.
- Jacques, Guillaume & Johann-Mattis List. 2019. Save the trees. *JHL* 9(1).
  The whole JHL 9(1) special issue is [available as a PDF from
  Marama](https://marama.huma-num.fr/data/Kalyan-Francois-Hammarstrom_2019_Tree-model-Historical-linguistics_JHL_9-1_Special-issue_print.pdf)
  and contains both this and the Daniels et al. critique.
- Collins, Christopher et al. 2009. Bubble Sets. *IEEE TVCG* 15(6).
- [HG project homepage](https://marama.huma-num.fr/Glotto/) ·
  [online analyzer](https://marama.huma-num.fr/hg/upload)
