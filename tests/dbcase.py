import os
import unittest
from urllib.parse import urlsplit

from backend import db

TEST_URL = os.environ.get("TEST_DATABASE_URL", "mysql://root@localhost/family_tree_test")
TABLES = ("change_log", "delete_requests", "sessions", "role_grants", "accounts",
          "marriages", "people", "families", "villages")


LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


def refuse_unsafe(url):
    parts = urlsplit(url)
    name = parts.path.lstrip("/")
    if not name.endswith("_test"):
        raise unittest.SkipTest("TEST_DATABASE_URL database %r must end with _test; tests DROP it" % name)
    if parts.hostname not in LOCAL_HOSTS:
        raise unittest.SkipTest("TEST_DATABASE_URL host %r is not local; tests DROP the database" % parts.hostname)


class DbCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        refuse_unsafe(TEST_URL)
        server_url, name = TEST_URL.rsplit("/", 1)
        try:
            server = db.connect(server_url + "/")
        except Exception as e:
            raise unittest.SkipTest("MySQL not reachable (%s); run: brew services start mysql" % e)
        with server.cursor() as cur:
            cur.execute("DROP DATABASE IF EXISTS `%s`" % name)
            cur.execute("CREATE DATABASE `%s` CHARACTER SET utf8mb4" % name)
            cur.execute("USE `%s`" % name)
            db.run_sql_file(cur, db.SCHEMA)
        server.commit()
        server.close()
        os.environ["DATABASE_URL"] = TEST_URL
        os.environ["COOKIE_SECURE"] = "0"
        os.environ.pop("COOKIE_DOMAIN", None)
        os.environ["ALLOWED_ORIGIN"] = "https://jainparivar.online"

    def setUp(self):
        self.conn = db.connect(TEST_URL)
        with self.conn.cursor() as cur:
            db.wipe(cur)
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def query(self, sql, args=()):
        self.conn.commit()
        with self.conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall()
        self.conn.commit()
        return list(rows)
