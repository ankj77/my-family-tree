import os
import ssl
from datetime import datetime, timedelta
from urllib.parse import unquote, urlparse

import certifi
import pymysql
import pymysql.cursors

from family_tree.graph import PERSON_COLUMNS, Graph

SCHEMA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db", "schema.sql")
LOCAL_HOSTS = ("localhost", "127.0.0.1")
WIPE_ORDER = ("guest_sessions", "guest_logins", "change_log", "delete_requests", "sessions", "role_grants", "accounts",
              "marriages", "people", "families", "villages")
IMPORT_START = datetime(2026, 1, 1)


def connect(url=None):
    parts = urlparse(url or os.environ["DATABASE_URL"])
    options = dict(
        host=parts.hostname,
        port=parts.port or 3306,
        user=unquote(parts.username or ""),
        password=unquote(parts.password or ""),
        database=parts.path.lstrip("/") or None,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )
    if parts.hostname not in LOCAL_HOSTS:
        options["ssl"] = ssl.create_default_context(cafile=certifi.where())
    return pymysql.connect(**options)


def run_sql_file(cur, path):
    with open(path, encoding="utf-8") as f:
        for statement in f.read().split(";"):
            if statement.strip():
                cur.execute(statement)


def insert_rows(cur, table, rows):
    for row in rows:
        columns = list(row)
        cur.execute(
            "INSERT INTO %s (%s) VALUES (%s)" % (table, ", ".join(columns), ", ".join(["%s"] * len(columns))),
            [row[c] for c in columns],
        )


def wipe(cur):
    cur.execute("SET FOREIGN_KEY_CHECKS=0")
    for table in WIPE_ORDER:
        cur.execute("DELETE FROM %s" % table)
    cur.execute("SET FOREIGN_KEY_CHECKS=1")


def import_rows(cur, rows):
    insert_rows(cur, "villages", rows["villages"])
    insert_rows(cur, "families", rows["families"])
    for index, row in enumerate(rows["people"]):
        plain = dict(row, father_id=None, mother_id=None,
                     created_at=IMPORT_START + timedelta(microseconds=index))
        insert_rows(cur, "people", [plain])
    for row in rows["people"]:
        if row["father_id"] or row["mother_id"]:
            cur.execute("UPDATE people SET father_id=%s, mother_id=%s WHERE id=%s",
                        (row["father_id"], row["mother_id"], row["id"]))
    insert_rows(cur, "marriages", [{"husband_id": h, "wife_id": w} for h, w in rows["marriages"]])


def load_graph(cur):
    cur.execute("SELECT %s FROM people ORDER BY created_at, id" % ", ".join(PERSON_COLUMNS))
    people = cur.fetchall()
    cur.execute("SELECT husband_id, wife_id FROM marriages")
    marriages = [(r["husband_id"], r["wife_id"]) for r in cur.fetchall()]
    cur.execute("SELECT id, village_id, name FROM families ORDER BY name, id")
    families = cur.fetchall()
    cur.execute("SELECT id, name, district, state FROM villages ORDER BY name, id")
    villages = cur.fetchall()
    cur.execute("SELECT person_id FROM accounts")
    accounts = [r["person_id"] for r in cur.fetchall()]
    cur.execute("SELECT id, person_id, scope, scope_id FROM role_grants ORDER BY id")
    grants = list(cur.fetchall())
    return Graph(list(people), marriages, list(families), list(villages), accounts), grants
