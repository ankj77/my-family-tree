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


class TestMotherIdValidation(unittest.TestCase):
    def _base(self):
        return [
            Person(id="dad", name="Dad", gender="male"),
            Person(id="mom", name="Mom", gender="female", relation="wife", relation_id="dad"),
            Person(id="kid", name="Kid", relation="father", relation_id="dad", mother_id="mom"),
        ]

    def test_valid_mother_id_produces_no_warning(self):
        warnings = validate(self._base())
        self.assertEqual([w for w in warnings if w.startswith("mother_id")], [])

    def test_unknown_mother_id_raises(self):
        people = self._base()
        people[2].mother_id = "ghost"
        with self.assertRaises(ValidationError):
            validate(people)

    def test_self_referential_mother_id_raises(self):
        people = self._base()
        people[2].mother_id = "kid"
        with self.assertRaises(ValidationError):
            validate(people)

    def test_mother_id_pointing_at_a_non_spouse_warns(self):
        people = self._base()
        people.append(Person(id="stranger", name="Stranger", gender="female",
                             relation="father", relation_id="dad"))
        people[2].mother_id = "stranger"
        warnings = validate(people)
        self.assertTrue(any(w.startswith("mother_id") for w in warnings))


class TestLifeValidation(unittest.TestCase):
    def test_living_with_a_death_date_warns(self):
        people = [
            Person(id="root", name="Root", gender="male", life="living", died="1961"),
        ]
        warnings = validate(people)
        self.assertTrue(any(w.startswith("life") for w in warnings))

    def test_deceased_with_a_death_date_does_not_warn(self):
        people = [
            Person(id="root", name="Root", gender="male", life="deceased", died="1961"),
        ]
        self.assertEqual([w for w in validate(people) if w.startswith("life")], [])

    def test_died_without_life_does_not_warn(self):
        people = [Person(id="root", name="Root", gender="male", died="1961")]
        self.assertEqual([w for w in validate(people) if w.startswith("life")], [])

    def test_living_without_a_death_date_does_not_warn(self):
        people = [Person(id="root", name="Root", gender="male", life="living")]
        self.assertEqual([w for w in validate(people) if w.startswith("life")], [])


if __name__ == "__main__":
    unittest.main()
