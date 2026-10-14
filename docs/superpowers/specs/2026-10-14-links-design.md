# Links: How Two People and Two Villages Are Connected

Date: 2026-10-14
Status: draft, awaiting owner review

## Problem

The tree page shows one family tree at a time, and a member only sees the trees their role
allows. The owner wants to answer two questions that cross trees and villages:

1. How am I linked to a given person (for example Ved Prakash Ji from another village)?
2. How is another village linked to Bakheta, through which marriages?

Real families are linked through many marriages across villages, so the answer is often a
chain: up to a shared ancestor, down to a daughter, across her marriage into another tree,
and so on.

## Agreed behaviour

### Who can use it

- Every logged-in member with an account can use the Links page for **all** villages and
  people, even trees they cannot open on the tree page.
- The Links page shows only: name, Hindi name, gender, life status and village. It never
  shows address, notes, birth or death dates, or phone details.
- Temporary guest logins cannot use the Links page (the API answers 403 for them and the
  menu item is hidden).

### A separate page

- New page `links.html`, opened from a **Links** item in the account menu.
- Each person card on the tree page gets a **How am I linked?** button that opens
  `links.html?b=<person id>` with the viewer as the first person.
- Two tabs: **People** and **Villages**. The tab and picks are kept in the URL
  (`?tab=people&a=..&b=..`, `?tab=villages&a=..&b=..`) so a link can be shared on WhatsApp.

### People tab

- Two person pickers. The first starts as the viewer. Each picker searches all people by
  English or Hindi name and shows the village beside each name, so two people with the same
  name can be told apart.
- Result:
  - A one-line summary, for example
    `Ved Prakash is your father's sister's husband (फूफा जी)`.
    When the first person is not the viewer it reads `Ved Prakash is Amit's …`.
  - The chain drawn as **mini trees**: the chain is split wherever it crosses a marriage.
    Each piece (a blood segment) is drawn as a small tree from its lowest people up to its
    shared ancestor and back down. Pieces are joined by a `══` marriage line. Each card shows
    the name and the village.
  - On phones the pieces stack vertically; on wide screens they sit side by side.
- Shortest chain = fewest steps. Between equally short chains, the one with fewer marriages
  wins; if still tied, the first one found.
- Same person picked twice: "That's the same person." No chain at all: "No link found in
  the records."

### Villages tab

- Pick one village: a list of every village linked to it by marriage, most marriages first,
  for example `Kakroi · 4 marriages`.
- Click a village in that list, or pick a second village: every couple linking the two,
  for example `Satta (Bakheta) married Ram Dayal (Kakroi)`. Each name opens the People tab
  for the viewer and that person.
- No direct marriage between the two: the shortest chain of villages through others,
  for example `Bakheta → Kakroi → Pugthala`, with one example couple for each step.
- No chain at all: "These villages are not linked in the records."

### Which village a person belongs to

- A person's village is the village of their **home tree** (`Graph.home_family`). A wife
  who married in and has no tree of her own belongs to her husband's tree.
- A marriage links the **husband's village** with the **wife's birth village**:
  - her own tree's village if she has a `family_id` (born in a tree on the site);
  - otherwise her `origin_village_id`;
  - if neither is known, the marriage is not counted between villages.
- A marriage where both sides are the same village is not listed as a link between villages.

## Design

### `family_tree/links.py` (pure, no database)

- `neighbours(graph, pid)` → list of `(other_id, rel)` where `rel` is the other person's
  relation to `pid`: `father`, `mother`, `son`, `daughter`, `husband`, `wife`, or the
  neutral `parent`, `child`, `spouse` when gender is not recorded.
  Parents come from `father_id` / `mother_id`, children from `graph.children_of`, spouses
  from `graph.spouse`.
- `person_path(graph, a, b)` → list of steps `[{"id": a, "rel": None}, {"id": .., "rel": ..}, …]`
  or `None`. Breadth-first search, tracking (steps, marriages) so ties prefer fewer marriages.
- `segments(steps)` → the steps split at `husband` / `wife` / `spouse` relations.
- `birth_village(graph, pid)` and `village_of(graph, pid)` as described above.
- `village_links(graph, vid)` → `[{"village_id", "marriages"}]`, most first.
- `village_pair(graph, a, b)` → `{"couples": [(husband_id, wife_id)…], "chain": None | [hop…]}`
  where a hop is `{"from", "to", "couple": (husband_id, wife_id)}`, found by breadth-first
  search over villages joined by marriages.

### `family_tree/kinship.py` (pure)

- `describe(graph, steps)` → `{"en": "father's sister's husband", "hi": "फूफा जी" | None}`.
- English path: going up to a parent and straight back down to a child becomes a sibling
  (`brother` / `sister` / `sibling`); each remaining step adds `'s <rel>`.
- Hindi term: looked up from a fixed table keyed by the English path, covering the common
  close relations: father/mother (पिता/माता), dada/dadi, nana/nani, chacha/chachi, tau/tai,
  bua/phoopha, mama/mami, mausi/mausa, bhai/behen, bhabhi, jija, saala/saali,
  devar/jeth/nanad, sasur/saas, beta/beti, pota/poti, bhatija/bhatiji, bhanja/bhanji,
  damad/bahu. Anything not in the table has no Hindi term. Chacha versus tau needs birth
  order, which is not reliable, so father's elder or younger brother both read
  `चाचा / ताऊ`.

### API (`backend/app.py`)

All four need a member login (401 if none, 403 for guests). Person fields are only
`id, name, name_hi, gender, life, village_id, village` (village name).

- `GET /directory` → every person with the fields above, for the pickers.
- `GET /links/people?a=<id>&b=<id>` →
  `{"found": bool, "steps": [person + "rel"], "segments": [[index…]…], "summary": {"en", "hi"}}`.
  404 for an unknown id.
- `GET /villages/<id>/links` → `[{"village_id", "village", "marriages"}]`. 404 for an unknown
  village.
- `GET /links/villages?a=<id>&b=<id>` →
  `{"couples": [{"husband": person, "wife": person}], "chain": null | [{"from", "to", "couple"}]}`.

The graph is already loaded on every request (`context()`), so no new tables or queries are
needed. Search is over a few thousand people at most.

### Pages

- `web/links.html` and `web/links.js`, built into `links.html` by `build.py` like the
  other pages, reusing `web/api.js` (login, `api.call`, menu) and the card colours in
  `web/app.css`.
- `links.js` turns each segment into a mini tree: the highest point in the segment (where
  the chain stops going up and starts going down) is the top; the people before it form the
  left leg, the people after it the right leg. Drawn with HTML and CSS, not the tree page's
  SVG, so it wraps on phones.
- `web/api.js` gains the **Links** menu item (members only); `web/app.js` gains the
  **How am I linked?** button on the person sheet.

## Testing

- `tests/test_links.py`: paths on the sample family (uncle, bua's husband, wife's brother,
  across two villages), tie-break on fewer marriages, no path, same person; village links,
  birth village rules, same-village marriages ignored, village chain when there is no direct
  marriage.
- `tests/test_kinship.py`: English paths and the Hindi terms, neutral wording when gender is
  missing, long paths without a Hindi term.
- `tests/test_api_links.py`: login needed, guests refused, a family reader can link to a
  person in a tree they cannot open, no private fields in any answer, 404s.
- `tests/links_check.js`: segment-to-mini-tree layout.

## Out of scope

- Showing more than one chain between two people.
- A drawn map of villages.
- Editing anything from the Links page.
