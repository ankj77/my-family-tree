from family_tree import auth
from tests.apicase import ApiCase


def find(card, pid):
    if card["id"] == pid:
        return card
    for s in card.get("spouses", []):
        if s["id"] == pid:
            return s
    for c in card.get("children", []):
        hit = find(c, pid)
        if hit:
            return hit
    return None


class TestViewing(ApiCase):
    def test_needs_login(self):
        self.assertEqual(self.get("/families/bakheta/tree").status_code, 401)

    def test_villages_and_people(self):
        self.login("amit")
        villages = self.get("/villages").get_json()
        self.assertEqual([v["id"] for v in villages], ["bakheta", "kakroi", "pugthala"])
        self.assertEqual(villages[0]["families"][0]["id"], "bakheta")
        self.assertEqual(villages[0]["families"][0]["root_name"], "Ram")
        people = self.get("/people").get_json()
        self.assertEqual(len(people), 9)
        self.assertTrue(next(p for p in people if p["id"] == "amit")["has_account"])

    def test_tree_flags_for_branch_rep(self):
        self.login("jagdish")
        tree = self.get("/families/bakheta/tree").get_json()["tree"]
        self.assertEqual(tree["id"], "ram")
        amit = find(tree, "amit")
        self.assertTrue(amit["can_edit"])
        self.assertFalse(amit["can_move"])
        self.assertEqual(amit["can_delete"], "request")
        self.assertEqual(amit["edit"]["gender"], "male")
        self.assertFalse(find(tree, "mohan")["can_edit"])
        self.assertIsNone(find(tree, "mohan")["edit"])
        jagdish = find(tree, "jagdish")
        self.assertFalse(jagdish["can_delete"])
        self.assertIn("has children", jagdish["delete_reason"])
        self.assertEqual(find(tree, "rashmi")["links"][0]["family_id"], "pugthala")

    def test_unknown_family(self):
        self.login("amit")
        self.assertEqual(self.get("/families/nope/tree").status_code, 404)


class TestAdding(ApiCase):
    def test_add_child(self):
        self.login("jagdish")
        r = self.post("/people", {"as": "child", "parent_id": "jagdish", "name": "Kiran", "gender": "female"})
        self.assertEqual(r.status_code, 201, r.get_json())
        self.assertEqual(r.get_json()["id"], "kiran")
        row = self.query("SELECT family_id, father_id, mother_id FROM people WHERE id='kiran'")[0]
        self.assertEqual(row, {"family_id": "bakheta", "father_id": "jagdish", "mother_id": "rashmi"})
        tree = self.get("/families/bakheta/tree").get_json()["tree"]
        self.assertIsNotNone(find(tree, "kiran"))
        log = self.query("SELECT actor_id, action FROM change_log WHERE person_id='kiran'")
        self.assertEqual(log, [{"actor_id": "jagdish", "action": "create"}])

    def test_add_child_under_in_law_goes_to_partner_family(self):
        self.login("mohan")
        r = self.post("/people", {"as": "child", "parent_id": "sita", "name": "Ravi"})
        self.assertEqual(r.status_code, 201, r.get_json())
        row = self.query("SELECT family_id, father_id, mother_id FROM people WHERE id='ravi'")[0]
        self.assertEqual(row, {"family_id": "bakheta", "father_id": "mohan", "mother_id": "sita"})

    def test_hindi_only_name(self):
        self.login("jagdish")
        r = self.post("/people", {"as": "child", "parent_id": "amit", "name_hi": "अंकुर"})
        self.assertEqual(r.get_json()["id"], "person")
        r = self.post("/people", {"as": "child", "parent_id": "amit", "name_hi": "पवन"})
        self.assertEqual(r.get_json()["id"], "person_2")

    def test_no_name_is_refused(self):
        self.login("jagdish")
        r = self.post("/people", {"as": "child", "parent_id": "amit"})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM people")[0]["n"], 9)

    def test_outside_branch_is_forbidden(self):
        self.login("jagdish")
        r = self.post("/people", {"as": "child", "parent_id": "mohan", "name": "X"})
        self.assertEqual(r.status_code, 403)

    def test_add_spouse(self):
        self.login("jagdish")
        r = self.post("/people", {"as": "spouse", "spouse_id": "amit", "name": "Pooja", "father_name": "Dev"})
        self.assertEqual(r.status_code, 201, r.get_json())
        self.assertEqual(self.query("SELECT gender FROM people WHERE id='pooja'")[0]["gender"], "female")
        self.assertEqual(self.query("SELECT husband_id, wife_id FROM marriages WHERE wife_id='pooja'"),
                         [{"husband_id": "amit", "wife_id": "pooja"}])
        again = self.post("/people", {"as": "spouse", "spouse_id": "amit", "name": "Other"})
        self.assertEqual(again.status_code, 409)

    def test_wife_added_later_becomes_mother_of_his_children(self):
        self.login("mohan")
        dev = self.post("/people", {"as": "child", "parent_id": "ram", "name": "Dev", "gender": "male"}).get_json()["id"]
        lone = self.post("/people", {"as": "child", "parent_id": dev, "name": "Lala"}).get_json()["id"]
        self.assertIsNone(self.query("SELECT mother_id FROM people WHERE id=%s", (lone,))[0]["mother_id"])
        r = self.post("/people", {"as": "spouse", "spouse_id": dev, "name": "Kamla"})
        self.assertEqual(r.status_code, 201, r.get_json())
        self.assertEqual(self.query("SELECT mother_id FROM people WHERE id=%s", (lone,))[0]["mother_id"], r.get_json()["id"])

    def test_spouse_with_born_in_family_is_unlinked(self):
        self.login("mohan")
        r = self.post("/people", {"as": "spouse", "spouse_id": "amit", "name": "Pooja", "family_id": "pugthala"})
        self.assertEqual(r.status_code, 201, r.get_json())
        row = self.query("SELECT family_id, status FROM people WHERE id='pooja'")[0]
        self.assertEqual(row, {"family_id": "pugthala", "status": "needs-parent"})
        unlinked = self.get("/families/pugthala/tree").get_json()["unlinked"]
        self.assertIn("pooja", [c["id"] for c in unlinked])

    def test_spouse_same_gender_refused(self):
        self.login("jagdish")
        r = self.post("/people", {"as": "spouse", "spouse_id": "amit", "name": "Raj", "gender": "male"})
        self.assertEqual(r.status_code, 409)

    def test_bad_kind(self):
        self.login("jagdish")
        self.assertEqual(self.post("/people", {"parent_id": "amit", "name": "X"}).status_code, 400)


class TestEditing(ApiCase):
    def test_add_father_of_married_in_husband_starts_a_tree_in_his_village(self):
        self.login("jagdish")
        kid = self.post("/people", {"as": "child", "parent_id": "neha", "name": "Kiran"}).get_json()["id"]
        self.assertEqual(self.post("/people/vikram/father", {"name": "Dev"}).status_code, 409)
        self.patch("/people/vikram", {"origin_village_id": "kakroi"})
        r = self.post("/people/vikram/father", {"name": "Dev"})
        self.assertEqual(r.status_code, 201, r.get_json())
        self.assertEqual(r.get_json()["family_id"], "kakroi")
        tree = self.get("/families/kakroi/tree").get_json()["tree"]
        self.assertEqual(tree["name"], "Dev")
        self.assertEqual([c["id"] for c in tree["children"]], ["vikram"])
        self.assertEqual([s["id"] for s in tree["children"][0]["spouses"]], ["neha"])
        self.assertEqual([c["id"] for c in tree["children"][0]["children"]], [kid])
        bakheta = self.get("/families/bakheta/tree").get_json()["tree"]
        self.assertIsNotNone(find(bakheta, kid))
        self.assertEqual(self.post("/people/vikram/father", {"name": "Again"}).status_code, 409)

    def test_add_father_above_root_makes_him_root(self):
        self.login("mohan")
        r = self.post("/people/ram/father", {"name": "Dada"})
        self.assertEqual(r.status_code, 201, r.get_json())
        self.assertEqual(self.get("/families/bakheta/tree").get_json()["tree"]["name"], "Dada")

    def test_add_father_refused_when_linked_through_mother(self):
        self.login("mohan")
        kid = self.post("/people", {"as": "child", "parent_id": "neha", "name": "Kiran"}).get_json()["id"]
        self.assertEqual(self.patch("/people/%s" % kid, {"father_id": None}).status_code, 200)
        r = self.post("/people/%s/father" % kid, {"name": "X"})
        self.assertEqual(r.status_code, 409)
        self.assertIn("through the mother", r.get_json()["error"])

    def test_edit_and_log(self):
        self.login("jagdish")
        r = self.patch("/people/amit", {"born": "1990", "address_city": "Delhi"})
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(self.query("SELECT born, updated_by FROM people WHERE id='amit'")[0],
                         {"born": "1990", "updated_by": "jagdish"})
        entry = self.query("SELECT action, before_json, after_json FROM change_log WHERE person_id='amit'")[0]
        self.assertEqual(entry["action"], "update")
        self.assertIn("1990", entry["after_json"])

    def test_home_village_must_be_a_village(self):
        self.login("jagdish")
        self.assertEqual(self.patch("/people/amit", {"origin_village_id": "nowhere"}).status_code, 404)
        r = self.patch("/people/amit", {"origin_village_id": "pugthala"})
        self.assertEqual(r.status_code, 200, r.get_json())
        tree = self.get("/families/bakheta/tree").get_json()["tree"]
        self.assertEqual(find(tree, "amit")["origin"], {"village": "Pugthala", "state": "Haryana"})

    def test_edit_values_include_links_for_admin(self):
        self.login("mohan")
        tree = self.get("/families/bakheta/tree").get_json()["tree"]
        edit = find(tree, "amit")["edit"]
        self.assertEqual(edit["family_id"], "bakheta")
        self.assertEqual(edit["father_id"], "jagdish")

    def test_rep_cannot_move(self):
        self.login("jagdish")
        self.assertEqual(self.patch("/people/amit", {"father_id": "mohan"}).status_code, 403)

    def test_admin_moves(self):
        self.login("mohan")
        r = self.patch("/people/amit", {"father_id": "mohan", "mother_id": "sita"})
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(self.query("SELECT father_id FROM people WHERE id='amit'")[0]["father_id"], "mohan")

    def test_rejected_write_saves_nothing(self):
        self.login("jagdish")
        r = self.patch("/people/amit", {"name": "", "name_hi": None})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.query("SELECT name FROM people WHERE id='amit'")[0]["name"], "Amit")
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM change_log")[0]["n"], 0)

    def test_too_long_is_409(self):
        self.login("jagdish")
        self.assertEqual(self.patch("/people/amit", {"name": "x" * 300}).status_code, 409)

    def test_cycle_is_409(self):
        self.login("mohan")
        self.assertEqual(self.patch("/people/jagdish", {"father_id": "amit"}).status_code, 409)


class TestDeleting(ApiCase):
    def test_admin_deletes_leaf(self):
        self.login("mohan")
        self.assertEqual(self.delete("/people/amit").status_code, 200)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM people WHERE id='amit'")[0]["n"], 0)

    def test_blocked(self):
        self.login("mohan")
        self.assertEqual(self.delete("/people/jagdish").status_code, 409)
        self.assertEqual(self.delete("/people/ram").status_code, 409)

    def test_rep_request_then_approve(self):
        self.login("jagdish")
        r = self.delete("/people/amit")
        self.assertEqual(r.status_code, 202)
        self.assertEqual(self.delete("/people/amit").status_code, 202)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM delete_requests")[0]["n"], 1)
        tree = self.get("/families/bakheta/tree").get_json()["tree"]
        self.assertTrue(find(tree, "amit")["delete_pending"])
        self.post("/logout")
        self.login("bash")
        self.assertEqual(self.get("/delete-requests").get_json(), [])
        self.post("/logout")
        self.login("mohan")
        pending = self.get("/delete-requests").get_json()
        self.assertEqual([p["person"] for p in pending], ["Amit"])
        self.assertEqual(pending[0]["requested_by"], "Jagdish")
        self.assertEqual(self.post("/delete-requests/%d/approve" % pending[0]["id"]).status_code, 200)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM people WHERE id='amit'")[0]["n"], 0)

    def test_reject(self):
        self.login("jagdish")
        self.delete("/people/amit")
        self.post("/logout")
        self.login("mohan")
        rid = self.get("/delete-requests").get_json()[0]["id"]
        self.assertEqual(self.post("/delete-requests/%d/reject" % rid).status_code, 200)
        self.assertEqual(self.get("/delete-requests").get_json(), [])
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM people WHERE id='amit'")[0]["n"], 1)

    def test_member_cannot_delete(self):
        self.login("amit")
        self.assertEqual(self.delete("/people/neha").status_code, 403)
        self.assertEqual(self.get("/delete-requests").status_code, 403)

    def test_deleting_a_branch_root_removes_that_role(self):
        with self.conn.cursor() as cur:
            cur.execute("INSERT INTO role_grants (person_id, scope, scope_id) VALUES ('rashmi','branch','amit')")
        self.conn.commit()
        self.login("mohan")
        self.assertEqual(self.delete("/people/amit").status_code, 200)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM role_grants WHERE scope_id='amit'")[0]["n"], 0)
        self.post("/logout")
        self.login("rashmi")
        self.assertEqual(self.get("/me").get_json()["roles"], [])
        self.assertEqual(self.get("/families/bakheta/tree").status_code, 200)


class TestScope(ApiCase):
    def add_person(self, pid, family_id, father_id, grant=None):
        with self.conn.cursor() as cur:
            cur.execute("INSERT INTO people (id, name, gender, family_id, father_id) VALUES (%s, %s, 'male', %s, %s)",
                        (pid, pid.title(), family_id, father_id))
            if grant:
                cur.execute("INSERT INTO accounts (person_id, username, password_hash) VALUES (%s, %s, %s)",
                            (pid, pid, auth.make_hash("pw-" + pid, iterations=1000)))
                cur.execute("INSERT INTO role_grants (person_id, scope, scope_id) VALUES (%s, %s, '')", (pid, grant))
        self.conn.commit()

    def test_village_admin_cannot_delete_global_admin(self):
        self.add_person("pg", "pugthala", "bash", "global")
        self.login("bash")
        self.assertEqual(self.delete("/people/pg").status_code, 403)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM people WHERE id='pg'")[0]["n"], 1)

    def test_last_global_admin_cannot_delete_self(self):
        self.add_person("solo", "bakheta", "ram", "global")
        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM role_grants WHERE person_id='mohan'")
        self.conn.commit()
        self.login("solo")
        r = self.delete("/people/solo")
        self.assertEqual(r.status_code, 409)
        self.assertIn("only global admin", r.get_json()["error"])
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM people WHERE id='solo'")[0]["n"], 1)

    def test_village_admin_cannot_move_out_of_scope(self):
        self.assertEqual(self.login("bash").status_code, 200)
        self.assertEqual(self.patch("/people/rashmi", {"family_id": "bakheta"}).status_code, 403)
        self.assertEqual(self.patch("/people/rashmi", {"father_id": "jagdish"}).status_code, 403)
        self.assertEqual(self.query("SELECT father_id FROM people WHERE id='rashmi'")[0]["father_id"], "bash")

    def test_child_under_pugthala_wife_joins_fathers_family(self):
        self.login("jagdish")
        r = self.post("/people", {"as": "child", "parent_id": "rashmi", "name": "Tara", "gender": "female"})
        self.assertEqual(r.status_code, 201, r.get_json())
        row = self.query("SELECT family_id, father_id, mother_id FROM people WHERE id='tara'")[0]
        self.assertEqual(row, {"family_id": "bakheta", "father_id": "jagdish", "mother_id": "rashmi"})
        self.assertEqual(self.patch("/people/tara", {"born": "2000"}).status_code, 200)
