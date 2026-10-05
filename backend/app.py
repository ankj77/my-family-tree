import json
import os
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
        raise ApiError(401, "Wrong username or password")
    if account["locked_until"] and account["locked_until"] > now():
        raise ApiError(429, "Too many wrong passwords. Try again in %d minutes." % LOCK_MINUTES)
    pid = account["person_id"]
    if not auth.check_hash(password, account["password_hash"]):
        failed = account["failed_logins"] + 1
        locked = now() + timedelta(minutes=LOCK_MINUTES) if failed >= LOCK_AFTER else None
        cur.execute("UPDATE accounts SET failed_logins=%s, locked_until=%s WHERE person_id=%s",
                    (0 if locked else failed, locked, pid))
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
