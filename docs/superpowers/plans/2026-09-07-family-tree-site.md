# Family Tree Site (couples, addresses, photos, three views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-box, single-layout family tree viewer into a couple-based tree with partial addresses and optional photos, selectable across three views (classic top-down, left-to-right, organic).

**Architecture:** Python (`family_tree/`) owns data loading, validation and tree shape, and emits a JSON payload. The browser code moves out of a Python string into real files under `web/`, which `build.py` inlines back into the single self-contained `family-tree.html`. Each view is one object in a registry (`FT.views.<id>`) exposing `layout` and `drawEdges`; `app.js` owns everything shared and knows about no specific view.

**Tech Stack:** Python 3 + PyYAML (already used), `unittest` (already used), plain browser JavaScript and SVG with no dependencies and no build step beyond `build.py`. No ES modules — they do not load over `file://`, which must keep working.

**Spec:** `docs/superpowers/specs/2026-09-07-family-tree-site-design.md`

## Global Constraints

- Every new YAML field is optional. The existing `family-tree.yaml` (105 people) must stay valid and `python3 build.py` must succeed at the end of every task.
- Output stays a **single** `family-tree.html` with CSS and JS inlined. Photos are the only external asset, referenced as `photos/<id>.<ext>` relative to the HTML.
- No ES modules, no `import`/`export`, no `fetch()`. Browser code is plain scripts sharing one `FT` global so `file://` keeps working.
- No external URLs in the output. `tests/test_render.py::test_is_self_contained_html` enforces this and must keep passing.
- No third-party Python dependencies beyond PyYAML. No image-processing library.
- Address keys are exactly `line`, `locality`, `city`, `state`, `country`. Unknown keys are a load error.
- Photo extensions are exactly `.jpg`, `.jpeg`, `.png`, `.webp`. Photo size warning threshold is 150KB.
- Placeholder spouses are synthesised at render time and never written to YAML. A blood person gets a placeholder **only if they have children**.
- Existing behaviour that must survive: pan, pinch-zoom, collapse/expand, highlight-to-root, the EN / हिं / EN+हिं language toggle, the `order` field for sibling ordering, the "Unlinked" panel, and the existing name search box.
- Run tests with `python3 -m unittest discover -s tests -v`.
- Never add code comments (per the repo owner's standing instruction). Explain in commit messages and in the plan, not in the files.

## Deviation from the spec

The spec's view interface listed a per-view `extent()`. Folded into `app.js` instead: the bounding box is a generic walk over laid-out node positions and is identical for all three views, so three copies would be three places to fix one bug. Views expose `layout`, `drawEdges` and `nodeShape`. Everything else follows the spec as written.

## File Structure

**Created:**
- `web/index.html` — page markup with `/*__CSS__*/`, `/*__APP_JS__*/`, `/*__TREE__*/`, `/*__UNLINKED__*/`, `/*__SUMMARY__*/` placeholders.
- `web/app.css` — all styling.
- `web/app.js` — the `FT` global: payload parsing, node measurement and drawing, pan/zoom, collapse, highlight, detail sheet, language toggle, search, view switching, `FT.init()`.
- `web/views/classic.js` — top-down layout.
- `web/views/horizontal.js` — left-to-right layout.
- `web/views/organic.js` — trunk-and-branches layout.
- `photos/.gitkeep` — the drop folder for `<id>.jpg`.

**Modified:**
- `family_tree/model.py` — `Address`, `Person.address`, `Person.mother_id`, `Person.photo`, `resolve_photos()`.
- `family_tree/validate.py` — `mother_id` existence error and non-spouse warning.
- `family_tree/tree.py` — `wives` → `spouses`, placeholder synthesis, `child_groups`.
- `family_tree/render.py` — becomes thin: payload JSON plus asset inlining.
- `build.py` — call `resolve_photos`, print its warnings.
- `README.md` — document `address`, `mother_id`, `photos/`, and the view picker.
- `tests/test_model.py`, `tests/test_validate.py`, `tests/test_tree.py`, `tests/test_render.py` — extended.

---

### Task 1: Address on the person model

**Files:**
- Modify: `family_tree/model.py`
- Test: `tests/test_model.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `Address` dataclass with fields `line, locality, city, state, country` (all `Optional[str]`, default `None`) and method `is_empty() -> bool`; `Person.address: Address` defaulting to an empty `Address`; module constant `ADDRESS_KEYS: set[str]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_model.py`, inside the file but above the `if __name__` block:

```python
class TestAddress(unittest.TestCase):
    def test_parses_all_address_keys(self):
        people = load_people(
            _write(
                "- id: x\n"
                "  name: X\n"
                "  address:\n"
                "    line: House 214\n"
                "    locality: Sector 14\n"
                "    city: Rohtak\n"
                "    state: Haryana\n"
                "    country: India\n"
            )
        )
        addr = people[0].address
        self.assertEqual(addr.line, "House 214")
        self.assertEqual(addr.locality, "Sector 14")
        self.assertEqual(addr.city, "Rohtak")
        self.assertEqual(addr.state, "Haryana")
        self.assertEqual(addr.country, "India")
        self.assertFalse(addr.is_empty())

    def test_partial_address_is_allowed(self):
        people = load_people(
            _write("- id: x\n  name: X\n  address:\n    city: Rohtak\n")
        )
        self.assertEqual(people[0].address.city, "Rohtak")
        self.assertIsNone(people[0].address.line)

    def test_missing_address_is_empty_not_none(self):
        people = load_people(_write("- id: x\n  name: X\n"))
        self.assertTrue(people[0].address.is_empty())
        self.assertIsNone(people[0].address.city)

    def test_unknown_address_key_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  address:\n    citty: Rohtak\n"))

    def test_non_mapping_address_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  address: Rohtak\n"))

    def test_numeric_address_value_is_stringified(self):
        people = load_people(
            _write("- id: x\n  name: X\n  address:\n    line: 214\n")
        )
        self.assertEqual(people[0].address.line, "214")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_model -v`
Expected: FAIL — `TypeError` on unknown key `address` from the existing `ALLOWED_KEYS` check, or `AttributeError: 'Person' object has no attribute 'address'`.

- [ ] **Step 3: Implement**

In `family_tree/model.py`, change the imports line to include `field`:

```python
from dataclasses import dataclass, field
```

Add `"address"` to `ALLOWED_KEYS`, and add these definitions above `class Person`:

```python
ADDRESS_KEYS = {"line", "locality", "city", "state", "country"}


@dataclass
class Address:
    line: Optional[str] = None
    locality: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None

    def is_empty(self) -> bool:
        return not any([self.line, self.locality, self.city, self.state, self.country])

    def as_dict(self) -> dict:
        return {
            k: v
            for k, v in (
                ("line", self.line),
                ("locality", self.locality),
                ("city", self.city),
                ("state", self.state),
                ("country", self.country),
            )
            if v
        }


def _parse_address(pid: str, raw) -> Address:
    if raw is None:
        return Address()
    if not isinstance(raw, dict):
        raise LoadError("Person '%s' has a non-mapping 'address'" % pid)
    unknown = set(raw) - ADDRESS_KEYS
    if unknown:
        raise LoadError("Person '%s' has unknown address keys: %s" % (pid, sorted(unknown)))
    return Address(**{k: (None if v is None else str(v)) for k, v in raw.items()})
```

Add the field to `Person`:

```python
    address: Address = field(default_factory=Address)
```

In `load_people`, before the `people.append(...)` call:

```python
        address = _parse_address(str(pid), entry.get("address"))
```

and pass `address=address,` inside the `Person(...)` construction.

- [ ] **Step 4: Run the full suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS, all tests including the six new ones.

- [ ] **Step 5: Verify the real data still builds**

Run: `python3 build.py`
Expected: `Wrote family-tree.html` and `People: 105 | Generations: ...`

- [ ] **Step 6: Commit**

```bash
git add family_tree/model.py tests/test_model.py
git commit -m "feat: optional nested address block on a person"
```

---

### Task 2: mother_id field and validation

**Files:**
- Modify: `family_tree/model.py`, `family_tree/validate.py`
- Test: `tests/test_model.py`, `tests/test_validate.py`

**Interfaces:**
- Consumes: `Person`, `Address` from Task 1.
- Produces: `Person.mother_id: Optional[str]`. `validate(people)` raises `ValidationError` for a `mother_id` that names no existing person or names the child itself, and appends a warning string starting `"mother_id"` when it names someone who is not a spouse of that child's parent.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_model.py` above the `if __name__` block:

```python
class TestMotherId(unittest.TestCase):
    def test_mother_id_is_parsed(self):
        people = load_people(
            _write(
                "- id: dad\n  name: Dad\n"
                "- id: kid\n  name: Kid\n  relation: father\n  relation_id: dad\n"
                "  mother_id: mom\n"
            )
        )
        self.assertEqual(people[1].mother_id, "mom")

    def test_missing_mother_id_is_none(self):
        people = load_people(_write("- id: x\n  name: X\n"))
        self.assertIsNone(people[0].mother_id)

    def test_non_scalar_mother_id_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  mother_id: [a, b]\n"))
```

Append to `tests/test_validate.py` above the `if __name__` block:

```python
class TestMotherIdValidation(unittest.TestCase):
    def _base(self):
        return [
            Person(id="dad", name="Dad", gender="male"),
            Person(id="mom", name="Mom", gender="female", relation="wife", relation_id="dad"),
            Person(id="kid", name="Kid", relation="father", relation_id="dad", mother_id="mom"),
        ]

    def test_valid_mother_id_produces_no_warning(self):
        warnings = validate(self._base())
        self.assertEqual([w for w in warnings if w.startswith("mother_id")], [])

    def test_unknown_mother_id_raises(self):
        people = self._base()
        people[2].mother_id = "ghost"
        with self.assertRaises(ValidationError):
            validate(people)

    def test_self_referential_mother_id_raises(self):
        people = self._base()
        people[2].mother_id = "kid"
        with self.assertRaises(ValidationError):
            validate(people)

    def test_mother_id_pointing_at_a_non_spouse_warns(self):
        people = self._base()
        people.append(Person(id="stranger", name="Stranger", gender="female",
                             relation="father", relation_id="dad"))
        people[2].mother_id = "stranger"
        warnings = validate(people)
        self.assertTrue(any(w.startswith("mother_id") for w in warnings))
```

`tests/test_validate.py` already imports `Person`, `validate` and `ValidationError`; confirm those imports are present at the top and add any that are missing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_model tests.test_validate -v`
Expected: FAIL — unknown key `mother_id` raises `LoadError`, and `Person(... mother_id=...)` raises `TypeError`.

- [ ] **Step 3: Implement the model half**

In `family_tree/model.py`, add `"mother_id"` to `ALLOWED_KEYS`, add the field to `Person` directly below `relation_id`:

```python
    mother_id: Optional[str] = None
```

and in `load_people`, before constructing the `Person`:

```python
        mother_id = entry.get("mother_id")
        if mother_id is not None and not isinstance(mother_id, (str, int)):
            raise LoadError("Person '%s' has a non-scalar mother_id" % pid)
```

Pass `mother_id=None if mother_id is None else str(mother_id),` into `Person(...)`.

- [ ] **Step 4: Implement the validation half**

In `family_tree/validate.py`, import the spouse relations:

```python
from family_tree.model import Person, PARENT_RELATIONS, SPOUSE_RELATIONS
```

Inside the existing `for p in people:` loop, after the `relation_id` checks, add:

```python
        if p.mother_id is not None:
            if p.mother_id not in by_id:
                raise ValidationError(
                    "Person '%s' mother_id '%s' does not exist" % (p.id, p.mother_id)
                )
            if p.mother_id == p.id:
                raise ValidationError("Person '%s' is their own mother" % p.id)
```

Then, just above the `warnings = []` line, build the spouse index, and after it append the non-spouse warnings:

```python
    spouses_of = {}
    for p in people:
        if p.relation in SPOUSE_RELATIONS and p.relation_id is not None:
            spouses_of.setdefault(p.relation_id, set()).add(p.id)

    warnings = []
    for p in people:
        if p.mother_id is None or p.relation_id is None:
            continue
        if p.mother_id not in spouses_of.get(p.relation_id, set()):
            warnings.append(
                "mother_id '%s' on '%s' is not a recorded spouse of '%s'; "
                "the child will hang from the parent's own line"
                % (p.mother_id, p.id, p.relation_id)
            )
```

Keep the existing `needs-parent` and `uncertain` warning blocks after this — do not replace the `warnings = []` line twice.

- [ ] **Step 5: Run the full suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS.

- [ ] **Step 6: Verify the real data still builds**

Run: `python3 build.py`
Expected: success, and no `mother_id` warnings (no row uses it yet).

- [ ] **Step 7: Commit**

```bash
git add family_tree/model.py family_tree/validate.py tests/test_model.py tests/test_validate.py
git commit -m "feat: optional mother_id to disambiguate children of multiple wives"
```

---

### Task 3: Photo resolution by filename convention

**Files:**
- Modify: `family_tree/model.py`, `build.py`
- Create: `photos/.gitkeep`
- Test: `tests/test_model.py`

**Interfaces:**
- Consumes: `Person` from Tasks 1–2.
- Produces: `Person.photo: Optional[str]` (a path relative to the built HTML, e.g. `photos/kannu.jpg`) and `resolve_photos(people: List[Person], photo_dir: str) -> List[str]`, which sets `photo` in place and returns warning strings. Module constants `PHOTO_EXTS: tuple`, `PHOTO_MAX_BYTES: int`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_model.py`. Add `import shutil` to the imports at the top of the file, and `resolve_photos` to the `family_tree.model` import line:

```python
class TestResolvePhotos(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.photos = os.path.join(self.dir, "photos")
        os.mkdir(self.photos)

    def tearDown(self):
        shutil.rmtree(self.dir)

    def _touch(self, name, size=10):
        with open(os.path.join(self.photos, name), "wb") as f:
            f.write(b"x" * size)

    def test_matches_photo_to_person_by_id(self):
        self._touch("kannu.jpg")
        people = [Person(id="kannu", name="Kannu")]
        warnings = resolve_photos(people, self.photos)
        self.assertEqual(people[0].photo, "photos/kannu.jpg")
        self.assertEqual(warnings, [])

    def test_person_without_photo_stays_none(self):
        people = [Person(id="kannu", name="Kannu")]
        resolve_photos(people, self.photos)
        self.assertIsNone(people[0].photo)

    def test_all_supported_extensions_match(self):
        for ext in ("jpg", "jpeg", "png", "webp"):
            self._touch("p_%s.%s" % (ext, ext))
        people = [Person(id="p_%s" % e, name=e) for e in ("jpg", "jpeg", "png", "webp")]
        resolve_photos(people, self.photos)
        self.assertTrue(all(p.photo is not None for p in people))

    def test_unrelated_extension_is_ignored(self):
        self._touch("kannu.txt")
        people = [Person(id="kannu", name="Kannu")]
        warnings = resolve_photos(people, self.photos)
        self.assertIsNone(people[0].photo)
        self.assertEqual(warnings, [])

    def test_photo_matching_no_person_warns(self):
        self._touch("nobody.jpg")
        warnings = resolve_photos([Person(id="kannu", name="Kannu")], self.photos)
        self.assertEqual(len(warnings), 1)
        self.assertIn("nobody.jpg", warnings[0])

    def test_duplicate_extensions_pick_one_deterministically_and_warn(self):
        self._touch("kannu.jpg")
        self._touch("kannu.png")
        people = [Person(id="kannu", name="Kannu")]
        warnings = resolve_photos(people, self.photos)
        self.assertEqual(people[0].photo, "photos/kannu.jpg")
        self.assertEqual(len(warnings), 1)
        self.assertIn("kannu.png", warnings[0])

    def test_oversized_photo_warns_with_sips_hint(self):
        self._touch("kannu.jpg", size=200 * 1024)
        warnings = resolve_photos([Person(id="kannu", name="Kannu")], self.photos)
        self.assertEqual(len(warnings), 1)
        self.assertIn("sips", warnings[0])

    def test_missing_photo_dir_is_not_an_error(self):
        self.assertEqual(resolve_photos([Person(id="k", name="K")], "/nonexistent/dir"), [])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_model -v`
Expected: FAIL with `ImportError: cannot import name 'resolve_photos'`.

- [ ] **Step 3: Implement**

In `family_tree/model.py`, add `import os` at the top, add the `photo` field to `Person` (below `address`):

```python
    photo: Optional[str] = None
```

and append at the end of the module:

```python
PHOTO_EXTS = (".jpg", ".jpeg", ".png", ".webp")
PHOTO_MAX_BYTES = 150 * 1024


def resolve_photos(people: List[Person], photo_dir: str) -> List[str]:
    warnings = []
    if not os.path.isdir(photo_dir):
        return warnings
    by_id = {p.id: p for p in people}
    folder = os.path.basename(os.path.normpath(photo_dir))
    for fname in sorted(os.listdir(photo_dir)):
        stem, ext = os.path.splitext(fname)
        if ext.lower() not in PHOTO_EXTS:
            continue
        person = by_id.get(stem)
        if person is None:
            warnings.append("photo '%s' matches no person id" % fname)
            continue
        if person.photo is not None:
            warnings.append(
                "photo '%s' ignored; '%s' is already used for '%s'"
                % (fname, person.photo, stem)
            )
            continue
        person.photo = "%s/%s" % (folder, fname)
        size = os.path.getsize(os.path.join(photo_dir, fname))
        if size > PHOTO_MAX_BYTES:
            warnings.append(
                "photo '%s' is %dKB (over %dKB) — shrink it: sips -Z 400 %s"
                % (fname, size // 1024, PHOTO_MAX_BYTES // 1024, os.path.join(photo_dir, fname))
            )
    return warnings
```

Sorting the directory listing is what makes duplicate-extension resolution deterministic: `kannu.jpg` sorts before `kannu.png`, so the first match wins and later ones warn.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest tests.test_model -v`
Expected: PASS.

- [ ] **Step 5: Wire it into the build**

In `build.py`, add `resolve_photos` to the model import:

```python
from family_tree.model import load_people, resolve_photos, LoadError
```

Add the constant next to the others:

```python
PHOTOS = "photos"
```

and in `main()`, immediately after the `validate` block:

```python
    warnings = warnings + resolve_photos(people, PHOTOS)
```

The existing `for w in warnings:` loop at the end already prints them.

- [ ] **Step 6: Create the drop folder**

```bash
mkdir -p photos && touch photos/.gitkeep
```

- [ ] **Step 7: Run the full suite and the real build**

Run: `python3 -m unittest discover -s tests -v && python3 build.py`
Expected: all tests PASS; build succeeds with no photo warnings (the folder is empty).

- [ ] **Step 8: Commit**

```bash
git add family_tree/model.py build.py photos/.gitkeep tests/test_model.py
git commit -m "feat: match photos to people by photos/<id>.<ext> convention"
```

---

### Task 4: Couples, placeholders and child groups

**Files:**
- Modify: `family_tree/tree.py`, `family_tree/render.py:20-27`
- Test: `tests/test_tree.py`

**Interfaces:**
- Consumes: `Person.mother_id` (Task 2), `PARENT_RELATIONS`, `SPOUSE_RELATIONS`.
- Produces: each tree node is now
  `{"person": Person, "spouses": List[Person], "placeholder": Optional[str], "child_groups": List[dict], "children": List[node]}`.
  `placeholder` is the gender string to draw a dashed box for (`"female"`, `"male"`) or `None` for no placeholder.
  Each child group is `{"spouse_id": Optional[str], "unattributed": bool, "child_ids": List[str]}`.
  The key `wives` is **renamed** to `spouses`; `render.py` is updated in the same task so the suite stays green.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_tree.py` above the `if __name__` block:

```python
class TestCouples(unittest.TestCase):
    def _tree(self, people):
        root, _, _ = build_tree(people)
        return root

    def _by_id(self, node, pid):
        if node["person"].id == pid:
            return node
        for c in node["children"]:
            found = self._by_id(c, pid)
            if found:
                return found
        return None

    def test_spouses_key_replaces_wives(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="w", name="W", gender="female", relation="wife", relation_id="root"),
            Person(id="kid", name="Kid", relation="father", relation_id="root"),
        ])
        self.assertEqual([s.id for s in root["spouses"]], ["w"])
        self.assertNotIn("wives", root)

    def test_placeholder_for_parent_without_recorded_spouse(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="kid", name="Kid", relation="father", relation_id="root"),
        ])
        self.assertEqual(root["placeholder"], "female")

    def test_no_placeholder_when_a_spouse_is_recorded(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="w", name="W", gender="female", relation="wife", relation_id="root"),
            Person(id="kid", name="Kid", relation="father", relation_id="root"),
        ])
        self.assertIsNone(root["placeholder"])

    def test_no_placeholder_for_a_childless_person(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="kid", name="Kid", gender="male", relation="father", relation_id="root"),
        ])
        self.assertIsNone(self._by_id(root, "kid")["placeholder"])

    def test_placeholder_gender_is_opposite_of_blood_person(self):
        root = self._tree([
            Person(id="root", name="Root", gender="female"),
            Person(id="kid", name="Kid", relation="mother", relation_id="root"),
        ])
        self.assertEqual(root["placeholder"], "male")

    def test_placeholder_gender_is_none_when_blood_gender_unknown(self):
        root = self._tree([
            Person(id="root", name="Root"),
            Person(id="kid", name="Kid", relation="father", relation_id="root"),
        ])
        self.assertIsNone(root["placeholder"])

    def test_single_spouse_owns_all_children(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="w", name="W", gender="female", relation="wife", relation_id="root"),
            Person(id="a", name="A", relation="father", relation_id="root"),
            Person(id="b", name="B", relation="father", relation_id="root"),
        ])
        self.assertEqual(root["child_groups"], [
            {"spouse_id": "w", "unattributed": False, "child_ids": ["a", "b"]}
        ])

    def test_no_spouse_groups_children_under_the_placeholder(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="a", name="A", relation="father", relation_id="root"),
        ])
        self.assertEqual(root["child_groups"], [
            {"spouse_id": None, "unattributed": False, "child_ids": ["a"]}
        ])

    def test_two_spouses_split_children_by_mother_id(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="w1", name="W1", gender="female", relation="wife", relation_id="root"),
            Person(id="w2", name="W2", gender="female", relation="wife", relation_id="root"),
            Person(id="a", name="A", relation="father", relation_id="root", mother_id="w1"),
            Person(id="b", name="B", relation="father", relation_id="root", mother_id="w2"),
        ])
        self.assertEqual(root["child_groups"], [
            {"spouse_id": "w1", "unattributed": False, "child_ids": ["a"]},
            {"spouse_id": "w2", "unattributed": False, "child_ids": ["b"]},
        ])

    def test_two_spouses_unattributed_children_form_their_own_group(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="w1", name="W1", gender="female", relation="wife", relation_id="root"),
            Person(id="w2", name="W2", gender="female", relation="wife", relation_id="root"),
            Person(id="a", name="A", relation="father", relation_id="root", mother_id="w1"),
            Person(id="b", name="B", relation="father", relation_id="root"),
        ])
        self.assertEqual(root["child_groups"], [
            {"spouse_id": "w1", "unattributed": False, "child_ids": ["a"]},
            {"spouse_id": "w2", "unattributed": False, "child_ids": []},
            {"spouse_id": None, "unattributed": True, "child_ids": ["b"]},
        ])

    def test_child_groups_preserve_sibling_order(self):
        root = self._tree([
            Person(id="root", name="Root", gender="male"),
            Person(id="w", name="W", gender="female", relation="wife", relation_id="root"),
            Person(id="a", name="A", relation="father", relation_id="root"),
            Person(id="b", name="B", relation="father", relation_id="root", order=1),
        ])
        self.assertEqual(root["child_groups"][0]["child_ids"], ["b", "a"])
```

Then update the existing `test_spouses_attached_to_person` in `TestBuildTree` to read `root["spouses"]` instead of `root["wives"]`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_tree -v`
Expected: FAIL with `KeyError: 'spouses'`.

- [ ] **Step 3: Implement**

Replace the `_node` function in `family_tree/tree.py` with:

```python
OPPOSITE_GENDER = {"male": "female", "female": "male"}


def _child_groups(children, spouses):
    child_ids = [c["person"].id for c in children]
    if not child_ids:
        return []
    if len(spouses) <= 1:
        return [{
            "spouse_id": spouses[0].id if spouses else None,
            "unattributed": False,
            "child_ids": child_ids,
        }]
    groups = [
        {"spouse_id": s.id, "unattributed": False, "child_ids": []}
        for s in spouses
    ]
    by_spouse = {g["spouse_id"]: g for g in groups}
    loose = []
    for c in children:
        group = by_spouse.get(c["person"].mother_id)
        if group is None:
            loose.append(c["person"].id)
        else:
            group["child_ids"].append(c["person"].id)
    if loose:
        groups.append({"spouse_id": None, "unattributed": True, "child_ids": loose})
    return groups


def _node(person, children_by_parent, spouses_by_person):
    spouses = spouses_by_person.get(person.id, [])
    children = [
        _node(child, children_by_parent, spouses_by_person)
        for child in children_by_parent.get(person.id, [])
    ]
    placeholder = None
    if children and not spouses:
        placeholder = OPPOSITE_GENDER.get(person.gender)
    return {
        "person": person,
        "spouses": spouses,
        "placeholder": placeholder,
        "child_groups": _child_groups(children, spouses),
        "children": children,
    }
```

- [ ] **Step 4: Update render.py for the rename**

In `family_tree/render.py`, `_node_json` currently reads `node["wives"]`. Change that block to:

```python
def _node_json(node: dict) -> dict:
    d = _person_json(node["person"])
    d["spouses"] = [_person_json(s) for s in node["spouses"]]
    d["placeholder"] = node["placeholder"]
    d["child_groups"] = node["child_groups"]
    d["children"] = [_node_json(c) for c in node["children"]]
    return d
```

In the JS template inside `render.py`, change the one occurrence of `(n.wives||[])` to `(n.spouses||[])`. This keeps the current viewer working; Task 6 replaces this rendering entirely.

- [ ] **Step 5: Run the full suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS.

- [ ] **Step 6: Verify the real data still builds and renders**

Run: `python3 build.py && open family-tree.html`
Expected: build succeeds; the tree still draws. Nothing looks different yet — no spouse is recorded in the data, and placeholders are not drawn until Task 6.

- [ ] **Step 7: Commit**

```bash
git add family_tree/tree.py family_tree/render.py tests/test_tree.py
git commit -m "feat: group children under couples and mark synthesised placeholder spouses"
```

---

### Task 5: Move the web assets out of render.py

**Files:**
- Create: `web/index.html`, `web/app.css`, `web/app.js`
- Modify: `family_tree/render.py` (delete `_TEMPLATE` entirely)
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: the node payload from Task 4.
- Produces: `render_html(root, unlinked, summary) -> str` unchanged in signature. `web/index.html` carries the placeholders `/*__CSS__*/`, `/*__APP_JS__*/`, `/*__TREE__*/`, `/*__UNLINKED__*/`, `/*__SUMMARY__*/`. Browser code exposes a single global `FT` with `FT.views = {}` and `FT.init()`; `render.py` appends `FT.init();` after all view files.

This task is behaviour-preserving. The viewer must look and act exactly as it does now.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_render.py` above the `if __name__` block:

```python
class TestAssetInlining(unittest.TestCase):
    def test_css_and_js_are_inlined_not_linked(self):
        html = TestRender()._html()
        self.assertNotIn("<link", html)
        self.assertNotIn('src="', html)
        self.assertIn("FT.init();", html)

    def test_no_es_module_syntax(self):
        html = TestRender()._html()
        self.assertNotIn('type="module"', html)
        self.assertNotIn("\nexport ", html)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL — `FT.init();` is not present.

- [ ] **Step 3: Create web/index.html**

Take the `_TEMPLATE` string in `family_tree/render.py` and split it. `web/index.html` gets everything except the CSS body and the JS body:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Family Tree</title>
<style>/*__CSS__*/</style>
</head>
<body>
<div id="toolbar">
  <input id="search" placeholder="Search name, press Enter" autocomplete="off">
  <button data-lang="both">EN+हिं</button>
  <button data-lang="en">EN</button>
  <button data-lang="hi">हिं</button>
  <button id="reset">Reset view</button>
  <span class="summary" id="summary"></span>
</div>
<div id="stage"><svg><g id="viewport"></g></svg></div>
<div id="unlinked"></div>
<script id="tree-data" type="application/json">/*__TREE__*/</script>
<script id="unlinked-data" type="application/json">/*__UNLINKED__*/</script>
<script id="summary-data" type="application/json">/*__SUMMARY__*/</script>
<script>/*__APP_JS__*/</script>
</body>
</html>
```

- [ ] **Step 4: Create web/app.css**

Copy the contents of the `<style>` block in `_TEMPLATE` verbatim (from `html,body{...}` through `#unlinked.empty{display:none;}`) into `web/app.css`. No changes.

- [ ] **Step 5: Create web/app.js**

Copy the body of the existing IIFE in `_TEMPLATE` verbatim into `web/app.js`, changing only the wrapper. The file starts:

```js
var FT = { views: {} };
(function () {
```

then the existing body verbatim, from `var NS="http://www.w3.org/2000/svg";` down to and including the `up.className='empty';` block and its closing `}`, but **excluding** the final `render(); resetView();` line. Then close with:

```js
  FT.init = function () { render(); resetView(); };
})();
```

Moving the two startup calls into `FT.init` is the only behavioural change, and `render.py` calls it after the view files load — which is what lets Tasks 6, 8 and 9 register views before first paint.

- [ ] **Step 6: Rewrite render.py**

Replace the whole of `family_tree/render.py` with:

```python
import json
import os
from typing import List

from family_tree.model import Person
from family_tree.tree import Summary

WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
VIEW_FILES = ("classic.js", "horizontal.js", "organic.js")


def _read(*parts) -> str:
    with open(os.path.join(WEB_DIR, *parts), "r", encoding="utf-8") as f:
        return f.read()


def _script() -> str:
    parts = [_read("app.js")]
    for name in VIEW_FILES:
        if os.path.exists(os.path.join(WEB_DIR, "views", name)):
            parts.append(_read("views", name))
    parts.append("FT.init();")
    return "\n".join(parts)


def _person_json(p: Person) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "name_hi": p.name_hi,
        "gender": p.gender,
        "born": p.born,
        "note": p.note,
        "status": p.status,
        "photo": p.photo,
        "address": p.address.as_dict(),
    }


def _node_json(node: dict) -> dict:
    d = _person_json(node["person"])
    d["spouses"] = [_person_json(s) for s in node["spouses"]]
    d["placeholder"] = node["placeholder"]
    d["child_groups"] = node["child_groups"]
    d["children"] = [_node_json(c) for c in node["children"]]
    return d


def _embed(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def render_html(root: dict, unlinked: List[Person], summary: Summary) -> str:
    return (
        _read("index.html")
        .replace("/*__TREE__*/", _embed(_node_json(root)))
        .replace("/*__UNLINKED__*/", _embed([_person_json(p) for p in unlinked]))
        .replace(
            "/*__SUMMARY__*/",
            _embed({
                "total": summary.total,
                "generations": summary.generations,
                "uncertain": summary.uncertain,
                "needs_parent": summary.needs_parent,
            }),
        )
        .replace("/*__CSS__*/", _read("app.css"))
        .replace("/*__APP_JS__*/", _script())
    )
```

The data placeholders are substituted before the CSS and JS so that nothing in the assets can be mistaken for a data token.

- [ ] **Step 7: Run the full suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS, including the existing `test_is_self_contained_html`.

- [ ] **Step 8: Verify the viewer is unchanged**

Run: `python3 build.py && open family-tree.html`
Expected: identical to before — pan, zoom, collapse circles, search, the three language buttons and the summary line all behave as they did.

- [ ] **Step 9: Commit**

```bash
git add web family_tree/render.py tests/test_render.py
git commit -m "refactor: move viewer css/js out of render.py into web/, inlined at build"
```

---

### Task 6: Couple nodes, thumbnails and the classic view module

**Files:**
- Modify: `web/app.js`, `web/app.css`
- Create: `web/views/classic.js`
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: the payload from Task 5, `FT.views` registry.
- Produces:
  - `FT.state` — `{lang, viewId, collapsed, selected}`.
  - `FT.nodes` — flat array of all nodes; `FT.byId` — id → node; `FT.parentOf` — id → parent node.
  - `FT.SELF_W = 150`, `FT.SPOUSE_W = 120`, `FT.NODE_H = 46`, `FT.BAR = 22`, `FT.H_GAP = 40`, `FT.V_GAP = 100`.
  - `FT.hasPartner(n) -> bool` — true when the node has at least one spouse or a placeholder.
  - `FT.nodeW(n) -> number`, `FT.nodeH(n) -> number` — the couple's bounding size.
  - `FT.jointX(n) -> number`, `FT.jointY(n) -> number` — the point children hang from, relative to the node origin.
  - `FT.drawNode(g, n)` — draws the couple into an SVG `<g>` positioned at the node origin.
  - `FT.visibleChildren(n) -> array`.
  - View contract: `FT.views.<id> = {id, label, nodeShape, layout(root), drawEdges(g, root)}` where `nodeShape` is `'box'` or `'leaf'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_render.py` above the `if __name__` block:

```python
class TestPayload(unittest.TestCase):
    def _html(self):
        people = [
            Person(id="root", name="Root", gender="male"),
            Person(id="w", name="Wife", gender="female", relation="wife", relation_id="root"),
            Person(id="kid", name="Kid", gender="male", relation="father", relation_id="root",
                   address=Address(city="Rohtak", country="India")),
        ]
        root, unlinked, summary = build_tree(people)
        return render_html(root, unlinked, summary)

    def test_payload_carries_address_and_couple_structure(self):
        html = self._html()
        self.assertIn("Rohtak", html)
        self.assertIn("child_groups", html)
        self.assertIn("placeholder", html)

    def test_classic_view_is_registered(self):
        self.assertIn("FT.views.classic", self._html())
```

Add `Address` to the `family_tree.model` import at the top of `tests/test_render.py`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL — `FT.views.classic` is not in the output.

- [ ] **Step 3: Replace the node/layout core in web/app.js**

Delete the existing `layout`, `render` and `textLines` functions and the `NODE_W/NODE_H/H_GAP/V_GAP/WIFE_W/WIFE_H` constants from `web/app.js`, and put this in their place. Keep the existing `el()` helper, the pan/zoom handlers, `highlight()`, `clearHl()`, the language buttons, the summary line and the unlinked panel exactly as they are.

```js
  FT.SELF_W = 150; FT.SPOUSE_W = 120; FT.NODE_H = 46;
  FT.BAR = 22; FT.H_GAP = 40; FT.V_GAP = 100;

  FT.state = { lang: 'both', viewId: 'classic', collapsed: {}, selected: null };
  FT.nodes = []; FT.byId = {}; FT.parentOf = {};

  FT.hasPartner = function (n) {
    return (n.spouses && n.spouses.length > 0) || !!n.placeholder;
  };
  FT.partners = function (n) {
    if (n.spouses && n.spouses.length) return n.spouses;
    if (n.placeholder) return [{ id: null, placeholder: true, gender: n.placeholder }];
    return [];
  };
  FT.nodeW = function (n) {
    return FT.hasPartner(n) ? FT.SELF_W + FT.BAR + FT.SPOUSE_W : FT.SELF_W;
  };
  FT.nodeH = function (n) {
    var rows = Math.max(1, FT.partners(n).length);
    return FT.NODE_H + (rows - 1) * (FT.NODE_H + 6);
  };
  FT.jointX = function (n) {
    return FT.hasPartner(n) ? FT.SELF_W + FT.BAR / 2 : FT.SELF_W / 2;
  };
  FT.jointY = function (n) { return FT.nodeH(n); };

  FT.visibleChildren = function (n) {
    return FT.state.collapsed[n.id] ? [] : (n.children || []);
  };

  FT.label = function (p) {
    var lang = FT.state.lang;
    if (lang === 'en') return [p.name || p.name_hi || p.id];
    if (lang === 'hi') return [p.name_hi || p.name || p.id];
    var out = [];
    if (p.name) out.push(p.name);
    if (p.name_hi) out.push(p.name_hi);
    return out.length ? out : [p.id];
  };

  function textLines(g, lines, cx, y) {
    lines.forEach(function (t, i) {
      var te = el('text', { x: cx, y: y + i * 14, 'text-anchor': 'middle' }, g);
      if (i > 0) te.setAttribute('class', 'hi');
      te.textContent = t;
    });
  }

  function drawBox(parent, p, x, y, w, role) {
    var cls = role + (p.status === 'uncertain' ? ' uncertain' : '') +
      (p.placeholder ? ' placeholder' : '');
    var g = el('g', { 'class': cls, transform: 'translate(' + x + ',' + y + ')' }, parent);
    el('rect', { width: w, height: FT.NODE_H, rx: 6 }, g);
    var textX = w / 2, thumb = 0;
    if (p.photo) {
      thumb = 16;
      var img = el('image', {
        href: p.photo, x: 6, y: FT.NODE_H / 2 - thumb, width: thumb * 2, height: thumb * 2,
        preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'inset(0 round 50%)', 'class': 'thumb'
      }, g);
      img.addEventListener('error', function () { g.removeChild(img); });
      textX = (w + thumb * 2 + 6) / 2;
    }
    textLines(g, p.placeholder ? ['Unknown'] : FT.label(p), textX, 18);
    if (p.status === 'uncertain') {
      var b = el('text', { x: w - 12, y: 15, 'class': 'badge' }, g);
      b.textContent = '?';
    }
    if (!p.placeholder) {
      g.addEventListener('click', function (ev) { ev.stopPropagation(); FT.select(p.id, n); });
    }
    return g;
  }

  FT.drawNode = function (parent, n) {
    var g = el('g', {
      'class': 'node' + (n.status === 'uncertain' ? ' uncertain' : ''),
      'data-id': n.id, transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    var self = el('g', { 'class': 'self' }, g);
    el('rect', { width: FT.SELF_W, height: FT.NODE_H, rx: 6 }, self);
    var textX = FT.SELF_W / 2;
    if (n.photo) {
      var img = el('image', {
        href: n.photo, x: 6, y: FT.NODE_H / 2 - 16, width: 32, height: 32,
        preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'inset(0 round 50%)', 'class': 'thumb'
      }, self);
      img.addEventListener('error', function () { self.removeChild(img); });
      textX = (FT.SELF_W + 38) / 2;
    }
    textLines(self, FT.label(n), textX, 18);
    if (n.status === 'uncertain') {
      var b = el('text', { x: FT.SELF_W - 12, y: 15, 'class': 'badge' }, self);
      b.textContent = '?';
    }
    FT.partners(n).forEach(function (p, i) {
      var y = i * (FT.NODE_H + 6);
      el('line', {
        'class': 'marriage', x1: FT.SELF_W, y1: FT.NODE_H / 2,
        x2: FT.SELF_W + FT.BAR, y2: y + FT.NODE_H / 2
      }, g);
      var sg = drawBox(g, p, FT.SELF_W + FT.BAR, y, FT.SPOUSE_W, 'spouse');
      sg.setAttribute('data-spouse-of', n.id);
    });
    if ((n.children || []).length) {
      var t = el('circle', {
        'class': 'toggle', cx: FT.jointX(n), cy: FT.jointY(n) + 10, r: 11
      }, g);
      t.addEventListener('click', function (ev) {
        ev.stopPropagation();
        FT.state.collapsed[n.id] = !FT.state.collapsed[n.id];
        FT.render();
      });
    }
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };

  FT.render = function () {
    while (vp.firstChild) vp.removeChild(vp.firstChild);
    var view = FT.views[FT.state.viewId] || FT.views.classic;
    view.layout(tree);
    var edges = el('g', {}, vp);
    var nodes = el('g', {}, vp);
    view.drawEdges(edges, tree);
    (function walk(n) {
      FT.drawNode(nodes, n);
      FT.visibleChildren(n).forEach(walk);
    })(tree);
    apply();
  };
```

The `drawBox` click handler references `n`; hoist it by giving `drawBox` a fourth argument. Change its signature to `function drawBox(parent, p, x, y, w, role, owner)` and the handler to `FT.select(p.id, owner)`, passing `n` from `FT.drawNode`. Task 7 defines `FT.select`; until then add this stub near the top of the IIFE so this task's build runs:

```js
  FT.select = function (id) { highlight(id); };
```

Rebuild the index maps after parsing the payload, replacing the existing `parentOf` / `all` walks:

```js
  (function walk(n, parent) {
    FT.nodes.push(n);
    FT.byId[n.id] = n;
    if (parent) FT.parentOf[n.id] = parent;
    (n.children || []).forEach(function (c) { walk(c, n); });
  })(tree, null);
```

Update `highlight()` and the search handler to use `FT.parentOf` and `FT.nodes` instead of the old `parentOf` and `all`, and to clear `FT.state.collapsed[...]` rather than setting `_collapsed`. The search must keep working exactly as before.

- [ ] **Step 4: Create web/views/classic.js**

```js
FT.views.classic = {
  id: 'classic',
  label: 'Classic (top-down)',
  nodeShape: 'box',
  layout: function (root) {
    var cursor = 0;
    (function place(n, depth) {
      n.depth = depth;
      n.y = depth * (FT.NODE_H + FT.V_GAP);
      var kids = FT.visibleChildren(n);
      if (!kids.length) {
        n.x = cursor;
        cursor += FT.nodeW(n) + FT.H_GAP;
        return;
      }
      kids.forEach(function (c) { place(c, depth + 1); });
      var first = kids[0], last = kids[kids.length - 1];
      var span = (first.x + FT.jointX(first) + last.x + FT.jointX(last)) / 2;
      n.x = span - FT.jointX(n);
      if (n.x < cursor - FT.nodeW(n) - FT.H_GAP) n.x = cursor;
      cursor = Math.max(cursor, n.x + FT.nodeW(n) + FT.H_GAP);
    })(root, 0);
  },
  drawEdges: function (g, root) {
    (function walk(n) {
      var kids = FT.visibleChildren(n);
      if (!kids.length) return;
      var jx = n.x + FT.jointX(n), jy = n.y + FT.jointY(n);
      var busY = jy + FT.V_GAP / 2;
      FT.edge(g, 'M' + jx + ',' + jy + ' V' + busY);
      var xs = kids.map(function (c) { return c.x + FT.jointX(c); });
      FT.edge(g, 'M' + Math.min.apply(null, xs) + ',' + busY +
                 ' H' + Math.max.apply(null, xs));
      kids.forEach(function (c) {
        FT.edge(g, 'M' + (c.x + FT.jointX(c)) + ',' + busY +
                   ' V' + c.y, c.id);
        walk(c);
      });
    })(root);
  }
};
```

Add the shared edge helper to `web/app.js` next to `el`:

```js
  FT.edge = function (g, d, childId) {
    var attrs = { 'class': 'edge', d: d };
    if (childId) attrs['data-edge'] = childId;
    return el('path', attrs, g);
  };
```

- [ ] **Step 5: Add the new styles to web/app.css**

Append:

```css
.node .self rect{fill:#eef4fb;stroke:#6b8fb5;stroke-width:1.4px;cursor:pointer;}
.node.hl .self rect{stroke:#d35400;stroke-width:2px;fill:#fdf0e6;}
.node.uncertain .self rect{stroke-dasharray:4 3;fill:#fbf6e6;}
.spouse rect{fill:#fbeef4;stroke:#b56b8f;stroke-width:1.4px;cursor:pointer;}
.spouse.placeholder rect{fill:#faf6f8;stroke-dasharray:4 3;cursor:default;}
.spouse.placeholder text{fill:#999;font-style:italic;}
.spouse text{font-size:11px;fill:#333;pointer-events:none;}
.thumb{pointer-events:none;}
```

Remove the now-dead `.node rect`, `.node.hl rect`, `.node.uncertain rect`, `.wife rect` and `.wife text` rules.

- [ ] **Step 6: Run the suite and rebuild**

Run: `python3 -m unittest discover -s tests -v && python3 build.py && open family-tree.html`
Expected: tests PASS. In the browser every man with children now shows a dashed `Unknown` box beside him, joined by a marriage bar, with children hanging from the joint. Collapse circles are larger. Nothing overlaps.

- [ ] **Step 7: Commit**

```bash
git add web family_tree/render.py tests/test_render.py
git commit -m "feat: couple nodes with placeholder spouses, thumbnails, and a view registry"
```

---

### Task 7: Person detail sheet

**Files:**
- Modify: `web/app.js`, `web/app.css`, `web/index.html`
- Test: manual (browser), plus `tests/test_render.py`

**Interfaces:**
- Consumes: `FT.byId`, `FT.parentOf`, `FT.select` stub from Task 6.
- Produces: `FT.select(id, ownerNode)` — highlights the lineage and opens the sheet; `FT.focus(id)` — centres the tree on a person and selects them; `FT.closeSheet()`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_render.py` above the `if __name__` block:

```python
class TestDetailSheet(unittest.TestCase):
    def test_sheet_markup_is_present(self):
        html = TestPayload()._html()
        self.assertIn('id="sheet"', html)
        self.assertIn("FT.closeSheet", html)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL — `id="sheet"` not present.

- [ ] **Step 3: Add the sheet markup**

In `web/index.html`, immediately after `<div id="unlinked"></div>`:

```html
<div id="sheet" class="hidden">
  <button id="sheet-close" aria-label="Close">×</button>
  <div id="sheet-body"></div>
</div>
```

- [ ] **Step 4: Implement the sheet in web/app.js**

Replace the `FT.select` stub with:

```js
  var ADDRESS_ROWS = [
    ['line', 'Address'], ['locality', 'Locality'], ['city', 'City'],
    ['state', 'State'], ['country', 'Country']
  ];

  function personRef(id) {
    var n = FT.byId[id];
    var label = n ? (FT.label(n)[0]) : id;
    return '<a href="#" data-goto="' + id + '">' + esc(label) + '</a>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function sheetHtml(p, owner) {
    var h = '';
    if (p.photo) h += '<img class="sheet-photo" src="' + esc(p.photo) + '" alt="">';
    if (p.name) h += '<h3>' + esc(p.name) + '</h3>';
    if (p.name_hi) h += '<p class="sheet-hi">' + esc(p.name_hi) + '</p>';
    var rows = '';
    if (p.born) rows += '<dt>Born</dt><dd>' + esc(p.born) + '</dd>';
    ADDRESS_ROWS.forEach(function (r) {
      var v = (p.address || {})[r[0]];
      if (v) rows += '<dt>' + r[1] + '</dt><dd>' + esc(v) + '</dd>';
    });
    if (p.note) rows += '<dt>Note</dt><dd>' + esc(p.note) + '</dd>';
    if (rows) h += '<dl>' + rows + '</dl>';

    var rel = '';
    var parent = FT.parentOf[owner.id];
    if (parent) rel += '<div><span>Parent</span> ' + personRef(parent.id) + '</div>';
    if (owner.spouses && owner.spouses.length) {
      rel += '<div><span>Spouse</span> ' +
        owner.spouses.map(function (s) { return esc(FT.label(s)[0]); }).join(', ') + '</div>';
    } else if (owner.placeholder) {
      rel += '<div><span>Spouse</span> <em>not recorded</em></div>';
    }
    var kids = owner.children || [];
    if (kids.length) {
      rel += '<div><span>Children</span> ' +
        kids.map(function (c) { return personRef(c.id); }).join(', ') + '</div>';
    }
    if (rel) h += '<div class="sheet-rel">' + rel + '</div>';
    return h;
  }

  var sheet = document.getElementById('sheet');
  var sheetBody = document.getElementById('sheet-body');

  FT.closeSheet = function () {
    sheet.classList.add('hidden');
    FT.state.selected = null;
  };

  FT.select = function (id, owner) {
    var node = owner || FT.byId[id];
    if (!node) return;
    var person = node.id === id ? node :
      (node.spouses || []).filter(function (s) { return s.id === id; })[0] || node;
    FT.state.selected = id;
    highlight(node.id);
    sheetBody.innerHTML = sheetHtml(person, node);
    sheet.classList.remove('hidden');
  };

  FT.focus = function (id) {
    var n = FT.byId[id];
    if (!n) return;
    var c = FT.parentOf[id];
    while (c) { FT.state.collapsed[c.id] = false; c = FT.parentOf[c.id]; }
    FT.render();
    var r = stage.getBoundingClientRect();
    tx = r.width / 2 - (n.x + FT.jointX(n)) * scale;
    ty = r.height / 2 - n.y * scale;
    apply();
    FT.select(id, n);
  };

  document.getElementById('sheet-close').addEventListener('click', FT.closeSheet);
  sheetBody.addEventListener('click', function (e) {
    var a = e.target.closest('[data-goto]');
    if (!a) return;
    e.preventDefault();
    FT.focus(a.getAttribute('data-goto'));
  });
```

Change the search handler's final lines to call `FT.focus(hit.id)` rather than duplicating the centring maths.

- [ ] **Step 5: Style the sheet in web/app.css**

Append:

```css
#sheet{position:absolute;right:0;top:0;bottom:0;width:320px;background:#fff;
  border-left:1px solid #ddd;box-shadow:-2px 0 12px rgba(0,0,0,.08);
  padding:16px;overflow:auto;z-index:20;box-sizing:border-box;font-size:13px;}
#sheet.hidden{display:none;}
#sheet-close{position:absolute;right:8px;top:8px;width:44px;height:44px;
  border:0;background:none;font-size:24px;line-height:1;cursor:pointer;color:#666;}
.sheet-photo{display:block;width:96px;height:96px;border-radius:50%;
  object-fit:cover;margin:0 auto 10px;border:1px solid #ccc;}
#sheet h3{margin:0 0 2px;text-align:center;font-size:16px;}
.sheet-hi{margin:0 0 12px;text-align:center;color:#666;}
#sheet dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px;}
#sheet dt{color:#888;}
#sheet dd{margin:0;}
.sheet-rel{margin-top:12px;padding-top:10px;border-top:1px solid #eee;line-height:1.9;}
.sheet-rel span{color:#888;margin-right:4px;}
.sheet-rel a{color:#3a6ea5;text-decoration:none;}
@media (max-width:768px){
  #sheet{right:0;left:0;top:auto;bottom:0;width:auto;max-height:60%;
    border-left:0;border-top:1px solid #ddd;border-radius:12px 12px 0 0;
    box-shadow:0 -2px 12px rgba(0,0,0,.12);}
}
```

- [ ] **Step 6: Run the suite and verify by hand**

Run: `python3 -m unittest discover -s tests -v && python3 build.py && open family-tree.html`
Expected: tests PASS. Clicking any person opens the panel with their names, born, note and relatives; clicking a child's name in the panel moves the tree to them; the × closes it. Narrow the window below 768px and confirm the panel becomes a bottom sheet.

- [ ] **Step 7: Commit**

```bash
git add web tests/test_render.py
git commit -m "feat: person detail sheet with address, photo and relative links"
```

---

### Task 8: Left-to-right view

**Files:**
- Create: `web/views/horizontal.js`
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: `FT.nodeW`, `FT.nodeH`, `FT.visibleChildren`, `FT.edge` from Task 6.
- Produces: `FT.views.horizontal`.

In this view a couple stacks vertically — the blood person on top, partner below — so `layout` overrides the node's own box arrangement by setting `n.stacked = true`, which `FT.drawNode` honours.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_render.py`:

```python
class TestHorizontalView(unittest.TestCase):
    def test_horizontal_view_is_registered(self):
        self.assertIn("FT.views.horizontal", TestPayload()._html())
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL.

- [ ] **Step 3: Teach drawNode about stacking**

In `web/app.js`, add near the geometry helpers:

```js
  FT.stacked = function (n) {
    var view = FT.views[FT.state.viewId];
    return !!(view && view.stack);
  };
```

and change `FT.nodeW`, `FT.nodeH`, `FT.jointX`, `FT.jointY` to branch on it:

```js
  FT.nodeW = function (n) {
    if (FT.stacked(n)) return FT.SELF_W;
    return FT.hasPartner(n) ? FT.SELF_W + FT.BAR + FT.SPOUSE_W : FT.SELF_W;
  };
  FT.nodeH = function (n) {
    var rows = Math.max(1, FT.partners(n).length);
    if (FT.stacked(n)) return FT.NODE_H * (1 + (FT.hasPartner(n) ? rows : 0)) + 4;
    return FT.NODE_H + (rows - 1) * (FT.NODE_H + 6);
  };
  FT.jointX = function (n) {
    if (FT.stacked(n)) return FT.SELF_W;
    return FT.hasPartner(n) ? FT.SELF_W + FT.BAR / 2 : FT.SELF_W / 2;
  };
  FT.jointY = function (n) {
    return FT.stacked(n) ? FT.nodeH(n) / 2 : FT.nodeH(n);
  };
```

In `FT.drawNode`, wrap the partner loop so stacked mode places partners below instead of beside:

```js
    FT.partners(n).forEach(function (p, i) {
      if (FT.stacked(n)) {
        var y = FT.NODE_H * (i + 1) + 4;
        el('line', { 'class': 'marriage', x1: FT.SELF_W / 2, y1: FT.NODE_H,
                     x2: FT.SELF_W / 2, y2: y }, g);
        drawBox(g, p, 0, y, FT.SELF_W, 'spouse', n);
      } else {
        var yy = i * (FT.NODE_H + 6);
        el('line', { 'class': 'marriage', x1: FT.SELF_W, y1: FT.NODE_H / 2,
                     x2: FT.SELF_W + FT.BAR, y2: yy + FT.NODE_H / 2 }, g);
        drawBox(g, p, FT.SELF_W + FT.BAR, yy, FT.SPOUSE_W, 'spouse', n);
      }
    });
```

Move the collapse toggle to `cx: FT.jointX(n) + (FT.stacked(n) ? 14 : 0)`, `cy: FT.stacked(n) ? FT.jointY(n) : FT.jointY(n) + 10`.

- [ ] **Step 4: Create web/views/horizontal.js**

```js
FT.views.horizontal = {
  id: 'horizontal',
  label: 'Left to right',
  nodeShape: 'box',
  stack: true,
  layout: function (root) {
    var cursor = 0;
    var COL = FT.SELF_W + 90;
    (function place(n, depth) {
      n.depth = depth;
      n.x = depth * COL;
      var kids = FT.visibleChildren(n);
      if (!kids.length) {
        n.y = cursor;
        cursor += FT.nodeH(n) + 18;
        return;
      }
      kids.forEach(function (c) { place(c, depth + 1); });
      var first = kids[0], last = kids[kids.length - 1];
      n.y = (first.y + FT.jointY(first) + last.y + FT.jointY(last)) / 2 - FT.jointY(n);
      cursor = Math.max(cursor, n.y + FT.nodeH(n) + 18);
    })(root, 0);
  },
  drawEdges: function (g, root) {
    (function walk(n) {
      var kids = FT.visibleChildren(n);
      if (!kids.length) return;
      var jx = n.x + FT.nodeW(n), jy = n.y + FT.jointY(n);
      var busX = jx + 45;
      FT.edge(g, 'M' + jx + ',' + jy + ' H' + busX);
      var ys = kids.map(function (c) { return c.y + FT.jointY(c); });
      FT.edge(g, 'M' + busX + ',' + Math.min.apply(null, ys) +
                 ' V' + Math.max.apply(null, ys));
      kids.forEach(function (c) {
        FT.edge(g, 'M' + busX + ',' + (c.y + FT.jointY(c)) + ' H' + c.x, c.id);
        walk(c);
      });
    })(root);
  }
};
```

- [ ] **Step 5: Run the suite and check by hand**

Run: `python3 -m unittest discover -s tests -v && python3 build.py`
Then in the browser console: `FT.state.viewId='horizontal'; FT.render();`
Expected: root at the left, generations marching right, couples stacked vertically, no overlaps across all 105 people.

- [ ] **Step 6: Commit**

```bash
git add web tests/test_render.py
git commit -m "feat: left-to-right view with vertically stacked couples"
```

---

### Task 9: Organic tree view

**Files:**
- Create: `web/views/organic.js`
- Modify: `web/app.js`, `web/app.css`
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: `FT.visibleChildren`, `FT.edge`.
- Produces: `FT.views.organic` with `nodeShape: 'leaf'`. `FT.drawNode` renders a leaf circle instead of boxes when the active view's `nodeShape` is `'leaf'`. `FT.hash01(str) -> number` in `[0,1)` — a stable FNV-1a hash so the tree's shape does not change between rebuilds.

- [ ] **Step 1: Write the failing test**

```python
class TestOrganicView(unittest.TestCase):
    def test_organic_view_is_registered(self):
        self.assertIn("FT.views.organic", TestPayload()._html())
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL.

- [ ] **Step 3: Add the hash and leaf rendering to web/app.js**

```js
  FT.hash01 = function (s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  };

  FT.leafCount = function (n) {
    var kids = FT.visibleChildren(n);
    if (!kids.length) return 1;
    return kids.reduce(function (sum, c) { return sum + FT.leafCount(c); }, 0);
  };
```

At the top of `FT.drawNode`, branch on the shape:

```js
    var view = FT.views[FT.state.viewId];
    if (view && view.nodeShape === 'leaf') return FT.drawLeaf(parent, n);
```

and add:

```js
  FT.drawLeaf = function (parent, n) {
    var g = el('g', {
      'class': 'leafnode' + (FT.hasPartner(n) ? ' paired' : ''),
      'data-id': n.id, transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    var r = 7 + Math.min(6, Math.sqrt(FT.leafCount(n)));
    el('ellipse', { rx: r, ry: r * 0.72, 'class': 'leaf' }, g);
    if (FT.hasPartner(n)) {
      el('ellipse', { cx: r * 1.5, rx: r * 0.8, ry: r * 0.6, 'class': 'leaf spouseleaf' }, g);
    }
    var t = el('text', { y: -r - 5, 'text-anchor': 'middle', 'class': 'leaflabel' }, g);
    t.textContent = FT.label(n)[0];
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };
```

Labels are hidden at low zoom by a class on the stage, set in `apply()`:

```js
    stage.classList.toggle('hide-labels', scale < 1.2);
```

- [ ] **Step 4: Create web/views/organic.js**

```js
FT.views.organic = {
  id: 'organic',
  label: 'Tree (organic)',
  nodeShape: 'leaf',
  layout: function (root) {
    var SPREAD = 150 * Math.PI / 180;
    var TRUNK = 120;
    var RING = 115;
    (function place(n, a0, a1, depth) {
      n.depth = depth;
      var mid = (a0 + a1) / 2;
      var wobble = (FT.hash01(n.id) - 0.5) * (a1 - a0) * 0.25;
      var ang = mid + wobble;
      var r = TRUNK + depth * RING;
      n.ang = ang;
      n.x = r * Math.sin(ang);
      n.y = -r * Math.cos(ang);
      var kids = FT.visibleChildren(n);
      if (!kids.length) return;
      var total = kids.reduce(function (s, c) { return s + FT.leafCount(c); }, 0);
      var cur = a0;
      kids.forEach(function (c) {
        var share = (a1 - a0) * (FT.leafCount(c) / total);
        place(c, cur, cur + share, depth + 1);
        cur += share;
      });
    })(root, -SPREAD / 2, SPREAD / 2, 0);
  },
  drawEdges: function (g, root) {
    FT.edge(g, 'M0,40 L' + root.x + ',' + root.y).setAttribute(
      'class', 'branch trunk'
    );
    (function walk(n) {
      FT.visibleChildren(n).forEach(function (c) {
        var cx = n.x + (c.x - n.x) * 0.35 + Math.sin(n.ang) * 20;
        var cy = n.y + (c.y - n.y) * 0.35 - Math.cos(n.ang) * 20;
        var p = FT.edge(g,
          'M' + n.x + ',' + n.y + ' Q' + cx + ',' + cy + ' ' + c.x + ',' + c.y, c.id);
        p.setAttribute('class', 'branch');
        p.setAttribute('stroke-width', Math.max(1.5, Math.sqrt(FT.leafCount(c)) * 1.8));
        walk(c);
      });
    })(root);
  }
};
```

- [ ] **Step 5: Style it in web/app.css**

```css
.branch{fill:none;stroke:#8b6b4a;stroke-linecap:round;}
.branch.trunk{stroke-width:16px;}
.branch.hl{stroke:#d35400;}
.leaf{fill:#cfe3c9;stroke:#8aa87f;stroke-width:1px;cursor:pointer;}
.leaf.spouseleaf{fill:#f0dbe6;stroke:#b56b8f;}
.leaflabel{font-size:11px;fill:#2c4a2c;pointer-events:none;}
#stage.hide-labels .leaflabel{display:none;}
```

- [ ] **Step 6: Run the suite and check by hand**

Run: `python3 -m unittest discover -s tests -v && python3 build.py`
In the console: `FT.state.viewId='organic'; FT.render();`
Expected: a trunk at the bottom with branches fanning upward, thicker where more descendants hang off them. Names vanish when zoomed out below 1.2× and reappear on zoom-in. Rebuild twice and confirm the shape is **identical** — that is what the stable hash buys.

- [ ] **Step 7: Commit**

```bash
git add web tests/test_render.py
git commit -m "feat: organic trunk-and-branches view with stable layout"
```

---

### Task 10: View picker, mobile toolbar and view defaults

**Files:**
- Modify: `web/index.html`, `web/app.js`, `web/app.css`
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: all three registered views.
- Produces: `FT.setView(id)` — switches view, persists to `localStorage` under key `ft-view`, re-renders and fits. `FT.fit()` — computes the bounding box over laid-out nodes and sets `tx/ty/scale` so everything is visible.

- [ ] **Step 1: Write the failing test**

```python
class TestViewPicker(unittest.TestCase):
    def test_picker_and_all_three_labels_present(self):
        html = TestPayload()._html()
        self.assertIn('id="view-picker"', html)
        self.assertIn("Classic (top-down)", html)
        self.assertIn("Left to right", html)
        self.assertIn("Tree (organic)", html)
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL.

- [ ] **Step 3: Add the picker to web/index.html**

Replace the toolbar block with:

```html
<div id="toolbar">
  <select id="view-picker" aria-label="Tree view"></select>
  <input id="search" placeholder="Search name, press Enter" autocomplete="off">
  <button id="more" aria-label="More options">⋯</button>
  <span id="extras">
    <button data-lang="both">EN+हिं</button>
    <button data-lang="en">EN</button>
    <button data-lang="hi">हिं</button>
    <button id="reset">Fit to screen</button>
  </span>
  <span class="summary" id="summary"></span>
</div>
```

- [ ] **Step 4: Implement the picker and fit in web/app.js**

```js
  var VIEW_ORDER = ['classic', 'horizontal', 'organic'];

  FT.setView = function (id) {
    if (!FT.views[id]) return;
    FT.state.viewId = id;
    try { localStorage.setItem('ft-view', id); } catch (e) {}
    document.getElementById('view-picker').value = id;
    FT.render();
    FT.fit();
  };

  FT.fit = function () {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (function walk(n) {
      var w = FT.views[FT.state.viewId].nodeShape === 'leaf' ? 30 : FT.nodeW(n);
      var h = FT.views[FT.state.viewId].nodeShape === 'leaf' ? 30 : FT.nodeH(n);
      minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w);
      minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h);
      FT.visibleChildren(n).forEach(walk);
    })(tree);
    var r = stage.getBoundingClientRect();
    var pad = 40;
    scale = Math.min(
      (r.width - pad * 2) / Math.max(1, maxX - minX),
      (r.height - pad * 2) / Math.max(1, maxY - minY)
    );
    scale = Math.max(0.05, Math.min(scale, 1.2));
    tx = pad - minX * scale + (r.width - pad * 2 - (maxX - minX) * scale) / 2;
    ty = pad - minY * scale + (r.height - pad * 2 - (maxY - minY) * scale) / 2;
    apply();
  };

  (function initPicker() {
    var sel = document.getElementById('view-picker');
    VIEW_ORDER.forEach(function (id) {
      if (!FT.views[id]) return;
      var o = document.createElement('option');
      o.value = id;
      o.textContent = FT.views[id].label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { FT.setView(sel.value); });
  })();

  document.getElementById('more').addEventListener('click', function () {
    document.getElementById('toolbar').classList.toggle('show-extras');
  });
```

Point the reset button at `FT.fit` instead of `resetView`, and delete `resetView`.

Replace the body of `FT.init` with:

```js
  FT.init = function () {
    var saved = null;
    try { saved = localStorage.getItem('ft-view'); } catch (e) {}
    var preferred = saved && FT.views[saved]
      ? saved
      : (window.innerWidth < 768 ? 'horizontal' : 'classic');
    FT.setView(preferred);
  };
```

- [ ] **Step 5: Style the responsive toolbar in web/app.css**

```css
#view-picker{padding:8px;font-size:16px;min-height:44px;max-width:180px;}
#toolbar button{min-height:44px;min-width:44px;}
#more{display:none;}
.toggle{fill:#6b8fb5;cursor:pointer;}
@media (max-width:768px){
  #more{display:inline-block;}
  #extras{display:none;width:100%;}
  #toolbar.show-extras #extras{display:flex;gap:8px;flex-wrap:wrap;}
  #toolbar .summary{font-size:11px;}
}
```

- [ ] **Step 6: Run the suite and check both widths**

Run: `python3 -m unittest discover -s tests -v && python3 build.py && open family-tree.html`
Expected: tests PASS. The dropdown switches between all three views and each fits to the window on switch. Reload and confirm the last view is remembered. Narrow to phone width: the picker and search stay visible, `⋯` reveals the language buttons, and the default on a fresh profile is Left to right.

- [ ] **Step 7: Commit**

```bash
git add web tests/test_render.py
git commit -m "feat: view picker, fit-to-screen, and a responsive mobile toolbar"
```

---

### Task 11: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`
- Test: full suite plus manual browser check

- [ ] **Step 1: Update README.md**

Add to the "Adding a person" field list, after `order`:

```markdown
  mother_id: wife_id       # optional: only when the father has 2+ recorded wives
  address:                 # optional, all keys optional
    line: House 214
    locality: Sector 14
    city: Rohtak
    state: Haryana
    country: India
```

Add two new sections before "## Viewer":

```markdown
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
```

Replace the "## Viewer" paragraph with one that documents the view picker (Classic / Left to right / Tree (organic)), the detail sheet on tap, and that the last-used view is remembered.

Update "## Limitations" — drop the stale "many wives on one man may render awkwardly" line, and replace it with:

```markdown
- The organic view is a picture first: names appear only as you zoom in past 1.2×.
- Search matches names only. Address search, address filters and the
  common-ancestor finder are a separate follow-up.
```

- [ ] **Step 2: Run the whole suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS, with no skipped tests.

- [ ] **Step 3: Rebuild and verify the real 105-person tree**

Run: `python3 build.py && open family-tree.html`

Check every item:
- Build prints `People: 105` and no unexpected warnings.
- Classic view: every parent shows a dashed `Unknown` partner; leaf people show none.
- Left to right: couples stack; scrolling down reaches the youngest generation.
- Organic: trunk and branches; labels appear on zoom-in; the shape is identical after a second `python3 build.py`.
- Tap a person: the sheet opens with their details; tapping a child's name moves the tree.
- Language buttons still switch EN / हिं / EN+हिं in every view.
- Search still jumps to a name and highlights the line to the root.
- Collapse circles still collapse and expand.
- The Unlinked panel still lists `needs-parent` people.

- [ ] **Step 4: Verify a photo end-to-end**

```bash
cp /System/Library/Desktop\ Pictures/*.heic /tmp/ 2>/dev/null || true
sips -s format jpeg -Z 300 "$(ls ~/Pictures/* 2>/dev/null | head -1)" --out photos/sevakram.jpg
python3 build.py && open family-tree.html
```

Expected: a round thumbnail on Sevak Ram's node and a large one in his detail sheet. Then `rm photos/sevakram.jpg` and rebuild to confirm the node renders plain again with no broken-image icon.

- [ ] **Step 5: Verify it still works offline from file://**

Open `family-tree.html` directly by double-clicking it in Finder with wifi off.
Expected: everything works except photos, which are relative paths and also work.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: wives, mother_id, addresses, photos and the view picker"
```

---

## Self-Review

**Spec coverage:** Address block → Task 1. Photos by convention with both warnings → Task 3. Couples, `mother_id`, placeholder rule → Tasks 2 and 4. Web asset extraction and the no-ES-modules constraint → Task 5. View interface and registry, thumbnail-only nodes → Task 6. Detail sheet with relatives and responsive presentation → Task 7. The three views → Tasks 6, 8, 9. Native `<select>` picker, 44px targets, collapsing toolbar, `localStorage` default, fit-to-screen → Task 10. Every failure-mode row is covered: photo error handler (Task 6), photo warnings (Task 3), `mother_id` error and warning (Task 2), unattributed children (Task 4), address load error (Task 1), `localStorage` fallback (Task 10). Testing section → the extended test files across Tasks 1–10 plus the manual pass in Task 11.

**Placeholder scan:** No TBDs. Every code step carries the actual code. The one instruction that references existing content rather than repeating it is Task 5's verbatim move of the current CSS and JS, which is a mechanical copy of a file already in the repo.

**Type consistency:** `spouses` (not `wives`) is used from Task 4 onward in `tree.py`, `render.py`, tests and JS. `placeholder` is a gender string or `None` everywhere. `child_groups` entries carry exactly `spouse_id`, `unattributed`, `child_ids` in Task 4's tests, Task 4's implementation and Task 6's consumer. `FT.nodeW/nodeH/jointX/jointY` are defined in Task 6 and redefined once in Task 8 to add stacking — both views and `FT.fit` in Task 10 call the same four names. `FT.select(id, owner)` is stubbed in Task 6 and implemented in Task 7 with the same signature.
