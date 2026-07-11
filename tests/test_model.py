import os
import tempfile
import unittest

from family_tree.model import Person, load_people, LoadError


def _write(text):
    fd, path = tempfile.mkstemp(suffix=".yaml")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    return path


class TestPerson(unittest.TestCase):
    def test_display_name_prefers_english(self):
        self.assertEqual(Person(id="x", name="Kannu", name_hi="कन्नू").display_name(), "Kannu")

    def test_display_name_falls_back_to_hindi_then_id(self):
        self.assertEqual(Person(id="x", name_hi="कन्नू").display_name(), "कन्नू")
        self.assertEqual(Person(id="x").display_name(), "x")


class TestLoadPeople(unittest.TestCase):
    def test_loads_all_fields_and_devanagari(self):
        path = _write(
            "- id: sevakram\n"
            "  name: Sevak Ram\n"
            "  name_hi: सेवकराम\n"
            "  born: \"1884\"\n"
            "- id: kannu\n"
            "  name: Kannu\n"
            "  father: sevakram\n"
        )
        people = load_people(path)
        self.assertEqual(len(people), 2)
        self.assertEqual(people[0].name_hi, "सेवकराम")
        self.assertEqual(people[1].father, "sevakram")

    def test_empty_file_returns_empty_list(self):
        self.assertEqual(load_people(_write("")), [])

    def test_non_list_top_level_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("id: sevakram\n"))

    def test_missing_id_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- name: Nobody\n"))

    def test_unknown_key_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  nickname: boss\n"))

    def test_invalid_status_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  status: dead\n"))


if __name__ == "__main__":
    unittest.main()
