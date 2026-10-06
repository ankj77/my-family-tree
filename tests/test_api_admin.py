from tests.apicase import ORIGIN, ApiCase


class TestAccounts(ApiCase):
    def test_list_in_scope(self):
        self.login("bash")
        listed = self.get("/accounts").get_json()
        self.assertEqual(next(a for a in listed if a["person_id"] == "rashmi")["relation"], "d/o Bash")
        ids = {a["person_id"] for a in listed}
        self.assertEqual(ids, {"bash", "rashmi"})
        self.post("/logout")
        self.login("amit")
        self.assertEqual(self.get("/accounts").status_code, 403)

    def test_create_and_use(self):
        self.login("mohan")
        r = self.post("/accounts", {"person_id": "neha"})
        self.assertEqual(r.status_code, 201, r.get_json())
        made = r.get_json()
        self.assertEqual(made["username"], "neha")
        self.assertEqual(len(made["password"]), 10)
        self.assertEqual(self.post("/accounts", {"person_id": "neha"}).status_code, 409)
        self.post("/logout")
        self.assertEqual(self.post("/login", {"username": "neha", "password": made["password"]}).status_code, 200)

    def test_only_living(self):
        self.login("mohan")
        self.assertEqual(self.post("/accounts", {"person_id": "ram"}).status_code, 409)

    def test_out_of_scope(self):
        self.login("bash")
        self.assertEqual(self.post("/accounts", {"person_id": "neha"}).status_code, 403)

    def test_bad_username(self):
        self.login("mohan")
        self.assertEqual(self.post("/accounts", {"person_id": "neha", "username": "no way!"}).status_code, 409)
        self.assertEqual(self.post("/accounts", {"person_id": "neha", "username": "AMIT"}).status_code, 409)

    def test_reset_ends_sessions(self):
        rashmi = self.app_client()
        r = rashmi.post("/login", json={"username": "rashmi", "password": "pw-rashmi"}, headers=ORIGIN)
        self.assertEqual(r.status_code, 200)
        self.login("bash")
        r = self.post("/accounts/rashmi/password")
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(rashmi.get("/me").status_code, 401)
        self.post("/logout")
        self.assertEqual(self.post("/login", {"username": "rashmi", "password": r.get_json()["password"]}).status_code, 200)

    def test_cannot_reset_higher_role(self):
        self.login("bash")
        self.assertEqual(self.post("/accounts/mohan/password").status_code, 403)

    def test_rename(self):
        self.login("mohan")
        self.assertEqual(self.patch("/accounts/amit", {"username": "amit.jain"}).status_code, 200)
        self.post("/logout")
        self.assertEqual(self.post("/login", {"username": "amit.jain", "password": "pw-amit"}).status_code, 200)

    def test_last_global_admin_keeps_login(self):
        self.login("mohan")
        self.assertEqual(self.delete("/accounts/mohan").status_code, 409)

    def test_remove_login(self):
        self.login("mohan")
        self.assertEqual(self.delete("/accounts/amit").status_code, 200)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM accounts WHERE person_id='amit'")[0]["n"], 0)


class TestRoles(ApiCase):
    def test_grant_and_revoke(self):
        self.login("mohan")
        r = self.post("/role-grants", {"person_id": "amit", "scope": "village", "scope_id": "bakheta"})
        self.assertEqual(r.status_code, 201, r.get_json())
        self.assertEqual(self.post("/role-grants", {"person_id": "amit", "scope": "village",
                                                    "scope_id": "bakheta"}).status_code, 409)
        grants = self.get("/role-grants").get_json()
        made = next(g for g in grants if g["person_id"] == "amit")
        self.assertEqual(made["scope_name"], "Bakheta")
        self.assertEqual(self.delete("/role-grants/%d" % made["id"]).status_code, 200)

    def test_village_admin_limits(self):
        self.login("bash")
        self.assertEqual(self.post("/role-grants", {"person_id": "rashmi", "scope": "village",
                                                    "scope_id": "pugthala"}).status_code, 403)
        self.assertEqual(self.post("/role-grants", {"person_id": "rashmi", "scope": "branch",
                                                    "scope_id": "rashmi"}).status_code, 201)

    def test_cannot_give_roles_to_out_of_scope_person(self):
        self.login("bash")
        r = self.post("/role-grants", {"person_id": "amit", "scope": "branch", "scope_id": "rashmi"})
        self.assertEqual(r.status_code, 403)

    def test_cannot_revoke_roles_of_higher_holder(self):
        self.query("INSERT INTO role_grants (person_id, scope, scope_id) VALUES ('mohan', 'branch', 'bash')")
        self.conn.commit()
        self.login("bash")
        r = self.delete("/role-grants/%d" % self.query("SELECT id FROM role_grants WHERE person_id='mohan' AND scope='branch'")[0]["id"])
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM role_grants WHERE person_id='mohan' AND scope='branch'")[0]["n"], 1)

    def test_needs_a_login(self):
        self.login("mohan")
        r = self.post("/role-grants", {"person_id": "vikram", "scope": "branch", "scope_id": "neha"})
        self.assertEqual(r.status_code, 409)

    def test_last_global_admin(self):
        self.login("mohan")
        mine = next(g for g in self.get("/role-grants").get_json() if g["scope"] == "global")
        self.assertEqual(self.delete("/role-grants/%d" % mine["id"]).status_code, 409)
        self.post("/role-grants", {"person_id": "amit", "scope": "global"})
        self.assertEqual(self.delete("/role-grants/%d" % mine["id"]).status_code, 200)


class TestVillagesAndFamilies(ApiCase):
    def test_village_create(self):
        self.login("mohan")
        r = self.post("/villages", {"name": "Bal Pabana", "district": "Karnal", "state": "Haryana"})
        self.assertEqual(r.status_code, 201, r.get_json())
        self.assertEqual(r.get_json()["id"], "bal_pabana")
        self.post("/logout")
        self.login("bash")
        self.assertEqual(self.post("/villages", {"name": "X"}).status_code, 403)

    def test_family_create(self):
        self.login("bash")
        r = self.post("/families", {"village_id": "pugthala", "name": "Jain",
                                    "root": {"name": "Lala", "gender": "male"}})
        self.assertEqual(r.status_code, 201, r.get_json())
        fid = r.get_json()["id"]
        tree = self.get("/families/%s/tree" % fid).get_json()["tree"]
        self.assertEqual(tree["name"], "Lala")
        self.assertEqual(self.post("/families", {"village_id": "bakheta", "name": "Other",
                                                 "root": {"name": "Y"}}).status_code, 403)


class TestChangeLog(ApiCase):
    def test_admin_reads_log(self):
        self.login("mohan")
        self.patch("/people/amit", {"born": "1991"})
        entries = self.get("/change-log?limit=10").get_json()
        self.assertEqual(entries[0]["action"], "update")
        self.assertEqual(entries[0]["after"], {"born": "1991"})
        self.assertEqual(entries[0]["before"], {"born": None})
        self.post("/logout")
        self.login("amit")
        self.assertEqual(self.get("/change-log").status_code, 403)


class TestFinalFixes(ApiCase):
    def test_own_password_reset_refused(self):
        self.login("mohan")
        r = self.post("/accounts/mohan/password")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.get("/me").status_code, 200)

    def test_peer_village_admin_cannot_be_removed(self):
        self.conn.cursor().execute("INSERT INTO role_grants (person_id, scope, scope_id) VALUES ('rashmi', 'village', 'pugthala')")
        self.conn.commit()
        self.login("bash")
        self.assertEqual(self.delete("/accounts/rashmi").status_code, 403)
        self.assertEqual(self.delete("/people/rashmi").status_code, 403)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM role_grants WHERE person_id='rashmi'")[0]["n"], 1)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM accounts WHERE person_id='rashmi'")[0]["n"], 1)

    def test_peer_admin_childless_person_delete_refused(self):
        with self.conn.cursor() as cur:
            cur.execute("INSERT INTO people (id, name, family_id, father_id, gender, life) "
                        "VALUES ('kaka', 'Kaka', 'pugthala', 'bash', 'male', 'living')")
            cur.execute("INSERT INTO accounts (person_id, username, password_hash) VALUES ('kaka', 'kaka', 'x')")
            cur.execute("INSERT INTO role_grants (person_id, scope, scope_id) VALUES ('kaka', 'village', 'pugthala')")
        self.conn.commit()
        self.login("bash")
        self.assertEqual(self.delete("/people/kaka").status_code, 403)
        self.assertEqual(self.query("SELECT COUNT(*) AS n FROM people WHERE id='kaka'")[0]["n"], 1)

    def test_village_admin_sees_own_deletions_in_log(self):
        with self.conn.cursor() as cur:
            cur.execute("INSERT INTO people (id, name, family_id, father_id, gender, life) "
                        "VALUES ('kaka', 'Kaka', 'pugthala', 'bash', 'male', 'living')")
        self.conn.commit()
        self.login("bash")
        self.assertEqual(self.delete("/people/kaka").status_code, 200)
        actions = [(e["action"], e["person_id"]) for e in self.get("/change-log?limit=1").get_json()]
        self.assertEqual(actions, [("delete", "kaka")])
        self.post("/logout")
        self.login("jagdish")
        self.assertEqual(self.get("/change-log").status_code, 403)

    def test_log_limit_applies_after_filtering(self):
        self.login("mohan")
        self.patch("/people/amit", {"born": "1991"})
        for n in range(3):
            self.patch("/people/bash", {"born": "190%d" % n})
        self.post("/logout")
        self.login("bash")
        entries = self.get("/change-log?limit=2").get_json()
        self.assertEqual(len(entries), 2)
        self.assertTrue(all(e["person_id"] == "bash" for e in entries))
