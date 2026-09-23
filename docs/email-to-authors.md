# Draft: email to Kalyan & François

Four questions that came out of building the editor, none of which can be
settled from the published material. Kept short and specific — each one names
the numbers so they can answer without rerunning anything.

Addresses are on the [HG homepage](https://marama.huma-num.fr/Glotto/), which
invites contact about data formatting.

**Before sending**, decide whether to offer them access to the repository (it
is currently private) and whether to mention the tool at all in the first
message — the questions stand on their own, and leading with them is less
likely to read as a pitch.

---

**Subject:** Four questions about the Historical Glottometry analyzer's calculations

Dear Professor François and Dr Kalyan,

I've been building an interactive tool for producing glottometric diagrams —
computing κ and ς from an innovations matrix, and rendering the isoglosses so
they can be explored rather than just exported. In the course of validating it
against your online analyzer I ran into four things I can't resolve from the
published material, and I'd be grateful for your guidance on any of them.

I've been testing against the 18-language demo dataset you distribute with the
analyzer.

**1. How are unknown cells handled?**

Both your engine and my implementation produce fractional ε, so both evidently
weight the '–' cells somehow, but the schemes differ. For ⓁA+ⓁB your analyzer
gives ε = 16.18 and κ = 0.82; treating each unknown as an independent coin flip
and taking the expected count gives me 15.25 and 0.78. I tried fixed
substitution across every combination of unknown-inside/unknown-outside the
subgroup, and row-, column- and global-mean imputation; none reproduces your
figures. Subgroups whose rows contain no unknown cells match exactly under
every scheme, so the divergence is entirely NA-driven — and for subgroups of
three or more your ε is consistently *higher* than anything I can produce
(ⓁN+ⓁO+ⓁP: 11.42 against 10.50 at best), while for pairs it is lower.

The 2018 chapter understandably leaves this undefined. Is there a documented
convention, or was it settled pragmatically?

**2. How are candidate subgroups generated?**

Your analyzer reports 673 subgroups for the demo data; I find 155. Mine are a
clean subset of yours, so you're evidently generating candidates beyond the
distinct innovation patterns in the matrix — and retaining some with ε as low
as 0.01. I had understood from the chapter (p. 80) that a cluster needs at
least one exclusively shared innovation to count as attested, which bounds
candidates by the number of distinct rows. Are you enumerating intersections of
isoglosses as well, or something else?

**3. Is Harald Hammarström's Fisher's exact test written up anywhere?**

Pelkey & Kalyan describe it as improving on κ and ς, citing a 2017 conference
presentation. I couldn't find a write-up, and Elgh & Hammarström (2024) takes a
different approach entirely. I've implemented a significance measure using my
own 2×2 table (all members participated × no outsider participated) and
labelled it explicitly as *not* his, since attaching his name to a construction
I couldn't verify seemed worse than leaving it unattributed. If the original
table is available anywhere I'd much rather implement that.

**4. Does this match what you intended by linkage breaking?**

I've implemented the proposal in your 2019 response to Jacques & List — the
diagram as a weighted hypergraph, a language as a connected component, and the
sequence obtained by successively removing the weakest isoglosses. On the demo
data it gives 15 stages, each naming the isogloss whose loss caused the split.

I've presented it as a *fragmentation sequence* rather than a chronology, with
Elgh & Hammarström's objection quoted alongside — that the weakness formula
offers no guarantee the weakest isoglosses were the earliest links broken. Does
that framing seem fair to you, or would you put it differently?

Thank you for the analyzer and for making the demo data available; having a
reference implementation to check against made this far more tractable than it
would otherwise have been.

With best wishes,

Andrew Kline
University of Hawaiʻi at Mānoa
