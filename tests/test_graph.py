import unittest

from tests.sample import sample_graph


class TestGraph(unittest.TestCase):
    def setUp(self):
        self.g = sample_graph()

    def test_tree_parent_prefers_the_parent_in_the_same_family(self):
        self.assertEqual(self.g.tree_parent("amit"), "jagdish")
        self.assertEqual(self.g.tree_parent("rashmi"), "bash")
        self.assertIsNone(self.g.tree_parent("ram"))
        self.assertIsNone(self.g.tree_parent("sita"))

    def test_kids_follow_tree_parents(self):
        self.assertEqual(self.g.kids["jagdish"], ["amit", "neha"])
        self.assertEqual(self.g.kids["rashmi"], [])

    def test_children_of_counts_both_parents(self):
        self.assertEqual(self.g.children_of("rashmi"), ["amit", "neha"])
        self.assertEqual(self.g.children_of("vikram"), [])

    def test_spouse_lookup_both_ways(self):
        self.assertEqual(self.g.spouse["jagdish"], "rashmi")
        self.assertEqual(self.g.spouse["rashmi"], "jagdish")

    def test_branch_is_descendants_in_family_plus_spouses(self):
        self.assertEqual(self.g.branch("jagdish"), {"jagdish", "amit", "neha", "rashmi", "vikram"})
        self.assertEqual(self.g.branch("bash"), {"bash", "rashmi", "jagdish"})

    def test_home_family_falls_back_to_spouse(self):
        self.assertEqual(self.g.home_family("sita"), "bakheta")
        self.assertEqual(self.g.home_family("rashmi"), "pugthala")
        self.assertEqual(self.g.village_of("vikram"), "bakheta")
        self.assertEqual(self.g.village_of("rashmi"), "pugthala")

    def test_unknown_branch_root_is_empty(self):
        self.assertEqual(self.g.branch("nobody"), set())
