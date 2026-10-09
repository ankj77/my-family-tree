import unittest

from family_tree.auth import (PASSWORD_ALPHABET, check_hash, hash_password, make_hash,
                              new_password, new_token, token_hash, valid_password)


class TestHashPassword(unittest.TestCase):
    def test_matches_the_vector_shared_with_auth_check_js(self):
        self.assertEqual(
            hash_password("open sesame", "00112233445566778899aabbccddeeff", 1000),
            "111d7870ba309c2ec0f57e584e4e314fc577046f365a791c67e56fab8127b1fa",
        )


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
        self.assertEqual(len(pw), 6)
        self.assertTrue(all(c in PASSWORD_ALPHABET for c in pw))
        self.assertTrue(valid_password(pw))

    def test_valid_password(self):
        self.assertTrue(valid_password("048213"))
        for bad in ("12345", "1234567", "abcdef", "12 345", "١٢٣٤٥٦"):
            self.assertFalse(valid_password(bad))

    def test_tokens(self):
        self.assertNotEqual(new_token(), new_token())
        self.assertEqual(len(token_hash("abc")), 64)
        self.assertEqual(token_hash("abc"), token_hash("abc"))


if __name__ == "__main__":
    unittest.main()
