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


class TestReadableDefaultDepth(unittest.TestCase):
    def test_init_collapses_below_the_third_generation(self):
        html = _payload_html()
        self.assertIn("FT.OPEN_DEPTH = 2", html)
        self.assertIn("FT.collapseBelowOpenDepth", html)

    def test_expand_all_control_and_handler_exist(self):
        html = _payload_html()
        self.assertIn('id="expand-all"', html)
        self.assertIn("FT.expandAll", html)

    def test_expand_all_clears_every_collapsed_entry(self):
        html = _payload_html()
        self.assertIn("FT.state.collapsed = {}", html)


class TestPlaceholderSpouseIsNamedAfterItsPartner(unittest.TestCase):
    def test_helper_exists_and_the_bare_unknown_label_is_gone(self):
        html = _payload_html()
        self.assertIn("FT.placeholderName", html)
        self.assertNotIn("unfilled ? 'Unknown'", html)

    def test_both_relations_and_both_scripts_are_covered(self):
        html = _payload_html()
        self.assertIn("wife", html)
        self.assertIn("husband", html)
        self.assertIn("की पत्नी", html)
        self.assertIn("के पति", html)


class TestParchmentTheme(unittest.TestCase):
    def test_serif_display_stack_is_declared_and_used(self):
        html = _payload_html()
        self.assertIn("--serif", html)
        self.assertIn("font-family:var(--serif)", html)

    def test_card_name_ink_is_its_own_token(self):
        html = _payload_html()
        self.assertIn("--name-ink", html)

    def test_tagline_ornaments_are_present(self):
        html = _payload_html()
        self.assertIn('id="ornament-motto"', html)
        self.assertIn('id="ornament-story"', html)
        self.assertIn("roots stay forever", html)

    def test_theme_still_ships_no_web_fonts(self):
        html = _payload_html()
        self.assertNotIn("fonts.googleapis.com", html)
        self.assertNotIn("@font-face", html)
        self.assertNotIn("@import", html)


class TestPosterView(unittest.TestCase):
    def test_poster_view_is_registered_and_listed(self):
        html = _payload_html()
        self.assertIn("FT.views.poster", html)
        self.assertIn("Tree (organic)", html)
        self.assertIn("'poster'", html)

    def test_poster_caps_depth_and_the_core_honours_it(self):
        html = _payload_html()
        self.assertIn("maxDepth: 2", html)
        self.assertIn("FT.maxDepth", html)

    def test_poster_draws_its_own_trunk_roots_and_ground(self):
        html = _payload_html()
        self.assertIn("poster-trunk", html)
        self.assertIn("poster-root", html)
        self.assertIn("poster-ground", html)

    def test_poster_leaf_fill_uses_inline_style_not_an_attribute(self):
        html = _payload_html()
        self.assertIn("e.style.fill = ramp[", html)

    def test_collapse_toggles_are_hidden_in_the_poster(self):
        html = _payload_html()
        self.assertIn('#stage[data-view="poster"] .toggle', html)


class TestPosterParentCards(unittest.TestCase):
    def test_poster_declares_the_parents_card_style(self):
        html = _payload_html()
        self.assertIn("cardStyle: 'parents'", html)
        self.assertIn("FT.drawParentCard", html)

    def test_parent_resolution_helper_exists(self):
        html = _payload_html()
        self.assertIn("FT.parentsOf", html)

    def test_card_shows_father_and_mother_with_unknown_fallback(self):
        html = _payload_html()
        self.assertIn("'Father'", html)
        self.assertIn("'Mother'", html)
        self.assertIn("(Unknown)", html)

    def test_parent_card_height_is_its_own_constant(self):
        html = _payload_html()
        self.assertIn("FT.POSTER_CARD_H", html)


class TestPlaceholderHindiIsConditional(unittest.TestCase):
    def test_hindi_form_is_guarded_on_a_devanagari_name(self):
        html = _payload_html()
        self.assertIn("var hi = owner.name_hi ?", html)

    def test_both_mode_returns_one_line_when_there_is_no_devanagari_name(self):
        html = _payload_html()
        self.assertIn("return hi ? [en, hi] : [en];", html)


class TestProgressiveGenerations(unittest.TestCase):
    def test_depth_cap_lives_in_state_not_only_on_the_view(self):
        html = _payload_html()
        self.assertIn("FT.state.depthCap", html)

    def test_deeper_and_shallower_controls_exist(self):
        html = _payload_html()
        self.assertIn('id="deeper"', html)
        self.assertIn('id="shallower"', html)
        self.assertIn("FT.deepen", html)

    def test_expand_all_lifts_the_cap(self):
        html = _payload_html()
        self.assertIn("FT.state.depthCap = Infinity", html)

    def test_focus_reveals_a_person_deeper_than_the_cap(self):
        html = _payload_html()
        self.assertIn("FT.depthOf", html)
        self.assertIn("FT.revealDepth", html)

    def test_the_view_reports_the_trees_full_depth(self):
        html = _payload_html()
        self.assertIn("FT.treeDepth", html)


class TestSearchSuggestions(unittest.TestCase):
    def test_suggestion_panel_and_matcher_exist(self):
        html = _payload_html()
        self.assertIn('id="suggest"', html)
        self.assertIn("FT.searchMatches", html)

    def test_matcher_ranks_prefix_then_substring_then_subsequence(self):
        html = _payload_html()
        self.assertIn("RANK_PREFIX", html)
        self.assertIn("RANK_SUBSTRING", html)
        self.assertIn("RANK_SUBSEQUENCE", html)

    def test_it_searches_devanagari_as_well_as_latin(self):
        html = _payload_html()
        self.assertIn("n.name_hi", html)

    def test_suggestion_rows_escape_every_interpolated_value(self):
        html = _payload_html()
        self.assertIn("esc(FT.label(m.node)[0])", html)

    def test_keyboard_navigation_is_wired(self):
        html = _payload_html()
        self.assertIn("ArrowDown", html)
        self.assertIn("ArrowUp", html)
        self.assertIn("Escape", html)


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
        html = _payload_html()
        self.assertNotIn("'marriage'", html)
        self.assertNotIn("FT.NODE_H", html)

    def test_rail_is_drawn(self):
        self.assertIn("card-rail", _payload_html())

    def test_every_row_gets_full_width_hit_geometry(self):
        html = _payload_html()
        self.assertIn("'class': 'card-hit', x: 0, y: 0, width: FT.CARD_W, height: FT.ROW_H", html)
        self.assertIn(".card-hit{fill:transparent;pointer-events:all;}", html)

    def test_long_text_is_truncated_to_the_card_width(self):
        html = _payload_html()
        self.assertIn("fitText(name, FT.CARD_W - textX - 10)", html)
        self.assertIn("fitText(m, FT.CARD_W - metaX - 10)", html)
        self.assertIn("getComputedTextLength", html)

    def test_collapse_dot_clears_the_card_border(self):
        self.assertIn("FT.jointY(n) + 8", _payload_html())

    def test_stack_flag_and_reader_are_gone(self):
        html = _payload_html()
        self.assertNotIn("FT.stacked", html)
        self.assertNotIn("stack: true", html)

    def test_a_died_value_wins_over_a_living_flag(self):
        html = _payload_html()
        self.assertIn("FT.isDeceased(p) ? ' deceased' : ''", html)
        self.assertIn("dot: !FT.isDeceased(p) && p.life === 'living'", html)
        self.assertIn("if (p.born && p.died) return p.born + '\u2013' + p.died;", html)


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

    def test_a_living_flag_and_a_died_value_both_reach_the_payload(self):
        people = [
            Person(id="root", name="Root", gender="male", life="living", died="1962"),
        ]
        root, unlinked, summary = build_tree(people)
        html = render_html(root, unlinked, summary)
        self.assertIn('"life": "living"', html)
        self.assertIn('"died": "1962"', html)


class TestSheetRendersLifeStatus(unittest.TestCase):
    def _html(self):
        people = [
            Person(id="root", name="Root", gender="male", born="1884",
                   life="deceased", died="1961"),
            Person(id="kid", name="Kid", gender="male", relation="father",
                   relation_id="root", born="1992", life="living"),
        ]
        root, unlinked, summary = build_tree(people)
        return render_html(root, unlinked, summary)

    def test_sheet_renders_life_status(self):
        html = self._html()
        self.assertIn("Died", html)
        self.assertIn("Status", html)
        self.assertIn("FT.isDeceased(p) ? 'Deceased' : 'Living'", html)


class TestIsDeceasedIsCentralized(unittest.TestCase):
    def test_isDeceased_is_defined_once_and_used_by_the_card_and_the_sheet(self):
        html = _payload_html()
        self.assertIn(
            "FT.isDeceased = function (p) {\n"
            "    return !!(p.died || p.life === 'deceased');\n"
            "  };",
            html,
        )
        self.assertIn("FT.isDeceased(p) ? ' deceased' : ''", html)
        self.assertIn("FT.isDeceased(p) ? 'Deceased' : 'Living'", html)
        self.assertNotIn("var deceased = FT.isDeceased(n);", html)


if __name__ == "__main__":
    unittest.main()
