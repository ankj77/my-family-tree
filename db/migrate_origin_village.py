#!/usr/bin/env python3
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import db
from family_tree.importer import origin_village_ids

OLD_COLUMNS = ("origin_village", "origin_district", "origin_state")


def columns(cur):
    cur.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'people'")
    return {r["COLUMN_NAME"] for r in cur.fetchall()}


def link(cur):
    cur.execute("SELECT id, name, district, state FROM villages")
    villages = list(cur.fetchall())
    known = {v["id"] for v in villages}
    cur.execute("SELECT id, origin_village, origin_district, origin_state FROM people")
    people = cur.fetchall()
    origins = [{"village": p["origin_village"], "district": p["origin_district"], "state": p["origin_state"]}
               for p in people]
    ids = origin_village_ids(origins, villages)
    for village in villages:
        if village["id"] in known:
            cur.execute("UPDATE villages SET district=%s, state=%s WHERE id=%s",
                        (village["district"], village["state"], village["id"]))
        else:
            db.insert_rows(cur, "villages", [village])
            print("new village: %s" % village["name"])
    if "origin_village_id" not in columns(cur):
        cur.execute("ALTER TABLE people ADD COLUMN origin_village_id VARCHAR(64) NULL")
    for person, village_id in zip(people, ids):
        cur.execute("UPDATE people SET origin_village_id=%s WHERE id=%s", (village_id, person["id"]))
    cur.connection.commit()
    cur.execute("ALTER TABLE people ADD CONSTRAINT fk_person_origin_village "
                "FOREIGN KEY (origin_village_id) REFERENCES villages(id)")
    print("linked %d people to a home village" % sum(1 for i in ids if i))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Turn the origin text columns into a link to villages.")
    parser.add_argument("--drop-old", action="store_true",
                        help="after the new API is live: drop the origin text columns and families.root_person_id")
    args = parser.parse_args(argv)
    cur = db.connect().cursor()
    have = columns(cur)
    if args.drop_old:
        for column in OLD_COLUMNS:
            if column in have:
                cur.execute("ALTER TABLE people DROP COLUMN %s" % column)
        cur.execute("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                    "AND TABLE_NAME = 'families' AND COLUMN_NAME = 'root_person_id'")
        if cur.fetchone():
            cur.execute("ALTER TABLE families DROP FOREIGN KEY fk_family_root")
            cur.execute("ALTER TABLE families DROP COLUMN root_person_id")
        print("dropped the old origin columns and families.root_person_id")
    elif "origin_village_id" in have:
        print("already migrated")
    else:
        link(cur)
    return 0


if __name__ == "__main__":
    sys.exit(main())
