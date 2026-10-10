from typing import List, Optional

from family_tree.graph import Graph

RANK = {"reader": 0, "branch": 1, "family": 2, "global": 3}


class Access:
    def __init__(self, graph: Graph, grants: List[dict], actor_id: str, guest: Optional[dict] = None):
        self.graph = graph
        self.grants = grants
        self.actor_id = actor_id
        self.guest = guest
        self.mine = [g for g in grants if g["person_id"] == actor_id]
        self.is_global = any(g["scope"] == "global" for g in self.mine)

    def admin_families(self) -> set:
        return {g["scope_id"] for g in self.mine if g["scope"] == "family"}

    def is_admin(self) -> bool:
        return self.is_global or bool(self.admin_families())

    def reads_everything(self) -> bool:
        if self.guest is not None:
            return self.guest["scope"] == "reader"
        return self.is_global or any(g["scope"] == "reader" for g in self.mine)

    def born_and_married_families(self, pid: str) -> set:
        if pid not in self.graph.people:
            return set()
        people = [pid] + ([self.graph.spouse[pid]] if pid in self.graph.spouse else [])
        return {self.graph.people[p].get("family_id") for p in people} - {None}

    def readable_families(self) -> set:
        if self.reads_everything():
            return set(self.graph.families)
        if self.guest is not None:
            return {self.guest["family_id"]} & set(self.graph.families)
        branch_families = {self.graph.home_family(g["scope_id"]) for g in self.mine
                           if g["scope"] == "branch" and g["scope_id"] in self.graph.people}
        found = self.born_and_married_families(self.actor_id) | self.admin_families() | branch_families
        return found & set(self.graph.families)

    def can_read_family(self, family_id: str) -> bool:
        return family_id in self.readable_families()

    def can_read_person(self, pid: str) -> bool:
        return self.reads_everything() or self.graph.home_family(pid) in self.readable_families()

    def rank_of(self, pid: str) -> int:
        return max([RANK[g["scope"]] for g in self.grants if g["person_id"] == pid] or [0])

    def level(self, pid: str) -> Optional[str]:
        if pid not in self.graph.people:
            return None
        if self.is_global:
            return "admin"
        if self.graph.home_family(pid) in self.admin_families():
            return "family"
        for grant in self.mine:
            if grant["scope"] == "branch" and pid in self.graph.branch(grant["scope_id"]):
                return "branch"
        return None

    def can_edit(self, pid: str) -> bool:
        return self.level(pid) is not None

    def is_admin_over(self, pid: str) -> bool:
        return self.level(pid) in ("admin", "family")

    def delete_mode(self, pid: str) -> Optional[str]:
        return {"admin": "direct", "family": "request", "branch": "request"}.get(self.level(pid))

    def _covers(self, grant: dict) -> bool:
        if self.is_global:
            return True
        if grant["scope"] == "branch":
            return self.graph.home_family(grant["scope_id"]) in self.admin_families()
        return False

    def can_manage_account(self, pid: str) -> bool:
        if not (self.is_admin_over(pid) and self.rank_of(pid) <= self.rank_of(self.actor_id)):
            return False
        target_grants = [g for g in self.grants if g["person_id"] == pid]
        return all(self._covers(g) for g in target_grants)

    def can_grant(self, scope: str, scope_id: str) -> bool:
        if scope in ("global", "family", "reader"):
            return self.is_global
        if scope == "branch":
            return self.is_admin_over(scope_id)
        return False

    def can_create_family(self, village_id: str) -> bool:
        return self.is_global
