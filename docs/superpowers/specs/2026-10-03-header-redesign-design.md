# Header Redesign, Named Codes, View Filters

Date: 2026-10-03
Status: built without a separate review (the owner said "do the changes, I will check later")
Source: the owner's phone mockup (header with title, New Person, avatar menu, search,
Tree Overview bar, floating controls)

## Decisions

| Mockup element | Decision |
|---|---|
| Title "Family Roots" | Adopted. It replaces "Family Tree" on the page, the login card and `<title>`. |
| Who is logged in, top left | Shown under the title: `Admin`, `<name> · 47 min left`, or `Guest · 47 min left`. |
| + New Person | Waits for the MySQL backend. Until then that spot holds **+ New code** (admin only). |
| Avatar menu: Settings / Log out / Switch Language | Log out and Switch language are in. Settings is left out until it has something to hold. The avatar shows the first letter of the name. |
| Notification bell | Left out until there is a backend. |
| Search "Search all 144 members…" | Restyled with an icon and the live count. The hint below reads "Search names or villages" (that is what search covers). |
| Tree Overview bar | It reads `144 People • 125 Male • 19 Female • 11 Generations • 3 Uncertain names • 0 Unlinked`. The data's "uncertain" means an unreadable name, not parentage. "Fix" waits for the backend. |
| Show: Matrilineal only | Replaced with **Show: Everyone / Bloodline only**. The tree is patrilineal and has almost no maternal lines. Bloodline only hides the spouses who married in and the dashed "Unknown" boxes. |
| Hide Deceased | Becomes **Living only**. It shows only the lines that lead to someone marked `living`; their ancestors stay so the tree is connected. Turning it on expands everything and fits to screen. Turning it off restores the default collapse. |
| Zoom: Fit-to-screen | Zoom − / Fit / + buttons instead of a dropdown, so the control never shows a stale value after a pinch. |
| Floating panel | Top-right of the tree area, holding View, Show, Living only, Zoom and Expand all. Open by default on desktop; on phones it is a ⚙ button that opens it. Top-right (not bottom-right as in the mockup) so it does not cover the "Our Roots" ornament. |

## Named codes and share links

- The New code panel adds a **Name** box (optional, at most 30 characters).
- It shows a share link `…/family-tree.html#code=K7M4QX9P&name=Sunita` with a **Copy link** button. The code is still shown, so it can be read aloud.
- Opening the link logs in with the code and the session remembers the name. The hash is cleared from the address bar.
- If a session is already active on that browser, the link is ignored. If the code is used or expired, the login card shows the usual message.
- A code typed by hand works the same way but shows as **Guest**.
- The name is not signed. A technical person could change it, which fits the agreed deterrent level.
- Rules unchanged: 24 hours to first use, 1h or 2h from login, one session per browser.

## Units

- `web/filters.js` (new, pure, tested in Node): `livingKeep(tree)` returns the set of node ids to keep for Living only.
- `web/auth.js`: `shareLink(base, code, name)`, `readLink(hash)`, link login in `start`, the name in the session, and the who-line, avatar and menu wiring.
- `web/app.js`: the `bloodline` and `livingOnly` state in `partners` / `spouseOf` / `hasPartner` / `visibleChildren`; `FT.zoomBy`; the new summary text; the controls panel wiring; removal of the `#more` / `#extras` / `#reset` handlers.
- `web/index.html`, `web/app.css`: the new header and the controls panel.
