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
  note: "free text"        # optional
  status: uncertain        # optional: uncertain | needs-parent
  mother_id: wife_id       # optional: only when the father has 2+ recorded wives
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

If a man has two or more recorded wives, add `mother_id` to each child so the
viewer knows which marriage they belong to. Children left without `mother_id`
hang from the man's own line.

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

- Children of a man with two or more wives all hang from one shared joint below him,
  even when each child's `mother_id` correctly records which wife is their mother.
  The data is right; no view yet draws the children split out under the wife they
  actually belong to.
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
