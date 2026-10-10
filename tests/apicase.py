from backend import db
from backend.app import app
from family_tree import auth
from tests.dbcase import DbCase
from tests.sample import sample_rows

ORIGIN = {"Origin": "https://jainparivar.online"}
ACCOUNTS = {
    "mohan": [("global", "")],
    "bash": [("family", "pugthala")],
    "jagdish": [("branch", "jagdish")],
    "amit": [],
    "rashmi": [],
}


class ApiCase(DbCase):
    def setUp(self):
        super().setUp()
        with self.conn.cursor() as cur:
            db.import_rows(cur, sample_rows())
            for pid, grants in ACCOUNTS.items():
                cur.execute("INSERT INTO accounts (person_id, username, password_hash) VALUES (%s, %s, %s)",
                            (pid, pid, auth.make_hash("pw-" + pid, iterations=1000)))
                for scope, scope_id in grants:
                    cur.execute("INSERT INTO role_grants (person_id, scope, scope_id) VALUES (%s, %s, %s)",
                                (pid, scope, scope_id))
        self.conn.commit()
        self.client = app.test_client()

    def login(self, who):
        r = self.post("/login", {"username": who, "password": "pw-" + who})
        self.assertEqual(r.status_code, 200, r.get_json())
        return r

    def get(self, path):
        return self.client.get(path, headers=ORIGIN)

    def post(self, path, data=None):
        return self.client.post(path, json={} if data is None else data, headers=ORIGIN)

    def patch(self, path, data):
        return self.client.patch(path, json=data, headers=ORIGIN)

    def delete(self, path):
        return self.client.delete(path, headers=ORIGIN)

    def app_client(self):
        return app.test_client()
