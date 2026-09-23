#!/usr/bin/env python3
"""Generate the synthetic demo dataset the app loads on startup.

The app used to ship Kalyan & François's own demo CSVs. They distribute those
freely and invite you to download them, but serving them from a public site is
redistribution rather than use, and the tool should stand on its own data
anyway. Their files remain in `prototype/data/` as dev-only test fixtures —
`tests/maramaBaseline.test.ts` checks our rankings against their engine's
actual output, which cannot be done with invented data.

The generated family is fictitious and says so. What it is built to show:

  - **intersecting subgroups** — the entire point of the method, and the thing
    a tree cannot express. Innovations spread over connected regions of a
    dialect network, so their isoglosses cross;
  - **a branch**, so the MDS and geographic layouts have 2-D structure to
    display rather than collapsing to a line;
  - **a realistic type mix**, weighted towards lexical replacement the way
    K&F's own data is (2018: 77, Table 5-1), so the type filter has something
    to bite on;
  - **unknown cells**, so the NA policy control is not inert.

Deterministic: same seed, same dataset. Regenerate with `npm run demo`.
"""

from __future__ import annotations

import csv
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "demo"

SEED = 20260922

# A chain of nine with a three-lect branch off the middle. Names are invented;
# the alphabetical initials make the chain easy to follow in a diagram.
LECTS = [
    "Anu", "Beri", "Cawa", "Deno", "Efi", "Galu", "Hiva", "Ione", "Kapu",
    "Lomu", "Meta", "Noro",
]

# Who borders whom. Innovations diffuse across these links, which is what
# makes the resulting isoglosses overlap instead of nest.
NEIGHBOURS = {
    0: [1], 1: [0, 2], 2: [1, 3], 3: [2, 4], 4: [3, 5, 9], 5: [4, 6],
    6: [5, 7], 7: [6, 8], 8: [7], 9: [4, 10], 10: [9, 11], 11: [10],
}

# Roughly K&F's Table 5-1 proportions: half lexical, a quarter irregular
# sound change, a fifth morphological, and a little of the rest.
TYPE_MIX = ["Lex"] * 50 + ["ISC"] * 25 + ["Mrp"] * 18 + ["RSC"] * 5 + ["Syn"] * 2

ONSETS = list("ptkbdgmnsrlwvh") + ["ŋ", "ʔ", "mʷ", "ñ"]
VOWELS = list("aeiou") + ["ə", "ɛ", "ɔ"]
GLOSSES = [
    "ash", "bark", "bite", "blood", "bone", "breast", "burn", "claw", "cloud",
    "cold", "die", "dog", "drink", "ear", "earth", "eat", "egg", "eye", "fat",
    "feather", "fire", "fish", "fly", "foot", "give", "good", "hair", "hand",
    "head", "hear", "heart", "horn", "knee", "know", "leaf", "lie", "liver",
    "long", "louse", "man", "moon", "mountain", "mouth", "nail", "name",
    "neck", "new", "night", "nose", "path", "rain", "red", "root", "round",
    "sand", "say", "see", "seed", "sit", "skin", "sleep", "small", "smoke",
    "stand", "star", "stone", "sun", "swim", "tail", "that", "this", "tongue",
    "tooth", "tree", "two", "walk", "warm", "water", "white", "woman", "yellow",
]
SOUND_CHANGES = [
    ("*k", "ʔ", "/ V_V"), ("*t", "s", "/ _i"), ("*s", "h", "/ #_"),
    ("*R", "∅", ""), ("*b", "β", "/ V_V"), ("*ŋ", "n", "/ _#"),
    ("*p", "f", ""), ("*d", "r", "/ V_V"), ("*e", "i", "/ _#"),
    ("*aw", "o", ""), ("*ay", "e", ""), ("*q", "ʔ", ""),
]
MORPHOLOGY = [
    "1sg", "2sg", "3sg", "1pl.incl", "1pl.excl", "2pl", "3pl", "dual",
    "possessive suffix", "article", "causative prefix", "nominaliser",
    "irrealis", "perfective", "plural marker", "trial pronoun",
]
SYNTAX = [
    "verb-initial order", "clause-final negator", "possessor precedes head",
    "serial verb construction", "obligatory subject marker",
]


def word(rng: random.Random, syllables: int = 2) -> str:
    return "".join(rng.choice(ONSETS) + rng.choice(VOWELS) for _ in range(syllables))


def region(rng: random.Random) -> set[int]:
    """A connected set of lects, as a diffusing innovation would reach.

    Grown by random walk over the neighbour graph, so every innovation covers
    a contiguous stretch of the network. Their isoglosses then overlap without
    nesting, which is the configuration the tree model cannot represent.
    """
    size = rng.choices(
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        # Weighted towards small regions: repeated small isoglosses are what
        # give a subgroup a high epsilon, and a family whose innovations all
        # sweep half the network has nothing to subgroup.
        weights=[6, 30, 24, 15, 9, 6, 4, 3, 3],
    )[0]
    start = rng.randrange(len(LECTS))
    reached = {start}
    frontier = [start]
    while len(reached) < size and frontier:
        current = rng.choice(frontier)
        options = [n for n in NEIGHBOURS[current] if n not in reached]
        if not options:
            frontier.remove(current)
            continue
        nxt = rng.choice(options)
        reached.add(nxt)
        frontier.append(nxt)
    return reached


def label(rng: random.Random, kind: str) -> str:
    if kind == "RSC":
        source, target, environment = rng.choice(SOUND_CHANGES)
        return f"RSC: {source} > {target} {environment}".strip()
    if kind == "ISC":
        gloss = rng.choice(GLOSSES)
        base = word(rng, rng.choice([2, 3]))
        changed = base[:-1] + rng.choice(VOWELS)
        return f"ISC: {gloss}: *{base} → *{changed}"
    if kind == "Mrp":
        return f"Mrp: {rng.choice(MORPHOLOGY)}: *{word(rng)} → *{word(rng)}"
    if kind == "Syn":
        return f"Syn: {rng.choice(SYNTAX)}"
    gloss = rng.choice(GLOSSES)
    return f"Lex: '{gloss}': *{word(rng, rng.choice([2, 3]))}"


def main() -> None:
    rng = random.Random(SEED)
    OUT.mkdir(parents=True, exist_ok=True)

    rows: list[tuple[str, list[str]]] = []
    used_labels: set[str] = set()

    while len(rows) < 170:
        members = region(rng)
        if len(members) < 1:
            continue

        kind = rng.choice(TYPE_MIX)
        text = label(rng, kind)
        if text in used_labels:
            continue
        used_labels.add(text)

        cells: list[str] = []
        for i in range(len(LECTS)):
            # A few cells are genuinely undetermined — lacking data, or the
            # form is not applicable — so the NA policy control has something
            # to act on.
            if rng.random() < 0.035:
                cells.append("NA")
            else:
                cells.append("1" if i in members else "0")

        # Repeated patterns are kept deliberately: a subgroup's epsilon *is*
        # the number of innovations sharing its exact distribution, so
        # de-duplicating would leave every subgroup attested exactly once.
        rows.append((text, cells))

    with (OUT / "innov.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([""] + LECTS)
        for text, cells in rows:
            writer.writerow([text] + cells)

    # An invented island arc: a curve for the chain, with the branch bending
    # away so the geographic layout is genuinely two-dimensional.
    coordinates: dict[str, tuple[float, float]] = {}
    for i in range(9):
        t = i / 8
        coordinates[LECTS[i]] = (-14.20 - 0.42 * (t ** 1.7), 171.10 + 1.55 * t)
    for j, index in enumerate([9, 10, 11]):
        t = (j + 1) / 3
        coordinates[LECTS[index]] = (-14.34 - 0.50 * t, 171.92 + 0.30 * t)

    with (OUT / "coords.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["lect", "latitude", "longitude"])
        for name in LECTS:
            lat, lon = coordinates[name]
            writer.writerow([name, f"{lat:.6f}", f"{lon:.6f}"])

    print(f"{len(rows)} innovations x {len(LECTS)} lects -> {OUT}")


if __name__ == "__main__":
    main()
