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
  born: "free text"        # optional
  note: "free text"        # optional
  status: uncertain        # optional: uncertain | needs-parent
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

## Viewer

Open `family-tree.html` in any browser (works offline). On desktop: drag to pan, scroll
to zoom. On mobile/touch: one finger pans, two fingers pinch-zoom. Tap/click a person to
highlight their line up to the root, tap the small circle under a node to collapse/expand,
use the search box (press Enter) to jump to a name, and the EN / हिं / EN+हिं buttons to
switch languages. The toolbar wraps to fit small screens.

## Limitations

- Many wives on one man, or a `needs-parent` person who has their own children, may
  render awkwardly. These are visual edge cases; the data is still correct.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
