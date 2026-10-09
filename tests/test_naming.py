import unittest

from family_tree.naming import slug, username


class TestNaming(unittest.TestCase):
    def test_slug_from_english_name(self):
        self.assertEqual(slug("Jagdish Chand", set()), "jagdish_chand")

    def test_slug_adds_a_number_when_taken(self):
        self.assertEqual(slug("Jagdish Chand", {"jagdish_chand"}), "jagdish_chand_2")
        self.assertEqual(slug("Jagdish Chand", {"jagdish_chand", "jagdish_chand_2"}), "jagdish_chand_3")

    def test_hindi_only_name_gets_fallback(self):
        self.assertEqual(slug("अंकुर", set()), "person")
        self.assertEqual(slug("अंकुर", {"person"}), "person_2")
        self.assertEqual(username("अंकुर", set()), "user")

    def test_accents_are_dropped(self):
        self.assertEqual(slug("Ãnkur", set()), "ankur")

    def test_username_uses_dots_and_plain_numbers(self):
        self.assertEqual(username("Jagdish Chand", set()), "jagdish.chand")
        self.assertEqual(username("Jagdish Chand", {"jagdish.chand"}), "jagdish.chand2")
        self.assertEqual(username("Naveen", {"t-naveen"}, "t-"), "t-naveen2")

    def test_long_names_are_cut(self):
        self.assertLessEqual(len(slug("a" * 300, set())), 56)
