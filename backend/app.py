import json
import os
import re
from datetime import datetime, timedelta, timezone

import pymysql
from flask import Flask, g, jsonify, request
from werkzeug.exceptions import HTTPException

from backend import db
from family_tree import auth, naming, rules, views
from family_tree.permissions import RANK, Access
from family_tree.rules import RuleError, display

SESSION_COOKIE = "ft_session"
SESSION_DAYS = 30
LOCK_AFTER = 5
LOCK_MINUTES = 15
WRITE_METHODS = ("POST", "PATCH", "DELETE")
DUMMY_HASH = auth.make_hash("not-a-real-password")

app = Flask(__name__)


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def allowed_origin():
    return os.environ.get("ALLOWED_ORIGIN", "https://jainparivar.online")


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def conn():
    if "conn" not in g:
        g.conn = db.connect()
    return g.conn


@app.teardown_appcontext
def _close(_exc):
    connection = g.pop("conn", None)
    if connection is not None:
        try:
            connection.rollback()
        finally:
            connection.close()


@app.errorhandler(Exception)
def _error(e):
    if isinstance(e, ApiError):
        return jsonify(error=e.message), e.status
    if isinstance(e, RuleError):
        return jsonify(error=str(e)), 409
    if isinstance(e, pymysql.err.IntegrityError):
        return jsonify(error="That change clashes with data already saved"), 409
    if isinstance(e, HTTPException):
        return jsonify(error=e.description), e.code
    app.logger.exception(e)
    return jsonify(error="Something went wrong on the server"), 500


@app.before_request
def _guard():
    if request.method == "OPTIONS":
        return app.response_class(status=204)
    if request.method in WRITE_METHODS:
        if request.headers.get("Origin") != allowed_origin():
            raise ApiError(403, "Requests must come from %s" % allowed_origin())
        if request.method != "DELETE" and not request.is_json:
            raise ApiError(415, "Send JSON")
    return None


@app.after_request
def _cors(response):
    if request.headers.get("Origin") == allowed_origin():
        response.headers["Access-Control-Allow-Origin"] = allowed_origin()
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        response.headers["Vary"] = "Origin"
    return response


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Send a JSON object")
    return data


def _dump(value):
    return None if value is None else json.dumps(value, ensure_ascii=False, default=str)


def log(cur, actor, person_id, action, before=None, after=None):
    cur.execute(
        "INSERT INTO change_log (actor_id, person_id, action, before_json, after_json) VALUES (%s, %s, %s, %s, %s)",
        (actor, person_id, action, _dump(before), _dump(after)),
    )


def commit_checked(cur):
    graph, _ = db.load_graph(cur)
    rules.check(graph)
    conn().commit()


def name_of(graph, pid):
    return display(graph.people[pid]) if pid in graph.people else pid


def current_person():
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise ApiError(401, "Please log in")
    cur = conn().cursor()
    cur.execute("SELECT person_id FROM sessions WHERE token_hash=%s AND expires_at > %s",
                (auth.token_hash(token), now()))
    row = cur.fetchone()
    if row is None:
        raise ApiError(401, "Please log in")
    return row["person_id"]


def context():
    actor = current_person()
    graph, grants = db.load_graph(conn().cursor())
    return actor, graph, Access(graph, grants, actor)


def me_json(pid):
    cur = conn().cursor()
    graph, grants = db.load_graph(cur)
    access = Access(graph, grants, pid)
    cur.execute("SELECT username FROM accounts WHERE person_id=%s", (pid,))
    row = graph.people[pid]
    return {
        "id": pid,
        "name": row.get("name"),
        "name_hi": row.get("name_hi"),
        "username": cur.fetchone()["username"],
        "roles": [{"id": g["id"], "scope": g["scope"], "scope_id": g["scope_id"]} for g in access.mine],
        "is_admin": access.is_admin(),
        "is_global": access.is_global,
        "home_family": graph.home_family(pid),
    }


def _set_cookie(response, token, max_age):
    response.set_cookie(
        SESSION_COOKIE, token, max_age=max_age, path="/", httponly=True, samesite="Lax",
        secure=os.environ.get("COOKIE_SECURE", "1") == "1",
        domain=os.environ.get("COOKIE_DOMAIN") or None,
    )


@app.post("/login")
def login():
    data = body()
    username = str(data.get("username") or "").strip().lower()
    password = str(data.get("password") or "")
    cur = conn().cursor()
    cur.execute("SELECT person_id, password_hash, failed_logins, locked_until FROM accounts WHERE username=%s",
                (username,))
    account = cur.fetchone()
    if account is None:
        auth.check_hash(password, DUMMY_HASH)
        raise ApiError(401, "Wrong username or password")
    if account["locked_until"] and account["locked_until"] > now():
        raise ApiError(429, "Too many wrong passwords. Try again in %d minutes." % LOCK_MINUTES)
    pid = account["person_id"]
    if not auth.check_hash(password, account["password_hash"]):
        cur.execute("UPDATE accounts SET failed_logins = failed_logins + 1 WHERE person_id=%s", (pid,))
        cur.execute("SELECT failed_logins FROM accounts WHERE person_id=%s", (pid,))
        if cur.fetchone()["failed_logins"] >= LOCK_AFTER:
            cur.execute("UPDATE accounts SET locked_until=%s, failed_logins=0 WHERE person_id=%s",
                        (now() + timedelta(minutes=LOCK_MINUTES), pid))
        conn().commit()
        raise ApiError(401, "Wrong username or password")
    token = auth.new_token()
    cur.execute("UPDATE accounts SET failed_logins=0, locked_until=NULL WHERE person_id=%s", (pid,))
    cur.execute("DELETE FROM sessions WHERE expires_at < %s", (now(),))
    cur.execute("INSERT INTO sessions (token_hash, person_id, expires_at) VALUES (%s, %s, %s)",
                (auth.token_hash(token), pid, now() + timedelta(days=SESSION_DAYS)))
    conn().commit()
    response = jsonify(me_json(pid))
    _set_cookie(response, token, SESSION_DAYS * 86400)
    return response


@app.post("/logout")
def logout():
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        cur = conn().cursor()
        cur.execute("DELETE FROM sessions WHERE token_hash=%s", (auth.token_hash(token),))
        conn().commit()
    response = jsonify(status="logged out")
    _set_cookie(response, "", 0)
    return response


@app.get("/me")
def me():
    return jsonify(me_json(current_person()))


@app.post("/me/password")
def change_password():
    actor = current_person()
    data = body()
    old, new = str(data.get("old") or ""), str(data.get("new") or "")
    cur = conn().cursor()
    cur.execute("SELECT password_hash FROM accounts WHERE person_id=%s", (actor,))
    if not auth.check_hash(old, cur.fetchone()["password_hash"]):
        raise ApiError(403, "The old password is wrong")
    if len(new) < auth.MIN_LENGTH:
        raise RuleError("The new password needs at least %d characters" % auth.MIN_LENGTH)
    current = auth.token_hash(request.cookies.get(SESSION_COOKIE))
    cur.execute("UPDATE accounts SET password_hash=%s WHERE person_id=%s", (auth.make_hash(new), actor))
    cur.execute("DELETE FROM sessions WHERE person_id=%s AND token_hash<>%s", (actor, current))
    log(cur, actor, actor, "password_change")
    conn().commit()
    return jsonify(status="changed")


def person_extras(graph, access, pending, pid):
    mode = access.delete_mode(pid)
    blocker = rules.delete_blocker(graph, pid) if mode else None
    can_edit = access.can_edit(pid)
    row = graph.people[pid]
    return {
        "family_id": row.get("family_id"),
        "can_edit": can_edit,
        "can_move": access.is_admin_over(pid),
        "can_delete": mode if mode and not blocker else False,
        "delete_reason": blocker,
        "delete_pending": pid in pending,
        "links": views.family_links(graph, pid),
        "edit": {k: row.get(k) for k in rules.EDIT_FIELDS + rules.LINK_FIELDS} if can_edit else None,
    }


@app.get("/villages")
def list_villages():
    _, graph, _ = context()
    out = []
    for village in graph.villages.values():
        families = [
            {"id": f["id"], "name": f["name"], "root_person_id": f["root_person_id"]}
            for f in graph.families.values() if f["village_id"] == village["id"]
        ]
        out.append(dict(village, families=families))
    return jsonify(out)


@app.get("/people")
def list_people():
    _, graph, _ = context()
    return jsonify([
        {"id": pid, "name": row.get("name"), "name_hi": row.get("name_hi"), "gender": row.get("gender"),
         "life": row.get("life"), "family_id": row.get("family_id"), "has_account": pid in graph.account_ids}
        for pid, row in graph.people.items()
    ])


@app.get("/families/<family_id>/tree")
def family_tree(family_id):
    _, graph, access = context()
    if family_id not in graph.families:
        raise ApiError(404, "No such family")
    cur = conn().cursor()
    cur.execute("SELECT person_id FROM delete_requests WHERE status='pending'")
    pending = {r["person_id"] for r in cur.fetchall()}
    return jsonify(views.family_json(graph, family_id, lambda pid: person_extras(graph, access, pending, pid)))


def child_links(graph, parent_id):
    parent = graph.people[parent_id]
    spouse = graph.spouse.get(parent_id)
    wives = {w for _, w in graph.marriages}
    is_mother = parent_id in wives or (spouse is None and parent.get("gender") == "female")
    if is_mother:
        links = {"mother_id": parent_id, "father_id": spouse}
    else:
        links = {"father_id": parent_id, "mother_id": spouse}
    father = graph.people.get(links["father_id"])
    links["family_id"] = (father and father.get("family_id")) or graph.home_family(parent_id)
    return links


@app.post("/people")
def create_person():
    actor, graph, access = context()
    data = dict(body())
    kind = data.pop("as", None)
    if kind == "child":
        anchor = data.pop("parent_id", None)
    elif kind == "spouse":
        anchor = data.pop("spouse_id", None)
    else:
        raise ApiError(400, 'Say "as": "child" or "as": "spouse"')
    if anchor not in graph.people:
        raise ApiError(404, "No such person")
    if not access.can_edit(anchor):
        raise ApiError(403, "You cannot edit %s" % name_of(graph, anchor))
    allowed = rules.EDIT_FIELDS + (("family_id",) if kind == "spouse" else ())
    fields = rules.clean_fields(data, allowed)
    if kind == "child":
        fields.update(child_links(graph, anchor))
    else:
        if anchor in graph.spouse:
            raise RuleError("%s already has a spouse: %s" % (name_of(graph, anchor), name_of(graph, graph.spouse[anchor])))
        if fields.get("family_id") is not None and fields["family_id"] not in graph.families:
            raise ApiError(404, "No such family")
        anchor_gender = graph.people[anchor].get("gender")
        if not fields.get("gender"):
            fields["gender"] = {"male": "female", "female": "male"}.get(anchor_gender)
        if fields.get("gender") is None or fields["gender"] == anchor_gender:
            raise RuleError("Choose the spouse's gender; husband and wife must differ")
    pid = naming.slug(fields.get("name") or fields.get("name_hi") or "", set(graph.people))
    fields.update(id=pid, updated_by=actor)
    cur = conn().cursor()
    db.insert_rows(cur, "people", [fields])
    if kind == "spouse":
        husband, wife = (pid, anchor) if fields["gender"] == "male" else (anchor, pid)
        db.insert_rows(cur, "marriages", [{"husband_id": husband, "wife_id": wife}])
    log(cur, actor, pid, "create", None, fields)
    commit_checked(cur)
    return jsonify(id=pid), 201


@app.patch("/people/<pid>")
def update_person(pid):
    actor, graph, access = context()
    if pid not in graph.people:
        raise ApiError(404, "No such person")
    if not access.can_edit(pid):
        raise ApiError(403, "You cannot edit %s" % name_of(graph, pid))
    data = body()
    if set(data) & set(rules.LINK_FIELDS) and not access.is_admin_over(pid):
        raise ApiError(403, "Only an admin can move a person to other parents or another family")
    fields = rules.clean_fields(data, rules.EDIT_FIELDS + rules.LINK_FIELDS)
    for key in ("father_id", "mother_id"):
        if fields.get(key) is not None and fields[key] not in graph.people:
            raise ApiError(404, "No such person: %s" % fields[key])
    if fields.get("family_id") is not None and fields["family_id"] not in graph.families:
        raise ApiError(404, "No such family")
    for key in ("father_id", "mother_id"):
        if fields.get(key) is not None and not access.is_admin_over(fields[key]):
            raise ApiError(403, "You cannot move %s under %s" % (name_of(graph, pid), name_of(graph, fields[key])))
    family_id = fields.get("family_id")
    if family_id is not None and not (
        access.is_global or graph.families[family_id]["village_id"] in access.admin_villages()
    ):
        raise ApiError(403, "You cannot move people into the %s family" % graph.families[family_id]["name"])
    if not fields:
        return jsonify(id=pid)
    before = {k: graph.people[pid].get(k) for k in fields}
    assignments = ", ".join("%s=%%s" % k for k in fields)
    cur = conn().cursor()
    cur.execute("UPDATE people SET %s, updated_by=%%s WHERE id=%%s" % assignments,
                list(fields.values()) + [actor, pid])
    log(cur, actor, pid, "update", before, fields)
    commit_checked(cur)
    return jsonify(id=pid)


def is_last_global(grants, pid):
    return {g["person_id"] for g in grants if g["scope"] == "global"} == {pid}


def delete_guard(graph, access, pid):
    if access.rank_of(pid) > 0 and not access.can_manage_account(pid):
        raise ApiError(403, "%s holds a role you cannot remove" % name_of(graph, pid))
    if is_last_global(access.grants, pid):
        raise RuleError("%s is the only global admin; make someone else global admin first" % name_of(graph, pid))


def delete_person(cur, graph, actor, pid, action):
    log(cur, actor, pid, action, graph.people[pid], None)
    cur.execute("DELETE FROM role_grants WHERE scope='branch' AND scope_id=%s", (pid,))
    cur.execute("DELETE FROM people WHERE id=%s", (pid,))


@app.delete("/people/<pid>")
def remove_person(pid):
    actor, graph, access = context()
    if pid not in graph.people:
        raise ApiError(404, "No such person")
    mode = access.delete_mode(pid)
    if mode is None:
        raise ApiError(403, "You cannot delete %s" % name_of(graph, pid))
    delete_guard(graph, access, pid)
    blocker = rules.delete_blocker(graph, pid)
    if blocker:
        raise RuleError(blocker)
    cur = conn().cursor()
    if mode == "request":
        cur.execute("SELECT id FROM delete_requests WHERE person_id=%s AND status='pending'", (pid,))
        if cur.fetchone() is None:
            cur.execute("INSERT INTO delete_requests (person_id, requested_by) VALUES (%s, %s)", (pid, actor))
            log(cur, actor, pid, "delete_request")
        conn().commit()
        return jsonify(status="requested"), 202
    delete_person(cur, graph, actor, pid, "delete")
    commit_checked(cur)
    return jsonify(status="deleted")


@app.get("/delete-requests")
def list_delete_requests():
    _, graph, access = context()
    if not access.is_admin():
        raise ApiError(403, "Only admins see delete requests")
    cur = conn().cursor()
    cur.execute("SELECT id, person_id, requested_by, created_at FROM delete_requests "
                "WHERE status='pending' ORDER BY created_at, id")
    return jsonify([
        {"id": r["id"], "person_id": r["person_id"], "person": name_of(graph, r["person_id"]),
         "requested_by": name_of(graph, r["requested_by"]), "created_at": r["created_at"].isoformat()}
        for r in cur.fetchall() if access.is_admin_over(r["person_id"])
    ])


@app.post("/delete-requests/<int:request_id>/<decision>")
def decide_delete(request_id, decision):
    if decision not in ("approve", "reject"):
        raise ApiError(404, "Not found")
    actor, graph, access = context()
    cur = conn().cursor()
    cur.execute("SELECT person_id FROM delete_requests WHERE id=%s AND status='pending'", (request_id,))
    row = cur.fetchone()
    if row is None:
        raise ApiError(404, "No such pending request")
    pid = row["person_id"]
    if not access.is_admin_over(pid):
        raise ApiError(403, "You cannot decide this request")
    if decision == "approve":
        delete_guard(graph, access, pid)
    if decision == "reject":
        cur.execute("UPDATE delete_requests SET status='rejected', decided_by=%s, decided_at=%s WHERE id=%s",
                    (actor, now(), request_id))
        log(cur, actor, pid, "delete_reject")
        conn().commit()
        return jsonify(status="rejected")
    blocker = rules.delete_blocker(graph, pid)
    if blocker:
        raise RuleError(blocker)
    delete_person(cur, graph, actor, pid, "delete_approve")
    commit_checked(cur)
    return jsonify(status="deleted")


USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")


def clean_username(value):
    name = str(value or "").strip().lower()
    if not USERNAME_RE.match(name):
        raise RuleError("A username needs 3 to 64 letters, digits, dots, dashes or underscores")
    return name


def usernames(cur):
    cur.execute("SELECT person_id, username FROM accounts")
    return {r["person_id"]: r["username"] for r in cur.fetchall()}


def require_admin(access):
    if not access.is_admin():
        raise ApiError(403, "Only admins can do this")


def manageable(graph, access, pid):
    if pid not in graph.account_ids:
        raise ApiError(404, "%s has no login" % name_of(graph, pid))
    if not access.can_manage_account(pid):
        raise ApiError(403, "You cannot manage %s's login" % name_of(graph, pid))


@app.get("/accounts")
def list_accounts():
    _, graph, access = context()
    require_admin(access)
    names = usernames(conn().cursor())
    return jsonify([
        {"person_id": pid, "name": row.get("name"), "name_hi": row.get("name_hi"),
         "family_id": graph.home_family(pid), "username": names.get(pid),
         "can_manage": access.can_manage_account(pid)}
        for pid, row in graph.people.items()
        if (row.get("life") == "living" or pid in names) and access.is_admin_over(pid)
    ])


@app.post("/accounts")
def create_account():
    actor, graph, access = context()
    data = body()
    pid = data.get("person_id")
    if pid not in graph.people:
        raise ApiError(404, "No such person")
    if not access.can_manage_account(pid):
        raise ApiError(403, "You cannot make a login for %s" % name_of(graph, pid))
    if pid in graph.account_ids:
        raise RuleError("%s already has a login" % name_of(graph, pid))
    if graph.people[pid].get("life") != "living":
        raise RuleError("Only living people get a login; mark %s as living first" % name_of(graph, pid))
    cur = conn().cursor()
    taken = set(usernames(cur).values())
    username = clean_username(data["username"]) if data.get("username") else naming.username(name_of(graph, pid), taken)
    if username in taken:
        raise RuleError("The username %s is taken" % username)
    password = auth.new_password()
    db.insert_rows(cur, "accounts", [{"person_id": pid, "username": username, "password_hash": auth.make_hash(password)}])
    log(cur, actor, pid, "account_create", None, {"username": username})
    commit_checked(cur)
    return jsonify(username=username, password=password), 201


@app.patch("/accounts/<pid>")
def rename_account(pid):
    actor, graph, access = context()
    manageable(graph, access, pid)
    username = clean_username(body().get("username"))
    cur = conn().cursor()
    names = usernames(cur)
    if username in set(names.values()) - {names[pid]}:
        raise RuleError("The username %s is taken" % username)
    cur.execute("UPDATE accounts SET username=%s WHERE person_id=%s", (username, pid))
    log(cur, actor, pid, "account_rename", {"username": names[pid]}, {"username": username})
    conn().commit()
    return jsonify(username=username)


@app.post("/accounts/<pid>/password")
def reset_password(pid):
    actor, graph, access = context()
    manageable(graph, access, pid)
    password = auth.new_password()
    cur = conn().cursor()
    cur.execute("UPDATE accounts SET password_hash=%s, failed_logins=0, locked_until=NULL WHERE person_id=%s",
                (auth.make_hash(password), pid))
    cur.execute("DELETE FROM sessions WHERE person_id=%s", (pid,))
    log(cur, actor, pid, "password_reset")
    conn().commit()
    return jsonify(username=usernames(cur)[pid], password=password)


@app.delete("/accounts/<pid>")
def delete_account(pid):
    actor, graph, access = context()
    manageable(graph, access, pid)
    if is_last_global(access.grants, pid):
        raise RuleError("%s is the only global admin; make someone else global admin first" % name_of(graph, pid))
    cur = conn().cursor()
    cur.execute("DELETE FROM accounts WHERE person_id=%s", (pid,))
    log(cur, actor, pid, "account_delete")
    conn().commit()
    return jsonify(status="deleted")


def scope_name(graph, grant):
    if grant["scope"] == "village":
        village = graph.villages.get(grant["scope_id"])
        return village["name"] if village else grant["scope_id"]
    if grant["scope"] == "branch":
        return name_of(graph, grant["scope_id"])
    return "Everything"


@app.get("/role-grants")
def list_grants():
    _, graph, access = context()
    require_admin(access)
    return jsonify([
        {"id": g["id"], "person_id": g["person_id"], "person": name_of(graph, g["person_id"]),
         "scope": g["scope"], "scope_id": g["scope_id"], "scope_name": scope_name(graph, g)}
        for g in access.grants
    ])


@app.post("/role-grants")
def create_grant():
    actor, graph, access = context()
    data = body()
    pid, scope = data.get("person_id"), data.get("scope")
    scope_id = "" if scope == "global" else str(data.get("scope_id") or "")
    if scope not in RANK:
        raise RuleError("scope must be global, village or branch")
    if pid not in graph.people:
        raise ApiError(404, "No such person")
    if pid not in graph.account_ids:
        raise RuleError("%s needs a login before getting a role" % name_of(graph, pid))
    if scope == "village" and scope_id not in graph.villages:
        raise ApiError(404, "No such village")
    if scope == "branch" and scope_id not in graph.people:
        raise ApiError(404, "No such person to root the branch")
    if not access.can_manage_account(pid):
        raise ApiError(403, "You cannot give roles to %s" % name_of(graph, pid))
    if not access.can_grant(scope, scope_id):
        raise ApiError(403, "You cannot give that role")
    if any(g["person_id"] == pid and g["scope"] == scope and g["scope_id"] == scope_id for g in access.grants):
        raise RuleError("%s already has that role" % name_of(graph, pid))
    cur = conn().cursor()
    cur.execute("INSERT INTO role_grants (person_id, scope, scope_id) VALUES (%s, %s, %s)", (pid, scope, scope_id))
    grant_id = cur.lastrowid
    log(cur, actor, pid, "role_grant", None, {"scope": scope, "scope_id": scope_id})
    conn().commit()
    return jsonify(id=grant_id), 201


@app.delete("/role-grants/<int:grant_id>")
def delete_grant(grant_id):
    actor, graph, access = context()
    grant = next((g for g in access.grants if g["id"] == grant_id), None)
    if grant is None:
        raise ApiError(404, "No such role")
    if not access.can_manage_account(grant["person_id"]):
        raise ApiError(403, "You cannot change %s's roles" % name_of(graph, grant["person_id"]))
    if not access.can_grant(grant["scope"], grant["scope_id"]):
        raise ApiError(403, "You cannot remove that role")
    if grant["scope"] == "global" and is_last_global(access.grants, grant["person_id"]):
        raise RuleError("This is the only global admin; make someone else global admin first")
    cur = conn().cursor()
    cur.execute("DELETE FROM role_grants WHERE id=%s", (grant_id,))
    log(cur, actor, grant["person_id"], "role_revoke", {"scope": grant["scope"], "scope_id": grant["scope_id"]}, None)
    conn().commit()
    return jsonify(status="removed")


def required_text(data, key, label):
    value = str(data.get(key) or "").strip()
    if not value:
        raise RuleError("%s is required" % label)
    if len(value) > 200:
        raise RuleError("%s is longer than 200 characters" % label)
    return value


@app.post("/villages")
def create_village():
    actor, graph, access = context()
    if not access.is_global:
        raise ApiError(403, "Only a global admin can add villages")
    data = body()
    name = required_text(data, "name", "Village name")
    extra = {}
    for key, label in (("district", "District"), ("state", "State")):
        value = str(data.get(key) or "").strip()
        if len(value) > 200:
            raise RuleError("%s is longer than 200 characters" % label)
        extra[key] = value or None
    vid = naming.slug(name, set(graph.villages), fallback="village")
    cur = conn().cursor()
    db.insert_rows(cur, "villages", [dict(extra, id=vid, name=name)])
    log(cur, actor, None, "village_create", None, dict(extra, id=vid, name=name))
    conn().commit()
    return jsonify(id=vid), 201


@app.post("/families")
def create_family():
    actor, graph, access = context()
    data = body()
    village_id = data.get("village_id")
    if village_id not in graph.villages:
        raise ApiError(404, "No such village")
    if not access.can_create_family(village_id):
        raise ApiError(403, "You cannot add families to this village")
    name = required_text(data, "name", "Family name")
    root = data.get("root") if isinstance(data.get("root"), dict) else {}
    root_fields = rules.clean_fields(root, rules.EDIT_FIELDS)
    fid = naming.slug(name, set(graph.families), fallback="family")
    pid = naming.slug(root_fields.get("name") or root_fields.get("name_hi") or "", set(graph.people))
    cur = conn().cursor()
    db.insert_rows(cur, "families", [{"id": fid, "village_id": village_id, "name": name, "root_person_id": None}])
    db.insert_rows(cur, "people", [dict(root_fields, id=pid, family_id=fid, updated_by=actor)])
    cur.execute("UPDATE families SET root_person_id=%s WHERE id=%s", (pid, fid))
    log(cur, actor, pid, "family_create", None, {"family": fid, "name": name, "village": village_id})
    commit_checked(cur)
    return jsonify(id=fid, root_person_id=pid), 201


def _loads(value):
    return json.loads(value) if isinstance(value, str) else value


@app.get("/change-log")
def change_log():
    _, graph, access = context()
    require_admin(access)
    try:
        limit = max(1, min(int(request.args.get("limit", 100)), 500))
    except ValueError:
        raise ApiError(400, "limit must be a number")
    person_id = request.args.get("person_id")
    cur = conn().cursor()
    sql = "SELECT id, at, actor_id, person_id, action, before_json, after_json FROM change_log"
    args = []
    if person_id:
        sql += " WHERE person_id=%s"
        args.append(person_id)
    cur.execute(sql + " ORDER BY at DESC, id DESC LIMIT %d" % limit, args)
    out = []
    for r in cur.fetchall():
        if not access.is_global and not (r["person_id"] in graph.people and access.is_admin_over(r["person_id"])):
            continue
        out.append({"id": r["id"], "at": r["at"].isoformat(), "actor_id": r["actor_id"],
                    "person_id": r["person_id"], "action": r["action"],
                    "before": _loads(r["before_json"]), "after": _loads(r["after_json"])})
    return jsonify(out)
