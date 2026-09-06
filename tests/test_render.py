import unittest

from family_tree.model import Address, Person
from family_tree.tree import build_tree
from family_tree.render import render_html


class TestRender(unittest.TestCase):
    def _html(self):
        people = [
            Person(id="sevakram", name="Sevak Ram", name_hi="सेवकराम", gender="male"),
            Person(id="kannu", name="Kannu", gender="male", relation="father", relation_id="sevakram"),
            Person(id="sev_w", name="Wife One", gender="female", relation="husband", relation_id="sevakram"),
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


class TestAssetInlining(unittest.TestCase):
    def test_css_and_js_are_inlined_not_linked(self):
        html = TestRender()._html()
        self.assertNotIn("<link", html)
        self.assertNotIn("<script src=", html)
        self.assertIn("FT.init();", html)

    def test_no_es_module_syntax(self):
        html = TestRender()._html()
        self.assertNotIn('type="module"', html)
        self.assertNotIn("\nexport ", html)


def _payload_html():
    people = [
        Person(id="root", name="Root", gender="male"),
        Person(id="w", name="Wife", gender="female", relation="wife", relation_id="root"),
        Person(id="kid", name="Kid", gender="male", relation="father", relation_id="root",
               address=Address(city="Rohtak", country="India")),
    ]
    root, unlinked, summary = build_tree(people)
    return render_html(root, unlinked, summary)


class TestPayload(unittest.TestCase):
    def test_payload_carries_address_and_couple_structure(self):
        html = _payload_html()
        self.assertIn("Rohtak", html)
        self.assertIn("child_groups", html)
        self.assertIn("placeholder", html)

    def test_classic_view_is_registered(self):
        self.assertIn("FT.views.classic", _payload_html())


class TestDetailSheet(unittest.TestCase):
    def test_sheet_markup_is_present(self):
        html = _payload_html()
        self.assertIn('id="sheet"', html)
        self.assertIn("FT.closeSheet", html)


class TestHorizontalView(unittest.TestCase):
    def test_horizontal_view_is_registered(self):
        self.assertIn("FT.views.horizontal", _payload_html())


class TestViewPicker(unittest.TestCase):
    def test_picker_and_all_three_labels_present(self):
        html = _payload_html()
        self.assertIn('id="view-picker"', html)
        self.assertIn("Classic (top-down)", html)
        self.assertIn("Left to right", html)
        self.assertIn("Tree (organic)", html)


class TestOrganicView(unittest.TestCase):
    def test_organic_view_is_registered(self):
        self.assertIn("FT.views.organic", _payload_html())

    def test_stable_hash_and_leaf_shape_live_in_the_shared_core(self):
        html = _payload_html()
        self.assertIn("FT.hash01", html)
        self.assertIn("FT.leafCount", html)
        self.assertIn("nodeShape === 'leaf'", html)

    def test_branches_keep_the_edge_class_so_highlighting_still_finds_them(self):
        html = _payload_html()
        self.assertIn("'edge branch'", html)
        self.assertNotIn("'branch'", html)

    def test_labels_are_hidden_below_the_zoom_threshold(self):
        html = _payload_html()
        self.assertIn("hide-labels", html)
        self.assertIn(".hide-labels .leaflabel", html)

    def test_branch_width_is_set_via_style_not_attribute(self):
        html = _payload_html()
        self.assertIn("style.strokeWidth", html)


if __name__ == "__main__":
    unittest.main()
