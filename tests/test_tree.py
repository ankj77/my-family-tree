import unittest

from family_tree.model import Person
from family_tree.tree import build_tree, Summary


class TestBuildTree(unittest.TestCase):
    def _people(self):
        return [
            Person(id="sevakram", name="Sevak Ram"),
            Person(id="kannu", name="Kannu", father="sevakram"),
            Person(id="gauri", name="Gaurishankar", father="kannu"),
            Person(id="sev_w", name="Wife One", spouse="sevakram"),
            Person(id="sev_w2", name="Wife Two", spouse="sevakram"),
            Person(id="floating", name="Floating", status="needs-parent"),
        ]

    def test_root_and_children_wired(self):
        root, unlinked, summary = build_tree(self._people())
        self.assertEqual(root["person"].id, "sevakram")
        self.assertEqual(len(root["children"]), 1)
        self.assertEqual(root["children"][0]["person"].id, "kannu")
        self.assertEqual(root["children"][0]["children"][0]["person"].id, "gauri")

    def test_wives_attached_to_husband(self):
        root, _, _ = build_tree(self._people())
        wife_ids = sorted(w.id for w in root["wives"])
        self.assertEqual(wife_ids, ["sev_w", "sev_w2"])

    def test_unlinked_holds_needs_parent(self):
        _, unlinked, _ = build_tree(self._people())
        self.assertEqual([p.id for p in unlinked], ["floating"])

    def test_summary_counts(self):
        _, _, summary = build_tree(self._people())
        self.assertEqual(summary.total, 6)
        self.assertEqual(summary.generations, 3)  # sevakram -> kannu -> gauri
        self.assertEqual(summary.needs_parent, 1)
        self.assertEqual(summary.uncertain, 0)


if __name__ == "__main__":
    unittest.main()
