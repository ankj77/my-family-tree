# Family Tree

The tree data lives in `family-tree.yaml` (the source of truth). The interactive
viewer `family-tree.html` is generated from it.

## Rebuild after editing

```bash
python3 build.py
open family-tree.html
```

## Adding a person

Append one entry to `family-tree.yaml`:

```yaml
- id: unique_slug          # required, lowercase, _-separated
  name: English Name       # English name (name and/or name_hi required)
  name_hi: देवनागरी नाम      # Devanagari name
  father: parent_id        # for a blood descendant
  # OR
  spouse: husband_id       # for a wife (married in)
  born: "free text"        # optional
  note: "free text"        # optional
  status: uncertain        # optional: uncertain | needs-parent
```

- Every person attaches by exactly one of `father` or `spouse` (the root ancestor
  `sevakram` has neither).
- `status: uncertain` = the name can't be read yet. `status: needs-parent` = the
  name is known but the father is not; the viewer parks them in an "Unlinked" panel.

## Viewer

Open `family-tree.html` in any browser (works offline). Drag to pan, scroll to zoom,
click a person to highlight their line up to the root, click the small circle under a
node to collapse/expand, use the search box (press Enter) to jump to a name, and the
EN / हिं / EN+हिं buttons to switch languages.

## Limitations

- Many wives on one man, or a `needs-parent` person who has their own children, may
  render awkwardly. These are visual edge cases; the data is still correct.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
