# Visual Theme and Life Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the family tree a warm, professional visual identity — cards on a warm canvas with gender rails, a real type scale, a coloured palette — and record whether each person is living or deceased, with a date of death.

**Architecture:** Two new optional YAML fields (`life`, `died`) flow through the existing Python layer into the JSON payload. The browser's `FT.drawNode` is rewritten so a couple is ONE card with one 52px row per person sharing a split left rail, replacing the current two-boxes-plus-marriage-bar. All colour and type moves into CSS custom properties in `web/app.css`. The three view modules are not rewritten — only re-verified, since node dimensions change.

**Tech Stack:** Python 3.9 + PyYAML, plain browser JavaScript and SVG, `unittest`. No new dependencies. No web fonts.

**Spec:** `docs/superpowers/specs/2026-09-07-visual-theme-and-life-status-design.md`

## Global Constraints

- Output stays a SINGLE self-contained `family-tree.html`. No `<link>`, no `<script src>`, no `fetch()`, **no web fonts** — `tests/test_render.py::test_is_self_contained_html` enforces it and offline `file://` use depends on it.
- No ES modules. Plain scripts sharing the one `FT` global.
- **No code comments anywhere.** The repo owner forbids all comments. The one pre-existing comment above `_embed` in `render.py` and the one in `app.js` above the touch handlers must survive.
- Every new YAML field is optional. The existing `family-tree.yaml` (105 people) must stay valid and `python3 build.py` must succeed after every task.
- `status` is NOT reused for life status. It means `uncertain` / `needs-parent`.
- Tap targets 44px minimum, including the search input. Most readers are on phones.
- All colour and type values come from the CSS custom properties named in the spec. No literal hex outside the token block.
- Tests: `python3 -m unittest discover -s tests -v`. Python 3.9.6. The suite is at 77 passing tests.
- A headless Chromium for verification lives at `~/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium`. It loads `file://` URLs with `--dump-dom` and `--screenshot`; pass `--virtual-time-budget=6000`. **Never pass `--user-data-dir`** — a fresh profile hangs on first-run setup and exhausts the machine's memory, which killed four subagents during the previous plan.

## Geometry Reference

Current constants in `web/app.js`, to be replaced:

```
SELF_W 150   SPOUSE_W 120   NODE_H 46   BAR 22   H_GAP 40   V_GAP 100
```

New constants:

```
CARD_W 250   ROW_H 52   RAIL_W 5   AVATAR 32   H_GAP 40   V_GAP 100
```

Derived: a card is `ROW_H × rows` tall, where rows is 1 for a lone person and 1 + spouse-count otherwise. Classic slot becomes `CARD_W + H_GAP` = 290px against today's 332px, so the classic view should come out near 13,500px wide rather than 15,508px. Confirm by measurement; do not assume.

## File Structure

**Modified:**
- `family_tree/model.py` — `Person.life`, `Person.died`, `ALLOWED_LIFE`, shape validation.
- `family_tree/validate.py` — the living-with-a-death-date warning.
- `family_tree/render.py` — `_person_json` carries `life` and `died`.
- `web/app.css` — the token block, card styling, toolbar, sheet, organic palette, type scale.
- `web/app.js` — `FT.drawNode` rewritten as the unified couple card; new constants; `FT.lifespan`; geometry helpers; the sheet gains life status and `died`.
- `web/views/classic.js`, `web/views/horizontal.js`, `web/views/organic.js` — touched only if re-verification proves a change is required.
- `README.md` — the two new fields and what the card shows.
- `tests/test_model.py`, `tests/test_validate.py`, `tests/test_render.py`.

---

### Task 1: `life` and `died` on the model

**Files:**
- Modify: `family_tree/model.py`, `family_tree/validate.py`
- Test: `tests/test_model.py`, `tests/test_validate.py`

**Interfaces:**
- Consumes: the existing `Person` dataclass.
- Produces: `Person.life: Optional[str]` (`"living"` / `"deceased"` / `None`), `Person.died: Optional[str]` (free text), module constant `ALLOWED_LIFE = {"living", "deceased"}`. `validate()` appends a warning beginning `"life"` when a person has `life: living` together with a `died` value.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_model.py` above the `if __name__` block:

```python
class TestLifeAndDied(unittest.TestCase):
    def test_parses_life_and_died(self):
        people = load_people(
            _write(
                "- id: x\n"
                "  name: X\n"
                "  born: \"1884\"\n"
                "  life: deceased\n"
                "  died: \"1961\"\n"
            )
        )
        self.assertEqual(people[0].life, "deceased")
        self.assertEqual(people[0].died, "1961")

    def test_life_living_is_allowed(self):
        people = load_people(_write("- id: x\n  name: X\n  life: living\n"))
        self.assertEqual(people[0].life, "living")

    def test_missing_life_and_died_are_none(self):
        people = load_people(_write("- id: x\n  name: X\n"))
        self.assertIsNone(people[0].life)
        self.assertIsNone(people[0].died)

    def test_invalid_life_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  life: undead\n"))

    def test_numeric_died_is_stringified(self):
        people = load_people(_write("- id: x\n  name: X\n  died: 1961\n"))
        self.assertEqual(people[0].died, "1961")

    def test_died_accepts_free_text(self):
        people = load_people(_write("- id: x\n  name: X\n  died: c. 1961 (Samvat 2018)\n"))
        self.assertEqual(people[0].died, "c. 1961 (Samvat 2018)")
```

Append to `tests/test_validate.py` above the `if __name__` block:

```python
class TestLifeValidation(unittest.TestCase):
    def test_living_with_a_death_date_warns(self):
        people = [
            Person(id="root", name="Root", gender="male", life="living", died="1961"),
        ]
        warnings = validate(people)
        self.assertTrue(any(w.startswith("life") for w in warnings))

    def test_deceased_with_a_death_date_does_not_warn(self):
        people = [
            Person(id="root", name="Root", gender="male", life="deceased", died="1961"),
        ]
        self.assertEqual([w for w in validate(people) if w.startswith("life")], [])

    def test_died_without_life_does_not_warn(self):
        people = [Person(id="root", name="Root", gender="male", died="1961")]
        self.assertEqual([w for w in validate(people) if w.startswith("life")], [])

    def test_living_without_a_death_date_does_not_warn(self):
        people = [Person(id="root", name="Root", gender="male", life="living")]
        self.assertEqual([w for w in validate(people) if w.startswith("life")], [])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m unittest tests.test_model tests.test_validate -v`
Expected: FAIL — `LoadError` on the unknown keys `life` / `died`, and `TypeError` from `Person(... life=...)`.

- [ ] **Step 3: Implement the model half**

In `family_tree/model.py`, add `"life"` and `"died"` to `ALLOWED_KEYS`, add beside the other allowed-value sets:

```python
ALLOWED_LIFE = {"living", "deceased"}
```

Add to `Person`, directly below `born`:

```python
    life: Optional[str] = None
    died: Optional[str] = None
```

In `load_people`, beside the existing `gender` / `status` checks:

```python
        life = entry.get("life")
        if life is not None and life not in ALLOWED_LIFE:
            raise LoadError("Person '%s' has invalid life '%s'" % (pid, life))
        died = entry.get("died")
```

and pass into the `Person(...)` construction:

```python
                life=life,
                died=None if died is None else str(died),
```

`born` is already stored as free text; `died` follows it exactly.

- [ ] **Step 4: Implement the validation half**

In `family_tree/validate.py`, inside the existing loop that builds warnings (the same one that appends the `mother_id` warnings, so the single `warnings = []` list is preserved):

```python
    for p in people:
        if p.life == "living" and p.died:
            warnings.append(
                "life 'living' on '%s' contradicts died '%s'; the death date will be shown"
                % (p.id, p.died)
            )
```

- [ ] **Step 5: Run the full suite**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS, 77 + 10 new.

- [ ] **Step 6: Verify the real data still builds**

Run: `python3 build.py`
Expected: success, 105 people, no `life` warnings (no row uses the field yet).

- [ ] **Step 7: Commit**

```bash
git add family_tree/model.py family_tree/validate.py tests/test_model.py tests/test_validate.py
git commit -m "feat: optional life and died fields on a person"
```

---

### Task 2: The palette and type token system

**Files:**
- Modify: `web/app.css`
- Test: `tests/test_render.py`

**Interfaces:**
- Produces: CSS custom properties on `:root` — `--canvas`, `--card`, `--edge`, `--rail-m`, `--rail-f`, `--rail-unknown`, `--ink`, `--ink-muted`, `--living`, `--connector`, `--bark`, `--bark-trunk`, `--leaf-1`, `--leaf-2`, `--leaf-3`, `--font`, `--shadow-card`.
- Every later task takes colour and type from these names only.

This task lands the tokens and restyles the chrome (canvas, toolbar, connectors, sheet). The card itself is Task 3 — this task must leave the viewer working, just recoloured.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_render.py` above the `if __name__` block:

```python
class TestThemeTokens(unittest.TestCase):
    def test_token_block_is_present(self):
        html = _payload_html()
        for token in ("--canvas", "--card", "--rail-m", "--rail-f", "--ink",
                      "--ink-muted", "--living", "--connector", "--bark",
                      "--leaf-1", "--font", "--shadow-card"):
            self.assertIn(token, html)

    def test_no_web_fonts(self):
        html = _payload_html()
        self.assertNotIn("fonts.googleapis.com", html)
        self.assertNotIn("@font-face", html)
        self.assertNotIn("@import", html)
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL — the tokens are not present.

- [ ] **Step 3: Add the token block at the top of `web/app.css`**

```css
:root{
  --canvas:#FAF8F5;
  --card:#FFFFFF;
  --edge:#E8E2DA;
  --rail-m:#2F4A7C;
  --rail-f:#A8446B;
  --rail-unknown:#C9BDB0;
  --ink:#1F2933;
  --ink-muted:#7A6E63;
  --living:#3F8F5E;
  --connector:#C8BDB0;
  --bark:#7A5C3E;
  --bark-trunk:#5E4530;
  --leaf-1:#7FA96A;
  --leaf-2:#9CBE7E;
  --leaf-3:#C2D6A0;
  --font:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari","Nirmala UI",sans-serif;
  --shadow-card:0 1px 2px rgba(60,45,30,.06),0 3px 8px rgba(60,45,30,.05);
}
```

- [ ] **Step 4: Restyle the chrome using only those tokens**

- `html,body` take `--font`; `body` takes `background:var(--canvas)`.
- `#stage` takes `--canvas` plus a faint dot grid:
  ```css
  #stage{background:var(--canvas);
    background-image:radial-gradient(var(--edge) 1px,transparent 1px);
    background-size:22px 22px;}
  ```
  The dots must read as texture, not wallpaper — if they dominate, reduce by moving the dot colour toward `--canvas`.
- `#toolbar` becomes `background:var(--card)`, `border-bottom:1px solid var(--edge)`, `box-shadow:var(--shadow-card)`, 13px/500 text, 8px gaps.
- `#toolbar input` keeps `min-height:44px` and takes `--edge` for its border and `--font`.
- `.edge` (connector paths) takes `stroke:var(--connector)` at `1.25px`. `.edge.hl` keeps the existing highlight colour.
- `#sheet` and its children take `--card`, `--edge`, `--ink`, `--ink-muted`; the label/value scale from the spec's table.
- Replace every literal hex elsewhere in the file with the matching token. Do not leave a stray `#eef4fb` or `#bbb` behind.

- [ ] **Step 5: Run the suite and look at the result**

Run: `python3 -m unittest discover -s tests -v && python3 build.py`
Then screenshot the built file with the headless Chromium (no `--user-data-dir`) and confirm: warm canvas, floating toolbar, receding connectors, and the tree still drawing correctly in all three views.

- [ ] **Step 6: Commit**

```bash
git add web/app.css tests/test_render.py
git commit -m "feat: warm palette and type tokens, restyled chrome"
```

---

### Task 3: The unified couple card

**Files:**
- Modify: `web/app.js`, `web/app.css`
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: the tokens from Task 2, and `life` / `died` in the payload once Task 4 adds them (this task must not depend on them — write the lifespan helper to tolerate both fields being absent).
- Produces: `FT.CARD_W = 250`, `FT.ROW_H = 52`, `FT.RAIL_W = 5`, `FT.AVATAR = 32`; `FT.rows(n)` returning the row count; `FT.nodeW`/`FT.nodeH`/`FT.jointX`/`FT.jointY` recomputed from them; `FT.drawNode` drawing one card with one row per person.
- **Removes:** `FT.SELF_W`, `FT.SPOUSE_W`, `FT.NODE_H`, `FT.BAR`, the marriage-bar lines, and the `FT.stacked` branch — a card is stacked in every view now, so the `stack` flag on `horizontal` becomes dead and must be deleted along with every reader of it.

- [ ] **Step 1: Write the failing test**

```python
class TestCoupleCard(unittest.TestCase):
    def test_card_constants_replace_the_box_constants(self):
        html = _payload_html()
        self.assertIn("FT.CARD_W = 250", html)
        self.assertIn("FT.ROW_H = 52", html)
        self.assertNotIn("FT.SPOUSE_W", html)
        self.assertNotIn("FT.BAR", html)

    def test_marriage_bar_is_gone(self):
        self.assertNotIn("class=\"marriage\"", _payload_html())

    def test_rail_is_drawn(self):
        self.assertIn("card-rail", _payload_html())
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL — the new constants are absent and `FT.SPOUSE_W` is still present.

- [ ] **Step 3: Replace the geometry constants and helpers in `web/app.js`**

```js
  FT.CARD_W = 250; FT.ROW_H = 52; FT.RAIL_W = 5; FT.AVATAR = 32;
  FT.H_GAP = 40; FT.V_GAP = 100;

  FT.rows = function (n) {
    var partners = FT.partners(n).length;
    return 1 + partners;
  };
  FT.nodeW = function () { return FT.CARD_W; };
  FT.nodeH = function (n) { return FT.rows(n) * FT.ROW_H; };
  FT.jointX = function () { return FT.CARD_W / 2; };
  FT.jointY = function (n) { return FT.nodeH(n); };
```

`FT.partners(n)` already returns the real spouses or a single synthesised placeholder, so `FT.rows` is 1 for a childless leaf and 2 for a parent with an unrecorded spouse.

Note `FT.jointX` and `FT.jointY` no longer branch on leaf views — the organic view's leaf rendering returns before either is used for a card, and the previous plan's dead `jointY` leaf guard was already removed. Confirm the organic view still centres correctly after this change; if it does not, keep a leaf guard in `jointX` only and say so in your report.

- [ ] **Step 4: Rewrite `FT.drawNode`**

Draw one `<g>` per couple, then one row per person:

```js
  function drawRow(parent, p, rowIndex, owner) {
    var y = rowIndex * FT.ROW_H;
    var unfilled = !!p.placeholder;
    var cls = 'card-row' + (unfilled ? ' unfilled' : '') +
      (p.life === 'deceased' || (p.died && p.life !== 'living') ? ' deceased' : '') +
      (p.status === 'uncertain' ? ' uncertain' : '');
    var g = el('g', { 'class': cls, transform: 'translate(0,' + y + ')' }, parent);
    el('rect', {
      'class': 'card-rail', x: 0, y: 0, width: FT.RAIL_W, height: FT.ROW_H,
      fill: unfilled ? 'var(--rail-unknown)'
        : (p.gender === 'female' ? 'var(--rail-f)' : 'var(--rail-m)')
    }, g);
    var textX = FT.RAIL_W + 12;
    if (p.photo) {
      var img = el('image', {
        href: p.photo, x: textX, y: (FT.ROW_H - FT.AVATAR) / 2,
        width: FT.AVATAR, height: FT.AVATAR,
        preserveAspectRatio: 'xMidYMid slice',
        'clip-path': 'inset(0 round 50%)', 'class': 'avatar'
      }, g);
      img.addEventListener('error', function () { g.removeChild(img); });
      textX += FT.AVATAR + 10;
    }
    var name = el('text', { 'class': 'card-name', x: textX, y: 21 }, g);
    name.textContent = unfilled ? 'Unknown' : FT.label(p)[0];
    var meta = FT.metaLine(p);
    if (meta.dot) {
      el('circle', { 'class': 'living-dot', cx: textX + 3, cy: 34, r: 3 }, g);
    }
    if (meta.text) {
      var m = el('text', {
        'class': 'card-meta', x: textX + (meta.dot ? 12 : 0), y: 38
      }, g);
      m.textContent = meta.text;
    }
    if (!unfilled) {
      g.addEventListener('click', function (ev) {
        ev.stopPropagation();
        FT.select(p.id, owner);
      });
    }
    return g;
  }
```

and the card wrapper:

```js
  FT.drawNode = function (parent, n) {
    var view = FT.views[FT.state.viewId];
    if (view && view.nodeShape === 'leaf') return FT.drawLeaf(parent, n);
    var g = el('g', {
      'class': 'card', 'data-id': n.id,
      transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    el('rect', {
      'class': 'card-bg', width: FT.CARD_W, height: FT.nodeH(n), rx: 8
    }, g);
    drawRow(g, n, 0, n);
    FT.partners(n).forEach(function (p, i) { drawRow(g, p, i + 1, n); });
    if ((n.children || []).length) {
      var cx = FT.jointX(n), cy = FT.jointY(n);
      var hit = el('circle', { 'class': 'toggle-hit', cx: cx, cy: cy, r: 22 }, g);
      el('circle', { 'class': 'toggle', cx: cx, cy: cy, r: 11 }, g);
      hit.addEventListener('click', function (ev) {
        ev.stopPropagation();
        FT.state.collapsed[n.id] = !FT.state.collapsed[n.id];
        FT.render();
      });
    }
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };
```

- [ ] **Step 5: Add `FT.metaLine`**

```js
  FT.metaLine = function (p) {
    var parts = [];
    if (FT.state.lang !== 'en' && p.name_hi) parts.push(p.name_hi);
    var span = FT.lifespan(p);
    if (span) parts.push(span);
    return { text: parts.join(' · '), dot: p.life === 'living' };
  };

  FT.lifespan = function (p) {
    if (p.born && p.died) return p.born + '–' + p.died;
    if (p.born && p.life === 'deceased') return p.born + '–Deceased';
    if (p.born && p.life === 'living') return p.born + '–Living';
    if (p.born) return 'b. ' + p.born;
    if (p.died) return 'd. ' + p.died;
    if (p.life === 'living') return 'Living';
    if (p.life === 'deceased') return 'Deceased';
    return '';
  };
```

- [ ] **Step 6: Delete the dead `stack` machinery**

`FT.stacked` and `horizontal.js`'s `stack: true` no longer mean anything — every card stacks. Remove `FT.stacked`, remove the `stack` property, and remove every reader. The suite must stay green; if any layout depends on it, say so rather than leaving a no-op function behind.

- [ ] **Step 7: Card CSS in `web/app.css`**

```css
.card-bg{fill:var(--card);stroke:var(--edge);stroke-width:1px;filter:url(#cardshadow);}
.card-name{font-size:13.5px;font-weight:600;fill:var(--ink);pointer-events:none;}
.card-meta{font-size:11px;fill:var(--ink-muted);pointer-events:none;}
.living-dot{fill:var(--living);pointer-events:none;}
.card-row{cursor:pointer;}
.card-row.unfilled{cursor:default;}
.card-row.unfilled .card-name{fill:var(--ink-muted);font-style:italic;font-weight:400;}
.card-row.deceased .card-rail{opacity:.7;}
.card-row.deceased .card-name{fill:var(--ink-muted);}
.card.hl .card-bg{stroke:#D3722F;stroke-width:2px;}
.avatar{pointer-events:none;}
```

SVG `filter:url(#cardshadow)` needs a filter defined once in `web/index.html`'s SVG. **105 nodes each running an SVG blur filter is a real performance risk** — measure the render time before and after. If it is slow, drop the filter and get depth from a 1px `--edge` stroke plus a second offset rect at low opacity, and say in your report which you chose and why.

- [ ] **Step 8: Run the suite and verify all three views**

Run: `python3 -m unittest discover -s tests -v && python3 build.py`
Then in the headless Chromium (no `--user-data-dir`), screenshot each view and run a full pairwise overlap scan across all 105 nodes in classic and horizontal. Report the classic view's measured width — the spec predicts roughly 13,500px.

- [ ] **Step 9: Commit**

```bash
git add web tests/test_render.py
git commit -m "feat: unified couple card with gender rail and lifespan line"
```

---

### Task 4: Life status through the payload, the sheet and the organic view

**Files:**
- Modify: `family_tree/render.py`, `web/app.js`, `web/app.css`
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: `Person.life` / `Person.died` from Task 1, `FT.lifespan` from Task 3.
- Produces: `life` and `died` in every person object in the payload; the detail sheet showing both; deceased leaves desaturated in the organic view.

- [ ] **Step 1: Write the failing test**

```python
class TestLifeInPayload(unittest.TestCase):
    def _html(self):
        people = [
            Person(id="root", name="Root", gender="male", born="1884",
                   life="deceased", died="1961"),
            Person(id="kid", name="Kid", gender="male", relation="father",
                   relation_id="root", born="1992", life="living"),
        ]
        root, unlinked, summary = build_tree(people)
        return render_html(root, unlinked, summary)

    def test_payload_carries_life_and_died(self):
        html = self._html()
        self.assertIn('"life"', html)
        self.assertIn('"died"', html)
        self.assertIn("1961", html)

    def test_sheet_renders_life_status(self):
        html = self._html()
        self.assertIn("Died", html)
        self.assertIn("Status", html)
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest tests.test_render -v`
Expected: FAIL — `"life"` is not in the payload.

- [ ] **Step 3: Add the fields to the payload**

In `family_tree/render.py`, `_person_json` gains two entries:

```python
        "life": p.life,
        "died": p.died,
```

- [ ] **Step 4: Show them in the detail sheet**

In `web/app.js`'s `sheetHtml`, after the `born` row:

```js
    if (p.died) rows += '<dt>Died</dt><dd>' + esc(p.died) + '</dd>';
    if (p.life) {
      rows += '<dt>Status</dt><dd>' +
        (p.life === 'living' ? 'Living' : 'Deceased') + '</dd>';
    }
```

Give the sheet a rail in the subject's gender colour down its left edge, taking `--rail-m` / `--rail-f` / `--rail-unknown`.

- [ ] **Step 5: Deceased and depth colouring in the organic view**

In `FT.drawLeaf`, pick the leaf fill from the three-green ramp by depth and add the deceased class:

```js
    var ramp = ['var(--leaf-1)', 'var(--leaf-2)', 'var(--leaf-3)'];
    var fill = ramp[(n.depth || 0) % ramp.length];
```

Apply `--bark` to `.branch` and `--bark-trunk` to `.branch.trunk` in the CSS, and desaturate a deceased leaf with the same rule the cards use (`opacity:.7` on the shape, muted label fill).

- [ ] **Step 6: Run the suite and verify**

Run: `python3 -m unittest discover -s tests -v && python3 build.py`
Then check in the browser: a person with `life: living` shows the green dot on their card and "Living" in the sheet; a deceased person shows the muted rail and their death year; the organic canopy has visible depth.

Add temporary `life`/`died` values to two or three people in `family-tree.yaml` to see it, then **revert them** — populating the real data is the owner's job, not this task's.

- [ ] **Step 7: Commit**

```bash
git add family_tree/render.py web tests/test_render.py
git commit -m "feat: life status in the payload, detail sheet and organic view"
```

---

### Task 5: Layout re-verification, README, and the visual pass

**Files:**
- Modify: `README.md`, and any view module that re-verification proves needs it
- Test: full suite plus measurement

- [ ] **Step 1: Measure all three layouts**

With the built file in the headless Chromium (no `--user-data-dir`), for each of `classic`, `horizontal` and `organic`:
- a full pairwise overlap scan across all 105 nodes — must be 0
- the bounding box, reported as numbers
- `FT.fit`'s computed scale at stage widths 390, 768 and 1400, confirming the rendered extent fits inside each

Then inject the adversarial cases the previous plan used: a person with 8 spouses beside a sibling with a wide subtree, and a person with a very long name. Confirm 0 overlaps and that a long name truncates rather than spilling out of its card.

Report every number. If any view overlaps, fix the view module and say what you changed.

- [ ] **Step 2: Confirm the classic view's width**

The spec predicts roughly 13,500px, down from 15,508px. Report the measured figure. A number far from that means `FT.rows` or the slot arithmetic is wrong — investigate rather than accepting it.

- [ ] **Step 3: Update `README.md`**

Add to the field list:

```markdown
  life: deceased           # optional: living | deceased (omitted = not known)
  died: "1961"             # optional, free text like born
```

Add a short section explaining, in plain language for a non-developer:
- what the card shows for each combination of `born` / `life` / `died`
- that omitting `life` means "we don't know", and that this is deliberate — it does not assume someone is alive
- that `life: living` together with a `died` date prints a build warning and the date wins
- that an invalid `life` value stops the build

- [ ] **Step 4: Full verification**

Run: `python3 -m unittest discover -s tests -v && python3 build.py`

Then confirm every item individually and report each result:
- all three views render 105 people with no overlap
- the view picker still lists all three and switching still fits
- the detail sheet opens, shows life status, and its relative links still navigate
- collapse/expand, highlight-to-root, pan, wheel zoom and pinch zoom all still work
- the EN / हिं / EN+हिं toggle still switches, and the card height does not change between settings
- search still finds and centres a name
- the Unlinked panel still lists `needs-parent` people
- the built HTML still contains no `<link>`, no `<script src>`, no `fetch(`, no `@font-face`, and no absolute URL other than the SVG namespace
- a real `file://` load in the headless Chromium renders the tree and populates the picker

- [ ] **Step 5: Screenshots**

Capture each of the three views at 1400px and the default view at 390px. Save the paths in your report — the owner will look at these.

- [ ] **Step 6: Commit**

```bash
git add README.md web
git commit -m "docs: life and died fields; verify layouts against the new card size"
```

---

## Self-Review

**Spec coverage:** `life`/`died` fields and their validation → Task 1. Palette, type scale, chrome → Task 2. Unified couple card, rail, avatar, meta line, status dot, deceased treatment → Task 3. Payload, sheet, organic palette and deceased leaves → Task 4. Layout re-verification, the classic-width prediction, README, visual pass → Task 5. Every failure-mode row is covered: invalid `life` (Task 1), living-with-death-date warning (Task 1), `died` without `life` (Task 3's `FT.lifespan` ordering), long-name truncation (Task 5), photo error handler (Task 3 retains it), three-or-more spouses (Task 3's `FT.rows` plus Task 5's adversarial case).

**Placeholder scan:** no TBDs. Every code step carries its code. Two steps deliberately require a judgment call with a stated fallback — the SVG shadow filter's performance in Task 3 Step 7, and whether `FT.jointX` needs a leaf guard in Task 3 Step 3 — and both instruct the implementer to report which way they went.

**Type consistency:** `FT.CARD_W`, `FT.ROW_H`, `FT.RAIL_W`, `FT.AVATAR` are defined in Task 3 and used in Tasks 3 and 5. `FT.rows(n)` is defined once and consumed by `FT.nodeH`. `FT.lifespan(p)` and `FT.metaLine(p)` are defined in Task 3 and consumed by Task 4's sheet work. `life` and `died` use the same names in the YAML, the dataclass, the payload and the JS throughout. The token names in Task 2 match every consumer in Tasks 3 and 4.
