import os
import unittest

from family_tree.graph import PERSON_COLUMNS, Graph
from family_tree.importer import rows_from_yaml
from family_tree.rules import check

YAML = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "family-tree.yaml")


class TestImporter(unittest.TestCase):
    def setUp(self):
        self.rows = rows_from_yaml(YAML)
        self.by_id = {r["id"]: r for r in self.rows["people"]}

    def test_counts(self):
        self.assertEqual(len(self.rows["people"]), 175)
        self.assertEqual(len(self.rows["marriages"]), 28)
        self.assertEqual([v["id"] for v in self.rows["villages"]], ["bakheta"])
        self.assertEqual(self.rows["families"][0]["root_person_id"], "ramkrishan")

    def test_rows_have_every_column(self):
        for row in self.rows["people"]:
            self.assertEqual(set(row), set(PERSON_COLUMNS))

    def test_blood_members_and_in_laws(self):
        self.assertEqual(self.by_id["ankur"]["family_id"], "bakheta")
        self.assertEqual(self.by_id["ankur"]["father_id"], "vijay")
        self.assertIsNone(self.by_id["attro"]["family_id"])
        self.assertEqual(self.by_id["attro"]["origin_village"], "Bal Pabana")
        self.assertEqual(self.by_id["jagdishchand_wife"]["origin_village"], "Pugthala")

    def test_mother_linked_child_gets_her_husband_as_father(self):
        self.assertEqual(self.by_id["santosh"]["mother_id"], "chalti")
        self.assertEqual(self.by_id["santosh"]["father_id"], "chalti_husband")
        self.assertEqual(self.by_id["pogarmal"]["mother_id"], "roodi")
        self.assertIsNone(self.by_id["pogarmal"]["father_id"])

    def test_imported_graph_passes_rules(self):
        check(Graph(self.rows["people"], self.rows["marriages"], self.rows["families"], self.rows["villages"]))
