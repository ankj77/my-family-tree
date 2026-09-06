# Family Tree Site — Data Model and Viewer Rework

Date: 2026-09-07
Status: approved for planning
Scope: parts A (data model) and B (viewer rework). Part C (search, address
filters, common-ancestor finder) is a follow-up spec.

## Problem

`family-tree.yaml` holds 105 people — 102 male, 3 female, and zero recorded
spouses. The viewer renders one box per person, so a child's parentage reads as
"descends from this man" with the mother absent entirely. The chart is also a
single top-down layout that gets very wide, which is awkward on the phones most
readers will use.

This spec covers three changes:

1. Each person gains a partial address and an optional photo.
2. A tree node becomes a **couple** — husband and wife joined by a marriage bar,
   with children hanging off the joint line.
3. The single layout becomes three selectable views: classic top-down,
   left-to-right, and an organic tree.

Publishing posture is unchanged: public repo, public GitHub Pages. Addresses are
partial by intent (locality and coarser). A private build is a future switch,
not built now.

## Data model

### Address

New optional nested block on a person. Every key optional; the detail sheet shows
only the keys that are present.

```yaml
- id: chandgiram
  name: Chandgiram
  name_hi: चंदगीराम
  gender: male
  relation: father
  relation_id: netram
  address:
    line: House 214
    locality: Sector 14
    city: Rohtak
    state: Haryana
    country: India
```

Allowed keys inside `address`: `line`, `locality`, `city`, `state`, `country`.
An unknown key is a **load error**, matching the existing top-level behaviour — a
silently dropped `citty:` is worse than a failed build.

`address` is represented as an `Address` dataclass on `Person`, defaulting to an
empty instance so callers never branch on `None`.

### Photos

Photos are matched by **filename convention**, not a YAML field: `photos/<id>.jpg`
(also `.jpeg`, `.png`, `.webp`). Dropping `photos/chandgiram.jpg` into the repo
makes the thumbnail appear with no edit to `family-tree.yaml`.

Photo resolution lives in `model.py` as `resolve_photos(people, photo_dir)`,
called by `build.py`. It sets each person's `photo` path and returns the list of
warnings below, so the matching logic is unit-testable without touching the
filesystem layout of the build script.

- A photo file matching no person id → build **warning** (catches typos).
- A photo over 150KB → build **warning** naming the file and printing the exact
  `sips` command to shrink it. 105 unshrunk photos make the page slow on mobile
  data; a warning is preferred over adding an image-processing dependency.

### Couples

A couple is a **blood descendant plus whoever married in**. Spouses use the
relation the model already supports; no edit to any of the 105 existing rows:

```yaml
- id: chandgiram_wife
  name_hi: गीता देवी
  gender: female
  relation: wife
  relation_id: chandgiram
```

`relation: husband` works symmetrically for the blood daughters already in the
data (Udmi and Kannu have children via `relation: mother`).

Children continue to link to the blood parent only. A new optional `mother_id`
disambiguates **only** when a man has more than one wife recorded.

- `mother_id` must reference an existing person → **validation error** (existence
  checks belong in `validate.py`, which holds the id index; `model.py` only
  checks the field's shape).
- `mother_id` must reference a spouse of that child's parent → validation
  **warning**; the child renders on the parent's own line.
- Multiple wives with children carrying no `mother_id` → those children hang from
  the man's own drop line, not from either marriage bar. This is silent and
  deliberate: it is the honest rendering of "we don't know which marriage".

### Placeholder spouses

Placeholders are **synthesised at render time and never stored in YAML**.

Rule: a dashed placeholder box is drawn for a blood person **who has children but
has no spouse recorded**. Its gender is the opposite of the blood person's.

A person with no children gets no placeholder — otherwise the youngest generation
fills with roughly 50 meaningless `Unknown` boxes on day one.

### Backward compatibility

Every addition is optional. The existing `family-tree.yaml` remains valid
unchanged and `python3 build.py` keeps working the moment this lands, rendering
placeholder spouses and no photos until data is collected.

## Architecture

### Why the web assets move out of `render.py`

`render.py` is 279 lines, ~200 of which are a JavaScript template inside a Python
string. Three views, a detail sheet and thumbnails would push that past 1000
lines of un-highlighted, un-lintable text.

```
web/
  index.html          markup + placeholders
  app.css
  app.js              payload parsing, state, pan/zoom, detail sheet, view switching
  views/classic.js
  views/horizontal.js
  views/organic.js
family_tree/
  model.py            + Address, mother_id
  validate.py         + address / mother_id / photo checks
  tree.py             + couple grouping, placeholder synthesis
  render.py           thin: build JSON payload, inline web/ files
photos/               <id>.jpg — dropped in by hand
```

### Build output

`build.py` inlines `web/` into the single `family-tree.html` it already produces.
The deploy story is unchanged — one file to open, works offline from `file://`,
works on GitHub Pages. Photos are the only external asset, referenced as
`photos/<id>.jpg` relative to the HTML.

Inlining also avoids a real trap: **ES modules do not load over `file://`**. The
web sources are therefore plain scripts sharing one `FT` global, not
`import`/`export`. This is what keeps "just open the file" working.

### View interface

Each view is one object, and this is the entire contract:

```js
FT.views.classic = {
  id: 'classic',
  label: 'Classic (top-down)',
  layout: function (root) { /* sets .x / .y on every couple node */ },
  extent: function (root) { /* returns bounds, for fit-to-screen */ }
};
```

`app.js` owns everything shared — payload parsing, collapse state, pan/zoom,
highlight-to-root, the detail sheet, the language toggle — and knows nothing
about any specific view. Adding a fourth view later is one new file plus one
registry line, and cannot break the existing three.

### The three views

**Classic** — today's layout, with the node widened to hold a couple: husband
box, marriage bar, wife box, and one drop line from the bar's midpoint to the
sibling bar.

**Left-to-right** — the identical algorithm with axes swapped. Couples stack
vertically as a pair; generations march right; siblings stack downward. This
makes a 105-person tree scroll *down* on a phone instead of dragging sideways.

**Organic** — trunk at the bottom, radius from the root growing with generation.
Each subtree receives an angular wedge sized by its descendant count, so a large
branch physically occupies more canopy. Branches are tapering curves whose stroke
width follows descendant count, which is what makes it read as a tree rather than
a fan.

Two properties make it survive 105 people:

- Branch wobble is derived from a hash of each person's id, so the shape is
  **stable across rebuilds** rather than reshuffling every time.
- Names are hidden below a zoom threshold and appear as you zoom into a branch.
  Zoomed out it is a picture; zoomed in it is navigable. Leaves stay tappable at
  every zoom level.

### Node rendering

A thumbnail is drawn **only where a photo file exists**. People without a photo
render as a plain box — no grey silhouette placeholders. The chart therefore
starts compact and grows richer as photos are collected.

Node contents: English name, Devanagari name (subject to the existing language
toggle), and the thumbnail when present. Address, born, note and relatives live
on the detail sheet, not in the node.

### Detail sheet

Opened by tapping or clicking any person. Contains: photo (if any), both names,
`born`, `note`, the address keys that are filled, and tappable links to father,
mother, spouse and children. Tapping a relative's name moves the tree to that
person.

Presentation: slides up from the bottom below 768px, docks as a side panel above
it. Same markup, swapped by one media query.

## Mobile

- The view picker is a native `<select>`, which gets the OS picker wheel on iOS
  and Android for free.
- The toolbar collapses to search + view picker on narrow screens; language and
  reset move behind a `⋯` toggle.
- Tap targets are at least 44px. The current 12px collapse circles fail this and
  are enlarged.
- Existing pinch-zoom and one-finger pan are kept as they are.
- Default view: classic on desktop, left-to-right on phones; thereafter the last
  choice is remembered in `localStorage`.
- Every view fits-to-screen on load rather than starting at 1× in a corner.

## Failure modes

| Condition | Behaviour |
|---|---|
| Photo file missing or corrupt | Node renders plain; the `<image>` error handler removes the thumb. No broken-image icon. |
| Photo matches no person id | Build warning. |
| Photo over 150KB | Build warning naming the file and the `sips` command to shrink it. |
| `mother_id` references a non-existent person | Load error. |
| `mother_id` references a non-spouse | Build warning; child renders on the parent's line. |
| Two wives, children without `mother_id` | Children hang from the man's own line. Silent and deliberate. |
| Malformed `address` block or unknown address key | Load error. |
| Organic view, very wide subtree | Wedges narrow but never overlap; readability degrades gracefully. |
| `localStorage` unavailable | Falls back to the width-based default view. |

## Testing

The Python side carries the correctness burden and is unit-tested. The existing
four test files are extended, not replaced:

- **model** — address parsing, unknown-address-key rejection, `mother_id`
  parsing, photo-to-id matching including extension precedence.
- **validate** — `mother_id` referencing a non-existent person (error) and a
  non-spouse (warning); unchanged existing checks still pass.
- **tree** — couple grouping; placeholder synthesis (has children → placeholder,
  no children → none); placeholder gender; children of a multi-wife man without
  `mother_id` attaching to the man; sibling `order` still honoured.
- **render** — the emitted JSON payload carries address, photo path and couple
  structure; the built HTML registers all three view ids.

The three layout functions are visual and are verified by building and opening
the result in a browser at phone and desktop widths, checking each view renders
105 people without overlap and that couple lines land correctly. A JS test runner
is not introduced for three pure functions whose failure mode is "it looks
wrong".

## Out of scope

Deferred to the part C spec:

- Search by name and by address.
- Filtering people by locality / city / state / country.
- Common-ancestor finder for 1–4 selected people.

Also deliberately not built now:

- A private build that strips addresses and photos. The single-YAML-to-single-
  build pipeline keeps this a one-flag change when it is wanted.
- A radial / sunburst view. 105 names on concentric rings are unreadable at phone
  size, and rotated Devanagari is worse.
- Image resizing at build time. A warning with a `sips` command is preferred over
  an image-processing dependency.

The structured address and the already-walkable parent chain are what make part C
cheap when it is picked up.
