import unittest

from family_tree.model import Person
from family_tree.validate import validate, ValidationError


def root():
    return Person(id="sevakram", name="Sevak Ram")


class TestValidate(unittest.TestCase):
    def test_valid_single_root_with_child_and_wife(self):
        people = [
            root(),
            Person(id="kannu", name="Kannu", father="sevakram"),
            Person(id="sev_w", name="Wife", spouse="sevakram"),
        ]
        self.assertEqual(validate(people), [])

    def test_duplicate_id_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="sevakram", name="Dup")])

    def test_missing_father_reference_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", name="X", father="ghost")])

    def test_missing_spouse_reference_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="w", name="W", spouse="ghost")])

    def test_both_father_and_spouse_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", name="X", father="sevakram", spouse="sevakram")])

    def test_no_name_at_all_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", father="sevakram")])

    def test_cycle_raises(self):
        with self.assertRaises(ValidationError):
            validate([
                Person(id="a", name="A", father="b"),
                Person(id="b", name="B", father="a"),
            ])

    def test_two_roots_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="other", name="Other")])

    def test_no_root_raises(self):
        # the only person is flagged needs-parent, so no root ancestor exists
        with self.assertRaises(ValidationError):
            validate([Person(id="np", name="Floating", status="needs-parent")])

    def test_needs_parent_and_uncertain_produce_warnings_not_errors(self):
        people = [
            root(),
            Person(id="np", name="Floating", status="needs-parent"),
            Person(id="uc", name="?", father="sevakram", status="uncertain"),
        ]
        warnings = validate(people)
        self.assertEqual(len(warnings), 2)
        self.assertTrue(any("need a parent" in w for w in warnings))
        self.assertTrue(any("uncertain" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()
