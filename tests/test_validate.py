import unittest

from family_tree.model import Person
from family_tree.validate import validate, ValidationError


def root():
    return Person(id="sevakram", name="Sevak Ram", gender="male")


def father(pid, name, parent):
    return Person(id=pid, name=name, gender="male", relation="father", relation_id=parent)


class TestValidate(unittest.TestCase):
    def test_valid_root_child_mother_and_spouse(self):
        people = [
            root(),
            father("kannu", "Kannu", "sevakram"),
            Person(id="sev_w", name="Wife", gender="female", relation="husband", relation_id="sevakram"),
            # a child linked via its mother
            Person(id="child2", name="Child Two", gender="male", relation="mother", relation_id="sev_w"),
        ]
        self.assertEqual(validate(people), [])

    def test_duplicate_id_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="sevakram", name="Dup")])

    def test_missing_relation_reference_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), father("x", "X", "ghost")])

    def test_relation_without_relation_id_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", name="X", relation="father")])

    def test_relation_id_without_relation_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", name="X", relation_id="sevakram")])

    def test_self_relation_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", name="X", relation="father", relation_id="x")])

    def test_no_name_at_all_raises(self):
        with self.assertRaises(ValidationError):
            validate([root(), Person(id="x", gender="male", relation="father", relation_id="sevakram")])

    def test_cycle_raises(self):
        with self.assertRaises(ValidationError):
            validate([
                Person(id="a", name="A", relation="father", relation_id="b"),
                Person(id="b", name="B", relation="father", relation_id="a"),
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
            Person(id="uc", name="?", relation="father", relation_id="sevakram", status="uncertain"),
        ]
        warnings = validate(people)
        self.assertEqual(len(warnings), 2)
        self.assertTrue(any("need a parent" in w for w in warnings))
        self.assertTrue(any("uncertain" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()
