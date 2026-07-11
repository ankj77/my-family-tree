import unittest

from family_tree.model import Person
from family_tree.tree import build_tree, Summary


class TestBuildTree(unittest.TestCase):
    def _people(self):
        return [
            Person(id="sevakram", name="Sevak Ram", gender="male"),
            Person(id="kannu", name="Kannu", gender="male", relation="father", relation_id="sevakram"),
            Person(id="gauri", name="Gaurishankar", gender="male", relation="father", relation_id="kannu"),
            # a daughter (a blood node) and her child linked via a mother relation
            Person(id="daughter", name="Daughter", gender="female", relation="father", relation_id="sevakram"),
            Person(id="dchild", name="Daughter Child", gender="male", relation="mother", relation_id="daughter"),
            # two spouses of the root, one via husband, one via wife relation
            Person(id="sev_w", name="Wife One", gender="female", relation="husband", relation_id="sevakram"),
            Person(id="sev_w2", name="Wife Two", gender="female", relation="wife", relation_id="sevakram"),
            Person(id="floating", name="Floating", status="needs-parent"),
        ]

    def _find_child(self, node, pid):
        for c in node["children"]:
            if c["person"].id == pid:
                return c
        return None

    def test_root_and_children_wired(self):
        root, unlinked, summary = build_tree(self._people())
        self.assertEqual(root["person"].id, "sevakram")
        child_ids = sorted(c["person"].id for c in root["children"])
        self.assertEqual(child_ids, ["daughter", "kannu"])
        self.assertEqual(self._find_child(root, "kannu")["children"][0]["person"].id, "gauri")

    def test_mother_relation_attaches_child(self):
        root, _, _ = build_tree(self._people())
        daughter = self._find_child(root, "daughter")
        self.assertEqual([c["person"].id for c in daughter["children"]], ["dchild"])

    def test_spouses_attached_to_person(self):
        root, _, _ = build_tree(self._people())
        wife_ids = sorted(w.id for w in root["wives"])
        self.assertEqual(wife_ids, ["sev_w", "sev_w2"])

    def test_unlinked_holds_needs_parent(self):
        _, unlinked, _ = build_tree(self._people())
        self.assertEqual([p.id for p in unlinked], ["floating"])

    def test_children_sorted_by_order_then_file_order(self):
        people = [
            Person(id="root", name="Root", gender="male"),
            # file order: a, b, c, d — but b has order 1, c has order 2, a/d unordered
            Person(id="a", name="A", relation="father", relation_id="root"),
            Person(id="b", name="B", relation="father", relation_id="root", order=1),
            Person(id="c", name="C", relation="father", relation_id="root", order=2),
            Person(id="d", name="D", relation="father", relation_id="root"),
        ]
        root, _, _ = build_tree(people)
        # ordered (b=1, c=2) come first left-to-right, then unordered a, d in file order
        self.assertEqual([c["person"].id for c in root["children"]], ["b", "c", "a", "d"])

    def test_summary_counts(self):
        _, _, summary = build_tree(self._people())
        self.assertEqual(summary.total, 8)
        self.assertEqual(summary.generations, 3)  # sevakram -> kannu -> gauri (and -> daughter -> dchild)
        self.assertEqual(summary.needs_parent, 1)
        self.assertEqual(summary.uncertain, 0)


if __name__ == "__main__":
    unittest.main()
