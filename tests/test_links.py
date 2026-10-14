import unittest

from family_tree import kinship, links
from family_tree.graph import Graph
from tests.sample import person, sample_graph, sample_rows


def rels(steps):
    return [s["rel"] for s in steps]


def ids(steps):
    return [s["id"] for s in steps]


class TestPersonPath(unittest.TestCase):
    def setUp(self):
        self.graph = sample_graph()

    def test_uncle_through_grandfather(self):
        steps = links.person_path(self.graph, "amit", "mohan")
        self.assertEqual(ids(steps), ["amit", "jagdish", "ram", "mohan"])
        self.assertEqual(rels(steps), [None, "father", "father", "son"])

    def test_crosses_a_marriage_into_another_village(self):
        steps = links.person_path(self.graph, "bash", "mohan")
        self.assertEqual(rels(steps), [None, "daughter", "husband", "father", "son"])
        self.assertEqual(links.segments(steps), [[0, 1], [2, 3, 4]])

    def test_same_person(self):
        self.assertEqual(links.person_path(self.graph, "amit", "amit"), [{"id": "amit", "rel": None}])

    def test_no_link(self):
        rows = sample_rows()
        rows["people"].append(person("alone", gender="male"))
        graph = Graph(rows["people"], rows["marriages"], rows["families"], rows["villages"])
        self.assertIsNone(links.person_path(graph, "amit", "alone"))

    def test_unknown_person(self):
        self.assertIsNone(links.person_path(self.graph, "amit", "nobody"))

    def test_equal_length_prefers_fewer_marriages(self):
        people = [
            person("a", father_id="f", mother_id="m", gender="male"),
            person("f", gender="male"),
            person("m", mother_id="t", gender="female"),
            person("t", gender="female"),
        ]
        graph = Graph(people, [("f", "t")], [], [])
        self.assertEqual(rels(links.person_path(graph, "a", "t")), [None, "mother", "mother"])

    def test_neutral_words_without_gender(self):
        people = [person("kid", father_id="dad"), person("dad")]
        graph = Graph(people, [], [], [])
        self.assertEqual(rels(links.person_path(graph, "kid", "dad")), [None, "parent"])


class TestPathToVillage(unittest.TestCase):
    def setUp(self):
        self.graph = sample_graph()

    def test_nearest_person_from_the_village(self):
        steps = links.path_to_village(self.graph, "amit", "kakroi")
        self.assertEqual(ids(steps), ["amit", "jagdish", "ram", "mohan", "sita"])

    def test_own_village_finds_someone_else(self):
        steps = links.path_to_village(self.graph, "amit", "bakheta")
        self.assertEqual(len(steps), 2)
        self.assertNotEqual(steps[-1]["id"], "amit")

    def test_everyone_from_the_village_nearest_first(self):
        paths = links.paths_to_village(self.graph, "jagdish", "pugthala")
        self.assertEqual([p[-1]["id"] for p in paths], ["rashmi", "bash"])

    def test_village_nobody_comes_from(self):
        self.assertIsNone(links.path_to_village(self.graph, "amit", "nowhere"))


class TestVillages(unittest.TestCase):
    def setUp(self):
        self.graph = sample_graph()

    def test_birth_village(self):
        self.assertEqual(links.birth_village(self.graph, "rashmi"), "pugthala")
        self.assertEqual(links.birth_village(self.graph, "sita"), "kakroi")
        self.assertEqual(links.birth_village(self.graph, "jagdish"), "bakheta")
        self.assertIsNone(links.birth_village(self.graph, "vikram"))

    def test_village_links_skip_unknown_and_same_village(self):
        self.assertEqual(links.village_links(self.graph, "bakheta"),
                         [{"village_id": "kakroi", "marriages": 1}, {"village_id": "pugthala", "marriages": 1}])
        self.assertEqual(links.village_links(self.graph, "kakroi"), [{"village_id": "bakheta", "marriages": 1}])

    def test_direct_couples(self):
        pair = links.village_pair(self.graph, "pugthala", "bakheta")
        self.assertEqual(pair, {"couples": [("jagdish", "rashmi")], "chain": None})

    def test_chain_through_another_village(self):
        pair = links.village_pair(self.graph, "pugthala", "kakroi")
        self.assertEqual(pair["couples"], [])
        self.assertEqual(pair["chain"], [
            {"from": "pugthala", "to": "bakheta", "couple": ("jagdish", "rashmi")},
            {"from": "bakheta", "to": "kakroi", "couple": ("mohan", "sita")},
        ])

    def test_not_linked(self):
        rows = sample_rows()
        rows["villages"].append({"id": "far", "name": "Far", "district": None, "state": None})
        graph = Graph(rows["people"], rows["marriages"], rows["families"], rows["villages"])
        self.assertEqual(links.village_pair(graph, "bakheta", "far"), {"couples": [], "chain": None})


class TestKinship(unittest.TestCase):
    def setUp(self):
        self.graph = sample_graph()

    def describe(self, a, b):
        return kinship.describe(links.person_path(self.graph, a, b))

    def test_close_relations_get_hindi(self):
        self.assertEqual(self.describe("amit", "mohan"), {"en": "father's brother", "hi": "चाचा / ताऊ जी"})
        self.assertEqual(self.describe("amit", "bash"), {"en": "mother's father", "hi": "नाना जी"})
        self.assertEqual(self.describe("amit", "sita"), {"en": "father's brother's wife", "hi": "चाची / ताई जी"})
        self.assertEqual(self.describe("amit", "neha"), {"en": "sister", "hi": "बहन"})
        self.assertEqual(self.describe("neha", "vikram"), {"en": "husband", "hi": "पति"})

    def test_long_path_has_no_hindi(self):
        self.assertEqual(self.describe("bash", "mohan"), {"en": "daughter's husband's brother", "hi": None})

    def test_same_person(self):
        self.assertEqual(self.describe("amit", "amit"), {"en": None, "hi": None})

    def test_neutral_sibling(self):
        steps = [{"id": "a", "rel": None}, {"id": "p", "rel": "father"}, {"id": "s", "rel": "child"}]
        self.assertEqual(kinship.describe(steps)["en"], "sibling")


if __name__ == "__main__":
    unittest.main()


class TestChainLayout(unittest.TestCase):
    def setUp(self):
        self.graph = sample_graph()

    def test_peak_sits_between_the_two_children_and_marriage_steps_aside(self):
        steps = links.person_path(self.graph, "bash", "mohan")
        spots = [(s["id"], c["col"], c["gen"]) for s, c in zip(steps, links.chain_layout(steps))]
        self.assertEqual(spots, [("bash", 0, 0), ("rashmi", 0, -1), ("jagdish", 1, -1),
                                 ("ram", 1.5, 0), ("mohan", 2, -1)])

    def test_straight_line_up_stays_in_one_column(self):
        steps = links.person_path(self.graph, "amit", "ram")
        self.assertEqual([c["col"] for c in links.chain_layout(steps)], [0, 0, 0])
        self.assertEqual([c["gen"] for c in links.chain_layout(steps)], [0, 1, 2])

    def test_each_line_names_the_relation(self):
        steps = links.person_path(self.graph, "bash", "mohan")
        self.assertEqual(links.chain_edges(self.graph, steps), [
            {"from": "bash", "to": "rashmi", "label": "daughter"},
            {"from": "rashmi", "to": "jagdish", "label": "married"},
            {"from": "ram", "to": "jagdish", "label": "son"},
            {"from": "ram", "to": "mohan", "label": "son"},
        ])

    def test_one_card_per_person_with_parents(self):
        cards = links.chain_cards(self.graph, links.person_path(self.graph, "bash", "mohan"))
        self.assertEqual([c["id"] for c in cards], ["bash", "rashmi", "jagdish", "ram", "mohan"])
        self.assertEqual(cards[1]["father"], "Bash")

    def test_cards_hide_private_fields(self):
        rows = sample_rows()
        next(p for p in rows["people"] if p["id"] == "mohan").update(note="private", born="1950", address_city="Delhi")
        graph = Graph(rows["people"], rows["marriages"], rows["families"], rows["villages"])
        text = str(links.chain_cards(graph, links.person_path(graph, "amit", "mohan")))
        for secret in ("private", "1950", "Delhi"):
            self.assertNotIn(secret, text)

    def test_relation_words(self):
        self.assertEqual(links.relation_words(self.graph, "amit"), "s/o Jagdish")
        self.assertEqual(links.relation_words(self.graph, "rashmi"), "d/o Bash")
        self.assertEqual(links.relation_words(self.graph, "sita"), "d/o Hari")
        self.assertEqual(links.relation_words(self.graph, "vikram"), "h/o Neha")
        self.assertEqual(links.relation_words(self.graph, "ram"), "")
