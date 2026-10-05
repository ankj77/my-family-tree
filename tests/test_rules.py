import unittest

from family_tree.graph import Graph
from family_tree.rules import RuleError, check, clean_fields, delete_blocker, EDIT_FIELDS
from tests.sample import person, sample_graph, sample_rows


def graph_with(change):
    rows = sample_rows()
    change(rows)
    return Graph(rows["people"], rows["marriages"], rows["families"], rows["villages"], {"amit"})


class TestCheck(unittest.TestCase):
    def test_sample_is_valid(self):
        check(sample_graph())

    def test_needs_a_name(self):
        def change(rows):
            rows["people"][4].update(name=None, name_hi=None)
        with self.assertRaisesRegex(RuleError, "name"):
            check(graph_with(change))

    def test_cycle(self):
        def change(rows):
            rows["people"][0]["father_id"] = "amit"
        with self.assertRaisesRegex(RuleError, "own ancestor"):
            check(graph_with(change))

    def test_marriage_inside_one_family(self):
        def change(rows):
            rows["people"].append(person("geeta", family_id="bakheta", father_id="ram", gender="female"))
            rows["marriages"].append(("amit", "geeta"))
        with self.assertRaisesRegex(RuleError, "same family"):
            check(graph_with(change))

    def test_second_spouse(self):
        def change(rows):
            rows["people"].append(person("lata", gender="female"))
            rows["marriages"].append(("mohan", "lata"))
        with self.assertRaisesRegex(RuleError, "already has a spouse"):
            check(graph_with(change))

    def test_member_without_parent_in_family(self):
        def change(rows):
            rows["people"].append(person("stray", family_id="bakheta"))
        with self.assertRaisesRegex(RuleError, "Stray has no parent in the Bakheta family"):
            check(graph_with(change))

    def test_needs_parent_member_is_allowed(self):
        def change(rows):
            rows["people"].append(person("stray", family_id="bakheta", status="needs-parent"))
        check(graph_with(change))

    def test_root_must_not_have_parent_in_family(self):
        def change(rows):
            rows["families"][0]["root_person_id"] = "jagdish"
        with self.assertRaises(RuleError):
            check(graph_with(change))

    def test_login_only_for_living(self):
        rows = sample_rows()
        graph = Graph(rows["people"], rows["marriages"], rows["families"], rows["villages"], {"ram"})
        with self.assertRaisesRegex(RuleError, "living"):
            check(graph)


class TestDeleteBlocker(unittest.TestCase):
    def setUp(self):
        self.g = sample_graph()

    def test_root(self):
        self.assertIn("root of the Bakheta family", delete_blocker(self.g, "ram"))

    def test_has_children(self):
        self.assertIn("has children", delete_blocker(self.g, "jagdish"))
        self.assertIn("has children", delete_blocker(self.g, "rashmi"))

    def test_in_law_depends_on_member(self):
        self.assertIn("delete Vikram first", delete_blocker(self.g, "neha"))

    def test_leaf_and_in_law_can_go(self):
        self.assertIsNone(delete_blocker(self.g, "amit"))
        self.assertIsNone(delete_blocker(self.g, "vikram"))
        self.assertIsNone(delete_blocker(self.g, "sita"))


class TestCleanFields(unittest.TestCase):
    def test_strips_and_blanks_become_null(self):
        self.assertEqual(clean_fields({"name": "  Amit ", "born": "  "}, EDIT_FIELDS),
                         {"name": "Amit", "born": None})

    def test_unknown_field(self):
        with self.assertRaisesRegex(RuleError, "Unknown field"):
            clean_fields({"photo": "x"}, EDIT_FIELDS)

    def test_too_long(self):
        with self.assertRaisesRegex(RuleError, "longer than 200"):
            clean_fields({"name": "x" * 201}, EDIT_FIELDS)

    def test_bad_choice(self):
        with self.assertRaisesRegex(RuleError, "gender must be one of"):
            clean_fields({"gender": "other"}, EDIT_FIELDS)

    def test_sort_order_must_be_whole_number(self):
        with self.assertRaises(RuleError):
            clean_fields({"sort_order": True}, EDIT_FIELDS)
        with self.assertRaises(RuleError):
            clean_fields({"sort_order": 1.5}, EDIT_FIELDS)
        self.assertEqual(clean_fields({"sort_order": 3}, EDIT_FIELDS), {"sort_order": 3})

    def test_text_must_be_text(self):
        with self.assertRaisesRegex(RuleError, "must be text"):
            clean_fields({"name": 5}, EDIT_FIELDS)
