import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from family_tree.auth import AuthMissing, hash_password, load_auth, set_admin_password


def _temp_path():
    folder = tempfile.mkdtemp()
    return os.path.join(folder, "auth.json")


class TestHashPassword(unittest.TestCase):
    def test_matches_the_vector_shared_with_auth_check_js(self):
        self.assertEqual(
            hash_password("open sesame", "00112233445566778899aabbccddeeff", 1000),
            "111d7870ba309c2ec0f57e584e4e314fc577046f365a791c67e56fab8127b1fa",
        )


class TestSetAdminPassword(unittest.TestCase):
    def test_writes_a_hash_that_verifies_and_no_plain_password(self):
        path = _temp_path()
        set_admin_password(path, "correct horse")
        with open(path, encoding="utf-8") as f:
            text = f.read()
        auth = json.loads(text)
        admin = auth["admin"]
        self.assertEqual(admin["iterations"], 200000)
        self.assertEqual(hash_password("correct horse", admin["salt"], admin["iterations"]), admin["hash"])
        self.assertNotIn("correct horse", text)
        self.assertEqual(len(auth["signing_key"]), 64)
        self.assertEqual(auth["contact"], "Ankur")

    def test_changing_the_password_keeps_signing_key_and_contact(self):
        path = _temp_path()
        first = set_admin_password(path, "correct horse")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(dict(first, contact="Ankur Jain"), f)
        second = set_admin_password(path, "battery staple")
        self.assertEqual(second["signing_key"], first["signing_key"])
        self.assertEqual(second["contact"], "Ankur Jain")
        self.assertNotEqual(second["admin"]["salt"], first["admin"]["salt"])

    def test_missing_signing_key_gets_a_new_one(self):
        path = _temp_path()
        first = set_admin_password(path, "correct horse")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"contact": "Ankur", "admin": first["admin"]}, f)
        second = set_admin_password(path, "correct horse")
        self.assertNotEqual(second["signing_key"], first["signing_key"])

    def test_rejects_a_short_password(self):
        with self.assertRaises(ValueError):
            set_admin_password(_temp_path(), "short")


class TestLoadAuth(unittest.TestCase):
    def test_missing_file_raises_auth_missing(self):
        with self.assertRaises(AuthMissing):
            load_auth(_temp_path())

    def test_reads_what_was_written(self):
        path = _temp_path()
        written = set_admin_password(path, "correct horse")
        self.assertEqual(load_auth(path), written)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build.py")


def _run_build(folder):
    return subprocess.run(
        [sys.executable, BUILD], cwd=folder, capture_output=True, text=True
    )


class TestBuild(unittest.TestCase):
    def test_stops_without_auth_json_and_says_how_to_fix_it(self):
        folder = tempfile.mkdtemp()
        shutil.copy(os.path.join(ROOT, "family-tree.yaml"), folder)
        result = _run_build(folder)
        self.assertEqual(result.returncode, 1)
        self.assertIn("--set-admin-password", result.stderr)
        self.assertFalse(os.path.exists(os.path.join(folder, "family-tree.html")))

    def test_embeds_the_hash_but_never_the_password(self):
        folder = tempfile.mkdtemp()
        shutil.copy(os.path.join(ROOT, "family-tree.yaml"), folder)
        auth = set_admin_password(os.path.join(folder, "auth.json"), "hunter2-secret")
        result = _run_build(folder)
        self.assertEqual(result.returncode, 0, result.stderr)
        with open(os.path.join(folder, "family-tree.html"), encoding="utf-8") as f:
            html = f.read()
        self.assertIn('id="auth-data"', html)
        self.assertIn(auth["admin"]["hash"], html)
        self.assertIn(auth["signing_key"], html)
        self.assertNotIn("hunter2-secret", html)


NODE = shutil.which("node")


@unittest.skipUnless(NODE, "node is not installed")
class TestAuthJs(unittest.TestCase):
    def test_auth_check_js_passes(self):
        result = subprocess.run(
            [NODE, os.path.join(ROOT, "tests", "auth_check.js")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_auth_start_check_js_passes(self):
        result = subprocess.run(
            [NODE, os.path.join(ROOT, "tests", "auth_start_check.js")],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


from family_tree.auth import (PASSWORD_ALPHABET, check_hash, make_hash, new_password,
                              new_token, token_hash)


class TestAccountHelpers(unittest.TestCase):
    def test_hash_round_trip(self):
        stored = make_hash("open sesame", iterations=1000)
        self.assertTrue(stored.startswith("pbkdf2_sha256$1000$"))
        self.assertTrue(check_hash("open sesame", stored))
        self.assertFalse(check_hash("open sesamE", stored))

    def test_same_password_different_salt(self):
        self.assertNotEqual(make_hash("x" * 8, iterations=1000), make_hash("x" * 8, iterations=1000))

    def test_bad_stored_value_is_false_not_crash(self):
        self.assertFalse(check_hash("x", "garbage"))
        self.assertFalse(check_hash("x", "md5$1$aa$bb"))
        self.assertFalse(check_hash("x", "pbkdf2_sha256$abc$aa$bb"))
        self.assertFalse(check_hash("x", "pbkdf2_sha256$0$aa$bb"))
        self.assertFalse(check_hash("x", "$-1$"))
        self.assertFalse(check_hash("x", "pbkdf2_sha256$1$zz$bb"))
        self.assertFalse(check_hash("x", "pbkdf2_sha256$1$aa$é"))
        self.assertFalse(check_hash("x", "pbkdf2_sha256$99999999$aa$bb"))

    def test_new_password(self):
        pw = new_password()
        self.assertEqual(len(pw), 10)
        self.assertTrue(all(c in PASSWORD_ALPHABET for c in pw))

    def test_tokens(self):
        self.assertNotEqual(new_token(), new_token())
        self.assertEqual(len(token_hash("abc")), 64)
        self.assertEqual(token_hash("abc"), token_hash("abc"))


if __name__ == "__main__":
    unittest.main()
