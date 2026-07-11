# Family Tree Digitization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a photographed paper family tree into a hand-editable YAML data file plus a self-contained interactive HTML tree generated from it.

**Architecture:** A small Python package (`family_tree/`) with four focused modules — load YAML into `Person` records, validate them, assemble a father→children tree (wives attached to husbands), and render a single offline HTML viewer. A `build.py` CLI wires them together. Data lives in `family-tree.yaml`; running `python3 build.py` regenerates `family-tree.html`.

**Tech Stack:** Python 3.9 (stdlib `dataclasses`, `json`, `unittest`), PyYAML for parsing, vanilla JavaScript + inline SVG for the viewer (no CDN, no framework).

## Global Constraints

- Python **3.9** compatible — no `match` statements, no `X | Y` type unions in annotations.
- Tests use stdlib **`unittest`** only (pytest is not installed). Run from the project root.
- Only third-party dependency is **PyYAML** (already installed). No others.
- Everything is **UTF-8**; Devanagari must round-trip. Always open files with `encoding="utf-8"`; `json.dumps(..., ensure_ascii=False)`.
- The generated HTML must be **fully self-contained and offline** — no network, no CDN, no external JS. Vanilla JS + SVG only.
- Names stored **as written**: `name` (English) and/or `name_hi` (Devanagari); at least one required.
- Exactly **one root**: `sevakram`. Blood descendants use `father:`; wives use `spouse:`. A person has one of `father`/`spouse`, never both (root has neither).
- Status flags: `uncertain` (name unreadable) and `needs-parent` (father unknown).
- Run all tests from project root: `cd /Users/ankurjain/Workspace/personal/family-tree`.

---

### Task 1: Package scaffold + `Person` model + `load_people`

**Files:**
- Create: `family_tree/__init__.py` (empty)
- Create: `tests/__init__.py` (empty)
- Create: `family_tree/model.py`
- Test: `tests/test_model.py`

**Interfaces:**
- Produces:
  - `class Person` — dataclass, fields: `id: str`, `name: Optional[str]=None`, `name_hi: Optional[str]=None`, `father: Optional[str]=None`, `spouse: Optional[str]=None`, `born: Optional[str]=None`, `note: Optional[str]=None`, `status: Optional[str]=None`; method `display_name() -> str`.
  - `def load_people(path: str) -> List[Person]`
  - `class LoadError(Exception)`

- [ ] **Step 1: Create empty package markers**

```bash
cd /Users/ankurjain/Workspace/personal/family-tree
mkdir -p family_tree tests
touch family_tree/__init__.py tests/__init__.py
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_model.py`:

```python
import os
import tempfile
import unittest

from family_tree.model import Person, load_people, LoadError


def _write(text):
    fd, path = tempfile.mkstemp(suffix=".yaml")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    return path


class TestPerson(unittest.TestCase):
    def test_display_name_prefers_english(self):
        self.assertEqual(Person(id="x", name="Kannu", name_hi="कन्नू").display_name(), "Kannu")

    def test_display_name_falls_back_to_hindi_then_id(self):
        self.assertEqual(Person(id="x", name_hi="कन्नू").display_name(), "कन्नू")
        self.assertEqual(Person(id="x").display_name(), "x")


class TestLoadPeople(unittest.TestCase):
    def test_loads_all_fields_and_devanagari(self):
        path = _write(
            "- id: sevakram\n"
            "  name: Sevak Ram\n"
            "  name_hi: सेवकराम\n"
            "  born: \"1884\"\n"
            "- id: kannu\n"
            "  name: Kannu\n"
            "  father: sevakram\n"
        )
        people = load_people(path)
        self.assertEqual(len(people), 2)
        self.assertEqual(people[0].name_hi, "सेवकराम")
        self.assertEqual(people[1].father, "sevakram")

    def test_empty_file_returns_empty_list(self):
        self.assertEqual(load_people(_write("")), [])

    def test_non_list_top_level_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("id: sevakram\n"))

    def test_missing_id_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- name: Nobody\n"))

    def test_unknown_key_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  nickname: boss\n"))

    def test_invalid_status_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  status: dead\n"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python3 -m unittest tests.test_model -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_tree.model'`

- [ ] **Step 4: Write minimal implementation**

Create `family_tree/model.py`:

```python
from dataclasses import dataclass
from typing import List, Optional

import yaml

ALLOWED_KEYS = {"id", "name", "name_hi", "father", "spouse", "born", "note", "status"}
ALLOWED_STATUS = {"uncertain", "needs-parent"}


class LoadError(Exception):
    pass


@dataclass
class Person:
    id: str
    name: Optional[str] = None
    name_hi: Optional[str] = None
    father: Optional[str] = None
    spouse: Optional[str] = None
    born: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None

    def display_name(self) -> str:
        return self.name or self.name_hi or self.id


def load_people(path: str) -> List[Person]:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if data is None:
        return []
    if not isinstance(data, list):
        raise LoadError("Top-level YAML must be a list of people")
    people = []
    for i, entry in enumerate(data):
        if not isinstance(entry, dict):
            raise LoadError("Person #%d is not a mapping" % i)
        unknown = set(entry) - ALLOWED_KEYS
        if unknown:
            raise LoadError("Person #%d has unknown keys: %s" % (i, sorted(unknown)))
        if not entry.get("id"):
            raise LoadError("Person #%d is missing 'id'" % i)
        status = entry.get("status")
        if status is not None and status not in ALLOWED_STATUS:
            raise LoadError("Person '%s' has invalid status '%s'" % (entry["id"], status))
        people.append(
            Person(
                id=str(entry["id"]),
                name=entry.get("name"),
                name_hi=entry.get("name_hi"),
                father=entry.get("father"),
                spouse=entry.get("spouse"),
                born=entry.get("born"),
                note=entry.get("note"),
                status=status,
            )
        )
    return people
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m unittest tests.test_model -v`
Expected: PASS (9 tests OK)

- [ ] **Step 6: Commit**

```bash
git add family_tree/__init__.py family_tree/model.py tests/__init__.py tests/test_model.py
git commit -m "feat: Person model and YAML loader"
```

---

### Task 2: Validation

**Files:**
- Create: `family_tree/validate.py`
- Test: `tests/test_validate.py`

**Interfaces:**
- Consumes: `Person` from `family_tree.model`.
- Produces:
  - `def validate(people: List[Person]) -> List[str]` — returns a list of warning strings; raises `ValidationError` on any hard error.
  - `class ValidationError(Exception)`

- [ ] **Step 1: Write the failing test**

Create `tests/test_validate.py`:

```python
import unittest

from family_tree.model import Person
from family_tree.validate import validate, ValidationError


def root():
    return Person(id="sevakram", name="Sevak Ram")


class TestValidate(unittest.TestCase):
    def test_valid_single_root_with_child_and_wife(self):
        people = [
            root(),
            Person(id="kannu", name="Kannu", father="sevakram"),
            Person(id="sev_w", name="Wife", spouse="sevakram"),
        ]
        self.assertEqual(validate(people), [])

    def test_duplicate_id_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="sevakram", name="Dup")])

    def test_missing_father_reference_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", name="X", father="ghost")])

    def test_missing_spouse_reference_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="w", name="W", spouse="ghost")])

    def test_both_father_and_spouse_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", name="X", father="sevakram", spouse="sevakram")])

    def test_no_name_at_all_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", father="sevakram")])

    def test_cycle_raises(self):
        with self.assertRaises(ValidationError):
            validate([
                Person(id="a", name="A", father="b"),
                Person(id="b", name="B", father="a"),
            ])

    def test_two_roots_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="other", name="Other")])

    def test_no_root_raises(self):
        # the only person is flagged needs-parent, so no root ancestor exists
        with self.assertRaises(ValidationError):
            validate([Person(id="np", name="Floating", status="needs-parent")])

    def test_needs_parent_and_uncertain_produce_warnings_not_errors(self):
        people = [
            root(),
            Person(id="np", name="Floating", status="needs-parent"),
            Person(id="uc", name="?", father="sevakram", status="uncertain"),
        ]
        warnings = validate(people)
        self.assertEqual(len(warnings), 2)
        self.assertTrue(any("need a parent" in w for w in warnings))
        self.assertTrue(any("uncertain" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_validate -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_tree.validate'`

- [ ] **Step 3: Write minimal implementation**

Create `family_tree/validate.py`:

```python
from typing import List, Optional

from family_tree.model import Person


class ValidationError(Exception):
    pass


def _first_cycle(people: List[Person]) -> Optional[str]:
    by_id = {p.id: p for p in people}
    for start in people:
        seen = set()
        cur = start
        while cur is not None and cur.father is not None:
            if cur.id in seen:
                return cur.id
            seen.add(cur.id)
            cur = by_id.get(cur.father)
    return None


def validate(people: List[Person]) -> List[str]:
    ids = [p.id for p in people]
    dupes = sorted({x for x in ids if ids.count(x) > 1})
    if dupes:
        raise ValidationError("Duplicate id(s): %s" % dupes)

    by_id = {p.id: p for p in people}
    for p in people:
        if not p.name and not p.name_hi:
            raise ValidationError("Person '%s' has neither name nor name_hi" % p.id)
        if p.father is not None and p.spouse is not None:
            raise ValidationError("Person '%s' has both father and spouse" % p.id)
        if p.father is not None and p.father not in by_id:
            raise ValidationError("Person '%s' father '%s' does not exist" % (p.id, p.father))
        if p.spouse is not None and p.spouse not in by_id:
            raise ValidationError("Person '%s' spouse '%s' does not exist" % (p.id, p.spouse))

    cyc = _first_cycle(people)
    if cyc is not None:
        raise ValidationError("Cycle detected in father chain at '%s'" % cyc)

    roots = [
        p for p in people
        if p.father is None and p.spouse is None and p.status != "needs-parent"
    ]
    if len(roots) == 0:
        raise ValidationError("No root found (a single ancestor with no father is required)")
    if len(roots) > 1:
        raise ValidationError(
            "Expected exactly one root, found %d: %s" % (len(roots), [p.id for p in roots])
        )

    warnings = []
    needs = [p.id for p in people if p.status == "needs-parent"]
    if needs:
        warnings.append("%d person(s) need a parent: %s" % (len(needs), needs))
    uncertain = [p.id for p in people if p.status == "uncertain"]
    if uncertain:
        warnings.append("%d name(s) uncertain: %s" % (len(uncertain), uncertain))
    return warnings
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_validate -v`
Expected: PASS (10 tests OK)

- [ ] **Step 5: Commit**

```bash
git add family_tree/validate.py tests/test_validate.py
git commit -m "feat: family tree validation rules"
```

---

### Task 3: Tree assembly + summary

**Files:**
- Create: `family_tree/tree.py`
- Test: `tests/test_tree.py`

**Interfaces:**
- Consumes: `Person` from `family_tree.model`.
- Produces:
  - `@dataclass class Summary` — fields `total: int`, `generations: int`, `uncertain: int`, `needs_parent: int`.
  - `def build_tree(people: List[Person]) -> Tuple[dict, List[Person], Summary]` — returns `(root_node, unlinked, summary)`. A node is a dict `{"person": Person, "wives": List[Person], "children": List[node]}`. `unlinked` is the list of `needs-parent` people (not in the tree).

- [ ] **Step 1: Write the failing test**

Create `tests/test_tree.py`:

```python
import unittest

from family_tree.model import Person
from family_tree.tree import build_tree, Summary


class TestBuildTree(unittest.TestCase):
    def _people(self):
        return [
            Person(id="sevakram", name="Sevak Ram"),
            Person(id="kannu", name="Kannu", father="sevakram"),
            Person(id="gauri", name="Gaurishankar", father="kannu"),
            Person(id="sev_w", name="Wife One", spouse="sevakram"),
            Person(id="sev_w2", name="Wife Two", spouse="sevakram"),
            Person(id="floating", name="Floating", status="needs-parent"),
        ]

    def test_root_and_children_wired(self):
        root, unlinked, summary = build_tree(self._people())
        self.assertEqual(root["person"].id, "sevakram")
        self.assertEqual(len(root["children"]), 1)
        self.assertEqual(root["children"][0]["person"].id, "kannu")
        self.assertEqual(root["children"][0]["children"][0]["person"].id, "gauri")

    def test_wives_attached_to_husband(self):
        root, _, _ = build_tree(self._people())
        wife_ids = sorted(w.id for w in root["wives"])
        self.assertEqual(wife_ids, ["sev_w", "sev_w2"])

    def test_unlinked_holds_needs_parent(self):
        _, unlinked, _ = build_tree(self._people())
        self.assertEqual([p.id for p in unlinked], ["floating"])

    def test_summary_counts(self):
        _, _, summary = build_tree(self._people())
        self.assertEqual(summary.total, 6)
        self.assertEqual(summary.generations, 3)  # sevakram -> kannu -> gauri
        self.assertEqual(summary.needs_parent, 1)
        self.assertEqual(summary.uncertain, 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_tree -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_tree.tree'`

- [ ] **Step 3: Write minimal implementation**

Create `family_tree/tree.py`:

```python
from dataclasses import dataclass
from typing import Dict, List, Tuple

from family_tree.model import Person


@dataclass
class Summary:
    total: int
    generations: int
    uncertain: int
    needs_parent: int


def _node(person, children_by_father, wives_by_husband):
    node = {
        "person": person,
        "wives": wives_by_husband.get(person.id, []),
        "children": [],
    }
    for child in children_by_father.get(person.id, []):
        node["children"].append(_node(child, children_by_father, wives_by_husband))
    return node


def _depth(node) -> int:
    if not node["children"]:
        return 1
    return 1 + max(_depth(c) for c in node["children"])


def build_tree(people: List[Person]) -> Tuple[dict, List[Person], Summary]:
    children_by_father: Dict[str, List[Person]] = {}
    wives_by_husband: Dict[str, List[Person]] = {}
    for p in people:
        if p.spouse is not None:
            wives_by_husband.setdefault(p.spouse, []).append(p)
        elif p.father is not None:
            children_by_father.setdefault(p.father, []).append(p)

    root_person = next(
        p for p in people
        if p.father is None and p.spouse is None and p.status != "needs-parent"
    )
    root = _node(root_person, children_by_father, wives_by_husband)
    unlinked = [p for p in people if p.status == "needs-parent"]
    summary = Summary(
        total=len(people),
        generations=_depth(root),
        uncertain=sum(1 for p in people if p.status == "uncertain"),
        needs_parent=len(unlinked),
    )
    return root, unlinked, summary
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_tree -v`
Expected: PASS (4 tests OK)

- [ ] **Step 5: Commit**

```bash
git add family_tree/tree.py tests/test_tree.py
git commit -m "feat: assemble father->children tree with wives and summary"
```

---

### Task 4: HTML viewer rendering

**Files:**
- Create: `family_tree/render.py`
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: `Person` from `family_tree.model`; node dict + `Summary` from `family_tree.tree`.
- Produces:
  - `def render_html(root: dict, unlinked: List[Person], summary: Summary) -> str` — returns a complete, self-contained HTML document string.

- [ ] **Step 1: Write the failing test**

Create `tests/test_render.py`:

```python
import unittest

from family_tree.model import Person
from family_tree.tree import build_tree
from family_tree.render import render_html


class TestRender(unittest.TestCase):
    def _html(self):
        people = [
            Person(id="sevakram", name="Sevak Ram", name_hi="सेवकराम"),
            Person(id="kannu", name="Kannu", father="sevakram"),
            Person(id="sev_w", name="Wife One", spouse="sevakram"),
            Person(id="floating", name="Floaty", status="needs-parent", note="taped"),
        ]
        root, unlinked, summary = build_tree(people)
        return render_html(root, unlinked, summary)

    def test_is_self_contained_html(self):
        html = self._html()
        self.assertTrue(html.lstrip().lower().startswith("<!doctype html"))
        self.assertNotIn("http://", html.replace("http://www.w3.org", ""))  # no external URLs except SVG ns
        self.assertNotIn("https://", html)

    def test_contains_english_and_devanagari_names(self):
        html = self._html()
        self.assertIn("Sevak Ram", html)
        self.assertIn("सेवकराम", html)
        self.assertIn("Kannu", html)

    def test_contains_unlinked_and_summary_data(self):
        html = self._html()
        self.assertIn("Floaty", html)
        self.assertIn("tree-data", html)
        self.assertIn("unlinked-data", html)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_tree.render'`

- [ ] **Step 3: Write minimal implementation**

Create `family_tree/render.py`:

```python
import json
from typing import List

from family_tree.model import Person
from family_tree.tree import Summary


def _person_json(p: Person) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "name_hi": p.name_hi,
        "born": p.born,
        "note": p.note,
        "status": p.status,
    }


def _node_json(node: dict) -> dict:
    d = _person_json(node["person"])
    d["wives"] = [_person_json(w) for w in node["wives"]]
    d["children"] = [_node_json(c) for c in node["children"]]
    return d


def _embed(obj) -> str:
    # ensure_ascii=False keeps Devanagari readable; escape </ so it can't close the script tag
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def render_html(root: dict, unlinked: List[Person], summary: Summary) -> str:
    tree_json = _embed(_node_json(root))
    unlinked_json = _embed([_person_json(p) for p in unlinked])
    summary_json = _embed(
        {
            "total": summary.total,
            "generations": summary.generations,
            "uncertain": summary.uncertain,
            "needs_parent": summary.needs_parent,
        }
    )
    return (
        _TEMPLATE
        .replace("/*__TREE__*/", tree_json)
        .replace("/*__UNLINKED__*/", unlinked_json)
        .replace("/*__SUMMARY__*/", summary_json)
    )


_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Family Tree</title>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,Arial,"Noto Sans Devanagari",sans-serif;}
  #toolbar{position:fixed;top:0;left:0;right:0;height:44px;display:flex;gap:8px;align-items:center;
    padding:0 12px;background:#f4f4f4;border-bottom:1px solid #ccc;z-index:10;box-sizing:border-box;}
  #toolbar input{padding:4px 8px;}
  #toolbar button{padding:4px 8px;cursor:pointer;}
  #toolbar .summary{margin-left:auto;font-size:12px;color:#555;}
  #stage{position:absolute;top:44px;left:0;right:0;bottom:0;overflow:hidden;background:#fff;cursor:grab;}
  #stage.grabbing{cursor:grabbing;}
  svg{width:100%;height:100%;display:block;}
  .edge{fill:none;stroke:#bbb;stroke-width:1.5px;}
  .edge.hl{stroke:#d35400;stroke-width:2.5px;}
  .node rect{fill:#eef4fb;stroke:#6b8fb5;rx:6;cursor:pointer;}
  .node.hl rect{stroke:#d35400;stroke-width:2px;fill:#fdf0e6;}
  .node.uncertain rect{stroke-dasharray:4 3;fill:#fbf6e6;}
  .node text{font-size:12px;fill:#222;pointer-events:none;}
  .node text.hi{font-size:11px;fill:#555;}
  .wife rect{fill:#fbeef4;stroke:#b56b8f;rx:6;}
  .wife text{font-size:11px;fill:#333;pointer-events:none;}
  .marriage{stroke:#b56b8f;stroke-width:1.5px;}
  .toggle{fill:#6b8fb5;cursor:pointer;}
  .badge{font-size:12px;fill:#c0392b;font-weight:bold;pointer-events:none;}
  #unlinked{position:fixed;right:0;top:44px;width:230px;max-height:45%;overflow:auto;background:#fffaf0;
    border-left:1px solid #ddd;border-bottom:1px solid #ddd;padding:8px;font-size:12px;z-index:5;box-sizing:border-box;}
  #unlinked h4{margin:0 0 6px;}
  #unlinked.empty{display:none;}
</style>
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
<script>
(function(){
  var NS="http://www.w3.org/2000/svg";
  var NODE_W=170, NODE_H=46, H_GAP=170, V_GAP=100, WIFE_W=110, WIFE_H=38;
  var tree=JSON.parse(document.getElementById('tree-data').textContent);
  var unlinked=JSON.parse(document.getElementById('unlinked-data').textContent);
  var summary=JSON.parse(document.getElementById('summary-data').textContent);
  var vp=document.getElementById('viewport');
  var stage=document.getElementById('stage');
  var lang='both';

  var parentOf={};
  (function walk(n){ (n.children||[]).forEach(function(c){ parentOf[c.id]=n; walk(c); }); })(tree);
  var all=[]; (function walk(n){ all.push(n); (n.children||[]).forEach(walk); })(tree);

  function label(p){
    if(lang==='en') return [p.name||p.name_hi||p.id];
    if(lang==='hi') return [p.name_hi||p.name||p.id];
    var out=[]; if(p.name) out.push(p.name); if(p.name_hi) out.push(p.name_hi);
    return out.length?out:[p.id];
  }

  var leaf=0;
  function layout(n, depth){
    n.depth=depth; n.y=depth*V_GAP;
    var kids=n._collapsed?[]:(n.children||[]);
    if(!kids.length){ n.x=leaf*(NODE_W+H_GAP); leaf++; }
    else {
      kids.forEach(function(c){ layout(c, depth+1); });
      n.x=(kids[0].x + kids[kids.length-1].x)/2;
    }
  }

  function el(tag, attrs, parent){
    var e=document.createElementNS(NS, tag);
    for(var k in attrs){ e.setAttribute(k, attrs[k]); }
    if(parent) parent.appendChild(e);
    return e;
  }

  function textLines(g, lines, cx, y){
    lines.forEach(function(t,i){
      var te=el('text', {x:cx, y:y+i*14, 'text-anchor':'middle'}, g);
      if(i>0) te.setAttribute('class','hi');
      te.textContent=t;
    });
  }

  function render(){
    while(vp.firstChild) vp.removeChild(vp.firstChild);
    leaf=0; layout(tree,0);
    var edges=el('g', {}, vp);
    var nodes=el('g', {}, vp);
    (function draw(n){
      var kids=n._collapsed?[]:(n.children||[]);
      kids.forEach(function(c){
        var midY=(n.y+NODE_H+c.y)/2;
        el('path', {'class':'edge','data-edge':c.id,
          d:'M'+(n.x+NODE_W/2)+','+(n.y+NODE_H)+' C'+(n.x+NODE_W/2)+','+midY+' '+(c.x+NODE_W/2)+','+midY+' '+(c.x+NODE_W/2)+','+c.y
        }, edges);
        draw(c);
      });
      var cls='node'+(n.status==='uncertain'?' uncertain':'');
      var g=el('g', {'class':cls, 'data-id':n.id, transform:'translate('+n.x+','+n.y+')'}, nodes);
      el('rect', {width:NODE_W, height:NODE_H}, g);
      textLines(g, label(n), NODE_W/2, 18);
      if(n.status==='uncertain'){ var b=el('text',{x:NODE_W-12,y:15,'class':'badge'},g); b.textContent='?'; }
      (n.wives||[]).forEach(function(w,i){
        var wx=NODE_W+30, wy=i*(WIFE_H+6);
        el('line',{'class':'marriage',x1:NODE_W,y1:NODE_H/2,x2:NODE_W+30,y2:wy+WIFE_H/2},g);
        var wcls='wife'+(w.status==='uncertain'?' uncertain':'');
        var wg=el('g',{'class':wcls, transform:'translate('+wx+','+wy+')'},g);
        el('rect',{width:WIFE_W,height:WIFE_H},wg);
        textLines(wg, label(w), WIFE_W/2, 16);
      });
      if((n.children||[]).length){
        var tg=el('circle',{'class':'toggle',cx:NODE_W/2,cy:NODE_H+2,r:6},g);
        tg.addEventListener('click',function(ev){ ev.stopPropagation(); n._collapsed=!n._collapsed; render(); });
      }
      g.addEventListener('click',function(){ highlight(n.id); });
    })(tree);
    apply();
  }

  function clearHl(){
    var hl=document.querySelectorAll('.node.hl,.edge.hl');
    for(var i=0;i<hl.length;i++) hl[i].classList.remove('hl');
  }
  function highlight(id){
    clearHl();
    var cur=id;
    while(cur){
      var node=document.querySelector('.node[data-id="'+cur+'"]');
      if(node) node.classList.add('hl');
      var edge=document.querySelector('.edge[data-edge="'+cur+'"]');
      if(edge) edge.classList.add('hl');
      cur=parentOf[cur]?parentOf[cur].id:null;
    }
  }

  var tx=40, ty=20, scale=1, dragging=false, lx=0, ly=0;
  function apply(){ vp.setAttribute('transform','translate('+tx+','+ty+') scale('+scale+')'); }
  stage.addEventListener('mousedown',function(e){ dragging=true; lx=e.clientX; ly=e.clientY; stage.classList.add('grabbing'); });
  window.addEventListener('mousemove',function(e){ if(!dragging) return; tx+=e.clientX-lx; ty+=e.clientY-ly; lx=e.clientX; ly=e.clientY; apply(); });
  window.addEventListener('mouseup',function(){ dragging=false; stage.classList.remove('grabbing'); });
  stage.addEventListener('wheel',function(e){
    e.preventDefault();
    var f=e.deltaY<0?1.1:1/1.1;
    var r=stage.getBoundingClientRect();
    var mx=e.clientX-r.left, my=e.clientY-r.top;
    tx=mx-(mx-tx)*f; ty=my-(my-ty)*f; scale*=f; apply();
  }, {passive:false});
  function resetView(){ tx=40; ty=20; scale=1; apply(); }

  document.getElementById('search').addEventListener('keydown',function(e){
    if(e.key!=='Enter') return;
    var q=e.target.value.trim().toLowerCase(); if(!q) return;
    var hit=null;
    for(var i=0;i<all.length;i++){
      var n=all[i];
      if(((n.name||'')+(n.name_hi||'')).toLowerCase().indexOf(q)>=0){ hit=n; break; }
    }
    if(!hit) return;
    var c=parentOf[hit.id]; while(c){ c._collapsed=false; c=parentOf[c.id]; }
    render();
    var r=stage.getBoundingClientRect();
    scale=1; tx=r.width/2-(hit.x+NODE_W/2); ty=r.height/2-(hit.y+NODE_H/2); apply();
    highlight(hit.id);
  });

  var langBtns=document.querySelectorAll('#toolbar [data-lang]');
  for(var i=0;i<langBtns.length;i++){
    langBtns[i].addEventListener('click', (function(b){ return function(){ lang=b.getAttribute('data-lang'); render(); }; })(langBtns[i]));
  }
  document.getElementById('reset').addEventListener('click', resetView);

  document.getElementById('summary').textContent=
    'People '+summary.total+' · Generations '+summary.generations+
    ' · Uncertain '+summary.uncertain+' · Needs-parent '+summary.needs_parent;

  var up=document.getElementById('unlinked');
  if(unlinked.length){
    var html='<h4>Unlinked — to place</h4>';
    unlinked.forEach(function(p){
      html+='<div>• '+(p.name||p.name_hi||p.id)+(p.note?' <em>('+p.note+')</em>':'')+'</div>';
    });
    up.innerHTML=html;
  } else {
    up.className='empty';
  }

  render(); resetView();
})();
</script>
</body>
</html>
"""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_render -v`
Expected: PASS (3 tests OK)

- [ ] **Step 5: Commit**

```bash
git add family_tree/render.py tests/test_render.py
git commit -m "feat: self-contained interactive HTML viewer renderer"
```

---

### Task 5: `build.py` CLI + seed data + README (end-to-end)

**Files:**
- Create: `build.py`
- Create: `family-tree.yaml` (seed: root only)
- Create: `README.md`
- (No new test module — this task's deliverable is a working end-to-end build, verified by running it and by the full suite.)

**Interfaces:**
- Consumes: `load_people`/`LoadError` (Task 1), `validate`/`ValidationError` (Task 2), `build_tree` (Task 3), `render_html` (Task 4).
- Produces: running `python3 build.py` reads `family-tree.yaml`, writes `family-tree.html`, prints a summary line and any warnings; exits non-zero with a clear message on load/validation error.

- [ ] **Step 1: Create the seed data file**

Create `family-tree.yaml`:

```yaml
# Family tree data — the single source of truth.
# One entry per person. See README.md for the field reference.
# Blood descendants use `father:`; wives use `spouse:`.
# Flags: status: uncertain (name unreadable) | needs-parent (father unknown).

- id: sevakram
  name: Sevak Ram
  name_hi: सेवकराम
  born: "1884 (Samvat 1941)"
  note: "root ancestor — all descend from him"
```

- [ ] **Step 2: Create the CLI**

Create `build.py`:

```python
#!/usr/bin/env python3
import sys

from family_tree.model import load_people, LoadError
from family_tree.validate import validate, ValidationError
from family_tree.tree import build_tree
from family_tree.render import render_html

DATA = "family-tree.yaml"
OUT = "family-tree.html"


def main() -> int:
    try:
        people = load_people(DATA)
    except (LoadError, FileNotFoundError) as e:
        print("ERROR loading %s: %s" % (DATA, e), file=sys.stderr)
        return 1
    try:
        warnings = validate(people)
    except ValidationError as e:
        print("VALIDATION ERROR: %s" % e, file=sys.stderr)
        return 1

    root, unlinked, summary = build_tree(people)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(render_html(root, unlinked, summary))

    print("Wrote %s" % OUT)
    print(
        "People: %d | Generations: %d | Uncertain: %d | Needs-parent: %d"
        % (summary.total, summary.generations, summary.uncertain, summary.needs_parent)
    )
    for w in warnings:
        print("  - " + w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Run the build end-to-end**

Run: `python3 build.py`
Expected output (exactly):
```
Wrote family-tree.html
People: 1 | Generations: 1 | Uncertain: 0 | Needs-parent: 0
```
Then confirm the file exists and opens: `open family-tree.html` (a browser tab shows a single "Sevak Ram / सेवकराम" node).

- [ ] **Step 4: Run the full test suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS (all tests across the four modules OK)

- [ ] **Step 5: Write the README**

Create `README.md`:

```markdown
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
```

- [ ] **Step 6: Commit**

```bash
git add build.py family-tree.yaml README.md
git commit -m "feat: build CLI, seed data, and README"
```

---

### Task 6: Transcribe the photo into `family-tree.yaml`

**Files:**
- Modify: `family-tree.yaml` (expand from the seed to the full transcription)

**Interfaces:**
- Consumes: everything above (the build pipeline). Produces the real data set.

This task is data entry, not code. The implementer transcribes the photographed chart
(`/Users/ankurjain/Downloads/20260711_164558 (1).jpg`) into `family-tree.yaml`, using
the crops in the scratchpad if helpful. It is expected to be iterative and to leave
flags for the user to resolve later.

- [ ] **Step 1: Transcribe every legible person**

Add one entry per person, top (Sevak Ram) to bottom. Rules:
- Store `name` (English) and `name_hi` (Devanagari) as written; add the other script only when confident.
- Set `father:` to the parent's `id` following the downward arrows.
- Enter wives (if any legible) as separate entries with `spouse:` pointing to the husband.
- Capture date annotations ("Till 1945", "Till 1925", "1884 / Samvat 1941") in `born` or `note` verbatim — do not interpret them.

- [ ] **Step 2: Flag everything unclear**

- Name unreadable (taped/smudged): add the entry with `name: "?"` and `status: uncertain` and a `note:` describing its location (e.g. `"taped over, below Kamal"`).
- Name legible but father unclear: `status: needs-parent` and a `note:` describing where it sits.

- [ ] **Step 3: Build and check**

Run: `python3 build.py`
Expected: exits 0, prints the summary, and lists warnings for the `uncertain` and
`needs-parent` entries. Fix any `VALIDATION ERROR` (e.g. a mistyped `father` id) until
it builds cleanly.

- [ ] **Step 4: Eyeball the viewer**

Run: `open family-tree.html`
Confirm the tree renders, Sevak Ram is the single root, uncertain nodes show the dashed
`?` badge, and needs-parent people appear in the "Unlinked" panel.

- [ ] **Step 5: Commit**

```bash
git add family-tree.yaml
git commit -m "data: transcribe family tree from photograph (with uncertain/needs-parent flags)"
```

- [ ] **Step 6: Review the flags with the user**

Present the list of `uncertain` and `needs-parent` entries and resolve them together by
editing `family-tree.yaml` and rerunning `python3 build.py`. Commit each round of fixes.

---

## Notes for the implementer

- Run every command from the project root: `cd /Users/ankurjain/Workspace/personal/family-tree`.
- If `import yaml` fails, install with `python3 -m pip install PyYAML --break-system-packages`.
- The `.gitignore` (already present) excludes `__pycache__/` and `*.pyc`. `family-tree.html` is a generated artifact but is small and self-contained — committing it is fine so the tree is viewable straight from the repo.
