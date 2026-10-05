#!/usr/bin/env python3
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import db
from family_tree import auth, naming, rules
from family_tree.importer import rows_from_yaml


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Load family-tree.yaml into the database, once.")
    parser.add_argument("--admin", required=True, help="person id that becomes the first global admin")
    parser.add_argument("--yaml", default="family-tree.yaml")
    parser.add_argument("--create-schema", action="store_true", help="create the tables first")
    parser.add_argument("--replace", action="store_true", help="delete everything already in the database")
    args = parser.parse_args(argv)

    rows = rows_from_yaml(args.yaml)
    admin = next((r for r in rows["people"] if r["id"] == args.admin), None)
    if admin is None:
        print("ERROR: no person with id '%s' in %s" % (args.admin, args.yaml), file=sys.stderr)
        return 1
    if admin["life"] != "living":
        print("ERROR: '%s' must be marked life: living to get a login" % args.admin, file=sys.stderr)
        return 1

    conn = db.connect()
    cur = conn.cursor()
    if args.create_schema:
        db.run_sql_file(cur, db.SCHEMA)
    cur.execute("SELECT COUNT(*) AS n FROM people")
    if cur.fetchone()["n"] and not args.replace:
        print("ERROR: the database already has people; pass --replace to start over", file=sys.stderr)
        return 1
    if args.replace:
        db.wipe(cur)
    db.import_rows(cur, rows)
    graph, _ = db.load_graph(cur)
    rules.check(graph)
    password = auth.new_password()
    username = naming.username(rules.display(admin), set())
    db.insert_rows(cur, "accounts", [{"person_id": admin["id"], "username": username,
                                      "password_hash": auth.make_hash(password)}])
    db.insert_rows(cur, "role_grants", [{"person_id": admin["id"], "scope": "global", "scope_id": ""}])
    conn.commit()
    conn.close()
    print("Imported %d people and %d marriages." % (len(rows["people"]), len(rows["marriages"])))
    print("Global admin login (shown once): username %s  password %s" % (username, password))
    return 0


if __name__ == "__main__":
    sys.exit(main())
