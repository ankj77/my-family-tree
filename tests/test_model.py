import os
import shutil
import tempfile
import unittest

from family_tree.model import Person, load_people, resolve_photos, LoadError


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
            "  gender: male\n"
            "  born: \"1884\"\n"
            "- id: kannu\n"
            "  name: Kannu\n"
            "  gender: male\n"
            "  relation: father\n"
            "  relation_id: sevakram\n"
        )
        people = load_people(path)
        self.assertEqual(len(people), 2)
        self.assertEqual(people[0].name_hi, "सेवकराम")
        self.assertEqual(people[0].gender, "male")
        self.assertEqual(people[1].relation, "father")
        self.assertEqual(people[1].relation_id, "sevakram")

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

    def test_invalid_relation_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  relation: cousin\n  relation_id: y\n"))

    def test_invalid_gender_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  gender: alien\n"))

    def test_malformed_yaml_raises_loaderror(self):
        # unbalanced bracket -> a raw yaml error, surfaced as a clean LoadError
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: [unclosed\n"))


class TestAddress(unittest.TestCase):
    def test_parses_all_address_keys(self):
        people = load_people(
            _write(
                "- id: x\n"
                "  name: X\n"
                "  address:\n"
                "    line: House 214\n"
                "    locality: Sector 14\n"
                "    city: Rohtak\n"
                "    state: Haryana\n"
                "    country: India\n"
            )
        )
        addr = people[0].address
        self.assertEqual(addr.line, "House 214")
        self.assertEqual(addr.locality, "Sector 14")
        self.assertEqual(addr.city, "Rohtak")
        self.assertEqual(addr.state, "Haryana")
        self.assertEqual(addr.country, "India")
        self.assertFalse(addr.is_empty())

    def test_partial_address_is_allowed(self):
        people = load_people(
            _write("- id: x\n  name: X\n  address:\n    city: Rohtak\n")
        )
        self.assertEqual(people[0].address.city, "Rohtak")
        self.assertIsNone(people[0].address.line)

    def test_missing_address_is_empty_not_none(self):
        people = load_people(_write("- id: x\n  name: X\n"))
        self.assertTrue(people[0].address.is_empty())
        self.assertIsNone(people[0].address.city)

    def test_unknown_address_key_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  address:\n    citty: Rohtak\n"))

    def test_non_mapping_address_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  address: Rohtak\n"))

    def test_numeric_address_value_is_stringified(self):
        people = load_people(
            _write("- id: x\n  name: X\n  address:\n    line: 214\n")
        )
        self.assertEqual(people[0].address.line, "214")


class TestMotherId(unittest.TestCase):
    def test_mother_id_is_parsed(self):
        people = load_people(
            _write(
                "- id: dad\n  name: Dad\n"
                "- id: kid\n  name: Kid\n  relation: father\n  relation_id: dad\n"
                "  mother_id: mom\n"
            )
        )
        self.assertEqual(people[1].mother_id, "mom")

    def test_missing_mother_id_is_none(self):
        people = load_people(_write("- id: x\n  name: X\n"))
        self.assertIsNone(people[0].mother_id)

    def test_non_scalar_mother_id_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  mother_id: [a, b]\n"))


class TestResolvePhotos(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.photos = os.path.join(self.dir, "photos")
        os.mkdir(self.photos)

    def tearDown(self):
        shutil.rmtree(self.dir)

    def _touch(self, name, size=10):
        with open(os.path.join(self.photos, name), "wb") as f:
            f.write(b"x" * size)

    def test_matches_photo_to_person_by_id(self):
        self._touch("kannu.jpg")
        people = [Person(id="kannu", name="Kannu")]
        warnings = resolve_photos(people, self.photos)
        self.assertEqual(people[0].photo, "photos/kannu.jpg")
        self.assertEqual(warnings, [])

    def test_person_without_photo_stays_none(self):
        people = [Person(id="kannu", name="Kannu")]
        resolve_photos(people, self.photos)
        self.assertIsNone(people[0].photo)

    def test_all_supported_extensions_match(self):
        for ext in ("jpg", "jpeg", "png", "webp"):
            self._touch("p_%s.%s" % (ext, ext))
        people = [Person(id="p_%s" % e, name=e) for e in ("jpg", "jpeg", "png", "webp")]
        resolve_photos(people, self.photos)
        self.assertTrue(all(p.photo is not None for p in people))

    def test_unrelated_extension_is_ignored(self):
        self._touch("kannu.txt")
        people = [Person(id="kannu", name="Kannu")]
        warnings = resolve_photos(people, self.photos)
        self.assertIsNone(people[0].photo)
        self.assertEqual(warnings, [])

    def test_photo_matching_no_person_warns(self):
        self._touch("nobody.jpg")
        warnings = resolve_photos([Person(id="kannu", name="Kannu")], self.photos)
        self.assertEqual(len(warnings), 1)
        self.assertIn("nobody.jpg", warnings[0])

    def test_duplicate_extensions_pick_alphabetically_first_and_warn(self):
        self._touch("kannu.jpg")
        self._touch("kannu.png")
        people = [Person(id="kannu", name="Kannu")]
        warnings = resolve_photos(people, self.photos)
        self.assertEqual(people[0].photo, "photos/kannu.jpg")
        self.assertEqual(len(warnings), 1)
        self.assertIn("kannu.png", warnings[0])

    def test_duplicate_extensions_are_alphabetical_not_priority_ordered(self):
        self._touch("kannu.jpg")
        self._touch("kannu.jpeg")
        people = [Person(id="kannu", name="Kannu")]
        warnings = resolve_photos(people, self.photos)
        self.assertEqual(people[0].photo, "photos/kannu.jpeg")
        self.assertEqual(len(warnings), 1)
        self.assertIn("kannu.jpg", warnings[0])

    def test_oversized_photo_warns_with_sips_hint(self):
        self._touch("kannu.jpg", size=200 * 1024)
        warnings = resolve_photos([Person(id="kannu", name="Kannu")], self.photos)
        self.assertEqual(len(warnings), 1)
        self.assertIn("sips", warnings[0])

    def test_missing_photo_dir_is_not_an_error(self):
        self.assertEqual(resolve_photos([Person(id="k", name="K")], "/nonexistent/dir"), [])


class TestLifeAndDied(unittest.TestCase):
    def test_parses_life_and_died(self):
        people = load_people(
            _write(
                "- id: x\n"
                "  name: X\n"
                "  born: \"1884\"\n"
                "  life: deceased\n"
                "  died: \"1961\"\n"
            )
        )
        self.assertEqual(people[0].life, "deceased")
        self.assertEqual(people[0].died, "1961")

    def test_life_living_is_allowed(self):
        people = load_people(_write("- id: x\n  name: X\n  life: living\n"))
        self.assertEqual(people[0].life, "living")

    def test_missing_life_and_died_are_none(self):
        people = load_people(_write("- id: x\n  name: X\n"))
        self.assertIsNone(people[0].life)
        self.assertIsNone(people[0].died)

    def test_invalid_life_raises(self):
        with self.assertRaises(LoadError):
            load_people(_write("- id: x\n  name: X\n  life: undead\n"))

    def test_numeric_died_is_stringified(self):
        people = load_people(_write("- id: x\n  name: X\n  died: 1961\n"))
        self.assertEqual(people[0].died, "1961")

    def test_died_accepts_free_text(self):
        people = load_people(_write("- id: x\n  name: X\n  died: c. 1961 (Samvat 2018)\n"))
        self.assertEqual(people[0].died, "c. 1961 (Samvat 2018)")


if __name__ == "__main__":
    unittest.main()
