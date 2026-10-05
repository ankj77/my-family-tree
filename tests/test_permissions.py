import unittest

from family_tree.permissions import Access
from tests.sample import SAMPLE_GRANTS, sample_graph


class TestAccess(unittest.TestCase):
    def setUp(self):
        self.g = sample_graph()

    def access(self, who, grants=SAMPLE_GRANTS):
        return Access(self.g, grants, who)

    def test_global_admin_reaches_everyone(self):
        a = self.access("mohan")
        for pid in self.g.people:
            self.assertEqual(a.level(pid), "admin", pid)
        self.assertEqual(a.delete_mode("amit"), "direct")

    def test_village_admin_reaches_own_village_only(self):
        a = self.access("bash")
        self.assertEqual(a.level("rashmi"), "admin")
        self.assertIsNone(a.level("jagdish"))
        self.assertIsNone(a.level("amit"))

    def test_village_admin_covers_in_law_through_spouse(self):
        grants = SAMPLE_GRANTS + [{"id": 9, "person_id": "rashmi", "scope": "village", "scope_id": "bakheta"}]
        a = self.access("rashmi", grants)
        self.assertEqual(a.level("vikram"), "admin")
        self.assertEqual(a.level("sita"), "admin")

    def test_branch_rep_reaches_branch_and_spouses(self):
        a = self.access("jagdish")
        for pid in ("jagdish", "amit", "neha", "rashmi", "vikram"):
            self.assertEqual(a.level(pid), "branch", pid)
        for pid in ("ram", "mohan", "sita", "bash"):
            self.assertIsNone(a.level(pid), pid)

    def test_branch_rep_delete_becomes_request(self):
        self.assertEqual(self.access("jagdish").delete_mode("amit"), "request")
        self.assertIsNone(self.access("jagdish").delete_mode("mohan"))

    def test_member_can_only_view(self):
        a = self.access("amit")
        self.assertFalse(a.is_admin())
        self.assertFalse(any(a.can_edit(pid) for pid in self.g.people))

    def test_accounts_never_above_own_rank(self):
        self.assertTrue(self.access("bash").can_manage_account("rashmi"))
        self.assertFalse(self.access("bash").can_manage_account("mohan"))
        grants = SAMPLE_GRANTS + [{"id": 9, "person_id": "rashmi", "scope": "global", "scope_id": ""}]
        self.assertFalse(self.access("bash", grants).can_manage_account("rashmi"))
        self.assertFalse(self.access("jagdish").can_manage_account("amit"))

    def test_granting(self):
        self.assertTrue(self.access("mohan").can_grant("village", "bakheta"))
        self.assertFalse(self.access("bash").can_grant("village", "pugthala"))
        self.assertFalse(self.access("bash").can_grant("global", ""))
        self.assertTrue(self.access("bash").can_grant("branch", "rashmi"))
        self.assertFalse(self.access("bash").can_grant("branch", "jagdish"))
        self.assertFalse(self.access("jagdish").can_grant("branch", "amit"))

    def test_creating_families(self):
        self.assertTrue(self.access("bash").can_create_family("pugthala"))
        self.assertFalse(self.access("bash").can_create_family("bakheta"))
        self.assertTrue(self.access("mohan").can_create_family("bakheta"))

    def test_unknown_person(self):
        self.assertIsNone(self.access("mohan").level("nobody"))
