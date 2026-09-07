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


class TestScriptConcatenationOrder(unittest.TestCase):
    def test_app_js_precedes_views_which_precede_init(self):
        html = _payload_html()
        app_js_pos = html.index("var FT = { views: {} };")
        classic_pos = html.index("FT.views.classic")
        horizontal_pos = html.index("FT.views.horizontal")
        organic_pos = html.index("FT.views.organic")
        init_pos = html.index("FT.init();")
        self.assertLess(app_js_pos, classic_pos)
        self.assertLess(app_js_pos, horizontal_pos)
        self.assertLess(app_js_pos, organic_pos)
        self.assertLess(classic_pos, init_pos)
        self.assertLess(horizontal_pos, init_pos)
        self.assertLess(organic_pos, init_pos)


class TestThemeTokens(unittest.TestCase):
    def test_token_block_is_present(self):
        html = _payload_html()
        for token in ("--canvas", "--card", "--rail-m", "--rail-f", "--ink",
                      "--ink-muted", "--living", "--connector", "--bark",
                      "--leaf-1", "--font", "--shadow-card"):
            self.assertIn(token, html)

    def test_no_web_fonts(self):
        html = _payload_html()
        self.assertNotIn("fonts.googleapis.com", html)
        self.assertNotIn("@font-face", html)
        self.assertNotIn("@import", html)


class TestCoupleCard(unittest.TestCase):
    def test_card_constants_replace_the_box_constants(self):
        html = _payload_html()
        self.assertIn("FT.CARD_W = 250", html)
        self.assertIn("FT.ROW_H = 52", html)
        self.assertNotIn("FT.SPOUSE_W", html)
        self.assertNotIn("FT.BAR", html)

    def test_marriage_bar_is_gone(self):
        self.assertNotIn("class=\"marriage\"", _payload_html())

    def test_rail_is_drawn(self):
        self.assertIn("card-rail", _payload_html())

    def test_stack_flag_and_reader_are_gone(self):
        html = _payload_html()
        self.assertNotIn("FT.stacked", html)
        self.assertNotIn("stack: true", html)

    def test_lifespan_helper_is_present(self):
        html = _payload_html()
        self.assertIn("FT.lifespan", html)
        self.assertIn("FT.metaLine", html)


class TestLifePayload(unittest.TestCase):
    def test_life_and_died_reach_the_payload(self):
        people = [
            Person(id="root", name="Root", gender="male", life="deceased", died="1962"),
            Person(id="kid", name="Kid", gender="male", relation="father",
                   relation_id="root", life="living"),
        ]
        root, unlinked, summary = build_tree(people)
        html = render_html(root, unlinked, summary)
        self.assertIn('"life": "deceased"', html)
        self.assertIn('"died": "1962"', html)
        self.assertIn('"life": "living"', html)


if __name__ == "__main__":
    unittest.main()
