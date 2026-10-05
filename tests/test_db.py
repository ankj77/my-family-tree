import os

import pymysql

from backend import db
from family_tree.importer import rows_from_yaml
from family_tree.rules import check
from tests.dbcase import DbCase
from tests.sample import sample_rows

YAML = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "family-tree.yaml")


class TestDb(DbCase):
    def load(self, rows):
        with self.conn.cursor() as cur:
            db.import_rows(cur, rows)
            graph, grants = db.load_graph(cur)
        self.conn.commit()
        return graph, grants

    def test_sample_round_trip(self):
        rows = sample_rows()
        graph, grants = self.load(rows)
        self.assertEqual(graph.people, {r["id"]: r for r in rows["people"]})
        self.assertEqual(set(graph.marriages), set(rows["marriages"]))
        self.assertEqual(graph.families["bakheta"]["root_person_id"], "ram")
        self.assertEqual(list(graph.people), [r["id"] for r in rows["people"]])
        self.assertEqual(grants, [])

    def test_yaml_import_passes_rules(self):
        graph, _ = self.load(rows_from_yaml(YAML))
        self.assertEqual(len(graph.people), 175)
        check(graph)

    def test_parent_cannot_be_deleted_under_child(self):
        self.load(sample_rows())
        with self.assertRaises(pymysql.err.IntegrityError):
            with self.conn.cursor() as cur:
                cur.execute("DELETE FROM people WHERE id='jagdish'")
        self.conn.rollback()

    def test_one_spouse_each_is_enforced(self):
        self.load(sample_rows())
        with self.assertRaises(pymysql.err.IntegrityError):
            with self.conn.cursor() as cur:
                cur.execute("INSERT INTO marriages (husband_id, wife_id) VALUES ('jagdish','neha')")
        self.conn.rollback()
