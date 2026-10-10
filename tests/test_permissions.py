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

    def test_family_admin_reaches_own_family_only_and_deletes_by_request(self):
        a = self.access("bash")
        self.assertEqual(a.level("rashmi"), "family")
        self.assertEqual(a.delete_mode("rashmi"), "request")
        self.assertIsNone(a.level("jagdish"))
        self.assertIsNone(a.level("amit"))

    def test_family_admin_covers_in_law_through_spouse(self):
        grants = SAMPLE_GRANTS + [{"id": 9, "person_id": "rashmi", "scope": "family", "scope_id": "bakheta"}]
        a = self.access("rashmi", grants)
        self.assertEqual(a.level("vikram"), "family")
        self.assertEqual(a.level("sita"), "family")

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
        self.assertTrue(self.access("mohan").can_grant("family", "bakheta"))
        self.assertTrue(self.access("mohan").can_grant("reader", ""))
        self.assertFalse(self.access("bash").can_grant("family", "pugthala"))
        self.assertFalse(self.access("bash").can_grant("reader", ""))
        self.assertFalse(self.access("bash").can_grant("global", ""))
        self.assertTrue(self.access("bash").can_grant("branch", "rashmi"))
        self.assertFalse(self.access("bash").can_grant("branch", "jagdish"))
        self.assertFalse(self.access("jagdish").can_grant("branch", "amit"))

    def test_creating_families(self):
        self.assertFalse(self.access("bash").can_create_family("pugthala"))
        self.assertTrue(self.access("mohan").can_create_family("bakheta"))

    def test_unknown_person(self):
        self.assertIsNone(self.access("mohan").level("nobody"))

    def test_family_admin_cannot_manage_account_with_uncovered_family_grant(self):
        grants = SAMPLE_GRANTS + [{"id": 9, "person_id": "rashmi", "scope": "family", "scope_id": "bakheta"}]
        self.assertFalse(self.access("bash", grants).can_manage_account("rashmi"))

    def test_family_admin_can_manage_account_with_covered_branch_grant(self):
        grants = SAMPLE_GRANTS + [{"id": 9, "person_id": "rashmi", "scope": "branch", "scope_id": "bash"}]
        self.assertTrue(self.access("bash", grants).can_manage_account("rashmi"))

    def test_family_admin_cannot_manage_account_with_uncovered_branch_grant(self):
        grants = SAMPLE_GRANTS + [{"id": 9, "person_id": "rashmi", "scope": "branch", "scope_id": "amit"}]
        self.assertFalse(self.access("bash", grants).can_manage_account("rashmi"))

    def test_global_admin_can_manage_all_grants(self):
        grants_with_family = SAMPLE_GRANTS + [{"id": 9, "person_id": "rashmi", "scope": "family", "scope_id": "bakheta"}]
        self.assertTrue(self.access("mohan", grants_with_family).can_manage_account("rashmi"))
        grants_with_branch = SAMPLE_GRANTS + [{"id": 9, "person_id": "rashmi", "scope": "branch", "scope_id": "amit"}]
        self.assertTrue(self.access("mohan", grants_with_branch).can_manage_account("rashmi"))

    def test_family_reader_reads_born_and_married_families(self):
        self.assertEqual(self.access("amit").readable_families(), {"bakheta"})
        self.assertEqual(self.access("rashmi").readable_families(), {"bakheta", "pugthala"})
        self.assertEqual(self.access("jagdish").readable_families(), {"bakheta", "pugthala"})
        self.assertEqual(self.access("sita").readable_families(), {"bakheta"})
        self.assertTrue(self.access("amit").can_read_person("neha"))
        self.assertFalse(self.access("amit").can_read_person("bash"))

    def test_global_reader_and_admin_read_everything_but_reader_cannot_edit(self):
        grants = SAMPLE_GRANTS + [{"id": 9, "person_id": "amit", "scope": "reader", "scope_id": ""}]
        reader = self.access("amit", grants)
        self.assertEqual(reader.readable_families(), {"bakheta", "pugthala"})
        self.assertFalse(any(reader.can_edit(pid) for pid in self.g.people))
        self.assertEqual(self.access("mohan").readable_families(), {"bakheta", "pugthala"})

    def test_family_admin_reads_own_family_too(self):
        grants = SAMPLE_GRANTS + [{"id": 9, "person_id": "amit", "scope": "family", "scope_id": "pugthala"}]
        self.assertEqual(self.access("amit", grants).readable_families(), {"bakheta", "pugthala"})

    def test_guests_read_their_one_family_or_everything(self):
        family_guest = Access(self.g, SAMPLE_GRANTS, "guest:g1", {"scope": "family", "family_id": "pugthala"})
        self.assertEqual(family_guest.readable_families(), {"pugthala"})
        self.assertFalse(family_guest.can_read_person("amit"))
        everything = Access(self.g, SAMPLE_GRANTS, "guest:g2", {"scope": "reader", "family_id": None})
        self.assertEqual(everything.readable_families(), {"bakheta", "pugthala"})
