# Family Tree

The tree data lives in `family-tree.yaml` (the source of truth). The interactive
viewer `family-tree.html` is generated from it.

## Rebuild after editing

```bash
python3 build.py
open family-tree.html
```

## Adding a person

Append one entry to `family-tree.yaml`. Each person has **one relation** to another
person — a `relation` type plus the `relation_id` it points to:

```yaml
- id: unique_slug          # required, lowercase, _-separated
  name: English Name       # English name (name and/or name_hi required)
  name_hi: देवनागरी नाम      # Devanagari name
  gender: male             # male | female (optional but recommended)
  relation: father         # father | mother | husband | wife
  relation_id: parent_id   # the id of the related person
  order: 1                 # optional: sibling order, lower = further left
  born: "free text"        # optional
  life: deceased           # optional: living | deceased (omitted = not known)
  died: "1961"             # optional, free text like born
  note: "free text"        # optional
  status: uncertain        # optional: uncertain | needs-parent
  address:                 # optional, all keys optional
    line: House 214
    locality: Sector 14
    city: Rohtak
    state: Haryana
    country: India
```

- `relation: father` or `mother` → `relation_id` is this person's **parent** (they hang
  under that parent in the tree). Link a child to whichever parent is *in* the tree
  (the blood descendant) — for the male line that's the `father`.
- `relation: husband` or `wife` → `relation_id` is this person's **spouse** (they married
  in and render beside their spouse).
- `relation` and `relation_id` must both be present or both absent. The single root
  ancestor `sevakram` has neither.
- `status: uncertain` = the name can't be read yet. `status: needs-parent` = the name is
  known but the parent is not (they also have no relation); the viewer parks them in an
  "Unlinked" panel.
- `order`: to arrange a person's children left-to-right, give each child an `order` number
  (lower = further left). Children without `order` appear to the right in file order.

## Recording a wife

A wife is a normal person entry whose `relation` points at her husband:

```yaml
- id: chandgiram_wife
  name_hi: गीता देवी
  gender: female
  relation: wife
  relation_id: chandgiram
```

Children stay linked to the blood parent only. Any parent who has children but no
recorded spouse renders a dashed **Unknown** box beside them — that placeholder is
drawn by the viewer and is never written to the YAML. A person with no children
gets no placeholder.

**One spouse per person.** Every child has exactly one father and one mother, and
each person has at most one recorded spouse. If you accidentally give the same
person two wives — usually a copy-paste with the wrong `relation_id` — the build
**stops** with an error naming the person and both spouses, so the mistake cannot
slip through quietly.

## Recording a death — or that someone is living

Two more optional fields, written the same free-text way as `born`:

```yaml
  life: deceased           # optional: living | deceased (omitted = not known)
  died: "1961"             # optional, free text like born
```

What shows up on the card depends on which of `born`, `life` and `died` you filled in:

| You wrote | The card shows |
|---|---|
| `born: 1884`, `life: deceased`, `died: "1961"` | `1884–1961` |
| `born: 1884`, `life: deceased` (no `died`) | `1884–Deceased` |
| `born: 1992`, `life: living` | `1992–Living`, with a small green dot |
| `born: 1884` only, no `life`/`died` | `b. 1884` |
| `died: "1961"` only, no `born` | `d. 1961` |
| none of the three | just the Devanagari name, or nothing at all |

The same rule shows up everywhere a person appears — the card, the organic tree's leaf, and the
detail sheet — and a deceased person's name and rail are always drawn a little dimmer than a living
one's, so a glance at the tree tells you who is still living.

**Leaving `life` out entirely means "we don't know" — it never means "living".** This is
deliberate. Most of the 105 people in this file are ancestors who are certainly no longer living,
but nobody recorded when they died. If a missing `life` were treated as "living", every one of them
would show up on the tree as alive today, and a newly added relative who has in fact passed away
would silently render as living until someone happened to notice. So when in doubt, write nothing —
the card will simply not claim to know, rather than guess wrong.

Two mistakes are easy to make here, and they are **not** treated the same way:

- **Quiet warning.** Writing `life: living` on someone who also has a `died` date does not stop the
  build. `python3 build.py` prints a warning line, but `family-tree.html` is still written — and the
  death date wins: that person renders as deceased regardless of the `living` flag. If you don't read
  the build's terminal output, you will not see this warning, so it's worth a habit of glancing at it
  after editing these fields.
- **Loud error.** Writing any `life` value other than `living` or `deceased` (a typo, a stray capital
  letter, anything else) **stops the build**. No new `family-tree.html` is written until you fix it,
  so this one you cannot miss.

## Photos

Drop a file into `photos/` named after the person's id — `photos/chandgiram.jpg`.
No YAML change is needed. Supported: `.jpg`, `.jpeg`, `.png`, `.webp`. A small
round thumbnail appears in that person's node; everyone else renders plain.

Keep photos under 150KB or `build.py` will warn and print the command to shrink
them:

```bash
sips -Z 400 photos/chandgiram.jpg
```

## Viewer

Open `family-tree.html` in any browser (works offline). Pick a layout from the view
picker in the toolbar: **Classic (top-down)**, **Left to right**, or **Tree (organic)**
— a hand-drawn-looking trunk-and-branches picture. Your last choice is remembered for
next time.

On desktop: drag to pan, scroll to zoom. On mobile/touch: one finger pans, two fingers
pinch-zoom. Tap/click a person to open a detail sheet with their photo, address and
tappable links to their parent, spouse(s) and children — tapping one of those links
closes the sheet and moves the tree to that person. Tap the small circle under a node
to collapse/expand, use the search box (press Enter) to jump to a name, and the
EN / हिं / EN+हिं buttons to switch languages. The toolbar wraps to fit small screens.

## Limitations

- The organic view is a picture first: names appear only as you zoom in past 1.2×.
  It also gets crowded as the family grows: today's tree has 47 people with no
  recorded children (its "leaves"), and the leaves and their labels stay clear of
  each other, with the two closest still 4.5px apart. That holds up to about 57
  such people, but somewhere around 62 the leaves in the crown of the tree start
  to touch and their labels start to overlap. That is only about 25-30% more
  childless people than today, not 25-30% more people overall — most new entries
  will have children and won't push toward that ceiling. Classic and Left to right
  are unaffected; they lay everyone out on a strict grid instead of a picture.
- Even today, a few names in the organic view sit close enough to overlap: 6 pairs
  of names, touching 9 of the 105 people, all in crowded parts of the crown.
  Zooming in further does not pull them apart, because the labels scale with the
  tree instead of staying a fixed size.
- Search matches names only. Address search, address filters and the
  common-ancestor finder are a separate follow-up.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
