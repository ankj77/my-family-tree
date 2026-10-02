# Login: Admin Password and Expiring Access Codes

Date: 2026-10-02
Status: draft, awaiting owner review

## Problem

The tree is published at `https://ankj77.github.io/my-family-tree/` and anyone with
the link can browse it, including present-day addresses. The owner wants viewing to
need a login: relatives get a short code that lets them in for a limited time, and
the owner has an admin password that never expires and can make those codes.

## What this is, and what it is not

The site is static GitHub Pages and the repo is **public**. `family-tree.yaml` and
the generated `family-tree.html` (which embeds every person) can be read on GitHub
by anyone, with or without a login. There is no server to remember which codes were
used.

So this login is a **deterrent for ordinary relatives**, not security. Anyone who
opens the page source or the repo gets past it. The owner has accepted this; real
security comes later with a backend, when data and access checks move server-side.
Nothing in this design should be read as protecting the data from a technical person.

## Agreed behaviour

- **Admin password.** Never expires. Logging in with it shows the tree plus a
  "New code" button. The admin session on that browser lasts until "Log out".
- **Access codes.** The admin picks **1 hour** or **2 hours** and presses "New code".
  The site shows a code like `K7M4-QX9P` with a Copy button, to send by WhatsApp or
  read aloud.
- **First-use window.** A code must be used within **24 hours** of being made, or it
  is refused as expired.
- **Session starts at login.** When a relative enters a valid code, their session runs
  for the chosen 1h or 2h **from that moment**, on that browser.
- **Session end.** When time runs out, the tree is hidden and the login screen
  returns with "Your time is over. Ask Ankur for a new code." This happens even if the
  tab stays open.
- **No restart on the same browser.** A code that has started a session cannot start
  another one on that browser after it ends.

### Known gaps, accepted

- **A forwarded code works on each new device.** Without a server, a code that is
  sent on gets its own 1h or 2h on each device it is used on, as long as it is still
  inside the 24-hour first-use window.
- **Sessions follow the device clock.** Moving the device's clock changes the time
  left.
- **Codes can be forged.** The signing key is in the page source, so anyone who reads
  it can make codes. Same root cause as above: there is no server.

## Code format

8 characters from Crockford base32 (`0-9 A-Z` without `I L O U`), shown as `XXXX-XXXX`,
40 bits:

| Bits | Field |
|---|---|
| 19 | Issue time, in 10-minute steps since 2026-01-01 UTC (lasts about 10 years) |
| 1 | Duration: 0 = 1 hour, 1 = 2 hours |
| 20 | Signature: first 20 bits of HMAC-SHA256(signing key, the 20 data bits) |

Input is forgiving: case, dashes and spaces are ignored, and the look-alikes `O→0`,
`I/L→1` are mapped before decoding. A code is accepted when its signature matches and
`now − issued < 24h`. The 10-minute rounding can make the first-use window up to ten
minutes shorter. That is fine.

## Configuration

A new committed file, `auth.json`:

```json
{
  "contact": "Ankur",
  "admin": { "salt": "<hex>", "iterations": 200000, "hash": "<hex>" },
  "signing_key": "<hex>"
}
```

- `python3 build.py --set-admin-password` asks for the password twice (`getpass`),
  makes a random salt and signing key if none exist, stores a PBKDF2-SHA256 hash, and
  rewrites `auth.json`. The plain password is never written anywhere.
- Changing the password keeps the signing key, so codes already sent keep working. To
  cancel every outstanding code, delete `signing_key` and run the command again.
- `build.py` embeds `auth.json` in the page as `/*__AUTH__*/`. If `auth.json` is
  missing, the build stops and prints the `--set-admin-password` command. Shipping an
  open site by accident must not be possible.
- The hash is public, so it uses PBKDF2 with 200,000 iterations to make guessing an
  admin password offline slow. A strong password is still the real defence.

## Components

**`web/auth.js`** (new): small, with no access to the tree.
- `FT.auth.encode(issuedStep, twoHours, key)` and `FT.auth.decode(code, key)`: pure
  functions, testable in Node.
- `FT.auth.checkAdmin(password)`: PBKDF2 through `crypto.subtle`, compared with the
  stored hash.
- Session state in `localStorage` (every access wrapped in try/catch, matching the
  existing `ft-view` and `ft-lang` handling):
  - `ft-session`: `{ "kind": "code" | "admin", "expires": <ms or null> }`
  - `ft-used-codes`: normalised codes that have already started a session on this browser.
- `FT.auth.start(onUnlock)`: on page load, if the session is valid call `onUnlock`,
  otherwise show the login screen. While unlocked, check the time every 30 seconds and
  on `visibilitychange`, and lock when the session ends.

**Login screen** (`web/index.html` + `web/app.css`): a full-page overlay in the
current saffron theme. It has the title, one input ("Enter your code or password"),
an Enter button and one message line. Messages come in English and Hindi, following
the saved `ft-lang`:
- wrong code: "That code isn't right. Check it and try again."
- expired code: "This code has expired. Ask Ankur for a new one."
- session over: "Your time is over. Ask Ankur for a new code."

When the input does not decode as a code, it is checked as the admin password.

**App start-up** (`web/app.js`): `FT.init()` runs only after unlock, through
`FT.auth.start(FT.init)` in `render.py`'s script assembly. Before unlock the tree is
never drawn behind the overlay. On lock, the page reloads, so no tree state is left.

**Admin controls**: for an admin session only, two buttons go into the existing
`#extras` toolbar group: **New code** and **Log out**. New code opens the existing
`#sheet` panel with a 1h / 2h choice, the code in large type, a Copy button and the
line "Use within 24 hours. Lasts 1 hour from when they log in." Code sessions show
a small "Time left: 47 min" in the toolbar and nothing else.

**`build.py` / `family_tree/render.py`**: `--set-admin-password`, a check that
`auth.json` exists, the `/*__AUTH__*/` placeholder, and adding `auth.js` to the
script parts.

## Risks to check during implementation

- **`crypto.subtle` on `file://`.** Opening `family-tree.html` straight from disk has
  to keep working. Chrome and Firefox allow it; Safari needs checking. If it fails,
  the README tells local users to run `python3 -m http.server` and open `localhost`.
  The published HTTPS site is not affected.
- **Self-contained test.** `test_is_self_contained_html` must still pass: no external
  URLs.

## Testing

- `tests/auth_check.js`, run with `node`: encode then decode round-trips for both
  durations, a single changed character fails, a code issued 25 hours ago is refused,
  a code issued 23 hours ago is accepted, and look-alike or lower-case input decodes.
- `tests/test_auth.py`: `--set-admin-password` produces a hash that Python's
  `hashlib.pbkdf2_hmac` verifies; the build fails clearly without `auth.json`; the
  rendered HTML contains the auth data and no plain password. It also runs
  `auth_check.js` through `subprocess` when `node` is available, so
  `python3 -m unittest` covers both.
- Manual check in the browser: admin login, making a 1h code, logging in with it in
  a private window, seeing the time left, and the expiry lock (tested by
  temporarily shortening the duration).

## Out of scope

Real per-person accounts, revoking a single code, codes that are strictly single-use,
and hiding the data from the page source all need the planned backend.
