import unittest

from family_tree.render import render_index


class TestRenderIndex(unittest.TestCase):
    def setUp(self):
        self.html = render_index()

    def test_is_html_with_app(self):
        self.assertTrue(self.html.lstrip().lower().startswith("<!doctype html"))
        self.assertIn("FT.boot = function (data)", self.html)
        self.assertTrue(self.html.rstrip().endswith("</html>"))
        self.assertIn("FT.api.start();", self.html)

    def test_carries_no_people(self):
        self.assertNotIn("Ram Krishan", self.html)
        self.assertNotIn("tree-data", self.html)
        self.assertNotIn("signing_key", self.html)

    def test_only_the_api_is_external(self):
        stripped = self.html.replace("http://www.w3.org", "").replace("https://api.jainparivar.online", "")
        stripped = stripped.replace("http://localhost:5000", "")
        self.assertNotIn("http://", stripped)
        self.assertNotIn("https://", stripped)

    def test_login_form_has_username_and_password(self):
        self.assertIn('id="login-user"', self.html)
        self.assertIn('id="login-pass"', self.html)
