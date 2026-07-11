import unittest

from family_tree.model import Person
from family_tree.tree import build_tree
from family_tree.render import render_html


class TestRender(unittest.TestCase):
    def _html(self):
        people = [
            Person(id="sevakram", name="Sevak Ram", name_hi="सेवकराम"),
            Person(id="kannu", name="Kannu", father="sevakram"),
            Person(id="sev_w", name="Wife One", spouse="sevakram"),
            Person(id="floating", name="Floaty", status="needs-parent", note="taped"),
        ]
        root, unlinked, summary = build_tree(people)
        return render_html(root, unlinked, summary)

    def test_is_self_contained_html(self):
        html = self._html()
        self.assertTrue(html.lstrip().lower().startswith("<!doctype html"))
        self.assertNotIn("http://", html.replace("http://www.w3.org", ""))  # no external URLs except SVG ns
        self.assertNotIn("https://", html)

    def test_contains_english_and_devanagari_names(self):
        html = self._html()
        self.assertIn("Sevak Ram", html)
        self.assertIn("सेवकराम", html)
        self.assertIn("Kannu", html)

    def test_contains_unlinked_and_summary_data(self):
        html = self._html()
        self.assertIn("Floaty", html)
        self.assertIn("tree-data", html)
        self.assertIn("unlinked-data", html)


if __name__ == "__main__":
    unittest.main()
