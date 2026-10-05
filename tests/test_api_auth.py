from tests.apicase import ORIGIN, ApiCase


class TestLogin(ApiCase):
    def test_login_returns_me_and_sets_cookie(self):
        r = self.login("amit")
        self.assertIn("ft_session=", r.headers["Set-Cookie"])
        self.assertIn("HttpOnly", r.headers["Set-Cookie"])
        me = r.get_json()
        self.assertEqual(me["username"], "amit")
        self.assertFalse(me["is_admin"])
        self.assertEqual(me["home_family"], "bakheta")
        self.assertEqual(self.get("/me").get_json()["id"], "amit")

    def test_username_ignores_case_and_spaces(self):
        r = self.post("/login", {"username": "  AMIT ", "password": "pw-amit"})
        self.assertEqual(r.status_code, 200)

    def test_wrong_password(self):
        r = self.post("/login", {"username": "amit", "password": "nope"})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.get_json()["error"], "Wrong username or password")

    def test_unknown_user_same_message(self):
        r = self.post("/login", {"username": "ghost", "password": "nope"})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.get_json()["error"], "Wrong username or password")

    def test_lock_after_five_wrong(self):
        for _ in range(5):
            self.post("/login", {"username": "amit", "password": "nope"})
        r = self.post("/login", {"username": "amit", "password": "pw-amit"})
        self.assertEqual(r.status_code, 429)

    def test_right_password_resets_counter(self):
        for _ in range(4):
            self.post("/login", {"username": "amit", "password": "nope"})
        self.assertEqual(self.query("SELECT failed_logins FROM accounts WHERE person_id='amit'")[0]["failed_logins"], 4)
        self.login("amit")
        self.assertEqual(self.query("SELECT failed_logins FROM accounts WHERE person_id='amit'")[0]["failed_logins"], 0)

    def test_lock_sets_deadline_and_resets_counter(self):
        for _ in range(5):
            self.post("/login", {"username": "amit", "password": "nope"})
        row = self.query("SELECT failed_logins, locked_until FROM accounts WHERE person_id='amit'")[0]
        self.assertEqual(row["failed_logins"], 0)
        self.assertIsNotNone(row["locked_until"])

    def test_admin_flags(self):
        me = self.login("mohan").get_json()
        self.assertTrue(me["is_admin"])
        self.assertTrue(me["is_global"])
        self.assertEqual(me["roles"][0]["scope"], "global")

    def test_me_needs_login(self):
        self.assertEqual(self.get("/me").status_code, 401)

    def test_logout(self):
        self.login("amit")
        self.assertEqual(self.post("/logout").status_code, 200)
        self.assertEqual(self.get("/me").status_code, 401)


class TestGuards(ApiCase):
    def test_write_needs_our_origin(self):
        r = self.client.post("/login", json={"username": "amit", "password": "pw-amit"})
        self.assertEqual(r.status_code, 403)

    def test_write_needs_json(self):
        r = self.client.post("/login", data={"username": "amit"}, headers=ORIGIN)
        self.assertEqual(r.status_code, 415)

    def test_cors_headers(self):
        r = self.get("/me")
        self.assertEqual(r.headers["Access-Control-Allow-Origin"], "https://jainparivar.online")
        self.assertEqual(r.headers["Access-Control-Allow-Credentials"], "true")

    def test_preflight(self):
        r = self.client.options("/people/amit", headers=dict(ORIGIN, **{"Access-Control-Request-Method": "PATCH"}))
        self.assertEqual(r.status_code, 204)
        self.assertIn("PATCH", r.headers["Access-Control-Allow-Methods"])

    def test_unknown_route_is_json(self):
        r = self.get("/nope")
        self.assertEqual(r.status_code, 404)
        self.assertIn("error", r.get_json())


class TestOwnPassword(ApiCase):
    def test_change(self):
        self.login("amit")
        self.assertEqual(self.post("/me/password", {"old": "bad", "new": "newpass99"}).status_code, 403)
        self.assertEqual(self.post("/me/password", {"old": "pw-amit", "new": "short"}).status_code, 409)
        self.assertEqual(self.post("/me/password", {"old": "pw-amit", "new": "newpass99"}).status_code, 200)
        self.assertEqual(self.get("/me").status_code, 200)
        self.post("/logout")
        self.assertEqual(self.post("/login", {"username": "amit", "password": "pw-amit"}).status_code, 401)
        self.assertEqual(self.post("/login", {"username": "amit", "password": "newpass99"}).status_code, 200)
