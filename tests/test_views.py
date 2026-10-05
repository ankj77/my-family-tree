import os
import unittest

from family_tree.graph import Graph
from family_tree.importer import rows_from_yaml
from family_tree.model import inherit_origins, load_people
from family_tree.render import _node_json, _person_json, summary_json
from family_tree.tree import build_tree
from family_tree.views import family_json, family_links, origin_of
from tests.sample import sample_graph

YAML = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "family-tree.yaml")


class TestSampleViews(unittest.TestCase):
    def setUp(self):
        self.g = sample_graph()

    def test_bakheta_tree_shape(self):
        data = family_json(self.g, "bakheta", lambda pid: {})
        tree = data["tree"]
        self.assertEqual(tree["id"], "ram")
        self.assertEqual([c["id"] for c in tree["children"]], ["jagdish", "mohan"])
        jagdish = tree["children"][0]
        self.assertEqual([s["id"] for s in jagdish["spouses"]], ["rashmi"])
        self.assertEqual(jagdish["spouses"][0]["father"], "Bash")
        self.assertEqual(data["family"], {"id": "bakheta", "name": "Bakheta", "village": "Bakheta"})
        self.assertEqual(data["summary"]["total"], 8)

    def test_pugthala_tree_shows_bakheta_husband_as_spouse(self):
        tree = family_json(self.g, "pugthala", lambda pid: {})["tree"]
        rashmi = tree["children"][0]
        self.assertEqual(rashmi["id"], "rashmi")
        self.assertEqual([s["id"] for s in rashmi["spouses"]], ["jagdish"])
        self.assertEqual(rashmi["spouses"][0]["father"], "Ram")

    def test_extras_reach_every_card(self):
        data = family_json(self.g, "bakheta", lambda pid: {"seen": pid})
        cards = []

        def walk(n):
            cards.append(n)
            cards.extend(n["spouses"])
            for c in n["children"]:
                walk(c)
        walk(data["tree"])
        self.assertTrue(all(c["seen"] == c["id"] for c in cards))

    def test_origins(self):
        self.assertEqual(origin_of(self.g, "amit"), ({"village": "Bakheta", "state": "Haryana"}, True))
        self.assertEqual(origin_of(self.g, "ram"), ({"village": "Bakheta", "state": "Haryana"}, False))
        self.assertEqual(origin_of(self.g, "sita"), ({"village": "Kakroi"}, False))
        self.assertEqual(origin_of(self.g, "vikram"), ({}, False))
        self.assertEqual(origin_of(self.g, "bash"), ({"village": "Pugthala", "state": "Haryana"}, True))

    def test_family_links(self):
        self.assertEqual(family_links(self.g, "rashmi"), [
            {"text": "Born in Pugthala family", "family_id": "pugthala"},
            {"text": "Married into Bakheta family", "family_id": "bakheta"},
        ])
        self.assertEqual(family_links(self.g, "neha"), [{"text": "Born in Bakheta family", "family_id": "bakheta"}])
        self.assertEqual(family_links(self.g, "vikram"),
                         [{"text": "Married into Bakheta family", "family_id": "bakheta"}])
        self.assertEqual(family_links(self.g, "sita"),
                         [{"text": "Married into Bakheta family", "family_id": "bakheta"}])


class TestSameTreeAsToday(unittest.TestCase):
    def test_api_tree_matches_the_static_build(self):
        people = load_people(YAML)
        inherit_origins(people)
        root, unlinked, summary = build_tree(people)
        rows = rows_from_yaml(YAML)
        graph = Graph(rows["people"], rows["marriages"], rows["families"], rows["villages"])
        data = family_json(graph, "bakheta", lambda pid: {})
        self.assertEqual(data["tree"], _node_json(root))
        self.assertEqual(data["unlinked"], [_person_json(p) for p in unlinked])
        self.assertEqual(data["summary"], summary_json(summary))
