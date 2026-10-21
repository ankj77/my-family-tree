from tests.apicase import ApiCase

PERSON_KEYS = {"id", "name", "name_hi", "gender", "life", "relation", "home_family", "village_id", "village"}


class TestLinksApi(ApiCase):
    def test_needs_login(self):
        self.assertEqual(self.get("/directory").status_code, 401)
        self.assertEqual(self.get("/links/people?a=amit&b=bash").status_code, 401)

    def test_guest_is_refused(self):
        self.login("mohan")
        made = self.post("/guests", {"minutes": 10, "scope": "family", "family_id": "bakheta"}).get_json()
        self.post("/logout")
        self.post("/login", made)
        self.assertEqual(self.get("/directory").status_code, 403)
        self.assertEqual(self.get("/links/people?a=amit&b=bash").status_code, 403)
        self.assertEqual(self.get("/villages/bakheta/links").status_code, 403)

    def test_family_reader_links_to_a_tree_they_cannot_open(self):
        self.query("UPDATE people SET address_city='Delhi', note='private', born='1950' WHERE id='bash'")
        self.login("amit")
        self.assertEqual(self.get("/families/pugthala/tree").status_code, 403)
        directory = self.get("/directory").get_json()
        self.assertIn("bash", [p["id"] for p in directory])
        self.assertTrue(all(set(p) == PERSON_KEYS for p in directory))
        r = self.get("/links/people?a=amit&b=bash").get_json()
        self.assertTrue(r["found"])
        self.assertEqual([s["id"] for s in r["steps"]], ["amit", "rashmi", "bash"])
        self.assertEqual(r["steps"][2]["village"], "Pugthala")
        self.assertEqual(r["summary"], {"en": "mother's father", "hi": "नाना जी"})
        self.assertEqual(r["segments"], [[0, 1, 2]])
        for text in ("Delhi", "private", "1950"):
            self.assertNotIn(text, str(directory) + str(r))

    def test_village_links(self):
        self.login("amit")
        self.assertEqual(self.get("/villages/bakheta/links").get_json(), [
            {"village_id": "kakroi", "village": "Kakroi", "marriages": 1},
            {"village_id": "pugthala", "village": "Pugthala", "marriages": 1}])
        direct = self.get("/links/villages?a=bakheta&b=pugthala").get_json()
        self.assertEqual([(c["husband"]["id"], c["wife"]["id"]) for c in direct["couples"]], [("jagdish", "rashmi")])
        self.assertIsNone(direct["chain"])
        chain = self.get("/links/villages?a=pugthala&b=kakroi").get_json()["chain"]
        self.assertEqual([(h["from"]["village"], h["to"]["village"]) for h in chain],
                         [("Pugthala", "Bakheta"), ("Bakheta", "Kakroi")])
        self.assertEqual(chain[1]["couple"]["wife"]["village"], "Kakroi")

    def test_village_people_only_from_readable_trees(self):
        self.query("UPDATE people SET note='private' WHERE id='rashmi'")
        self.login("amit")
        people = self.get("/villages/pugthala/people").get_json()
        self.assertEqual([p["id"] for p in people], ["rashmi"])
        self.assertEqual(people[0]["home_family"], "bakheta")
        self.assertNotIn("bash", [p["id"] for p in people])
        self.assertNotIn("private", str(people))
        self.assertIn("rashmi", [p["id"] for p in self.get("/villages/bakheta/people").get_json()])
        self.assertEqual(self.get("/villages/nowhere/people").status_code, 404)

    def test_unknown_ids(self):
        self.login("amit")
        self.assertEqual(self.get("/links/people?a=amit&b=nobody").status_code, 404)
        self.assertEqual(self.get("/links/people?a=amit").status_code, 404)
        self.assertEqual(self.get("/villages/nowhere/links").status_code, 404)
        self.assertEqual(self.get("/links/villages?a=bakheta&b=nowhere").status_code, 404)

    def test_link_tree_for_the_tree_page(self):
        self.query("UPDATE people SET note='private' WHERE id='mohan'")
        self.login("amit")
        r = self.get("/links/tree?a=bash&b=mohan").get_json()
        self.assertTrue(r["found"])
        self.assertTrue(r["tree"]["hidden"])
        self.assertEqual([t["id"] for t in r["tree"]["children"]], ["bash", "rashmi", "jagdish", "ram", "mohan"])
        self.assertEqual(r["edges"][1], {"from": "rashmi", "to": "jagdish", "label": "married"})
        self.assertEqual(r["counts"]["total"], 5)
        self.assertNotIn("private", str(r))
        self.assertEqual(self.get("/links/tree?a=bash").status_code, 404)

    def test_link_tree_to_a_village(self):
        self.login("amit")
        r = self.get("/links/tree?a=amit&v=kakroi").get_json()
        self.assertEqual([s["id"] for s in r["steps"]], ["amit", "jagdish", "ram", "mohan", "sita"])
        self.assertFalse(self.get("/links/tree?a=amit&v=bakheta").get_json()["found"] is None)
        self.assertEqual(self.get("/links/tree?a=amit&v=nowhere").status_code, 404)

    def test_everyone_from_a_village_with_their_relation(self):
        self.login("jagdish")
        r = self.get("/links/person-village?a=jagdish&v=pugthala").get_json()
        self.assertEqual([(p["id"], p["summary"]["en"]) for p in r], [("rashmi", "wife"), ("bash", "wife's father")])
        self.assertEqual(r[1]["summary"]["hi"], "ससुर जी")
        self.assertEqual(self.get("/links/person-village?a=jagdish&v=nowhere").status_code, 404)
