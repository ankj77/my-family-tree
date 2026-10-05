# Backend: Logins, Editing, and Many Families

Date: 2026-10-06
Status: draft, awaiting owner review

## Problem

The tree is a static page built from `family-tree.yaml`. Only the owner can change it,
by editing the file and rebuilding. The owner wants relatives to log in, view the tree,
and edit their own part of it from the website. The owner also wants the data to hold
more than one family: Bakheta today, and later families such as Pugthala, Bal Pabana and
Raja Khedi, each with people who look after their own tree.

## Agreed behaviour

### Accounts

- Only **living** people in the tree get an account. There is no self sign-up.
- An admin creates the account. The username is generated from the name
  (`jagdish.chand`, then `jagdish.chand2` if taken) and the admin may change it.
- The password is generated (10 characters) and shown **once** with a Copy button,
  to be sent by WhatsApp.
- Anyone can change their own password by giving the old one. New passwords need at
  least 8 characters.
- An admin can reset the password of anyone inside their scope, but never of someone
  with a higher role.
- There is no separate admin account. Admin is a role on a relative's own account.
- A login lasts 30 days or until Log out. Resetting a password or deleting an account
  ends that person's sessions at once.
- After 5 wrong passwords in a row, the username is locked for 15 minutes.

### Roles

| Role | Covers | Add / edit | Delete | Approves deletes | Accounts & passwords | Grants roles | Creates |
|---|---|---|---|---|---|---|---|
| Global admin | everything | yes | directly | anywhere | everyone | any role | villages, families |
| Village admin | all families in their village | yes | directly | in their village | people in their village | branch reps in their village | families in their village |
| Branch rep | one person and everyone below | yes | request only | no | no | no | no |
| Everyone logged in | view all villages and families | no | no | no | own password | no | no |

- A person can hold several roles, for example branch rep for two branches.
- A **branch** is the branch root, everyone below them in the same family (through the
  tree-parent link, defined below), and the spouses of all of those.
- Giving a branch rep a family's root person covers the whole family.
- A branch rep's delete becomes a **delete request**. A village admin of that village
  decides it, or a global admin if the village has no village admin. Until then the
  person shows "deletion pending".
- The owner is the first global admin, created by the import.

### Villages and families

- A **village** is a place: name, district, state.
- A **family** is one tree inside a village, with a root person. A village may hold
  several families.
- Every person born into a recorded family has that `family_id`. People who married in
  from a family not yet recorded have no `family_id`. They show as a spouse and keep
  their parents' names as text (`father_name`, `mother_name`).
- One person is one row, even when they appear in two trees. Rashmi is a daughter in
  the Pugthala tree and a wife in the Bakheta tree. Editing her in either changes both.
- When an in-law's birth family is later recorded, their `father_id`/`mother_id` are
  set and the text names are no longer shown.

### Tree-parent rule

A family's tree is drawn from its root downward. A person's **tree parent** is the
parent who belongs to the same family: the father if he is in that family, otherwise
the mother. This keeps today's behaviour, where a child hangs under the blood parent.
A daughter's husband appears beside her as a spouse, as today.

## What this is, and what it is not

- The pages stop carrying people data. `family-tree.yaml` stays in the public repo for
  now, and old commits keep the generated HTML. The owner accepted this; the data is
  not sensitive.
- The API only answers logged-in users. This is real access control, unlike the
  access codes it replaces.
- The page no longer works offline or from disk; it needs the API.

## Architecture

| Piece | Where | Cost |
|---|---|---|
| Pages: `index.html`, `admin.html` | GitHub Pages, `https://jainparivar.online` | free |
| API: Python Flask app | Vercel project `family-tree-api` (account `ankurjainuae-8333`), `https://api.jainparivar.online` | Hobby plan, free |
| Database | TiDB Cloud Starter (MySQL-compatible), Mumbai region | free tier |
| Backups | GitHub Action, weekly, to private repo `ankj77/family-tree-backup` | free |

- The API reuses the existing Python: the validation rules and the tree-JSON builder
  (`tree.py`, `render.py`'s `_node_json`/`_person_json`). The viewer receives the JSON
  shape it already draws.
- The API opens one database connection per request. This is fine for a few hundred
  people and serverless functions.
- On each request, the API loads every person into memory to work out permissions and
  trees. That is fine up to a few thousand people.

### Repo layout

```
api/             Flask app, requirements.txt (flask, pymysql), vercel.json
db/schema.sql    every CREATE TABLE
db/import_yaml.py  one-time import of family-tree.yaml
web/, build.py   pages as now, without data
```

### Configuration (Vercel environment variables, never in the repo)

- `DATABASE_URL`: TiDB connection string, TLS required.
- `ALLOWED_ORIGIN`: `https://jainparivar.online`.

## Data model (`db/schema.sql`)

All tables use InnoDB and utf8mb4 (for Devanagari).

### villages

| Column | Type |
|---|---|
| id | VARCHAR(64) PK (slug, e.g. `bakheta`) |
| name | VARCHAR(200) NOT NULL |
| district, state | VARCHAR(200) NULL |

### families

| Column | Type |
|---|---|
| id | VARCHAR(64) PK (slug) |
| village_id | VARCHAR(64) NOT NULL, FK villages |
| name | VARCHAR(200) NOT NULL |
| root_person_id | VARCHAR(64) NULL, FK people (set right after the root is inserted) |

### people

| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(64) PK | slug as today; new people get one generated from the name, made unique |
| family_id | VARCHAR(64) NULL, FK families | birth family; NULL only for in-laws whose family is not recorded |
| father_id, mother_id | VARCHAR(64) NULL, FK people ON DELETE RESTRICT | |
| father_name, mother_name | VARCHAR(200) NULL | text fallback when that parent is not a row |
| name, name_hi | VARCHAR(200) NULL | at least one required |
| gender | ENUM('male','female') NULL | |
| life | ENUM('living','deceased') NULL | |
| born, died | VARCHAR(100) NULL | free text |
| status | ENUM('uncertain','needs-parent','gap') NULL | |
| note | TEXT NULL | |
| sort_order | INT NULL | the YAML `order` |
| address_line, address_locality, address_city, address_state, address_country | VARCHAR(200) NULL | |
| origin_village, origin_district, origin_state | VARCHAR(200) NULL | own home village; used for in-laws whose family is not recorded (Rashmi: Pugthala) |
| updated_at | TIMESTAMP | |
| updated_by | VARCHAR(64) NULL | person id of the editor |

A person's village shown on the page is their own `origin_*` if set, otherwise their
family's village (marked "(family line)", as today). The import copies `origin` only
for people who have it written in the YAML (the root and 25 in-laws). The "family
line" inheritance code in `model.py` is not used by the API.

### marriages

| Column | Type |
|---|---|
| husband_id | VARCHAR(64) FK people ON DELETE CASCADE, UNIQUE |
| wife_id | VARCHAR(64) FK people ON DELETE CASCADE, UNIQUE |
| PK | (husband_id, wife_id) |

The UNIQUE keys keep today's rule of one spouse each.

### accounts

| Column | Type |
|---|---|
| person_id | VARCHAR(64) PK, FK people ON DELETE CASCADE |
| username | VARCHAR(64) UNIQUE NOT NULL |
| password_hash | VARCHAR(200) NOT NULL (PBKDF2-SHA256, 200,000 rounds, salted, as in `auth.py`) |
| failed_logins | INT NOT NULL DEFAULT 0 |
| locked_until | DATETIME NULL |
| created_at | TIMESTAMP |

### role_grants

| Column | Type |
|---|---|
| id | BIGINT AUTO_INCREMENT PK |
| person_id | VARCHAR(64) FK accounts ON DELETE CASCADE |
| scope | ENUM('global','village','branch') |
| scope_id | VARCHAR(64) NOT NULL DEFAULT '' (village id, or branch-root person id; '' for global, so the UNIQUE key works) |
| UNIQUE | (person_id, scope, scope_id) |

### sessions

| Column | Type |
|---|---|
| token_hash | CHAR(64) PK (SHA-256 of a random 32-byte token) |
| person_id | VARCHAR(64) FK accounts ON DELETE CASCADE |
| expires_at | DATETIME |

### delete_requests

| Column | Type |
|---|---|
| id | BIGINT AUTO_INCREMENT PK |
| person_id | VARCHAR(64) FK people ON DELETE CASCADE |
| requested_by | VARCHAR(64) (no FK, so requests survive the requester's deletion) |
| status | ENUM('pending','approved','rejected') |
| decided_by | VARCHAR(64) NULL |
| created_at, decided_at | DATETIME |

### change_log

| Column | Type |
|---|---|
| id | BIGINT AUTO_INCREMENT PK |
| at | TIMESTAMP |
| actor_id | VARCHAR(64) |
| person_id | VARCHAR(64) NULL (no FK, so entries survive deletes) |
| action | VARCHAR(32): create, update, delete, delete_request, delete_approve, delete_reject, account_create, password_reset, account_delete, role_grant, role_revoke, village_create, family_create |
| before_json, after_json | JSON NULL (`BEFORE` is a reserved word) |

## Rules checked on every write

Every write runs in one transaction. The rules are checked before commit; if one fails,
nothing is saved and the API answers 409 with a readable reason.

- Each person has a name or name_hi.
- No cycles through father/mother.
- Each family has exactly one root: one person in the family with no tree parent,
  not counting `needs-parent` people. It must equal `families.root_person_id`.
- One spouse each (also enforced by the UNIQUE keys).
- Husband and wife are not in the same family (a tree draws each person once, either
  as a child or as a spouse).
- Accounts only for people with `life = living`.
- **Delete** is allowed only when the person has no children (as father or mother),
  and is not the only link of a spouse with no family. Delete that in-law first.
  The person's marriage, account, roles and sessions go with them.
- A family's root person cannot be deleted.
- Only admins can change a person's parents (moving them). Branch reps edit the other
  fields, and add children and spouses.

## API (`https://api.jainparivar.online`)

All bodies are JSON. Writes must be `Content-Type: application/json`.

### Login (anyone)

| Method | Path | Does |
|---|---|---|
| POST | `/login` | `{username, password}`; sets the session cookie; returns `/me` |
| POST | `/logout` | ends the session |
| GET | `/me` | person, roles, and the list of branches and villages they can edit |
| POST | `/me/password` | `{old, new}` |

### Viewing (logged in)

| Method | Path | Does |
|---|---|---|
| GET | `/villages` | villages, each with its families |
| GET | `/people` | everyone, short form (id, names, gender, life, family, has_account), for pickers |
| GET | `/families/{id}/tree` | `{tree, unlinked, summary}`, the same shapes the page embeds today. Every person also gets `can_edit`, `can_delete` (`"direct"`, `"request"` or `false`, with a reason), `delete_pending`, `family_id`, and links to other families they appear in |

### Editing

| Method | Path | Does |
|---|---|---|
| POST | `/people` | `{as: "child", parent_id, ...fields}` or `{as: "spouse", spouse_id, ...fields}`. A child gets the family of the parent it is added under; both parents are set when that parent has a spouse. A spouse gets `family_id` only if one is chosen |
| PATCH | `/people/{id}` | edit fields; `father_id`/`mother_id` only for admins |
| DELETE | `/people/{id}` | admins delete (200); branch reps create a delete request (202) |

### Admin (within the caller's scope)

| Method | Path | Does |
|---|---|---|
| POST | `/villages` | global admin only |
| POST | `/families` | `{village_id, name, root: {...fields}}`, creating the family and its root person together |
| GET | `/delete-requests` | pending requests in scope |
| POST | `/delete-requests/{id}/approve`, `/reject` | approve re-checks the delete rules |
| GET | `/accounts` | living people (and anyone with a login) in the caller's scope, with username |
| POST | `/accounts` | `{person_id, username?}`; returns `{username, password}` once |
| PATCH | `/accounts/{person_id}` | `{username}`, rename a login |
| POST | `/accounts/{person_id}/password` | reset; returns the new password once |
| DELETE | `/accounts/{person_id}` | remove a login |
| GET | `/role-grants` | every role, with names (admins only) |
| POST | `/role-grants` | `{person_id, scope, scope_id}` |
| DELETE | `/role-grants/{id}` | |
| GET | `/change-log?person_id=&limit=` | newest first |

### Permission check

One function, `can(actor, action, person)`, used by every endpoint:

- Global admin: yes.
- Village admin: yes if the person's family is in their village. An in-law with no
  family counts under their spouse's family.
- Branch rep: yes if the person is in one of their branches. Delete becomes a request.
- Account and role actions also check that the target holds no higher role than the
  caller.
- The last global admin cannot lose that role or their login.

### Errors

401 not logged in, 403 not allowed, 404 not found, 409 breaks a rule (with reason),
429 locked after wrong passwords. The page shows the reason text.

### Security

- Session cookie: `HttpOnly; Secure; SameSite=Lax; Domain=.jainparivar.online; Max-Age=30 days`.
- CORS allows only `ALLOWED_ORIGIN`, with credentials.
- Writes require a JSON content type, so a form on another site cannot post to the API.
- The `Origin` header must equal `ALLOWED_ORIGIN` on writes.
- Passwords and session tokens are never logged or stored in plain text.

## Pages

### Viewer (`index.html`)

- `build.py` still inlines CSS and JS into one `index.html` (and the same file as
  `family-tree.html` for old links), but writes no people data.
- On load the page calls `/me`. If not logged in, it shows a username and password
  form. `auth.js`, `auth.json`, the access codes and **+ New code** are removed.
- After login it calls `/villages`, then `/families/{id}/tree`, and hands the result to
  the existing views. Classic, horizontal, poster, search, place search, filters,
  garlands and the "Unknown" spouse box all stay as they are.
- **Family switcher** in the header: "Bakheta ▾" lists villages and their families.
  The page opens on the user's own family (or their spouse's), then the last one
  viewed. The URL carries `?family=<id>` so links can be shared.
- **Account menu**: Change password, Log out, and Admin (admins only).
- API base URL: `https://api.jainparivar.online`, or `http://localhost:5001` when the
  page is opened from `localhost`.

### Detail sheet

Buttons appear only where the API says they are allowed:

- **Edit**: the sheet becomes a form with today's fields. Admins also see father and
  mother pickers.
- **Add child**: name, name_hi, gender, born, living/deceased. The parent is filled in.
- **Add wife / Add husband**: the same form, plus an optional birth family picker, or
  father and mother names as text.
- **Delete**: admins confirm and delete. Branch reps see **Request delete**. When delete
  is not allowed, the button is greyed out with the reason.
- Links "Born in Pugthala family →" and "Married into Bakheta family →" switch trees and
  open that person.

After a save, the tree reloads and the sheet reopens on the same person.

### Admin page (`admin.html`)

Built by `build.py` from `web/admin.html`. Each tab shows only what is in the admin's
scope:

1. **Pending deletes**: approve or reject.
2. **Accounts**: search a living person, then Create login or Reset password. The
   password is shown once with Copy.
3. **Roles**: make someone a village admin (global admin only) or a branch rep. Remove
   roles.
4. **Villages & families**: add a village (global admin only), add a family with its
   root person.
5. **Change log**: newest first, filterable by person, showing before and after.

## Data move (`db/import_yaml.py`)

1. Load `family-tree.yaml` with the existing `model.load_people` and `validate`.
2. Create village `bakheta` (Bakheta, Haryana) and family `bakheta`, with root
   `ramkrishan`.
3. People with `relation: father` get `father_id`. People with `relation: mother` get
   `mother_id`, plus `father_id` if that mother has a recorded husband. Both kinds get
   `family_id = bakheta`.
4. People with `relation: husband|wife` get a `marriages` row and `family_id = NULL`.
   Their `father`/`mother` become `father_name`/`mother_name`.
5. `needs-parent` people get `family_id = bakheta` and no parent.
6. Create the owner's account (person id given on the command line) with a global
   admin grant, and print the generated password once.
7. Running it again on a non-empty database refuses, unless `--replace` is given.

## Deploy steps

Owner:

1. Sign up at tidbcloud.com, create a free Starter cluster in Mumbai, and copy the
   connection string.
2. `npm i -g vercel` and `vercel login`.

Claude:

3. Run `db/schema.sql` on TiDB with the `mysql` client.
4. Run the import.
5. `vercel deploy --prod` from `api/`, with `DATABASE_URL` and `ALLOWED_ORIGIN` set.
6. Add `api.jainparivar.online` to the Vercel project. The owner adds the CNAME it
   gives (`api` → `cname.vercel-dns.com`) in Hostinger.
7. Smoke-test the live API.
8. Push the pages that use the API. From this push, relatives need a login. The owner
   creates accounts first.
9. Stop writing people data into the pages, and remove `auth.json` and the access-code
   code. `family-tree.yaml` stays in the repo for now (owner's decision, 2026-10-06);
   it is no longer what the site shows.
10. Add the weekly backup Action, with a token for `ankj77/family-tree-backup` stored
    as a repo secret.

## Testing

Python `unittest` and Node check scripts, as today. No new test frameworks.

1. **Permissions** (pure Python, no database): `can()` for every role against people
   inside and outside scope. This covers an in-law spouse, a child in another family,
   the branch root, a village admin on an in-law with no family, password reset against
   a higher role, and a branch rep's delete becoming a request.
2. **Validation**: `test_validate.py` updated for the new model: one root per family,
   no cycles, one spouse each, and the delete rules.
3. **API on a real MySQL**: Homebrew MySQL on the owner's Mac, throwaway database
   `family_tree_test` built from `db/schema.sql`, using Flask's test client. It covers
   login, lockout, logout, change password, add child, add spouse, edit, delete, delete
   request, approve and reject, create account, reset password, role grants, the change
   log, and that a rejected write leaves nothing saved.
4. **Import**: 175 people, the right number of marriages, one village, one family.
   The API's Bakheta tree JSON equals what `build.py` produces today, field by field
   (apart from the new `can_*` fields).
5. **Front end** (Node): the loader turns API answers into the view shapes, the buttons
   follow `can_edit`/`can_delete`, and logged-out users get the login form.
6. **After deploy**: a script against the live API (log in, fetch tree, make one edit,
   undo it), then a Chrome click-through: log in, switch family, edit, log out.

## Out of scope (later)

- Photo upload.
- One-click undo from the change log.
- Search across all families; search stays within the family on screen.
- Second marriages.
- Sign-up, email or phone login, forgotten-password emails.
- The header's notification bell and "Fix" button from the 2026-10-03 mockup.
