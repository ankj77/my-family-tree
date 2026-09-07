# Visual Theme and Life Status

Date: 2026-09-07
Status: approved for planning
Builds on: `2026-09-07-family-tree-site-design.md` (couples, addresses, photos, three views)

## Problem

The viewer works but looks unfinished. Every node is a pale fill with a 1.5px grey
outline on flat white, so the gender colour is spread thinly across the whole box
and nothing has weight. There is no surface for the nodes to sit on, the type is
unstyled system default at one size, and the connector lines compete with the
content rather than receding behind it.

Separately, the data records `born` but has no way to say whether a person is
living, and no death date. On a chart spanning 1884 to the present that is the
single most useful missing fact.

## Two decisions that changed during design

**1. The couple becomes one card, not two boxes side by side.**

The reference the owner supplied puts both spouses inside a single card, sharing
one left rail split by gender, with no marriage bar between them. That reads as a
couple more clearly than two boxes joined by a line, and it has a consequence
worth stating plainly: it makes the classic view **narrower**, not wider.

- Today: `SELF_W 150 + BAR 22 + SPOUSE_W 120 + H_GAP 40` = 332px per slot, 15,508px overall.
- Proposed: `CARD_W 250 + H_GAP 40` = 290px per slot, roughly **13,500px** overall.

The earlier estimate of 22,000-24,000px assumed side-by-side cards. Stacking them
inverts that cost into a saving, so no layout regression risk from growth — but
the change to `FT.drawNode` is substantial and all three layouts still need
re-verification, because node *height* now varies with spouse count in every
view rather than only in the horizontal one.

**2. No web fonts.**

A proper typeface pairing was part of the brief, and it cannot be delivered. The
output must remain a single self-contained HTML file with no external resources —
`tests/test_render.py::test_is_self_contained_html` enforces it, and offline
`file://` use depends on it. A Google Fonts `<link>` would break both, and
embedding a Devanagari face as a data URI would add megabytes to a file that is
currently 56KB.

Typography is therefore delivered through a refined **system** stack with explicit
Devanagari fallbacks, a real type scale, deliberate weights, and letter-spacing —
not through a custom face. This is a genuine reduction against the brief and is
recorded as such.

## Data model

Two new optional fields on a person:

```yaml
- id: sevakram
  name: Sevak Ram
  name_hi: सेवकराम
  born: 1884 (Samvat 1941)
  life: deceased
  died: 1961
```

- `died` — free text, exactly like `born`, so `"1961"`, `"c. 1961"` and
  `"Samvat 2018"` all work. The existing `born` values already take this shape.
- `life` — one of `living` or `deceased`. Omitted means **not known**.

`status` is deliberately NOT reused. It already means `uncertain` (the name can't
be read on the paper chart) or `needs-parent`, and overloading it would make both
meanings ambiguous.

**Why `life` is explicit rather than inferred from `died`:** most of the 105 are
ancestors who are certainly dead but whose death dates nobody recorded. If a
missing `died` meant "living", every one of them would render as alive, and a new
entry for a dead relative would silently show as living until someone noticed.
Three explicit states let a card say "not known" instead of guessing wrong about
whether someone is alive.

### Validation

- `life` outside `{living, deceased}` → load error, matching how `gender` and
  `status` behave.
- `life: living` together with a `died` value → validation **warning**. The
  contradiction is almost certainly a typo, and silence would let it stand.
- `died` with no `life` → no warning; `died` implies deceased for display.

## Card anatomy

One card per couple. Each person occupies one 52px row; a card is 52px tall for a
single person, 104px for a couple, and grows by 52px per additional spouse.

```
┌─┬──────────────────────────────────────┐
│▌│  ◯   Chandgiram                      │   rail 5px, indigo
│▌│      चंदगीराम · 1928–1994            │   row 1, 52px
├─┼──────────────────────────────────────┤
│▌│  ◯   Geeta Devi                      │   rail 5px, rose
│▌│      गीता देवी · ● Living             │   row 2, 52px
└─┴──────────────────────────────────────┘
   CARD_W 250
```

- **Rail** — 5px down the left edge, one segment per row, coloured by that
  person's gender. A placeholder spouse gets a muted grey-rose rail and the card
  keeps a dashed outline on that row only.
- **Avatar** — 32px circle, drawn only where a photo file exists (unchanged
  policy from the previous spec: no grey silhouettes for the 105 people who have
  no photo yet). Where absent, the text starts at the same x so rows stay aligned.
- **Name** — 13.5px, semibold, primary text colour.
- **Meta line** — 11px, muted: the Devanagari name and the lifespan, separated by
  a middot. Under the EN-only language setting the Devanagari half drops and only
  the lifespan remains; the row height does not change, so the grid stays stable
  across language switches.
- **Status dot** — 6px, immediately before the lifespan text. Green for living,
  omitted for deceased and for unknown.

### Lifespan text

| Data | Renders |
|---|---|
| `born`, `life: deceased`, `died` | `1884–1961` |
| `born`, `life: deceased`, no `died` | `1884–Deceased` |
| `born`, `life: living` | `● Living` after the birth year: `1992–Living` |
| `born`, no `life` | `b. 1884` |
| `died` but no `born` | `d. 1961` |
| neither | the meta line carries only the Devanagari name, or is empty |

### Deceased treatment

A deceased person's rail drops to 70% opacity and their name takes the muted text
colour. Living people stay full-strength with the green dot. This is the one rule
that makes generations legible at a glance, and it applies identically in all
three views and in the detail sheet.

## Palette

Named tokens, defined once in `web/app.css` as custom properties:

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#FAF8F5` | warm off-white surface behind the tree |
| `--card` | `#FFFFFF` | card fill |
| `--edge` | `#E8E2DA` | card hairline border |
| `--rail-m` | `#2F4A7C` | deep indigo, male |
| `--rail-f` | `#A8446B` | warm rose, female |
| `--rail-unknown` | `#C9BDB0` | muted, placeholder spouse |
| `--ink` | `#1F2933` | primary text |
| `--ink-muted` | `#7A6E63` | meta text, deceased names |
| `--living` | `#3F8F5E` | status dot |
| `--connector` | `#C8BDB0` | tree lines |
| `--bark` | `#7A5C3E` | organic branches |
| `--bark-trunk` | `#5E4530` | organic trunk |
| `--leaf-1/2/3` | `#7FA96A` / `#9CBE7E` / `#C2D6A0` | canopy depth |

The neutrals carry a warm bias rather than being pure grey, so they read as
chosen rather than inherited. Card depth comes from two stacked shadows
(`0 1px 2px` and `0 3px 8px`, both warm-tinted at low alpha) plus the hairline
border — not from a heavy single shadow.

The canvas carries a faint dot grid at very low opacity so panning and zooming
have a sense of motion. It must not read as wallpaper.

## Typography

System stack with explicit Devanagari coverage, one scale:

```
--font: system-ui, -apple-system, "Segoe UI", Roboto,
        "Noto Sans Devanagari", "Nirmala UI", sans-serif;
```

| Role | Size | Weight | Notes |
|---|---|---|---|
| Card name | 13.5px | 600 | |
| Card meta | 11px | 400 | `--ink-muted` |
| Sheet name | 17px | 600 | |
| Sheet labels | 10.5px | 600 | uppercase, 0.06em tracking |
| Sheet values | 13px | 400 | |
| Toolbar | 13px | 500 | |
| Organic leaf label | 11px | 500 | |

## Chrome

- **Toolbar** — the flat grey band becomes the card surface with a hairline
  bottom border and a matching shadow, so it reads as a layer above the canvas.
  Controls group with consistent 8px gaps; the 44px tap minimum is preserved
  everywhere including the search input.
- **Detail sheet** — inherits the same tokens, gains a rail down its left edge in
  the subject's gender colour, and shows `died` and the life status alongside
  `born`.
- **Connectors** — `--connector`, 1.25px, so the cards dominate.

## Organic view

Branches take `--bark`, darkening toward `--bark-trunk` at the trunk. Leaves take
the three-green ramp by depth rather than one flat mint, giving the canopy
visible depth. Spouse leaves keep a rose tint. Deceased leaves desaturate by the
same rule as cards.

## Failure modes

| Condition | Behaviour |
|---|---|
| `life` value not in `{living, deceased}` | Load error. |
| `life: living` with a `died` value | Validation warning; `died` wins for display. |
| `died` present, `life` absent | Treated as deceased for display, no warning. |
| Very long name overflowing the card | Truncated with an ellipsis; full name is in the detail sheet. |
| Photo missing or corrupt | Existing error handler removes the avatar; text keeps its x position so rows stay aligned. |
| Three or more spouses | Card grows by 52px per row; the two-pass row sizing already added for the classic view absorbs it. |

## Testing

Python: `life` and `died` parsing, the invalid-`life` load error, the
living-with-death-date warning, and the payload carrying both fields.

Layouts: all three views re-verified for overlap at 105 people with the same
measurement method used previously — a full pairwise node scan, plus injected
multi-spouse and long-name cases. The classic view's expected width drops to
roughly 13,500px; confirm it rather than assume it.

Visual: one screenshot per view, checked in a real browser at desktop and phone
widths.

## Out of scope

- Web fonts, for the reasons above.
- A dark theme. The site is a single light-surfaced document; no request for one.
- Per-marriage child attachment. Still deferred, still documented.
- Any change to the three layout algorithms themselves beyond what the new node
  dimensions require.
